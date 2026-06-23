import { AppError } from "../../lib/errors";
import { env } from "../../lib/env";
import {
  GeneratedSettingSeedSchema,
  GenerateChapterRequestSchema,
  RegenerateChapterRequestSchema,
  StoryPayloadSchema,
} from "../../schemas/story";
import type {
  Chapter,
  ChapterPlanItem,
  Concept,
  DraftControls,
  GenerateChapterRequest,
  NormalizedFullGenerateRequest,
  NormalizedOutlineRequest,
  OutputLanguage,
  RegenerateChapterRequest,
  StoryPayload,
} from "../../types/story";
import {
  renderStoryMarkdown,
  maybeWriteMarkdownFile,
  renderStoryPdfHtml,
  writeChapterMarkdownFiles,
} from "../exporters/markdown-exporter";
import { PresetLoader } from "../presets/preset-loader";
import {
  buildChapterDraftPrompt,
  buildChapterRepairPrompt,
  buildChapterPlanPrompt,
  buildConceptPrompt,
  buildConceptNameAlignmentPrompt,
  buildRegenerateChapterPrompt,
  buildSettingSeedPrompt,
  buildStoryBiblePrompt,
} from "../prompts/story-prompts";
import { createSeedBlueprint, type SeedHistoryEntry } from "../prompts/seed-blueprint";
import { getLocalProsePolishConfig, type LocalProsePolishConfig, type ProsePolishTarget } from "../presets/prose-polish-config";
import { postProcessProseHumanizer } from "../postprocessors/prose-humanizer-post-processor";
import { runReaderPanel } from "../postprocessors/reader-panel";
import { reviewManuscript } from "../postprocessors/manuscript-review";
import { tightenChapterText } from "../postprocessors/adversarial-cut";
import { planChapterRevisions, buildRevisionInstruction } from "../postprocessors/revision-planner";
import { evaluateFoundation, type FoundationReport } from "../postprocessors/foundation-gate";
import { generateCanonFacts } from "../postprocessors/canon-facts";
import { RouterClient } from "../router/router-client";
import {
  createContinuityLite,
  ensureChapterPlanIntegrity,
  parseChapterPlan,
  parseConcept,
  parseStoryBible,
  resolveDraftControls,
  summarizeChapter,
  validateChapterDraft,
  validateOutlineGeneration,
  validateStoryPayload,
} from "../validators/story-validator";
import { analyzeChapterQuality, hasOnlySoftChapterQualityFailures, needsChapterRetry, getOrCreatePhraseReuseIndex, resetPhraseReuseIndex, indexChapter } from "../validators/chapter-quality";
// ─── Character Consistency (shared core-pipeline) ────────────────────────────
import {
  createEmptyMemoryStore,
  addFactSheet,
  type CharacterMemoryStore,
} from "../core-pipeline/character-memory-store";
import {
  extractCharacterFacts,
} from "../core-pipeline/character-fact-extractor";
import {
  validateConsistency,
  hasCriticalViolations,
  type DriftReport,
} from "../core-pipeline/character-consistency";
import {
  ContinuityTracker,
  type MinimalChapterRef,
} from "../core-pipeline/continuity-tracker";
import { applyCharacterFactsToRelationshipGraph, createInitialRelationshipGraph } from "../relationship/relationship-graph";
import { analyzeVoiceFingerprint, buildVoiceLockInstruction } from "../core-pipeline/validators/voice-fingerprint";
import { buildPropagationLedger } from "../core-pipeline/validators/propagation-ledger";
import { getRemainingChapterPlanItems } from "./story-resume";
import { resolveFinalStoryTitle } from "./story-title";

export type StoryProgressOperation = "outline" | "full" | "chapter" | "regenerate";
export type StoryProgressStatus = "started" | "completed";

export type StoryProgressEvent = {
  operation: StoryProgressOperation;
  stageId: string;
  label: string;
  detail: string;
  current: number;
  total: number;
  status: StoryProgressStatus;
  chapter?: Chapter;
  storyPayload?: StoryPayload;
};

type StoryProgressReporter = (event: StoryProgressEvent) => void;

type StoryProgressOptions = {
  onProgress?: StoryProgressReporter;
  operation?: StoryProgressOperation;
  totalStages?: number;
  stageOffset?: number;
};

type ResolvedStoryProgressOptions = {
  onProgress?: StoryProgressReporter;
  operation: StoryProgressOperation;
  totalStages: number;
  stageOffset: number;
};

type StoryStageDescriptor = {
  id: string;
  label: string;
  detail: string;
};

type SeedHistoryStorePort = {
  load(): Promise<SeedHistoryEntry[]>;
  append(entry: SeedHistoryEntry): Promise<SeedHistoryEntry[]>;
};

type StoryPosterResult = {
  status: "completed" | "failed" | "skipped";
  title: string;
  model: string;
  size: string;
  generatedAt: string;
  filePath?: string;
  error?: string;
};
type StoryPosterGeneratorPort = {
  generatePoster(storyPayload: StoryPayload): Promise<StoryPosterResult>;
};

type PostProcessModels = {
  rewriter: string;
  fallback?: string;
};

const CHAPTER_DRAFT_TEMPERATURE = 0.58;
const CHAPTER_REPAIR_TEMPERATURE = 0.28;
const MAX_CHAPTER_REPAIR_ATTEMPTS = 2;

export class StoryOrchestrator {
  constructor(
    private readonly presetLoader: PresetLoader,
    private readonly routerClient: RouterClient,
    private modelPresetName: string,
    private readonly seedHistoryStore?: SeedHistoryStorePort,
    private readonly posterGenerator?: StoryPosterGeneratorPort,
    private readonly prosePolishConfig: LocalProsePolishConfig = getLocalProsePolishConfig(),
  ) {}

  private modelAliasOverride?: string;

  getModelPresetName() {
    return this.modelPresetName;
  }

  getActiveModelAlias() {
    return this.modelAliasOverride;
  }

  setModelAliasOverride(modelAlias: string) {
    this.modelAliasOverride = modelAlias.trim() || undefined;
  }

  private async recordStoryBibleCharacterNames(request: NormalizedOutlineRequest, title: string, storyBible: StoryPayload["storyBible"]) {
    const characterNames = [storyBible.heroine.name, storyBible.betrayer.name, storyBible.rival.name]
      .map((name) => name.trim())
      .filter(Boolean);

    if (!this.seedHistoryStore || characterNames.length === 0) {
      return;
    }

    await this.seedHistoryStore.append({
      fingerprint: `character-names:${request.linePreset}:${characterNames.map(normalizeHistoryKeyPart).join('|')}`,
      linePreset: request.linePreset,
      titleHint: title,
      createdAt: new Date().toISOString(),
      characterNames,
    });
  }

  /**
   * Align the concept's free-text fields with the canonical character names
   * from the story bible. The concept is written before the bible, so its
   * invented names won't match the chapters (which follow the bible). This
   * cosmetic pass keeps the studio's "Ý tưởng" tab consistent with the story.
   *
   * Title and titleCandidates are preserved verbatim; only logline, promise,
   * and conflictEngine are rewritten. On any failure the original concept is
   * returned unchanged so generation never breaks on this non-critical step.
   */
  private async alignConceptNames(
    request: NormalizedOutlineRequest,
    concept: Concept,
    storyBible: StoryPayload["storyBible"],
    context: Awaited<ReturnType<StoryOrchestrator["loadGenerationContext"]>>,
  ): Promise<Concept> {
    try {
      const alignmentPrompt = buildConceptNameAlignmentPrompt({ request, concept, storyBible });
      const result = await this.routerClient.generateJson<unknown>({
        model: context.models.planner,
        fallbackModel: context.models.fallback,
        ...alignmentPrompt,
        temperature: 0.2,
        timeoutMs: env.routerPlanningTimeoutMs,
      });

      const aligned = parseConcept(unwrapEnvelope(result.data, "concept"));
      // Preserve the original title and candidates; only the prose fields are
      // allowed to change so we never alter the chosen title during alignment.
      return {
        ...aligned,
        title: concept.title,
        titleCandidates: concept.titleCandidates,
      };
    } catch {
      // Cosmetic alignment must never block story generation.
      return concept;
    }
  }

  async generateOutline(request: NormalizedOutlineRequest, progressOptions?: StoryProgressOptions, options?: { recentStoryTitles?: string[] }) {
    const progress = resolveProgressOptions(progressOptions, "outline", 5);
    const context = await runProgressStage(
      progress,
      1,
      {
        id: "load-context",
        label: "Nạp preset",
        detail: "Đang nạp preset và alias model.",
      },
      () => this.loadGenerationContext(request.linePreset, request.stylePreset),
      "Đã nạp preset và alias model.",
    );
    if (request.chapterCount !== context.linePreset.constraints.fixedChapterCount) {
      throw new AppError("VALIDATION_ERROR", `chapterCount must be ${context.linePreset.constraints.fixedChapterCount}`, 400);
    }

    const concept = await runProgressStage(
      progress,
      2,
      {
        id: "concept",
        label: "Tạo concept",
        detail: "Đang phác tiêu đề, logline và trục xung đột.",
      },
      async () => {
        const conceptPrompt = buildConceptPrompt({
          request,
          linePreset: context.linePreset,
          stylePreset: context.stylePreset,
          recentStoryTitles: options?.recentStoryTitles,
          prosePolishConfig: this.prosePolishConfig,
        });
        const conceptResult = await this.routerClient.generateJson<unknown>({
          model: context.models.planner,
          fallbackModel: context.models.fallback,
          ...conceptPrompt,
          timeoutMs: env.routerPlanningTimeoutMs,
        });

        return {
          concept: parseConcept(unwrapEnvelope(conceptResult.data, "concept")),
          modelUsed: conceptResult.modelUsed,
        };
      },
      (result) => `Đã tạo concept bằng ${result.modelUsed}.`,
    );

    const storyBible = await runProgressStage(
      progress,
      3,
      {
        id: "story-bible",
        label: "Dựng story bible",
        detail: "Đang xác định dàn nhân vật, premise và các engine cảm xúc.",
      },
      async () => {
        const biblePrompt = buildStoryBiblePrompt({
          request,
          concept: concept.concept,
          linePreset: context.linePreset,
          stylePreset: context.stylePreset,
          recentSeedHistory: (await this.seedHistoryStore?.load()) ?? [],
        });
        const bibleResult = await this.routerClient.generateJson<unknown>({
          model: context.models.bible,
          fallbackModel: context.models.fallback,
          ...biblePrompt,
          timeoutMs: env.routerPlanningTimeoutMs,
        });

        return {
          storyBible: parseStoryBible(unwrapEnvelope(bibleResult.data, "storyBible")),
          modelUsed: bibleResult.modelUsed,
        };
      },
      (result) => `Đã dựng story bible bằng ${result.modelUsed}.`,
    );

    await this.recordStoryBibleCharacterNames(request, concept.concept.title, storyBible.storyBible);

    const alignedConcept = await this.alignConceptNames(request, concept.concept, storyBible.storyBible, context);

    const chapterPlan = await runProgressStage(
      progress,
      4,
      {
        id: "chapter-plan",
        label: "Lập 15 chương",
        detail: "Đang dựng outline từng chương.",
      },
      async () => {
        const chapterPlanPrompt = buildChapterPlanPrompt({
          request,
          concept: alignedConcept,
          storyBible: storyBible.storyBible,
          linePreset: context.linePreset,
          stylePreset: context.stylePreset,
        });
        const chapterPlanResult = await this.routerClient.generateJson<unknown>({
          model: context.models.planner,
          fallbackModel: context.models.fallback,
          ...chapterPlanPrompt,
          timeoutMs: env.routerPlanningTimeoutMs,
        });

        return {
          chapterPlan: parseChapterPlan(unwrapArrayEnvelope(chapterPlanResult.data, "chapterPlan")),
          modelUsed: chapterPlanResult.modelUsed,
        };
      },
      (result) => `Đã lập chapter plan bằng ${result.modelUsed}.`,
    );

    return runProgressStage(
      progress,
      5,
      {
        id: "assemble-outline",
        label: "Ghép outline",
        detail: "Đang kiểm tra outline và chuẩn bị payload cho studio.",
      },
      async () => {
        validateOutlineGeneration({
          concept: alignedConcept,
          storyBible: storyBible.storyBible,
          chapterPlan: chapterPlan.chapterPlan,
        });

        const title = resolveFinalStoryTitle(alignedConcept, request.titleHint);
        return StoryPayloadSchema.parse({
          title,
          request,
          concept: alignedConcept,
          storyBible: storyBible.storyBible,
          chapterPlan: chapterPlan.chapterPlan,
          chapters: [],
          continuityLite: createContinuityLite(storyBible.storyBible, chapterPlan.chapterPlan),
          meta: {
            generatedAt: new Date().toISOString(),
            modelAliases: {
              planner: context.models.planner,
              bible: context.models.bible,
              drafter: context.models.drafter,
              rewriter: context.models.rewriter,
              fallback: context.models.fallback,
            },
          },
        });
      },
      "Outline đã sẵn sàng.",
    );
  }

  async generateSettingSeed(request: NormalizedOutlineRequest, options?: { recentStoryTitles?: string[] }) {
    const context = await this.loadGenerationContext(request.linePreset, request.stylePreset);
    const recentSeedHistory = (await this.seedHistoryStore?.load()) ?? [];
    const seedBlueprint = createSeedBlueprint({
      linePreset: resolveSeedBlueprintLinePreset(request),
      history: recentSeedHistory,
    });
    const prompt = buildSettingSeedPrompt({
      request,
      linePreset: context.linePreset,
      stylePreset: context.stylePreset,
      seedBlueprint,
      recentSeedHistory,
      recentStoryTitles: options?.recentStoryTitles,
      prosePolishConfig: this.prosePolishConfig,
    });
    const result = await this.routerClient.generateJson<unknown>({
      model: context.models.planner,
      fallbackModel: context.models.fallback,
      ...prompt,
      temperature: 0.92,
      timeoutMs: env.routerPlanningTimeoutMs,
    });

    const rawSeedPackage = GeneratedSettingSeedSchema.parse(unwrapEnvelope(result.data, "seedPackage"));
    const customDramaBranch = request.customCreativeInputs?.dramaBranch?.trim();
    const normalizedSeedPackage = customDramaBranch
      ? GeneratedSettingSeedSchema.parse({
          ...rawSeedPackage,
          linePreset: customDramaBranch,
        })
      : rawSeedPackage;
    const postProcessedSeedPackage = GeneratedSettingSeedSchema.safeParse({
      ...normalizedSeedPackage,
      settingSeed: await this.postProcessText({
        text: normalizedSeedPackage.settingSeed,
        target: "settingSeed",
        outputLanguage: request.outputLanguage,
        models: context.models,
        timeoutMs: env.routerPlanningTimeoutMs,
        contextLabel: "setting seed",
      }),
    });
    const seedPackage = postProcessedSeedPackage.success ? postProcessedSeedPackage.data : normalizedSeedPackage;
    await this.seedHistoryStore?.append({
      fingerprint: seedBlueprint.fingerprint,
      linePreset: seedPackage.linePreset,
      titleHint: seedPackage.titleHint,
      createdAt: new Date().toISOString(),
      blueprint: seedBlueprint,
    });

    return {
      seedPackage,
      meta: {
        modelUsed: result.modelUsed,
        seedFingerprint: seedBlueprint.fingerprint,
      },
    };
  }

  async generateFull(request: NormalizedFullGenerateRequest, progressOptions?: StoryProgressOptions, options?: { recentStoryTitles?: string[] }) {
    const posterStageCount = this.posterGenerator ? 1 : 0;
    const chapterStageOffset = 5 + posterStageCount;
    const finalizeStageNumber = chapterStageOffset + request.chapterCount + 1;
    const totalStages = finalizeStageNumber;
    const progress = resolveProgressOptions(progressOptions, "full", totalStages);
    const initialOutline = await this.generateOutline(request, progress, options);
    const { outline, foundationReport } = await this.applyFoundationGate(initialOutline, request, progress, options);
    const posterPromise = this.startPosterGeneration(outline, progress);
    const chapters: Chapter[] = [];
    let relationshipGraph = createInitialRelationshipGraph(outline.storyBible);

    // ─── Character Consistency System ──────────────────────────────────────
    const memoryStore: CharacterMemoryStore = createEmptyMemoryStore();
    const continuityTracker = new ContinuityTracker({
      storyBible: outline.storyBible,
      chapterPlan: outline.chapterPlan,
    });

    // Reset phrase reuse index for this generation run
    resetPhraseReuseIndex();

    // Canon hard-facts (autonovel gen_canon): lock facts before drafting and
    // feed them into every chapter via the continuity tracker.
    const canonFacts = await this.computeCanonFacts(outline);
    if (canonFacts.length > 0) {
      continuityTracker.setCanonFacts(canonFacts);
      outline.continuityLite = { ...outline.continuityLite, canonFacts };
    }

    // Phát outline (ý tưởng, dàn ý, hồ sơ) ngay sau khi dựng xong để studio
    // hiển thị trước khi chương đầu tiên được viết.
    const outlineStoryPayload = StoryPayloadSchema.parse({
      ...outline,
      request: {
        ...outline.request,
        draftControls: request.draftControls,
      },
      chapters: [],
      relationshipGraph,
      meta: {
        ...outline.meta,
        generatedAt: new Date().toISOString(),
      },
    });
    emitProgress(
      progress,
      5,
      {
        id: "stream-outline",
        label: "Chuẩn bị bản thảo",
        detail: "Đang gửi ý tưởng, dàn ý và hồ sơ tới studio.",
      },
      "completed",
      "Đã gửi ý tưởng, dàn ý và hồ sơ tới studio.",
      { storyPayload: outlineStoryPayload },
    );

    for (const chapterPlanItem of outline.chapterPlan) {
      const chapterStage = {
        id: `chapter-${chapterPlanItem.chapterNumber}`,
        label: `Viết chương ${chapterPlanItem.chapterNumber}/${outline.chapterPlan.length}`,
        detail: `Đang viết "${chapterPlanItem.title}".`,
      };
      const chapter = await runProgressStage(
        progress,
        chapterStageOffset + chapterPlanItem.chapterNumber,
        chapterStage,
        () =>
          this.generateChapter(
            {
              storyBible: outline.storyBible,
              chapterPlan: outline.chapterPlan,
              chapterNumber: chapterPlanItem.chapterNumber,
              previousChapterSummaries: chapters.map(summarizeChapter),
              draftControls: request.draftControls,
              userIntensity: request.storyControls.intensity,
              outputLanguage: request.outputLanguage,
              storyTitle: outline.title,
              voiceLock: this.computeVoiceLock(chapters),
              memoryStore,
              continuityTracker,
            },
            outline.request.stylePreset,
            undefined,
            outline.continuityLite,
            {
              onProgress: (event) => {
                if (event.stageId !== "repair-chapter") {
                  return;
                }

                emitProgress(
                  progress,
                  chapterStageOffset + chapterPlanItem.chapterNumber,
                  chapterStage,
                  event.status,
                  event.status === "started"
                    ? `Đang sửa "${chapterPlanItem.title}" sau khi kiểm tra chất lượng.`
                    : `Đã sửa xong "${chapterPlanItem.title}".`,
                );
              },
            },
          ),
        `Chương ${chapterPlanItem.chapterNumber} đã sẵn sàng.`,
      );

      chapters.push(chapter);

      // Index chapter for phrase reuse tracking
      indexChapter(getOrCreatePhraseReuseIndex(), chapter.chapterNumber, chapter.text);

      // Update continuity tracker with character facts
      const factSheet = memoryStore.chapters.get(chapter.chapterNumber);
      if (factSheet) {
        relationshipGraph = applyCharacterFactsToRelationshipGraph(relationshipGraph, factSheet);
        const chapterRef: MinimalChapterRef = {
          chapterNumber: chapter.chapterNumber,
          title: chapter.title,
          summary: chapter.summary,
          text: chapter.text,
        };
        continuityTracker.recordChapter(chapterRef, factSheet);
      }

      const partialStoryPayload = StoryPayloadSchema.parse({
        ...outline,
        request: {
          ...outline.request,
          draftControls: request.draftControls,
        },
        chapters: [...chapters],
        relationshipGraph,
        meta: {
          ...outline.meta,
          generatedAt: new Date().toISOString(),
        },
      });
      emitProgress(
        progress,
        chapterStageOffset + chapterPlanItem.chapterNumber,
        chapterStage,
        "completed",
        `Chương ${chapterPlanItem.chapterNumber} đã sẵn sàng.`,
        {
          chapter,
          storyPayload: partialStoryPayload,
        },
      );
    }

    const poster = await posterPromise;
    const evaluationModels: PostProcessModels = {
      rewriter: outline.meta.modelAliases.rewriter ?? outline.meta.modelAliases.drafter,
      fallback: outline.meta.modelAliases.fallback,
    };
    const baseAssembledStoryPayload = StoryPayloadSchema.parse({
      ...outline,
      request: {
        ...outline.request,
        draftControls: request.draftControls,
      },
      chapters,
      relationshipGraph,
      meta: {
        ...outline.meta,
        generatedAt: new Date().toISOString(),
        ...(poster ? { poster } : {}),
        ...(foundationReport ? { foundationReport } : {}),
        ...((): { propagationDebt?: StoryPayload["meta"]["propagationDebt"] } => {
          const propagationDebt = this.computePropagationDebt(continuityTracker);
          return propagationDebt ? { propagationDebt } : {};
        })(),
      },
    });
    return runProgressStage(
      progress,
      finalizeStageNumber,
      {
        id: "finalize-story",
        label: "Hoàn tất truyện",
        detail: "Đang kiểm tra bản thảo đã ghép.",
      },
      async () => {
        const evaluations = await this.runManuscriptEvaluations(baseAssembledStoryPayload, evaluationModels);
        if (!evaluations.readerPanel && !evaluations.manuscriptReview) {
          return baseAssembledStoryPayload;
        }
        const withReports = StoryPayloadSchema.parse({
          ...baseAssembledStoryPayload,
          meta: {
            ...baseAssembledStoryPayload.meta,
            ...evaluations,
          },
        });
        const { chapters: revisedChapters, revised } = await this.maybeRunRevisionLoop(withReports, evaluations);
        if (revised.length === 0) {
          return withReports;
        }
        return StoryPayloadSchema.parse({
          ...withReports,
          chapters: revisedChapters,
          meta: { ...withReports.meta, generatedAt: new Date().toISOString() },
        });
      },
      `Đã ghép ${chapters.length} chương.`,
    );
  }

  async resumeFull(storyPayloadInput: StoryPayload, progressOptions?: StoryProgressOptions) {
    const storyPayload = validateStoryPayload(storyPayloadInput);
    const remainingChapterPlan = getRemainingChapterPlanItems(storyPayload);

    if (remainingChapterPlan.length === 0) {
      return storyPayload;
    }

    const totalStages = remainingChapterPlan.length + 1;
    const progress = resolveProgressOptions(progressOptions, "full", totalStages);
    const chapters: Chapter[] = [...storyPayload.chapters].sort((left, right) => left.chapterNumber - right.chapterNumber);
    let relationshipGraph = storyPayload.relationshipGraph ?? createInitialRelationshipGraph(storyPayload.storyBible);
    const memoryStore: CharacterMemoryStore = createEmptyMemoryStore();

    resetPhraseReuseIndex();
    for (const chapter of chapters) {
      indexChapter(getOrCreatePhraseReuseIndex(), chapter.chapterNumber, chapter.text);
    }

    for (const [index, chapterPlanItem] of remainingChapterPlan.entries()) {
      const stageIndex = index + 1;
      const chapterStage = {
        id: `resume-chapter-${chapterPlanItem.chapterNumber}`,
        label: `Viết tiếp chương ${chapterPlanItem.chapterNumber}/${storyPayload.chapterPlan.length}`,
        detail: `Đang viết tiếp "${chapterPlanItem.title}".`,
      };
      const chapter = await runProgressStage(
        progress,
        stageIndex,
        chapterStage,
        () =>
          this.generateChapter(
            {
              storyBible: storyPayload.storyBible,
              chapterPlan: storyPayload.chapterPlan,
              chapterNumber: chapterPlanItem.chapterNumber,
              previousChapterSummaries: chapters
                .filter((item) => item.chapterNumber < chapterPlanItem.chapterNumber)
                .map(summarizeChapter),
              draftControls: storyPayload.request.draftControls,
              userIntensity: storyPayload.request.storyControls.intensity,
              outputLanguage: storyPayload.request.outputLanguage,
              storyTitle: storyPayload.title,
              voiceLock: this.computeVoiceLock(chapters),
              memoryStore,
            },
            storyPayload.request.stylePreset,
            undefined,
            storyPayload.continuityLite,
            {
              onProgress: (event) => {
                if (event.stageId !== "repair-chapter") {
                  return;
                }

                emitProgress(
                  progress,
                  stageIndex,
                  chapterStage,
                  event.status,
                  event.status === "started"
                    ? `Đang sửa "${chapterPlanItem.title}" sau khi kiểm tra chất lượng.`
                    : `Đã sửa xong "${chapterPlanItem.title}".`,
                );
              },
            },
          ),
        `Chương ${chapterPlanItem.chapterNumber} đã sẵn sàng.`,
      );

      chapters.push(chapter);
      chapters.sort((left, right) => left.chapterNumber - right.chapterNumber);
      indexChapter(getOrCreatePhraseReuseIndex(), chapter.chapterNumber, chapter.text);

      const factSheet = memoryStore.chapters.get(chapter.chapterNumber);
      if (factSheet) {
        relationshipGraph = applyCharacterFactsToRelationshipGraph(relationshipGraph, factSheet);
      }

      const partialStoryPayload = StoryPayloadSchema.parse({
        ...storyPayload,
        chapters: [...chapters],
        relationshipGraph,
        meta: {
          ...storyPayload.meta,
          generatedAt: new Date().toISOString(),
        },
      });
      emitProgress(
        progress,
        stageIndex,
        chapterStage,
        "completed",
        `Chương ${chapterPlanItem.chapterNumber} đã sẵn sàng.`,
        {
          chapter,
          storyPayload: partialStoryPayload,
        },
      );
    }

    const assembledStoryPayload = StoryPayloadSchema.parse({
      ...storyPayload,
      chapters,
      relationshipGraph,
      meta: {
        ...storyPayload.meta,
        generatedAt: new Date().toISOString(),
      },
    });
    const evaluationModels: PostProcessModels = {
      rewriter: storyPayload.meta.modelAliases.rewriter ?? storyPayload.meta.modelAliases.drafter,
      fallback: storyPayload.meta.modelAliases.fallback,
    };
    return runProgressStage(
      progress,
      totalStages,
      {
        id: "finalize-resumed-story",
        label: "Hoàn tất truyện",
        detail: "Đang kiểm tra bản thảo viết tiếp đã ghép.",
      },
      async () => {
        const evaluations = await this.runManuscriptEvaluations(assembledStoryPayload, evaluationModels);
        if (!evaluations.readerPanel && !evaluations.manuscriptReview) {
          return assembledStoryPayload;
        }
        const withReports = StoryPayloadSchema.parse({
          ...assembledStoryPayload,
          meta: {
            ...assembledStoryPayload.meta,
            ...evaluations,
          },
        });
        const { chapters: revisedChapters, revised } = await this.maybeRunRevisionLoop(withReports, evaluations);
        if (revised.length === 0) {
          return withReports;
        }
        return StoryPayloadSchema.parse({
          ...withReports,
          chapters: revisedChapters,
          meta: { ...withReports.meta, generatedAt: new Date().toISOString() },
        });
      },
      `Đã ghép ${chapters.length} chương.`,
    );
  }

  async generateChapter(
    request: GenerateChapterRequest,
    stylePresetName?: string,
    _legacyInspiredByPresetName?: string,
    continuityLite?: StoryPayload["continuityLite"],
    progressOptions?: StoryProgressOptions,
  ) {
    const parsed = GenerateChapterRequestSchema.parse(request);
    ensureChapterPlanIntegrity(parsed.chapterPlan);

    const chapterPlanItem = parsed.chapterPlan.find((chapter: ChapterPlanItem) => chapter.chapterNumber === parsed.chapterNumber);
    if (!chapterPlanItem) {
      throw new AppError("VALIDATION_ERROR", `Chapter ${parsed.chapterNumber} does not exist in chapterPlan.`, 400);
    }

    const progress = resolveProgressOptions(progressOptions, "chapter", 4);
    const draftControls = resolveDraftControls(parsed.draftControls);
    const context = await runProgressStage(
      progress,
      1,
      {
        id: "load-context",
        label: "Nạp ngữ cảnh chương",
        detail: "Đang nạp preset văn phong và alias model cho bản thảo.",
      },
      () =>
        this.loadGenerationContext(
          env.defaultLinePreset,
          stylePresetName ?? env.defaultStylePreset,
        ),
      "Đã nạp xong ngữ cảnh chương.",
    );

    // ─── Enhanced continuity context (includes character memory) ───────────
    const memoryStore = parsed.memoryStore as CharacterMemoryStore | undefined;
    const continuityTracker = parsed.continuityTracker as ContinuityTracker | undefined;
    const enhancedContinuity: StoryPayload["continuityLite"] | undefined = continuityTracker
      ? continuityTracker.getContinuityContext(parsed.chapterNumber) as StoryPayload["continuityLite"]
      : continuityLite;

    const chapterPrompt = buildChapterDraftPrompt({
      storyTitle: parsed.storyTitle,
      storyBible: parsed.storyBible,
      chapterPlanItem,
      previousChapterSummaries: parsed.previousChapterSummaries,
      continuityLite: enhancedContinuity,
      draftControls,
      userIntensity: parsed.userIntensity,
      outputLanguage: parsed.outputLanguage ?? "english",
      stylePreset: context.stylePreset,
      prosePolishConfig: this.prosePolishConfig,
      voiceLock: parsed.voiceLock,
    });

    const chapterResult = await runProgressStage(
      progress,
      2,
      {
        id: "draft-chapter",
        label: `Viết chương ${parsed.chapterNumber}`,
        detail: `Đang viết "${chapterPlanItem.title}".`,
      },
      async () => {
        const result = await this.routerClient.generateJson<unknown>({
          model: context.models.drafter,
          fallbackModel: context.models.fallback,
          ...chapterPrompt,
          temperature: CHAPTER_DRAFT_TEMPERATURE,
          timeoutMs: env.routerChapterTimeoutMs,
        });

        return {
          chapter: unwrapEnvelope(result.data, "chapter"),
          modelUsed: result.modelUsed,
        };
      },
      (result) => `Đã nhận bản thảo từ ${result.modelUsed}.`,
    );

    const draftedChapter = await runProgressStage(
      progress,
      3,
      {
        id: "repair-chapter",
        label: "Sửa chương nếu cần",
        detail: "Đang kiểm tra chất lượng, tính nhất quán nhân vật và thử sửa nếu cần.",
      },
      async () => {
        const chapter = await this.postProcessChapterText(
          alignChapterTitleWithPlan(
            validateChapterDraft(chapterResult.chapter, parsed.chapterNumber),
            chapterPlanItem.title,
          ),
          {
            target: "chapter",
            outputLanguage: parsed.outputLanguage ?? "english",
            models: context.models,
            timeoutMs: env.routerChapterTimeoutMs,
            contextLabel: `chapter ${parsed.chapterNumber}`,
          },
        );
        let metrics = analyzeChapterQuality(
          chapter.text,
          draftControls,
          parsed.outputLanguage ?? "english",
          parsed.chapterNumber,
          parsed.userIntensity,
        );

        // ─── Character Consistency Check ──────────────────────────────────
        let driftReport: DriftReport | null = null;
        if (memoryStore && memoryStore.chapters.size > 0) {
          driftReport = await validateConsistency(
            chapter.text,
            parsed.chapterNumber,
            parsed.storyBible,
            memoryStore,
            this.routerClient,
          );
        }

        const needsRepair = needsChapterRetry(metrics) || (driftReport && hasCriticalViolations(driftReport));

        if (!needsRepair) {
          // Extract facts and store even if no repair needed
          if (memoryStore) {
            try {
              const factSheet = await extractCharacterFacts(
                chapter.text,
                parsed.chapterNumber,
                parsed.storyBible,
                parsed.outputLanguage ?? "english",
                this.routerClient,
              );
              memoryStore.chapters = addFactSheet(memoryStore, factSheet).chapters;
            } catch {
              // Fail-open: character extraction should not block chapter completion
            }
          }
          return {
            chapter,
            repaired: false,
          };
        }

        let repairedChapter = chapter;
        const maxAttempts = driftReport ? MAX_CHAPTER_REPAIR_ATTEMPTS + 1 : MAX_CHAPTER_REPAIR_ATTEMPTS;

        for (let repairAttempt = 1; repairAttempt <= maxAttempts; repairAttempt += 1) {
          const repairPrompt = buildChapterRepairPrompt({
            previousDraft: repairedChapter.text,
            failures: metrics.failures,
            draftControls,
            chapterPlanItem,
            userIntensity: parsed.userIntensity,
            repairAttempt,
            maxRepairAttempts: maxAttempts,
            previousMetrics: {
              wordCount: metrics.wordCount,
              dialogueRatio: metrics.dialogueRatio,
            },
            driftViolations: driftReport?.violations.map((v) => ({
              type: v.type,
              character: v.characterName,
              excerpt: v.excerpt,
              description: v.contradictedFact,
            })),
            outputLanguage: parsed.outputLanguage ?? "english",
            prosePolishConfig: this.prosePolishConfig,
          });
          const repairedResult = await this.routerClient.generateJson<unknown>({
            model: context.models.rewriter,
            fallbackModel: context.models.fallback,
            systemPrompt: chapterPrompt.systemPrompt,
            userPrompt: `${chapterPrompt.userPrompt}\n\n${repairPrompt}`,
            temperature: CHAPTER_REPAIR_TEMPERATURE,
            timeoutMs: env.routerChapterTimeoutMs,
          });
          repairedChapter = await this.postProcessChapterText(
            alignChapterTitleWithPlan(
              validateChapterDraft(unwrapEnvelope(repairedResult.data, "chapter"), parsed.chapterNumber),
              chapterPlanItem.title,
            ),
            {
              target: "chapter",
              outputLanguage: parsed.outputLanguage ?? "english",
              models: context.models,
              timeoutMs: env.routerChapterTimeoutMs,
              contextLabel: `chapter ${parsed.chapterNumber} repair ${repairAttempt}`,
            },
          );
          metrics = analyzeChapterQuality(
            repairedChapter.text,
            draftControls,
            parsed.outputLanguage ?? "english",
            parsed.chapterNumber,
            parsed.userIntensity,
          );

          // Re-check consistency after repair
          if (memoryStore) {
            driftReport = await validateConsistency(
              repairedChapter.text,
              parsed.chapterNumber,
              parsed.storyBible,
              memoryStore,
              this.routerClient,
            );
          }

          const stillNeedsRepair = needsChapterRetry(metrics) || (driftReport && hasCriticalViolations(driftReport));

          if (!stillNeedsRepair) {
            // Extract facts and store
            if (memoryStore) {
              try {
                const factSheet = await extractCharacterFacts(
                  repairedChapter.text,
                  parsed.chapterNumber,
                  parsed.storyBible,
                  parsed.outputLanguage ?? "english",
                  this.routerClient,
                );
                memoryStore.chapters = addFactSheet(memoryStore, factSheet).chapters;
              } catch {
                // Fail-open
              }
            }
            return {
              chapter: repairedChapter,
              repaired: true,
            };
          }
        }

        // Extract facts even if repair failed (so next chapters have context)
        if (memoryStore) {
          try {
            const factSheet = await extractCharacterFacts(
              repairedChapter.text,
              parsed.chapterNumber,
              parsed.storyBible,
              parsed.outputLanguage ?? "english",
              this.routerClient,
            );
            memoryStore.chapters = addFactSheet(memoryStore, factSheet).chapters;
          } catch {
            // Fail-open
          }
        }

        if (hasOnlySoftChapterQualityFailures(metrics)) {
          return {
            chapter: repairedChapter,
            repaired: true,
          };
        }

        throw new AppError(
          "MODEL_OUTPUT_INVALID",
          `Chapter ${parsed.chapterNumber} still failed quality checks after ${maxAttempts} repair attempts: ${metrics.failures.join("; ")}.`,
          502,
          {
            chapterNumber: parsed.chapterNumber,
            failures: metrics.failures,
            metrics,
          },
        );
      },
      (result) => {
        if (!result.repaired) {
          return "Chất lượng đã đạt; không cần sửa.";
        }

        return `Đã sửa xong chương ${parsed.chapterNumber}.`;
      },
    );

    return runProgressStage(
      progress,
      4,
      {
        id: "validate-chapter",
        label: "Chốt chương",
        detail: "Đang xác nhận bản thảo cuối hợp lệ và sẵn sàng trả về.",
      },
      async () => {
        if (!draftedChapter.repaired) {
          return this.maybeTightenChapter(draftedChapter.chapter, {
            draftControls,
            outputLanguage: parsed.outputLanguage ?? "english",
            models: context.models,
            chapterNumber: parsed.chapterNumber,
            userIntensity: parsed.userIntensity,
            timeoutMs: env.routerChapterTimeoutMs,
          });
        }

        const finalMetrics = analyzeChapterQuality(
          draftedChapter.chapter.text,
          draftControls,
          parsed.outputLanguage ?? "english",
          parsed.chapterNumber,
          parsed.userIntensity,
        );
        if (needsChapterRetry(finalMetrics) && !hasOnlySoftChapterQualityFailures(finalMetrics)) {
          throw new AppError(
            "MODEL_OUTPUT_INVALID",
            `Chapter ${parsed.chapterNumber} still failed quality checks after repair: ${finalMetrics.failures.join("; ")}.`,
            502,
            {
              chapterNumber: parsed.chapterNumber,
              failures: finalMetrics.failures,
              metrics: finalMetrics,
            },
          );
        }

        return this.maybeTightenChapter(draftedChapter.chapter, {
          draftControls,
          outputLanguage: parsed.outputLanguage ?? "english",
          models: context.models,
          chapterNumber: parsed.chapterNumber,
          userIntensity: parsed.userIntensity,
          timeoutMs: env.routerChapterTimeoutMs,
        });
      },
      `Chương ${parsed.chapterNumber} đã sẵn sàng.`,
    );
  }


  async regenerateChapter(request: RegenerateChapterRequest, progressOptions?: StoryProgressOptions) {
    const parsed = RegenerateChapterRequestSchema.parse(request);
    const storyPayload = validateStoryPayload(parsed.storyPayload);

    const targetChapterPlan = storyPayload.chapterPlan.find((chapter: ChapterPlanItem) => chapter.chapterNumber === parsed.targetChapter);
    const currentChapter = storyPayload.chapters.find((chapter: Chapter) => chapter.chapterNumber === parsed.targetChapter);

    if (!targetChapterPlan) {
      throw new AppError("VALIDATION_ERROR", `Story payload does not define chapter ${parsed.targetChapter} in the chapter plan.`, 400);
    }

    if (!currentChapter) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Chapter ${parsed.targetChapter} has not been drafted yet. Generate Full Story before using Regenerate Chapter.`,
        400,
      );
    }

    const progress = resolveProgressOptions(progressOptions, "regenerate", 3);
    const context = await runProgressStage(
      progress,
      1,
      {
        id: "load-context",
        label: "Nạp ngữ cảnh viết lại",
        detail: "Đang nạp preset và alias model cho lượt viết lại.",
      },
      () =>
        this.loadGenerationContext(
          storyPayload.request.linePreset,
          storyPayload.request.stylePreset,
        ),
      "Đã nạp xong ngữ cảnh viết lại.",
    );

    const rewrittenChapter = await runProgressStage(
      progress,
      2,
      {
        id: "rewrite-chapter",
        label: `Viết lại chương ${parsed.targetChapter}`,
        detail: `Đang áp dụng ${parsed.mode} cho chương ${parsed.targetChapter}.`,
      },
      async () => {
        const regeneratePrompt = buildRegenerateChapterPrompt({
          storyTitle: storyPayload.title,
          storyBible: storyPayload.storyBible,
          chapterPlanItem: targetChapterPlan,
          currentChapter,
          continuityLite: storyPayload.continuityLite,
          instruction: parsed.instruction,
          mode: parsed.mode,
          preserveConstraints: parsed.preserveConstraints,
          outputLanguage: storyPayload.request.outputLanguage,
          stylePreset: context.stylePreset,
          prosePolishConfig: this.prosePolishConfig,
        });

        const regenerateResult = await this.routerClient.generateJson<unknown>({
          model: context.models.rewriter,
          fallbackModel: context.models.fallback,
          ...regeneratePrompt,
          temperature: 0.75,
          timeoutMs: env.routerChapterTimeoutMs,
        });

        const chapter = await this.postProcessChapterText(
          alignChapterTitleWithPlan(
            validateChapterDraft(unwrapEnvelope(regenerateResult.data, "chapter"), parsed.targetChapter),
            targetChapterPlan.title,
          ),
          {
            target: "regenerate",
            outputLanguage: storyPayload.request.outputLanguage,
            models: context.models,
            timeoutMs: env.routerChapterTimeoutMs,
            contextLabel: `regenerated chapter ${parsed.targetChapter}`,
          },
        );

        return {
          chapter,
          modelUsed: regenerateResult.modelUsed,
        };
      },
      (result) => `Đã nhận bản viết lại từ ${result.modelUsed}.`,
    );

    return runProgressStage(
      progress,
      3,
      {
        id: "merge-story",
        label: "Gộp chương đã viết lại",
        detail: "Đang cập nhật story payload bằng bản thảo mới.",
      },
      async () => {
        const chapters = storyPayload.chapters.map((chapter: Chapter) =>
          chapter.chapterNumber === parsed.targetChapter ? rewrittenChapter.chapter : chapter,
        );

        const nextPayload = StoryPayloadSchema.parse({
          ...storyPayload,
          chapters,
          meta: {
            ...storyPayload.meta,
            generatedAt: new Date().toISOString(),
          },
        });

        return {
          chapter: rewrittenChapter.chapter,
          storyPayload: nextPayload,
        };
      },
      `Đã gộp chương ${parsed.targetChapter} vào truyện.`,
    );
  }

  async exportMarkdown(storyPayloadInput: unknown, options?: { filename?: string; writeToFile?: boolean }) {
    const storyPayload = validateStoryPayload(storyPayloadInput);
    const markdown = renderStoryMarkdown(storyPayload);
    const filePath = await maybeWriteMarkdownFile(storyPayload, markdown, options);

    return {
      markdown,
      filePath,
    };
  }

  async exportChapterMarkdownFiles(storyPayloadInput: unknown, outputDirectory: string) {
    const storyPayload = validateStoryPayload(storyPayloadInput);
    if (storyPayload.chapters.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Story payload does not contain drafted chapters.", 400);
    }

    const filePaths = await writeChapterMarkdownFiles(storyPayload, outputDirectory);
    return {
      filePaths,
      count: filePaths.length,
    };
  }

  exportStoryPdfHtml(storyPayloadInput: unknown) {
    const storyPayload = validateStoryPayload(storyPayloadInput);
    if (storyPayload.chapters.length === 0) {
      throw new AppError("VALIDATION_ERROR", "Story payload does not contain drafted chapters.", 400);
    }

    return renderStoryPdfHtml(storyPayload);
  }

  private async loadGenerationContext(linePresetName: string, stylePresetName: string) {
    const [linePreset, stylePreset, loadedModels] = await Promise.all([
      this.presetLoader.loadLinePreset(linePresetName),
      this.presetLoader.loadStylePreset(stylePresetName),
      this.presetLoader.loadModelPreset(this.modelPresetName),
    ]);

    const models = this.modelAliasOverride
      ? {
        planner: this.modelAliasOverride,
        bible: this.modelAliasOverride,
        drafter: this.modelAliasOverride,
        rewriter: this.modelAliasOverride,
        fallback: this.modelAliasOverride,
      }
      : loadedModels;

    return {
      linePreset,
      stylePreset,
      models,
    };
  }

  private async postProcessChapterText(
    chapter: Chapter,
    options: {
      target: ProsePolishTarget;
      outputLanguage: string;
      models: PostProcessModels;
      timeoutMs?: number;
      contextLabel?: string;
    },
  ): Promise<Chapter> {
    const text = await this.postProcessText({
      text: chapter.text,
      ...options,
    });

    if (text === chapter.text) {
      return chapter;
    }

    return {
      ...chapter,
      text,
    };
  }

  private postProcessText(params: {
    text: string;
    target: ProsePolishTarget;
    outputLanguage: string;
    models: PostProcessModels;
    timeoutMs?: number;
    contextLabel?: string;
  }) {
    return postProcessProseHumanizer({
      text: params.text,
      target: params.target,
      outputLanguage: params.outputLanguage,
      config: this.prosePolishConfig,
      routerClient: this.routerClient,
      model: params.models.rewriter,
      fallbackModel: params.models.fallback,
      timeoutMs: params.timeoutMs,
      contextLabel: params.contextLabel,
    });
  }

  /**
   * Derive a prompt-only "voice lock" from the chapters written so far so later
   * chapters keep the same prose register (autonovel voice fingerprint).
   * Cheap (no LLM), opt-out via VOICE_LOCK_ENABLED=false. Returns undefined when
   * disabled, when there is nothing to sample, or on any analysis miss.
   */
  /**
   * Generate canon hard-facts (autonovel gen_canon) for a freshly built
   * outline. Opt-in via CANON_FACTS_ENABLED; fail-open returns [].
   */
  private async computeCanonFacts(outline: StoryPayload): Promise<string[]> {
    if (!env.canonFactsEnabled) {
      return [];
    }
    return generateCanonFacts({
      concept: outline.concept,
      storyBible: outline.storyBible,
      chapterPlan: outline.chapterPlan,
      outputLanguage: outline.request.outputLanguage,
      routerClient: this.routerClient,
      model: outline.meta.modelAliases.planner,
      fallbackModel: outline.meta.modelAliases.fallback,
      timeoutMs: env.routerPlanningTimeoutMs,
    });
  }

  private computeVoiceLock(chapters: Chapter[]): string | undefined {
    if (!env.voiceLockEnabled || chapters.length === 0) {
      return undefined;
    }
    const fingerprint = analyzeVoiceFingerprint(chapters.map((chapter) => chapter.text));
    return fingerprint ? buildVoiceLockInstruction(fingerprint) : undefined;
  }

  /**
   * Build the propagation-debt ledger (autonovel state.json) from the continuity
   * tracker once the story is assembled. Prompt-free analysis; opt-out via
   * PROPAGATION_LEDGER_ENABLED=false. Returns undefined when disabled or empty.
   */
  private computePropagationDebt(continuityTracker?: ContinuityTracker): StoryPayload["meta"]["propagationDebt"] {
    if (!env.propagationLedgerEnabled || !continuityTracker) {
      return undefined;
    }
    try {
      const plotBeats = continuityTracker.getPlotBeatReport();
      const debts = buildPropagationLedger({
        foreshadow: continuityTracker.getForeshadowReport(),
        plotBeats,
        establishedFacts: continuityTracker.getAllEstablishedFacts(),
        totalChapters: plotBeats.total,
      });
      return debts.length > 0 ? debts : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * autonovel adversarial-cut pass on a finalized chapter (opt-in via
   * ADVERSARIAL_CUT_ENABLED). The tightened text is re-checked against the
   * quality gate; if the cut introduced a hard failure the original is kept.
   * Fully fail-open: any error returns the chapter unchanged.
   */
  private async maybeTightenChapter(
    chapter: Chapter,
    options: {
      draftControls: DraftControls;
      outputLanguage: OutputLanguage;
      models: PostProcessModels;
      chapterNumber: number;
      userIntensity?: number;
      timeoutMs?: number;
    },
  ): Promise<Chapter> {
    if (!env.adversarialCutEnabled) {
      return chapter;
    }

    try {
      const tightened = await tightenChapterText({
        text: chapter.text,
        outputLanguage: options.outputLanguage,
        routerClient: this.routerClient,
        model: options.models.rewriter,
        fallbackModel: options.models.fallback,
        timeoutMs: options.timeoutMs,
        targetCutRatio: env.adversarialCutTargetRatio,
        contextLabel: `chapter ${options.chapterNumber} adversarial cut`,
      });

      if (tightened === chapter.text) {
        return chapter;
      }

      const metrics = analyzeChapterQuality(
        tightened,
        options.draftControls,
        options.outputLanguage,
        options.chapterNumber,
        options.userIntensity,
      );
      if (needsChapterRetry(metrics) && !hasOnlySoftChapterQualityFailures(metrics)) {
        // Cut broke a hard rule (e.g. word count floor) — keep the original.
        return chapter;
      }

      return { ...chapter, text: tightened };
    } catch {
      return chapter;
    }
  }

  /**
   * Foundation gate (autonovel Phase 1): score the freshly built outline and,
   * if it is below FOUNDATION_GATE_MIN_SCORE, rebuild the whole outline up to
   * FOUNDATION_GATE_MAX_ATTEMPTS times, keeping the highest-scoring version.
   * Opt-in via FOUNDATION_GATE_ENABLED. Fail-open: a null evaluation counts as
   * a pass, and any error returns the original outline untouched.
   */
  private async applyFoundationGate(
    outline: StoryPayload,
    request: NormalizedFullGenerateRequest,
    progress: ResolvedStoryProgressOptions,
    options?: { recentStoryTitles?: string[] },
  ): Promise<{ outline: StoryPayload; foundationReport?: FoundationReport }> {
    if (!env.foundationGateEnabled) {
      return { outline };
    }

    const models: PostProcessModels = {
      rewriter: outline.meta.modelAliases.planner,
      fallback: outline.meta.modelAliases.fallback,
    };

    const evaluate = (candidate: StoryPayload) =>
      evaluateFoundation({
        concept: candidate.concept,
        storyBible: candidate.storyBible,
        chapterPlan: candidate.chapterPlan,
        outputLanguage: candidate.request.outputLanguage,
        linePreset: candidate.request.linePreset,
        routerClient: this.routerClient,
        model: models.rewriter,
        fallbackModel: models.fallback,
        timeoutMs: env.routerPlanningTimeoutMs,
      });

    try {
      let best = outline;
      let bestReport = await evaluate(outline);
      let attempts = 1;

      // null report = evaluation unavailable -> treat as pass (fail-open).
      while (
        bestReport !== null &&
        bestReport.overallScore < env.foundationGateMinScore &&
        attempts < env.foundationGateMaxAttempts
      ) {
        attempts += 1;
        const candidate = await this.generateOutline(request, progress, options);
        const candidateReport = await evaluate(candidate);
        if (!candidateReport || candidateReport.overallScore > (bestReport?.overallScore ?? 0)) {
          best = candidate;
          bestReport = candidateReport;
          if (!candidateReport) break; // can't compare further; keep this one
        }
      }

      const foundationReport = bestReport ? { ...bestReport, attempts } : undefined;
      return { outline: best, foundationReport };
    } catch {
      return { outline };
    }
  }

  /**
   * Run the novel-level evaluations (autonovel reader panel + expert review).
   * Both are opt-in, run in parallel, and fail-open: a failed evaluation simply
   * yields no report and never blocks story completion.
   */
  private async runManuscriptEvaluations(
    storyPayload: StoryPayload,
    models: PostProcessModels,
  ): Promise<Pick<StoryPayload["meta"], "readerPanel" | "manuscriptReview">> {
    if ((!env.readerPanelEnabled && !env.manuscriptReviewEnabled) || storyPayload.chapters.length === 0) {
      return {};
    }

    const concept = { logline: storyPayload.concept.logline, promise: storyPayload.concept.promise };
    const [readerPanel, manuscriptReview] = await Promise.all([
      env.readerPanelEnabled
        ? runReaderPanel({
            title: storyPayload.title,
            concept,
            chapters: storyPayload.chapters,
            outputLanguage: storyPayload.request.outputLanguage,
            routerClient: this.routerClient,
            model: models.rewriter,
            fallbackModel: models.fallback,
            timeoutMs: env.routerPlanningTimeoutMs,
          })
        : Promise.resolve(null),
      env.manuscriptReviewEnabled
        ? reviewManuscript({
            title: storyPayload.title,
            concept,
            chapters: storyPayload.chapters,
            outputLanguage: storyPayload.request.outputLanguage,
            routerClient: this.routerClient,
            model: models.rewriter,
            fallbackModel: models.fallback,
            timeoutMs: env.routerPlanningTimeoutMs,
          })
        : Promise.resolve(null),
    ]);

    return {
      ...(readerPanel ? { readerPanel } : {}),
      ...(manuscriptReview ? { manuscriptReview } : {}),
    };
  }

  /**
   * autonovel revision loop: turn the evaluation reports into per-chapter
   * revision briefs and rewrite the highest-priority chapters in place
   * (opt-in via REVISION_LOOP_ENABLED, capped by REVISION_MAX_CHAPTERS).
   *
   * Each rewrite is re-checked against the quality gate; if a rewrite would
   * introduce a hard failure or the model errors, the original chapter is kept.
   * Fully fail-open — never throws, never blocks completion.
   */
  private async maybeRunRevisionLoop(
    storyPayload: StoryPayload,
    reports: Pick<StoryPayload["meta"], "readerPanel" | "manuscriptReview">,
  ): Promise<{ chapters: Chapter[]; revised: number[] }> {
    const unchanged = { chapters: storyPayload.chapters, revised: [] as number[] };
    if (!env.revisionLoopEnabled || storyPayload.chapters.length === 0) {
      return unchanged;
    }

    const briefs = planChapterRevisions(reports.readerPanel, reports.manuscriptReview, {
      minSeverity: "high",
      maxChapters: env.revisionMaxChapters,
    });
    if (briefs.length === 0) {
      return unchanged;
    }

    try {
      const context = await this.loadGenerationContext(
        storyPayload.request.linePreset,
        storyPayload.request.stylePreset,
      );
      const draftControls = resolveDraftControls(storyPayload.request.draftControls);
      const outputLanguage = storyPayload.request.outputLanguage;
      const chapters = [...storyPayload.chapters];
      const revised: number[] = [];

      for (const brief of briefs) {
        const index = chapters.findIndex((chapter) => chapter.chapterNumber === brief.chapterNumber);
        const chapterPlanItem = storyPayload.chapterPlan.find((item) => item.chapterNumber === brief.chapterNumber);
        if (index === -1 || !chapterPlanItem) {
          continue;
        }
        const current = chapters[index];

        try {
          const revisePrompt = buildRegenerateChapterPrompt({
            storyTitle: storyPayload.title,
            storyBible: storyPayload.storyBible,
            chapterPlanItem,
            currentChapter: {
              chapterNumber: current.chapterNumber,
              title: current.title,
              summary: current.summary ?? "",
              text: current.text,
            },
            continuityLite: storyPayload.continuityLite,
            instruction: buildRevisionInstruction(brief),
            mode: "rewrite_chapter",
            preserveConstraints: { preserveNames: true, preserveMainReveal: true, preserveEndingMode: true },
            outputLanguage,
            stylePreset: context.stylePreset,
            prosePolishConfig: this.prosePolishConfig,
          });

          const result = await this.routerClient.generateJson<unknown>({
            model: context.models.rewriter,
            fallbackModel: context.models.fallback,
            ...revisePrompt,
            temperature: 0.7,
            timeoutMs: env.routerChapterTimeoutMs,
          });

          const candidate = alignChapterTitleWithPlan(
            validateChapterDraft(unwrapEnvelope(result.data, "chapter"), current.chapterNumber),
            chapterPlanItem.title,
          );
          const metrics = analyzeChapterQuality(
            candidate.text,
            draftControls,
            outputLanguage,
            current.chapterNumber,
            storyPayload.request.storyControls.intensity,
          );
          if (needsChapterRetry(metrics) && !hasOnlySoftChapterQualityFailures(metrics)) {
            continue; // keep original — revision broke a hard rule
          }

          chapters[index] = candidate;
          revised.push(current.chapterNumber);
        } catch {
          // keep original chapter on any failure
        }
      }

      chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
      return { chapters, revised };
    } catch {
      return unchanged;
    }
  }

  private startPosterGeneration(outline: StoryPayload, progress: ResolvedStoryProgressOptions) {
    if (!this.posterGenerator) {
      return Promise.resolve<StoryPosterResult | undefined>(undefined);
    }

    const posterStage = {
      id: "poster-image",
      label: "Tạo poster",
      detail: "Đang tạo poster 16:9 bằng GPT-Image 2.",
    };
    emitProgress(progress, 6, posterStage, "started");

    return this.posterGenerator.generatePoster(outline)
      .then((poster) => {
        emitProgress(
          progress,
          6,
          posterStage,
          "completed",
          poster.status === "completed"
            ? `Đã tạo poster: ${poster.filePath}.`
            : `Poster ${poster.status}: ${poster.error || "không có chi tiết."}`,
        );
        return poster;
      })
      .catch((error) => {
        const failedPoster: StoryPosterResult = {
          status: "failed",
          title: outline.title,
          model: "gpt-image-2",
          size: "1536x1024",
          generatedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        };
        emitProgress(
          progress,
          6,
          posterStage,
          "completed",
          `Poster failed: ${failedPoster.error}`,
        );
        return failedPoster;
      });
  }

}

function resolveSeedBlueprintLinePreset(request: NormalizedOutlineRequest) {
  const customDramaBranch = request.customCreativeInputs?.dramaBranch?.toLowerCase() || "";
  if (!customDramaBranch) {
    return request.linePreset;
  }

  const customNicheRoutes: Array<{ linePreset: string; pattern: RegExp }> = [
    {
      linePreset: "werewolf_luna_alpha_soulmate",
      pattern: /\b(werewolf|wolf|luna|alpha|mate|soulmate|moon wolf|rejected mate|second chance|pack|blood moon|rival luna)\b/i,
    },
    {
      linePreset: "steamy_alien_captive_romance",
      pattern: /\b(steamy|alien|alien master|alien masters|captive|captivity|dominant|warship|alien king|alien commander|collar)\b/i,
    },
    {
      linePreset: "workplace_ceo_power_struggle",
      pattern: /\b(workplace|office|ceo|corporate|startup|layoff|fired|boss|hr|board|pitch|cap table|investor|employee|coworker|career|company|slack|audit)\b/i,
    },
    {
      linePreset: "medical_hidden_doctor_life_care",
      pattern: /\b(medical|medicine|hospital|doctor|surgeon|nurse|clinic|patient|triage|surgery|consent|chart|pharmacy|ambulance|care|ward|insurance)\b/i,
    },
    {
      linePreset: "school_campus_bullying_identity",
      pattern: /\b(school|campus|student|scholarship|bully|bullied|bullying|classmate|teacher|principal|dorm|exam|talent show|graduation|bodyguard|university|college)\b/i,
    },
    {
      linePreset: "billionaire_rich_poor_romance",
      pattern: /\b(billionaire|rich|poor|contract|fake wife|wealthy|heir|tycoon)\b/i,
    },
    {
      linePreset: "secret_identity_hidden_heiress",
      pattern: /\b(secret|hidden|undercover|heiress|identity|pretend|assistant|bodyguard|owner)\b/i,
    },
    {
      linePreset: "toxic_family_betrayal",
      pattern: /\b(family|toxic|mother|father|sister|brother|stepmother|mother-in-law|inheritance|deed|custody|relative)\b/i,
    },
    {
      linePreset: "cheating_ex_wedding_drama",
      pattern: /\b(cheat|cheating|ex|wedding|mistress|husband|wife|fiance|bride|groom|affair|divorce|dark romance|possessive|obsessive|coercive|toxic marriage|morally grey)\b/i,
    },
    {
      linePreset: "single_mom_poor_woman_comeback",
      pattern: /\b(single mom|single mother|poor woman|child|children|custody|abandoned wife|mother comeback)\b/i,
    },
    {
      linePreset: "social_injustice_discrimination_drama",
      pattern: /\b(disabled|racist|discrimination|injustice|refused|serve|restaurant|manager|innocent|accessibility|bias)\b/i,
    },
    {
      linePreset: "humiliation_revenge_justice",
      pattern: /\b(humiliation|humiliated|revenge|justice|karma|mocked|scapegoat)\b/i,
    },
  ];

  return customNicheRoutes.find((route) => route.pattern.test(customDramaBranch))?.linePreset ?? request.linePreset;
}

function resolveProgressOptions(
  options: StoryProgressOptions | undefined,
  defaultOperation: StoryProgressOperation,
  defaultTotalStages: number,
): ResolvedStoryProgressOptions {
  return {
    onProgress: options?.onProgress,
    operation: options?.operation ?? defaultOperation,
    totalStages: options?.totalStages ?? defaultTotalStages,
    stageOffset: options?.stageOffset ?? 0,
  };
}

function emitProgress(
  options: ResolvedStoryProgressOptions,
  stageIndex: number,
  stage: StoryStageDescriptor,
  status: StoryProgressStatus,
  detail?: string,
  payload?: Pick<StoryProgressEvent, "chapter" | "storyPayload">,
) {
  if (!options.onProgress) {
    return;
  }

  options.onProgress({
    operation: options.operation,
    stageId: stage.id,
    label: stage.label,
    detail: detail ?? stage.detail,
    current: options.stageOffset + stageIndex,
    total: options.totalStages,
    status,
    ...payload,
  });
}

async function runProgressStage<T>(
  options: ResolvedStoryProgressOptions,
  stageIndex: number,
  stage: StoryStageDescriptor,
  action: () => Promise<T>,
  completedDetail?: string | ((result: T) => string),
) {
  emitProgress(options, stageIndex, stage, "started");
  const result = await action();
  emitProgress(
    options,
    stageIndex,
    stage,
    "completed",
    typeof completedDetail === "function" ? completedDetail(result) : completedDetail,
  );
  return result;
}

function alignChapterTitleWithPlan(chapter: Chapter, plannedTitle: string): Chapter {
  return {
    ...chapter,
    title: plannedTitle,
  };
}

function normalizeHistoryKeyPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function unwrapEnvelope(value: unknown, key: string) {
  if (value && typeof value === "object" && key in value) {
    return (value as Record<string, unknown>)[key];
  }

  return value;
}

function unwrapArrayEnvelope(value: unknown, key: string) {
  if (value && typeof value === "object" && key in value) {
    return value;
  }

  if (Array.isArray(value)) {
    return {
      [key]: value,
    };
  }

  return value;
}
