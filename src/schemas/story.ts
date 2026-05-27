import { z } from "zod";

import {
  MAX_TARGET_WORDS_PER_CHAPTER,
  MIN_TARGET_WORDS_PER_CHAPTER,
} from "../constants/draft-controls";

export const MAX_SETTING_SEED_LENGTH = 4_000;

function createChapterSummary(text: string) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (sentences.slice(0, 2).join(" ") || trimmed.slice(0, 220)).trim();
}

export const AudienceSchema = z.object({
  genderFocus: z.string().default("female"),
  ageBand: z.string().default("18_34"),
  market: z.string().default("global"),
});

export const OutputLanguageSchema = z.enum([
  "english",
  "vietnamese",
  "japanese",
  "korean",
  "portuguese",
  "spanish",
]);

export const StoryControlsSchema = z.object({
  betrayalType: z.string().default("hidden_relationship_replaced_by_fiancee"),
  shameType: z.string().default("polite_class_exclusion"),
  revengeMode: z.string().default("strategic_withdrawal_status_reversal"),
  endingMode: z.string().default("bittersweet_dignity_first"),
  intensity: z.number().min(0).max(1).default(0.84),
});

export const CustomCreativeInputsSchema = z
  .object({
    dramaBranch: z.string().trim().min(1).max(600).optional(),
    stylePreset: z.string().trim().min(1).max(600).optional(),
    betrayalType: z.string().trim().min(1).max(600).optional(),
    shameType: z.string().trim().min(1).max(600).optional(),
    revengeMode: z.string().trim().min(1).max(600).optional(),
    endingMode: z.string().trim().min(1).max(600).optional(),
  })
  .partial()
  .optional();

export const DraftControlsSchema = z.object({
  targetWordsPerChapter: z
    .number()
    .int()
    .min(MIN_TARGET_WORDS_PER_CHAPTER)
    .max(MAX_TARGET_WORDS_PER_CHAPTER)
    .optional(),
  dialogueRatio: z.number().min(0.2).max(0.85).default(0.55),
  hookDensity: z.enum(["low", "medium", "high"]).default("high"),
});

export const OutlineRequestInputSchema = z.object({
  titleHint: z.string().trim().min(1).max(120).optional(),
  linePreset: z.string().trim().min(1).optional(),
  stylePreset: z.string().trim().min(1).optional(),
  outputLanguage: OutputLanguageSchema.optional(),
  audience: AudienceSchema.optional(),
  storyControls: StoryControlsSchema.optional(),
  customCreativeInputs: CustomCreativeInputsSchema,
  settingSeed: z.string().trim().min(1).max(MAX_SETTING_SEED_LENGTH).optional(),
  chapterCount: z.number().int().positive().optional(),
});

export const NormalizedOutlineRequestSchema = z.object({
  titleHint: z.string().trim().min(1).max(120).optional(),
  linePreset: z.string().trim().min(1),
  stylePreset: z.string().trim().min(1),
  outputLanguage: OutputLanguageSchema,
  audience: AudienceSchema,
  storyControls: StoryControlsSchema,
  customCreativeInputs: CustomCreativeInputsSchema,
  settingSeed: z.string().trim().min(1).max(MAX_SETTING_SEED_LENGTH).optional(),
  chapterCount: z.number().int().positive(),
});

export const FullGenerateRequestInputSchema = OutlineRequestInputSchema.extend({
  draftControls: DraftControlsSchema.optional(),
});

export const NormalizedFullGenerateRequestSchema = NormalizedOutlineRequestSchema.extend({
  draftControls: DraftControlsSchema,
});

export const ConceptSchema = z.object({
  title: z.string().min(1),
  titleCandidates: z.array(z.string().min(1)).min(1),
  logline: z.string().min(1),
  promise: z.string().min(1),
  conflictEngine: z.string().min(1),
});

export const StoryBibleCharacterSchema = z.object({
  name: z.string().min(1),
  wound: z.string().min(1),
  strengths: z.array(z.string().min(1)).min(1),
  blindSpots: z.array(z.string().min(1)).min(1).default(["needs firmer self-protection"]),
});

// ─── Speech Pattern Schema (Wave 6 Idiolect) ────────────────────────────────

export const SpeechPatternSchema = z.object({
  fillers: z.array(z.string().min(1)),
  syntaxQuirk: z.string().min(1),
  vocabularyBand: z.enum(["formal", "neutral", "casual", "crude"]),
  avoidedPhrases: z.array(z.string().min(1)),
});

export const StoryBibleSchema = z.object({
  premise: z.string().min(1),
  heroine: StoryBibleCharacterSchema.extend({
    speechPattern: SpeechPatternSchema.optional(),
  }),
  betrayer: z.object({
    name: z.string().min(1),
    wound: z.string().min(1),
    cowardiceVector: z.string().min(1),
    speechPattern: SpeechPatternSchema.optional(),
  }),
  rival: z.object({
    name: z.string().min(1),
    socialPower: z.string().min(1),
    demeanor: z.string().min(1),
    speechPattern: SpeechPatternSchema.optional(),
  }),
  classHierarchy: z.array(z.string().min(1)).min(1).default(["elite family circles", "startup capital gatekeepers"]),
  betrayalEngine: z.string().min(1),
  classShameEngine: z.string().min(1),
  revengeEngine: z.string().min(1),
  endingMode: z.string().min(1),
});

export const ChapterPlanItemSchema = z.object({
  chapterNumber: z.number().int().min(1).max(10),
  title: z.string().min(1),
  hook: z.string().min(1),
  mainBeat: z.string().min(1),
  humiliationProgression: z.string().min(1),
  revengeProgression: z.string().min(1),
  endingBeat: z.string().min(1),
});

export const ChapterSchema = z
  .object({
    chapterNumber: z.number().int().min(1).max(10),
    title: z.string().min(1),
    summary: z.string().min(1).optional(),
    text: z.string().min(1),
  })
  .transform((chapter) => ({
    ...chapter,
    summary: chapter.summary?.trim() || createChapterSummary(chapter.text),
  }));

export const ChapterStateSchema = z.object({
  chapter: z.number().int().min(1).max(10),
  heroineAgency: z.number().int().min(0).max(100),
  emotionalTemperature: z.string().optional(),
});

export const ContinuityLiteSchema = z.object({
  heroineName: z.string().min(1),
  betrayerName: z.string().min(1),
  rivalName: z.string().min(1),
  coreReveal: z.string().min(1),
  endingMode: z.string().min(1),
  speechPatterns: z.record(z.string(), SpeechPatternSchema).default({}),
  chapterState: z.array(ChapterStateSchema).default([]),
});

export const StoryPosterSchema = z.object({
  status: z.enum(["completed", "failed", "skipped"]),
  title: z.string().min(1),
  model: z.string().min(1),
  size: z.string().min(1),
  generatedAt: z.string(),
  filePath: z.string().min(1).optional(),
  error: z.string().min(1).optional(),
});

export const StoryPayloadSchema = z.object({
  title: z.string().min(1),
  request: z.object({
    titleHint: z.string().optional(),
    linePreset: z.string().min(1),
    stylePreset: z.string().min(1),
    outputLanguage: OutputLanguageSchema,
    audience: AudienceSchema,
    storyControls: StoryControlsSchema,
    customCreativeInputs: CustomCreativeInputsSchema,
    settingSeed: z.string().optional(),
    chapterCount: z.number().int().positive(),
    draftControls: DraftControlsSchema.optional(),
  }),
  concept: ConceptSchema,
  storyBible: StoryBibleSchema,
  chapterPlan: z.array(ChapterPlanItemSchema).length(10),
  chapters: z.array(ChapterSchema).default([]),
  continuityLite: ContinuityLiteSchema,
  meta: z.object({
    generatedAt: z.string(),
    modelAliases: z.object({
      planner: z.string().min(1),
      bible: z.string().min(1),
      drafter: z.string().min(1),
      rewriter: z.string().min(1).optional(),
      fallback: z.string().min(1).optional(),
    }),
    poster: StoryPosterSchema.optional(),
  }),
});

export const GenerateChapterRequestSchema = z
  .object({
    storyTitle: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    outputLanguage: OutputLanguageSchema.optional(),
    storyBible: StoryBibleSchema,
    chapterPlan: z.array(ChapterPlanItemSchema).length(10),
    chapterNumber: z.number().int().min(1).max(10),
    previousChapterSummaries: z.array(z.string().min(1)).default([]),
    draftControls: DraftControlsSchema.optional(),
    stylePreset: z.string().trim().min(1).optional(),
    continuityLite: ContinuityLiteSchema.optional(),
    // ─── Character Consistency (optional, added for character tracking) ──
    memoryStore: z.any().optional(),
    continuityTracker: z.any().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.storyTitle && value.title && value.storyTitle !== value.title) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["storyTitle"],
        message: "storyTitle and title must match when both are provided.",
      });
    }
  })
  .transform(({ title, storyTitle, ...rest }) => ({
    ...rest,
    storyTitle: storyTitle ?? title,
  }));

export const RegenerateModeSchema = z.enum([
  "rewrite_chapter",
  "rewrite_hook",
  "rewrite_ending_beat",
  "rewrite_dialogue_tone",
  "rewrite_class_shame",
  "rewrite_revenge_sharpness",
]);

export const PreserveConstraintsSchema = z.object({
  preserveNames: z.boolean().default(true),
  preserveMainReveal: z.boolean().default(true),
  preserveEndingMode: z.boolean().default(true),
});

export const RegenerateChapterRequestSchema = z.object({
  storyPayload: StoryPayloadSchema,
  targetChapter: z.number().int().min(1).max(10),
  mode: RegenerateModeSchema,
  instruction: z.string().trim().min(1),
  preserveConstraints: PreserveConstraintsSchema.default({
    preserveNames: true,
    preserveMainReveal: true,
    preserveEndingMode: true,
  }),
});

export const ExportMarkdownRequestSchema = z.object({
  storyPayload: StoryPayloadSchema,
  writeToFile: z.boolean().optional(),
  filename: z.string().trim().min(1).optional(),
});

export const GenerateSettingSeedRequestSchema = OutlineRequestInputSchema;

export const GeneratedSettingSeedSchema = z.object({
  titleHint: z.string().trim().min(1).max(120),
  linePreset: z.string().trim().min(1).max(600),
  settingSeed: z.string().trim().min(80).max(MAX_SETTING_SEED_LENGTH),
  storyControls: StoryControlsSchema.extend({
    betrayalType: z.string().trim().min(1).max(600),
    shameType: z.string().trim().min(1).max(600),
    revengeMode: z.string().trim().min(1).max(600),
    endingMode: z.string().trim().min(1).max(600),
  }),
  draftControls: z.object({
    dialogueRatio: z.number().min(0.2).max(0.85).default(0.55),
    hookDensity: z.enum(["low", "medium", "high"]).default("high"),
  }),
});
