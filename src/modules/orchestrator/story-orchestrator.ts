import { AppError } from "../../lib/errors";
import { env } from "../../lib/env";
import { unwrapEnvelope, unwrapArrayEnvelope, normalizeModelKeys, coerceAlias } from "../../lib/envelope";
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
  GeneratedSettingSeed,
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
import { resolveNicheSpine } from "../prompts/niche-spine";
import { resolveComplexityChapterCount, clampChapterCount } from "../prompts/drama15-chapter-architecture";
import { getLocalProsePolishConfig, type LocalProsePolishConfig, type ProsePolishTarget } from "../presets/prose-polish-config";
import { postProcessProseHumanizer } from "../postprocessors/prose-humanizer-post-processor";
import { runReaderPanel } from "../postprocessors/reader-panel";
import { reviewManuscript } from "../postprocessors/manuscript-review";
import { tightenChapterText } from "../postprocessors/adversarial-cut";
import { planChapterRevisions, buildRevisionInstruction } from "../postprocessors/revision-planner";
import { evaluateFoundation, type FoundationReport } from "../postprocessors/foundation-gate";
import { generateCanonFacts } from "../postprocessors/canon-facts";
import { RouterClient, type JsonValidationResult } from "../router/router-client";
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
import { analyzeChapterQuality, hasOnlySoftChapterQualityFailures, needsChapterRetry, isChapterQualityNotWorse, isWithinSoftFailureBudget, getOrCreatePhraseReuseIndex, indexChapter, type ChapterQualityMetrics } from "../validators/chapter-quality";
import { createPhraseReuseIndex, type PhraseReuseIndex } from "../core-pipeline/validators/phrase-reuse-tracker";
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
  buildIdiolectRepairInstruction,
  buildAddressRegisterDriftRepairInstruction,
  type DriftReport,
} from "../core-pipeline/character-consistency";
import {
  enrichStoryBibleAddressRegisters,
  collectAddressRegistersFromBible,
  collectSpeechPatternsFromBible,
  buildAddressRegisterRepairInstruction,
} from "../core-pipeline/address-register";
import {
  ContinuityTracker,
  type MinimalChapterRef,
} from "../core-pipeline/continuity-tracker";
import { applyCharacterFactsToRelationshipGraph, createInitialRelationshipGraph } from "../relationship/relationship-graph";
import { analyzeVoiceFingerprint, buildVoiceLockInstruction } from "../core-pipeline/validators/voice-fingerprint";
import { buildChapterCorpusReference } from "../corpus/corpus-retrieval";
import { buildPropagationLedger } from "../core-pipeline/validators/propagation-ledger";
import { detectThreadResolution } from "../core-pipeline/validators/thread-resolution";
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
    // The incoming chapterCount only needs to sit inside the supported band;
    // the exact count is finalised after the bible exists (see below), because
    // it now flexes with story complexity (pressureThreads / supporting cast).
    if (clampChapterCount(request.chapterCount) !== request.chapterCount) {
      throw new AppError("VALIDATION_ERROR", `chapterCount must be within the supported 15-17 band`, 400);
    }

    // Seed blueprint drives per-story diversity: a fresh set of the 16 niche
    // diversity axes (arena, humiliation, leverage, reveal, ending...), scored
    // for novelty against recent history so two stories in the SAME niche do not
    // share the same plot skeleton. Previously this only ran in generateSettingSeed
    // (the "Gợi ý" button); the actual outline generation ignored it, so every
    // niche collapsed onto the same static preset + fixed architecture. We build
    // it once here and feed it into concept, bible, and chapter-plan prompts.
    const outlineRecentSeedHistory = (await this.seedHistoryStore?.load()) ?? [];
    const outlineSeedBlueprint = createSeedBlueprint({
      linePreset: resolveSeedBlueprintLinePreset(request),
      history: outlineRecentSeedHistory,
    });
    const nicheSpine = resolveNicheSpine(resolveSeedBlueprintLinePreset(request));

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
          seedBlueprint: outlineSeedBlueprint,
          nicheSpine,
        });
        const conceptResult = await this.routerClient.generateJsonWithRepair<Concept>({
          model: context.models.planner,
          fallbackModel: context.models.fallback,
          ...conceptPrompt,
          timeoutMs: env.routerPlanningTimeoutMs,
          validate: (data) => validateParsed(
            () => parseConcept(unwrapEnvelope(data, "concept")),
            (concept) => findMissingCoreFields({
              logline: concept.logline,
              promise: concept.promise,
              conflictEngine: concept.conflictEngine,
            }),
          ),
        });

        return {
          concept: conceptResult.data,
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
          seedBlueprint: outlineSeedBlueprint,
          nicheSpine,
        });
        const bibleResult = await this.routerClient.generateJsonWithRepair<StoryPayload["storyBible"]>({
          model: context.models.bible,
          fallbackModel: context.models.fallback,
          ...biblePrompt,
          timeoutMs: env.routerPlanningTimeoutMs,
          validate: (data) => validateParsed(
            () => parseStoryBible(unwrapEnvelope(data, "storyBible")),
            (bible) => [
              ...findMissingCoreFields({
                premise: bible.premise,
                "heroine.name": bible.heroine.name,
                "betrayer.name": bible.betrayer.name,
                "rival.name": bible.rival.name,
                betrayalEngine: bible.betrayalEngine,
              }),
              // When the concept implies a family / institutional pressure
              // (parents, elders, council, board), the bible must name at least
              // one supportingPressureCast member so that role does not silently
              // vanish from the story the way it did in earlier drafts.
              ...(conceptImpliesSupportingPressure(concept.concept)
                && bible.supportingPressureCast.length === 0
                ? ["supportingPressureCast is empty but the concept implies a family, council, or institutional pressure role; name at least one such character."]
                : []),
              // Require at least two distinct pressure threads, each with a
              // concrete resolutionBeat, so the climax chapter must close every
              // line it opened instead of resolving only the strongest one and
              // dumping the rest on the final chapter.
              ...(bible.pressureThreads.length < 2
                ? ["pressureThreads must list at least two distinct pressure lines (e.g. a material/evidence line and a social/emotional line), each with a concrete resolutionBeat."]
                : []),
            ],
          ),
        });

        return {
          storyBible: enrichStoryBibleAddressRegisters(
            bibleResult.data,
            request.outputLanguage,
          ),
          modelUsed: bibleResult.modelUsed,
        };
      },
      (result) => `Đã dựng story bible bằng ${result.modelUsed}.`,
    );

    await this.recordStoryBibleCharacterNames(request, concept.concept.title, storyBible.storyBible);

    const alignedConcept = await this.alignConceptNames(request, concept.concept, storyBible.storyBible, context);

    // Phase A: finalise the chapter count (15-17) from the story's structural
    // complexity now that the bible exists. Extra pressure threads or supporting
    // pressure cast earn breathing chapters in the rise arc so the climax is not
    // forced to resolve everything at once. The floor is 15, so a simple story is
    // byte-identical to the previous fixed pipeline. Every downstream step
    // (plan prompt, validation, chapter loop, progress math) uses this count.
    const effectiveChapterCount = resolveComplexityChapterCount({
      pressureThreadCount: storyBible.storyBible.pressureThreads.length,
      supportingCastCount: storyBible.storyBible.supportingPressureCast.length,
    });
    const effectiveRequest: NormalizedOutlineRequest = { ...request, chapterCount: effectiveChapterCount };

    const chapterPlan = await runProgressStage(
      progress,
      4,
      {
        id: "chapter-plan",
        label: `Lập ${effectiveChapterCount} chương`,
        detail: "Đang dựng outline từng chương.",
      },
      async () => {
        const chapterPlanPrompt = buildChapterPlanPrompt({
          request: effectiveRequest,
          concept: alignedConcept,
          storyBible: storyBible.storyBible,
          linePreset: context.linePreset,
          stylePreset: context.stylePreset,
          seedBlueprint: outlineSeedBlueprint,
          nicheSpine,
        });
        const chapterPlanResult = await this.routerClient.generateJsonWithRepair<ChapterPlanItem[]>({
          model: context.models.planner,
          fallbackModel: context.models.fallback,
          ...chapterPlanPrompt,
          timeoutMs: env.routerPlanningTimeoutMs,
          validate: (data) => validateParsed(
            () => parseChapterPlan(unwrapArrayEnvelope(data, "chapterPlan")),
            (plan) => plan.length === effectiveChapterCount
              ? []
              : [`chapterPlan must contain exactly ${effectiveChapterCount} chapters, got ${plan.length}`],
          ),
        });

        return {
          chapterPlan: chapterPlanResult.data,
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
          request: effectiveRequest,
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

  async generateSettingSeed(
    request: NormalizedOutlineRequest,
    options?: { recentStoryTitles?: string[]; draftControlsHint?: { dialogueRatio: number; hookDensity: "low" | "medium" | "high" } },
  ) {
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
      draftControlsHint: options?.draftControlsHint,
      prosePolishConfig: this.prosePolishConfig,
    });
    const result = await this.routerClient.generateJsonWithRepair<GeneratedSettingSeed>({
      model: context.models.planner,
      fallbackModel: context.models.fallback,
      ...prompt,
      temperature: 0.92,
      timeoutMs: env.routerPlanningTimeoutMs,
      validate: (data) => validateWithSchema(
        GeneratedSettingSeedSchema,
        // Normalize snake_case/kebab keys to camelCase, then fill settingSeed
        // from a synonym if the model named the long text field differently.
        // Fixes cross-model misses (e.g. Claude emitting setting_seed / seed).
        coerceAlias(
          normalizeModelKeys(unwrapEnvelope(data, "seedPackage")),
          "settingSeed",
          ["seed", "setup", "world", "settingSeedText", "premise"],
        ),
      ),
    });

    const rawSeedPackage = result.data;
    const customDramaBranch = request.customCreativeInputs?.dramaBranch?.trim();
    const normalizedSeedPackage = customDramaBranch
      ? parseSeedPackage(
          {
            ...rawSeedPackage,
            linePreset: customDramaBranch,
          },
          result.modelUsed,
        )
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
    // The chapter count is only final after the outline (the bible's complexity
    // decides 15-17), so seed the progress bar with the requested floor and
    // correct it once the plan exists. emitProgress reads progress.totalStages
    // live, so updating it mid-run keeps the bar accurate without a second bar.
    let finalizeStageNumber = chapterStageOffset + request.chapterCount + 1;
    const progress = resolveProgressOptions(progressOptions, "full", finalizeStageNumber);
    const initialOutline = await this.generateOutline(request, progress, options);
    const { outline, foundationReport } = await this.applyFoundationGate(initialOutline, request, progress, options);
    // Re-derive the stage math from the actual plan length (may be 16 or 17).
    finalizeStageNumber = chapterStageOffset + outline.chapterPlan.length + 1;
    progress.totalStages = finalizeStageNumber;
    const posterPromise = this.startPosterGeneration(outline, progress);
    const chapters: Chapter[] = [];
    let relationshipGraph = createInitialRelationshipGraph(outline.storyBible);

    // ─── Character Consistency System ──────────────────────────────────────
    const memoryStore: CharacterMemoryStore = createEmptyMemoryStore();
    const continuityTracker = new ContinuityTracker({
      storyBible: outline.storyBible,
      chapterPlan: outline.chapterPlan,
    });

    // Per-run phrase-reuse index (instance-scoped, not a shared singleton) so
    // concurrent story generations on the same web process never contaminate or
    // reset each other's phrase tracking.
    const phraseReuseIndex = createPhraseReuseIndex();

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
              corpusReference: this.buildCorpusReference(outline.request, chapterPlanItem.chapterNumber),
              memoryStore,
              continuityTracker,
              phraseReuseIndex,
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
      indexChapter(phraseReuseIndex, chapter.chapterNumber, chapter.text);

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
      // Persist the accumulated address usage so a later resume/regenerate keeps
      // the cross-chapter address lock instead of starting from an empty list.
      continuityLite: {
        ...outline.continuityLite,
        establishedAddressUsage: continuityTracker.getContinuityContext(chapters.length + 1).establishedAddressUsage,
      },
      meta: {
        ...outline.meta,
        generatedAt: new Date().toISOString(),
        ...(poster ? { poster } : {}),
        ...(foundationReport ? { foundationReport } : {}),
        ...((): { propagationDebt?: StoryPayload["meta"]["propagationDebt"] } => {
          const propagationDebt = this.computePropagationDebt(continuityTracker);
          return propagationDebt ? { propagationDebt } : {};
        })(),
        ...((): { threadResolution?: StoryPayload["meta"]["threadResolution"] } => {
          const threadResolution = this.computeThreadResolution(outline.storyBible, chapters);
          return threadResolution && threadResolution.length > 0 ? { threadResolution } : {};
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

    // Rebuild the continuity tracker from the already-written chapters so the
    // resumed run keeps the same character memory, canon locks, foreshadow and
    // established-address state as a fresh full run (fixes memory loss on resume).
    const continuityTracker = new ContinuityTracker({
      storyBible: storyPayload.storyBible,
      chapterPlan: storyPayload.chapterPlan,
    });
    const canonFacts = storyPayload.continuityLite?.canonFacts ?? [];
    if (canonFacts.length > 0) {
      continuityTracker.setCanonFacts(canonFacts);
    }

    // Per-run phrase-reuse index (instance-scoped, not a shared singleton) so
    // concurrent resumes on the same web process never contaminate each other.
    const phraseReuseIndex = createPhraseReuseIndex();
    for (const chapter of chapters) {
      indexChapter(phraseReuseIndex, chapter.chapterNumber, chapter.text);
      // Re-extract facts for prior chapters and replay them into the tracker +
      // memory store + relationship graph so drift checks and the drafting
      // context see the accumulated arc, not an empty store.
      try {
        const factSheet = await extractCharacterFacts(
          chapter.text,
          chapter.chapterNumber,
          storyPayload.storyBible,
          storyPayload.request.outputLanguage,
          this.routerClient,
        );
        memoryStore.chapters = addFactSheet(memoryStore, factSheet).chapters;
        relationshipGraph = applyCharacterFactsToRelationshipGraph(relationshipGraph, factSheet);
        continuityTracker.recordChapter(
          {
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            summary: chapter.summary,
            text: chapter.text,
          },
          factSheet,
        );
      } catch {
        // Fail-open: if a prior chapter cannot be re-analyzed, resume still runs
        // with whatever memory was reconstructed so far.
      }
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
              corpusReference: this.buildCorpusReference(storyPayload.request, chapterPlanItem.chapterNumber),
              memoryStore,
              continuityTracker,
              phraseReuseIndex,
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
      indexChapter(phraseReuseIndex, chapter.chapterNumber, chapter.text);

      const factSheet = memoryStore.chapters.get(chapter.chapterNumber);
      if (factSheet) {
        relationshipGraph = applyCharacterFactsToRelationshipGraph(relationshipGraph, factSheet);
        continuityTracker.recordChapter(
          {
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            summary: chapter.summary,
            text: chapter.text,
          },
          factSheet,
        );
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
      // Persist the accumulated address usage so a later resume/regenerate keeps
      // the cross-chapter address lock instead of starting from an empty list.
      continuityLite: {
        ...storyPayload.continuityLite,
        establishedAddressUsage: continuityTracker.getContinuityContext(chapters.length + 1).establishedAddressUsage,
      },
      meta: {
        ...storyPayload.meta,
        generatedAt: new Date().toISOString(),
        ...((): { propagationDebt?: StoryPayload["meta"]["propagationDebt"] } => {
          const propagationDebt = this.computePropagationDebt(continuityTracker);
          return propagationDebt ? { propagationDebt } : {};
        })(),
        ...((): { threadResolution?: StoryPayload["meta"]["threadResolution"] } => {
          const threadResolution = this.computeThreadResolution(storyPayload.storyBible, chapters);
          return threadResolution ? { threadResolution } : {};
        })(),
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
    parsed.storyBible = enrichStoryBibleAddressRegisters(
      parsed.storyBible,
      parsed.outputLanguage ?? "english",
    );

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
    // Per-run phrase-reuse index (falls back to the shared singleton only when a
    // caller does not thread one through — avoids cross-story contamination when
    // multiple stories generate concurrently in the same process).
    const phraseReuseIndex = (parsed.phraseReuseIndex as PhraseReuseIndex | undefined) ?? getOrCreatePhraseReuseIndex();
    const enhancedContinuity: StoryPayload["continuityLite"] | undefined = continuityTracker
      ? continuityTracker.getContinuityContext(parsed.chapterNumber) as StoryPayload["continuityLite"]
      : continuityLite;

    // Render the accumulated character arc (emotional state, relationship
    // changes, established facts, foreshadow) from prior chapters directly into
    // the draft prompt so character development actually drives the writing —
    // not just the post-hoc consistency check.
    const characterArcContext = continuityTracker?.toPromptContext();

    const chapterPrompt = buildChapterDraftPrompt({
      storyTitle: parsed.storyTitle,
      storyBible: parsed.storyBible,
      chapterPlanItem,
      previousChapterSummaries: parsed.previousChapterSummaries,
      continuityLite: enhancedContinuity,
      characterArcContext,
      draftControls,
      userIntensity: parsed.userIntensity,
      outputLanguage: parsed.outputLanguage ?? "english",
      stylePreset: context.stylePreset,
      prosePolishConfig: this.prosePolishConfig,
      voiceLock: parsed.voiceLock,
      corpusReference: parsed.corpusReference,
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
        const outputLanguage = parsed.outputLanguage ?? "english";
        const addressRegisters = collectAddressRegistersFromBible(parsed.storyBible);
        let metrics = analyzeChapterQuality(
          chapter.text,
          draftControls,
          outputLanguage,
          parsed.chapterNumber,
          parsed.userIntensity,
          addressRegisters,
          phraseReuseIndex,
        );

        // ─── Character Consistency Check ──────────────────────────────────
        let driftReport: DriftReport | null = null;
        if (outputLanguage === "vietnamese" || (memoryStore && memoryStore.chapters.size > 0)) {
          driftReport = await validateConsistency(
            chapter.text,
            parsed.chapterNumber,
            parsed.storyBible,
            memoryStore ?? createEmptyMemoryStore(),
            this.routerClient,
          );
          driftReport = normalizeAddressDriftSeverity(driftReport);
        }

        const needsRepair = needsChapterRetry(metrics) || (driftReport && hasCriticalViolations(driftReport));

        // Voice-consistency telemetry: confirms at runtime why some chapters read
        // "human" and others read "AI". A chapter only gets the low-temp anti-AI
        // rewrite when it fails the gate here; chapters that pass keep the raw
        // draft cadence. Watch for repaired=false rows whose sameSubjectOpenerShare
        // sits in the 0.35–0.44 "dead zone" the VN AI-voice gate does not catch.
        const vav = metrics.vietnameseAiVoice;
        console.info(
          `[voice-metrics] ch=${parsed.chapterNumber} willRepair=${Boolean(needsRepair)} ` +
            `vavNeedsRepair=${vav.needsRepair} vavScore=${vav.score.toFixed(3)} ` +
            `sameSubjectShare=${vav.sameSubjectOpenerShare.toFixed(3)} maxStreak=${vav.maxSameSubjectStreak} ` +
            `clicheHits=${vav.clicheHits} motCach=${vav.adverbialMotCach} ` +
            `sentenceCV=${metrics.sentenceVariance.cv.toFixed(3)} ` +
            `softFailures=${metrics.failures.length} [${metrics.failures.join(" | ")}]`,
        );

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
        const maxAttempts = metrics.addressRegister.needsRepair || metrics.sentenceVariance.needsRepair || metrics.vietnameseAiVoice.needsRepair || (driftReport && hasCriticalViolations(driftReport))
          ? MAX_CHAPTER_REPAIR_ATTEMPTS + 1
          : MAX_CHAPTER_REPAIR_ATTEMPTS;

        for (let repairAttempt = 1; repairAttempt <= maxAttempts; repairAttempt += 1) {
          const repairExtras = buildChapterRepairExtras({
            metrics,
            driftReport,
            storyBible: parsed.storyBible,
          });
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
            addressRegisterViolations: repairExtras.addressRegisterViolations,
            addressRegisterRepairInstruction: repairExtras.addressRegisterRepairInstruction,
            idiolectRepairInstruction: repairExtras.idiolectRepairInstruction,
            outputLanguage,
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
            outputLanguage,
            parsed.chapterNumber,
            parsed.userIntensity,
            addressRegisters,
            phraseReuseIndex,
          );

          // Re-check consistency after repair
          if (outputLanguage === "vietnamese" || memoryStore) {
            driftReport = await validateConsistency(
              repairedChapter.text,
              parsed.chapterNumber,
              parsed.storyBible,
              memoryStore ?? createEmptyMemoryStore(),
              this.routerClient,
            );
            driftReport = normalizeAddressDriftSeverity(driftReport);
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

        if (hasOnlySoftChapterQualityFailures(metrics) && isWithinSoftFailureBudget(metrics)) {
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
            phraseReuseIndex,
          });
        }

        const finalMetrics = analyzeChapterQuality(
          draftedChapter.chapter.text,
          draftControls,
          parsed.outputLanguage ?? "english",
          parsed.chapterNumber,
          parsed.userIntensity,
          collectAddressRegistersFromBible(parsed.storyBible),
          phraseReuseIndex,
        );
        if (needsChapterRetry(finalMetrics) && (!hasOnlySoftChapterQualityFailures(finalMetrics) || !isWithinSoftFailureBudget(finalMetrics))) {
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
          phraseReuseIndex,
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
   * Retrieve real chapter excerpts (same niche when available) as structure
   * references for the drafter. Fail-open: returns undefined when the corpus
   * asset is absent, so it silently no-ops until the asset is deployed.
   */
  private buildCorpusReference(
    request: { linePreset?: string; customCreativeInputs?: { dramaBranch?: string | null } | null } | undefined,
    chapterNumber: number,
  ): string | undefined {
    const niche = request?.customCreativeInputs?.dramaBranch?.trim() || request?.linePreset;
    const reference = buildChapterCorpusReference({ niche: niche || undefined, chapterNumber });
    return reference || undefined;
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
   * Check that every pressure thread declared in the story bible is at least
   * addressed in the closing chapters (climax + resolution). Informational
   * signal persisted to meta.threadResolution — mirrors computePropagationDebt:
   * prompt-free, fail-open, non-blocking. The hard enforcement lives in the
   * prompt layer (climax mandatory element + bible min-2-threads validation).
   */
  private computeThreadResolution(storyBible: StoryPayload["storyBible"], chapters: Chapter[]): StoryPayload["meta"]["threadResolution"] {
    try {
      const threads = storyBible.pressureThreads ?? [];
      if (threads.length === 0 || chapters.length === 0) {
        return undefined;
      }
      const closingText = chapters
        .slice(-2)
        .map((chapter) => chapter.text)
        .join("\n\n");
      const report = detectThreadResolution(threads, closingText);
      if (report.threads.length === 0) {
        return undefined;
      }
      return report.threads.map((entry) => ({
        label: entry.label,
        addressed: entry.addressed,
        resolved: entry.resolved,
      }));
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
      phraseReuseIndex?: PhraseReuseIndex;
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

      const baselineMetrics = analyzeChapterQuality(
        chapter.text,
        options.draftControls,
        options.outputLanguage,
        options.chapterNumber,
        options.userIntensity,
        undefined,
        options.phraseReuseIndex,
      );
      const metrics = analyzeChapterQuality(
        tightened,
        options.draftControls,
        options.outputLanguage,
        options.chapterNumber,
        options.userIntensity,
        undefined,
        options.phraseReuseIndex,
      );
      if (needsChapterRetry(metrics) && !hasOnlySoftChapterQualityFailures(metrics)) {
        // Cut broke a hard rule (e.g. word count floor) — keep the original.
        return chapter;
      }
      if (!isChapterQualityNotWorse(metrics, baselineMetrics)) {
        // The cut lowered overall quality (more AI-tells, worse variance, more
        // phrase reuse) without breaking a hard rule — keep the original.
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
        if (!candidateReport) {
          // Evaluation was unavailable for this attempt (transient model/parse
          // error). Keep the current best scored outline instead of swapping in
          // an unscored candidate, then stop trying.
          break;
        }
        if (candidateReport.overallScore > bestReport.overallScore) {
          best = candidate;
          bestReport = candidateReport;
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

    // Act on medium-and-up issues (not only "high"): reader-panel / review
    // rarely emit "high", so a high-only threshold left the loop effectively
    // dormant. maxChapters still bounds how many chapters are rewritten.
    const briefs = planChapterRevisions(reports.readerPanel, reports.manuscriptReview, {
      minSeverity: "medium",
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
          const addressRegisters = collectAddressRegistersFromBible(storyPayload.storyBible);
          const metrics = analyzeChapterQuality(
            candidate.text,
            draftControls,
            outputLanguage,
            current.chapterNumber,
            storyPayload.request.storyControls.intensity,
            addressRegisters,
          );
          if (needsChapterRetry(metrics) && !hasOnlySoftChapterQualityFailures(metrics)) {
            continue; // keep original — revision broke a hard rule
          }

          // Only accept the revision if it is at least as good as the current
          // chapter; otherwise a "revision" could silently degrade the prose.
          const baselineMetrics = analyzeChapterQuality(
            current.text,
            draftControls,
            outputLanguage,
            current.chapterNumber,
            storyPayload.request.storyControls.intensity,
            addressRegisters,
          );
          if (!isChapterQualityNotWorse(metrics, baselineMetrics)) {
            continue; // keep original — revision did not improve quality
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

function normalizeAddressDriftSeverity(report: DriftReport): DriftReport {
  return {
    ...report,
    violations: report.violations.map((violation) =>
      violation.type === "address_register_drift"
        ? { ...violation, severity: "critical" as const }
        : violation,
    ),
  };
}

function buildChapterRepairExtras(params: {
  metrics: ChapterQualityMetrics;
  driftReport: DriftReport | null;
  storyBible: StoryPayload["storyBible"];
}) {
  const addressRegisters = collectAddressRegistersFromBible(params.storyBible);
  const speechPatterns = collectSpeechPatternsFromBible(params.storyBible);
  const idiolectWarnings = params.driftReport?.violations.filter((violation) => violation.type === "speech_idiolect") ?? [];
  const addressDrift = params.driftReport?.violations.filter((violation) => violation.type === "address_register_drift") ?? [];

  const addressRegisterRepairInstruction = params.metrics.addressRegister.needsRepair
    ? buildAddressRegisterRepairInstruction(params.metrics.addressRegister.violations, addressRegisters)
    : addressDrift.length > 0
      ? buildAddressRegisterDriftRepairInstruction(addressDrift, addressRegisters)
      : undefined;

  return {
    addressRegisterViolations: params.metrics.addressRegister.violations,
    addressRegisterRepairInstruction,
    idiolectRepairInstruction: idiolectWarnings.length > 0
      ? buildIdiolectRepairInstruction(idiolectWarnings, speechPatterns)
      : undefined,
  };
}

function normalizeHistoryKeyPart(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

/**
 * Validate a model-produced seed package. A schema miss here means the model
 * returned malformed/off-spec content, so it surfaces as a 502 MODEL_OUTPUT_INVALID
 * (not a 400 request error) — otherwise the ZodError bubbles up and the API
 * mislabels a bad model response as "invalid request data".
 */
function parseSeedPackage(value: unknown, modelUsed?: string) {
  const parsed = GeneratedSettingSeedSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new AppError(
    "MODEL_OUTPUT_INVALID",
    `Model${modelUsed ? ` ${modelUsed}` : ""} trả gói gợi ý sai định dạng. Hãy thử lại hoặc đổi model.`,
    502,
    { issues: parsed.error.issues },
  );
}

/**
 * Adapt a Zod schema to the generateJsonWithRepair validator contract. On
 * failure it returns flattened, human-readable errors that are fed back to the
 * model in the repair round (e.g. "storyControls.betrayerType: Required").
 */
type SafeParseLike<T> = {
  success: boolean;
  data?: T;
  error?: { issues: Array<{ path: PropertyKey[]; message: string }> };
};

function validateWithSchema<T>(
  schema: { safeParse: (data: unknown) => SafeParseLike<T> },
  data: unknown,
): JsonValidationResult<T> {
  const parsed = schema.safeParse(data);
  if (parsed.success) {
    return { ok: true, value: parsed.data as T, errors: [] };
  }
  const errors = (parsed.error?.issues ?? []).map((issue) => {
    const path = issue.path.map((part) => String(part)).join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return { ok: false, errors };
}

/**
 * Adapt a robust parse function (parseConcept/parseStoryBible/parseChapterPlan)
 * to the generateJsonWithRepair validator contract. These parsers coerce
 * missing fields to placeholders instead of throwing, so a caller-supplied
 * `findIssues` inspects the parsed result and reports any core fields that are
 * still empty/placeholder — those issues trigger the schema-aware repair round.
 */
function validateParsed<T>(
  parse: () => T,
  findIssues: (value: T) => string[],
): JsonValidationResult<T> {
  let value: T;
  try {
    value = parse();
  } catch (error) {
    return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
  }
  const issues = findIssues(value);
  if (issues.length > 0) {
    return { ok: false, errors: issues };
  }
  return { ok: true, value, errors: [] };
}

const MISSING_FIELD_PLACEHOLDER = "Not provided";

/**
 * Report the names of core fields that a robust parser left empty or filled
 * with the "Not provided" placeholder — i.e. fields the model failed to supply.
 */
function findMissingCoreFields(fields: Record<string, string | undefined>): string[] {
  return Object.entries(fields)
    .filter(([, value]) => !value || !value.trim() || value.trim() === MISSING_FIELD_PLACEHOLDER)
    .map(([name]) => `${name} is missing or empty; provide a concrete value.`);
}

// Detect whether a concept leans on a family / institutional pressure beyond the
// betrayer-rival pair, so the bible generation step can require at least one
// named supportingPressureCast member. Matches both English and Vietnamese
// keywords because the concept text follows the story's output language.
const SUPPORTING_PRESSURE_KEYWORDS = [
  // English
  "family", "parents", "mother", "father", "mother-in-law", "father-in-law",
  "elder", "grandmother", "grandfather", "council", "board", "clan",
  "guardian", "in-laws", "relatives", "aunt", "uncle",
  // Vietnamese
  "gia đình", "gia tộc", "cha", "mẹ", "bố", "ba mẹ", "cha mẹ", "mẹ chồng",
  "bố chồng", "cha chồng", "ông nội", "bà nội", "hội đồng", "dòng họ",
  "người giám hộ", "họ hàng", "chú", "bác", "cô", "dì", "nhà chồng",
];

function conceptImpliesSupportingPressure(concept: { logline: string; promise: string; conflictEngine: string }): boolean {
  const haystack = `${concept.logline}\n${concept.promise}\n${concept.conflictEngine}`.toLowerCase();
  return SUPPORTING_PRESSURE_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

// Envelope unwrapping lives in ../../lib/envelope so it can be unit-tested in
// isolation and shared. It tolerates double-wrapping and renamed wrapper keys,
// which fixes the "every field undefined" schema errors from models that wrap
// their JSON differently (e.g. Claude echoing the skeleton wrapper twice).
