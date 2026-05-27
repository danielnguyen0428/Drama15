import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";
import {
  ChapterPlanItemSchema,
  ChapterSchema,
  ConceptSchema,
  DraftControlsSchema,
  FullGenerateRequestInputSchema,
  NormalizedFullGenerateRequestSchema,
  NormalizedOutlineRequestSchema,
  OutlineRequestInputSchema,
  StoryBibleSchema,
  StoryPayloadSchema,
} from "../../schemas/story";
import { normalizeBranchScopedStylePresetId, normalizeLinePresetId } from "../presets/legacy-preset-migrations";
import type {
  Chapter,
  ChapterPlanItem,
  Concept,
  DraftControls,
  FullGenerateRequestInput,
  NormalizedFullGenerateRequest,
  NormalizedOutlineRequest,
  OutlineRequestInput,
  StoryBible,
  StoryPayload,
} from "../../types/story";

export function normalizeOutlineRequest(input: OutlineRequestInput): NormalizedOutlineRequest {
  const parsed = OutlineRequestInputSchema.parse(input);
  const linePreset = normalizeLinePresetId(parsed.linePreset ?? env.defaultLinePreset);
  const normalized = {
    titleHint: parsed.titleHint,
    linePreset,
    stylePreset: normalizeBranchScopedStylePresetId(parsed.stylePreset ?? env.defaultStylePreset, linePreset),
    outputLanguage: parsed.outputLanguage ?? "english",
    audience: parsed.audience ?? {
      genderFocus: "female",
      ageBand: "18_34",
      market: "global",
    },
    storyControls:
      parsed.storyControls ?? {
        betrayalType: "hidden_relationship_replaced_by_fiancee",
        shameType: "polite_class_exclusion",
        revengeMode: "strategic_withdrawal_status_reversal",
        endingMode: "bittersweet_dignity_first",
        intensity: 0.84,
      },
    customCreativeInputs: parsed.customCreativeInputs,
    settingSeed: parsed.settingSeed,
    chapterCount: parsed.chapterCount ?? env.defaultChapterCount,
  };

  const validated = NormalizedOutlineRequestSchema.parse(normalized);
  if (validated.chapterCount !== env.defaultChapterCount) {
    throw new AppError("VALIDATION_ERROR", `chapterCount must be ${env.defaultChapterCount}`, 400, {
      chapterCount: validated.chapterCount,
    });
  }

  return validated;
}

export function normalizeFullGenerateRequest(input: FullGenerateRequestInput): NormalizedFullGenerateRequest {
  const parsed = FullGenerateRequestInputSchema.parse(input);
  const normalized = {
    ...normalizeOutlineRequest(parsed),
    draftControls: DraftControlsSchema.parse(parsed.draftControls ?? {}),
  };

  return NormalizedFullGenerateRequestSchema.parse(normalized);
}

export function parseConcept(rawConcept: unknown): Concept {
  const source = asRecord(rawConcept);
  return ConceptSchema.parse({
    title: coerceText(source.title, "Untitled Story"),
    titleCandidates: coerceStringArray(source.titleCandidates, coerceText(source.title, "Untitled Story")),
    logline: coerceText(source.logline),
    promise: coerceText(source.promise),
    conflictEngine: coerceText(source.conflictEngine),
  });
}

export function parseStoryBible(rawStoryBible: unknown): StoryBible {
  const source = asRecord(rawStoryBible);
  const heroine = asRecord(source.heroine);
  const betrayer = asRecord(source.betrayer);
  const rival = asRecord(source.rival);

  return StoryBibleSchema.parse({
    premise: coerceText(source.premise),
    heroine: {
      name: coerceText(heroine.name),
      wound: coerceText(heroine.wound),
      strengths: coerceStringArray(heroine.strengths, "intelligent"),
      blindSpots: coerceStringArray(heroine.blindSpots, "accepts emotional crumbs too long"),
    },
    betrayer: {
      name: coerceText(betrayer.name),
      wound: coerceText(betrayer.wound),
      cowardiceVector: coerceText(betrayer.cowardiceVector),
    },
    rival: {
      name: coerceText(rival.name),
      socialPower: coerceText(rival.socialPower),
      demeanor: coerceText(rival.demeanor),
    },
    classHierarchy: coerceStringArray(source.classHierarchy, "elite hierarchy"),
    betrayalEngine: coerceText(source.betrayalEngine),
    classShameEngine: coerceText(source.classShameEngine),
    revengeEngine: coerceText(source.revengeEngine),
    endingMode: coerceText(source.endingMode),
  });
}

export function parseChapterPlan(rawChapterPlan: unknown): ChapterPlanItem[] {
  const items = Array.isArray(rawChapterPlan)
    ? rawChapterPlan
    : Array.isArray(asRecord(rawChapterPlan).chapterPlan)
      ? (asRecord(rawChapterPlan).chapterPlan as unknown[])
      : Array.isArray(asRecord(rawChapterPlan).chapters)
        ? (asRecord(rawChapterPlan).chapters as unknown[])
        : [];

  return items.map((item, index) => {
    const source = asRecord(item);
    return ChapterPlanItemSchema.parse({
      chapterNumber: coerceChapterNumber(firstDefined(source.chapterNumber, source.chapter_id, source.id), index + 1),
      title: coerceText(source.title, `Chapter ${index + 1}`),
      hook: coerceText(firstDefined(source.hook, source.openingHook, source.hook_type)),
      mainBeat: coerceText(firstDefined(source.mainBeat, source.main_beat, source.function, source.coreBeat)),
      humiliationProgression: coerceText(firstDefined(source.humiliationProgression, source.humiliation_progression, source.pressureBeat)),
      revengeProgression: coerceText(firstDefined(source.revengeProgression, source.revenge_progression, source.agencyBeat)),
      endingBeat: coerceText(firstDefined(source.endingBeat, source.ending_beat, source.closingBeat, source.closing_line)),
    });
  });
}

export function validateOutlineGeneration(payload: {
  concept: Concept;
  storyBible: StoryBible;
  chapterPlan: ChapterPlanItem[];
}) {
  if (!payload.storyBible.heroine.name || !payload.storyBible.betrayer.name || !payload.storyBible.rival.name) {
    throw new AppError("MODEL_OUTPUT_INVALID", "Generated bible is missing one or more core character names.", 502);
  }

  ensureChapterPlanIntegrity(payload.chapterPlan);
  return payload;
}

export function validateChapterDraft(rawChapter: unknown, expectedChapterNumber: number): Chapter {
  const source = asRecord(rawChapter);
  const chapter = ChapterSchema.parse({
    chapterNumber: coerceChapterNumber(firstDefined(source.chapterNumber, source.chapter_id, source.id), expectedChapterNumber),
    title: coerceText(source.title, `Chapter ${expectedChapterNumber}`),
    summary: sanitizeChapterSummary(coerceOptionalText(source.summary)),
    text: coerceText(firstDefined(source.text, source.content)),
  });
  if (chapter.chapterNumber !== expectedChapterNumber) {
    throw new AppError("MODEL_OUTPUT_INVALID", `Chapter number ${chapter.chapterNumber} does not match requested chapter ${expectedChapterNumber}.`, 502, {
      expectedChapterNumber,
      chapterNumber: chapter.chapterNumber,
    });
  }

  if (chapter.text.trim().length < 200) {
    throw new AppError("MODEL_OUTPUT_INVALID", `Chapter ${expectedChapterNumber} is too short to be usable.`, 502);
  }

  return chapter;
}

export function ensureChapterPlanIntegrity(chapterPlan: ChapterPlanItem[]) {
  if (chapterPlan.length !== env.defaultChapterCount) {
    throw new AppError("MODEL_OUTPUT_INVALID", `Chapter plan must contain ${env.defaultChapterCount} chapters.`, 502, {
      chapterCount: chapterPlan.length,
    });
  }

  chapterPlan.forEach((chapter, index) => {
    const expectedNumber = index + 1;
    if (chapter.chapterNumber !== expectedNumber) {
      throw new AppError(
        "MODEL_OUTPUT_INVALID",
        `Chapter plan numbering is invalid at position ${expectedNumber}.`,
        502,
        {
          expectedNumber,
          chapterNumber: chapter.chapterNumber,
        },
      );
    }
  });
}

export function validateStoryPayload(payload: unknown): StoryPayload {
  const storyPayload = StoryPayloadSchema.parse(payload);
  ensureChapterPlanIntegrity(storyPayload.chapterPlan);
  return storyPayload;
}

export function summarizeChapter(chapter: Chapter) {
  return chapter.summary;
}

export function createContinuityLite(storyBible: StoryBible, chapterPlan: ChapterPlanItem[]) {
  return {
    heroineName: storyBible.heroine.name,
    betrayerName: storyBible.betrayer.name,
    rivalName: storyBible.rival.name,
    coreReveal: storyBible.betrayalEngine,
    endingMode: storyBible.endingMode,
    chapterState: chapterPlan.map((chapter, index) => ({
      chapter: chapter.chapterNumber,
      heroineAgency: Math.min(100, 18 + index * 5),
      emotionalTemperature: chapter.humiliationProgression,
    })),
  };
}

export function resolveDraftControls(input?: DraftControls): DraftControls {
  return DraftControlsSchema.parse(input ?? {});
}

function asRecord(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstDefined(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function coerceText(value: unknown, fallback = "Not provided"): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const parts: string[] = value
      .map((item) => coerceOptionalText(item))
      .filter((item): item is string => Boolean(item));
    return parts.join("; ") || fallback;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferredKeys = [
      "coreDynamic",
      "summary",
      "description",
      "text",
      "value",
      "content",
      "premise",
      "message",
    ];

    for (const key of preferredKeys) {
      const nested = coerceOptionalText(record[key]);
      if (nested) {
        return nested;
      }
    }

    const flattened = Object.values(record)
      .map((item) => coerceOptionalText(item))
      .filter((item): item is string => Boolean(item))
      .slice(0, 5);

    return flattened.join("; ") || fallback;
  }

  return fallback;
}

function coerceOptionalText(value: unknown): string | undefined {
  const text = coerceText(value, "");
  return text.trim() ? text : undefined;
}

function sanitizeChapterSummary(value: string | undefined): string | undefined {
  let text = String(value || "").trim();
  if (!text) {
    return undefined;
  }

  text = text.replace(/^(summary|tóm tắt)\s*:\s*/i, "").trim();
  for (let index = 0; index < 3; index += 1) {
    const stripped = text.replace(/^(?:[A-Z][A-Z0-9_]{2,}(?:\s*,\s*)?)+\s*:\s*/, "").trim();
    if (stripped === text) {
      break;
    }
    text = stripped;
  }

  return text || undefined;
}

function coerceStringArray(value: unknown, fallback: string): string[] {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => coerceOptionalText(item))
      .filter((item): item is string => Boolean(item));

    if (items.length > 0) {
      return items;
    }
  }

  const singleValue = coerceOptionalText(value);
  return singleValue ? [singleValue] : [fallback];
}

function coerceChapterNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return fallback;
}
