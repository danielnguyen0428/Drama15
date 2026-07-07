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
  dialogueRatio: z.number().min(0.2).max(0.85).default(0.56),
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

export const AddressTargetSchema = z.object({
  call: z.string().min(1),
  notes: z.string().optional(),
});

export const AddressRegisterSchema = z.object({
  selfReference: z.string().min(1),
  toOthers: z.record(z.string(), AddressTargetSchema).default({}),
  forbiddenTerms: z.array(z.string().min(1)).default([]),
  narratorThirdPerson: z.string().optional(),
});

export const StoryBibleSchema = z.object({
  premise: z.string().min(1),
  heroine: StoryBibleCharacterSchema.extend({
    speechPattern: SpeechPatternSchema.optional(),
    addressRegister: AddressRegisterSchema.optional(),
  }),
  betrayer: z.object({
    name: z.string().min(1),
    wound: z.string().min(1),
    cowardiceVector: z.string().min(1),
    speechPattern: SpeechPatternSchema.optional(),
    addressRegister: AddressRegisterSchema.optional(),
  }),
  rival: z.object({
    name: z.string().min(1),
    socialPower: z.string().min(1),
    demeanor: z.string().min(1),
    speechPattern: SpeechPatternSchema.optional(),
    addressRegister: AddressRegisterSchema.optional(),
  }),
  classHierarchy: z.array(z.string().min(1)).min(1).default(["elite family circles", "startup capital gatekeepers"]),
  // Named secondary characters who apply pressure on the heroine beyond the
  // betrayer/rival pair — parents, elders, guardians, board members, councils.
  // Previously the bible only modelled 3 roles, so a family/institutional
  // pressure implied by the concept (e.g. "the family forces the marriage")
  // silently vanished from the actual story. Optional by default; the
  // orchestrator enforces "at least one" only when the concept implies such a
  // role, so two-hander stories that need no supporting cast are not penalised.
  supportingPressureCast: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().min(1),
        relationshipToHeroine: z.string().min(1),
        pressureContribution: z.string().min(1),
      }),
    )
    .default([]),
  betrayalEngine: z.string().min(1),
  classShameEngine: z.string().min(1),
  revengeEngine: z.string().min(1),
  endingMode: z.string().min(1),
  // Distinct pressure lines the story must resolve at the climax. Earlier drafts
  // resolved only the strongest (usually material/evidence) thread and let the
  // social/emotional thread evaporate, so the climax felt lopsided and the final
  // chapter had to absorb an unresolved thread it had no room for. Requiring at
  // least two named threads, each with a concrete resolutionBeat, forces the
  // climax chapter to close every line it opened. Defaults to empty for
  // backward compatibility; the orchestrator enforces "min 2" on fresh bibles.
  pressureThreads: z
    .array(
      z.object({
        label: z.string().min(1),
        resolutionBeat: z.string().min(1),
      }),
    )
    .default([]),
});

export const ChapterPlanItemSchema = z.object({
  chapterNumber: z.number().int().min(1).max(17),
  title: z.string().min(1),
  hook: z.string().min(1),
  mainBeat: z.string().min(1),
  humiliationProgression: z.string().min(1),
  revengeProgression: z.string().min(1),
  endingBeat: z.string().min(1),
});

export const ChapterSchema = z
  .object({
    chapterNumber: z.number().int().min(1).max(17),
    title: z.string().min(1),
    summary: z.string().min(1).optional(),
    text: z.string().min(1),
  })
  .transform((chapter) => ({
    ...chapter,
    summary: chapter.summary?.trim() || createChapterSummary(chapter.text),
  }));

export const ChapterStateSchema = z.object({
  chapter: z.number().int().min(1).max(17),
  heroineAgency: z.number().int().min(0).max(100),
  emotionalTemperature: z.string().optional(),
});

export const EstablishedAddressUsageSchema = z.object({
  speaker: z.string().min(1),
  target: z.string().min(1),
  term: z.string().min(1),
  count: z.number().int().min(1),
});

export const ContinuityLiteSchema = z.object({
  heroineName: z.string().min(1),
  betrayerName: z.string().min(1),
  rivalName: z.string().min(1),
  coreReveal: z.string().min(1),
  endingMode: z.string().min(1),
  speechPatterns: z.record(z.string(), SpeechPatternSchema).default({}),
  addressRegisters: z.record(z.string(), AddressRegisterSchema).default({}),
  establishedAddressUsage: z.array(EstablishedAddressUsageSchema).default([]),
  chapterState: z.array(ChapterStateSchema).default([]),
  canonFacts: z.array(z.string().min(1)).default([]),
});

export const RelationshipNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  description: z.string().min(1),
});

export const RelationshipEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().min(1),
  type: z.string().min(1),
  chapterNumber: z.number().int().min(1).max(17).optional(),
  confidence: z.enum(["explicit", "inferred"]),
});

export const RelationshipGraphSchema = z.object({
  nodes: z.array(RelationshipNodeSchema),
  edges: z.array(RelationshipEdgeSchema),
  updatedAt: z.string(),
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

// ─── Evaluation Reports (autonovel: reader panel + expert review) ───────────

export const ReaderPanelPersonaScoreSchema = z.object({
  persona: z.string().min(1),
  score: z.number().min(0).max(10),
  liked: z.string().default(""),
  concern: z.string().default(""),
});

export const EvaluationIssueSchema = z.object({
  issue: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
  chapters: z.array(z.number().int().min(1).max(17)).default([]),
});

export const ReaderPanelReportSchema = z.object({
  overallScore: z.number().min(0).max(10),
  personas: z.array(ReaderPanelPersonaScoreSchema).default([]),
  topIssues: z.array(EvaluationIssueSchema).default([]),
  model: z.string().min(1),
  generatedAt: z.string(),
});

export const ManuscriptReviewReportSchema = z.object({
  verdict: z.string().default(""),
  items: z.array(
    EvaluationIssueSchema.extend({
      persona: z.enum(["critic", "professor"]).default("critic"),
    }),
  ).default([]),
  model: z.string().min(1),
  generatedAt: z.string(),
});

export const PropagationDebtSchema = z.object({
  kind: z.enum(["missed_foreshadow", "pending_foreshadow", "unachieved_beat", "late_fact"]),
  detail: z.string().min(1),
  chapters: z.array(z.number().int().min(1).max(17)).default([]),
  severity: z.enum(["low", "medium", "high"]).default("medium"),
});

export const FoundationReportSchema = z.object({
  overallScore: z.number().min(0).max(10),
  dimensions: z.array(z.object({
    name: z.string().min(1),
    score: z.number().min(0).max(10),
    note: z.string().default(""),
  })).default([]),
  issues: z.array(z.string()).default([]),
  suggestions: z.array(z.string()).default([]),
  attempts: z.number().int().min(1).optional(),
  model: z.string().min(1),
  generatedAt: z.string(),
});

// Per-thread resolution signal computed after the whole manuscript exists: for
// each pressureThreads item declared in the bible, did the final two chapters
// (climax + resolution) actually reference and close it? Informational (like
// propagationDebt) — surfaces a lopsided climax that resolved only one thread.
export const ThreadResolutionSchema = z.object({
  label: z.string().min(1),
  addressed: z.boolean(),
  resolved: z.boolean(),
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
  chapterPlan: z.array(ChapterPlanItemSchema).min(15).max(17),
  chapters: z.array(ChapterSchema).default([]),
  continuityLite: ContinuityLiteSchema,
  relationshipGraph: RelationshipGraphSchema.optional(),
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
    readerPanel: ReaderPanelReportSchema.optional(),
    manuscriptReview: ManuscriptReviewReportSchema.optional(),
    propagationDebt: z.array(PropagationDebtSchema).optional(),
    threadResolution: z.array(ThreadResolutionSchema).optional(),
    foundationReport: FoundationReportSchema.optional(),
  }),
});

export const GenerateChapterRequestSchema = z
  .object({
    storyTitle: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    outputLanguage: OutputLanguageSchema.optional(),
    storyBible: StoryBibleSchema,
    chapterPlan: z.array(ChapterPlanItemSchema).min(15).max(17),
    chapterNumber: z.number().int().min(1).max(17),
    previousChapterSummaries: z.array(z.string().min(1)).default([]),
    draftControls: DraftControlsSchema.optional(),
    userIntensity: z.number().min(0).max(1).optional(),
    stylePreset: z.string().trim().min(1).optional(),
    continuityLite: ContinuityLiteSchema.optional(),
    // ─── Voice lock (optional, derived from earlier chapters) ─────────────
    voiceLock: z.string().optional(),
    // ─── Corpus structure references (optional, retrieved from corpus asset) ─
    corpusReference: z.string().optional(),
    // ─── Character Consistency (optional, added for character tracking) ──
    memoryStore: z.any().optional(),
    continuityTracker: z.any().optional(),
    // ─── Phrase-reuse index (optional, per-generation instance to avoid the
    //     global singleton racing across concurrent generations) ──────────
    phraseReuseIndex: z.any().optional(),
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
  targetChapter: z.number().int().min(1).max(17),
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
    dialogueRatio: z.number().min(0.2).max(0.85).default(0.56),
    hookDensity: z.enum(["low", "medium", "high"]).default("high"),
  }),
});
