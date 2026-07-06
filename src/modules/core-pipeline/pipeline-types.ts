/**
 * Unified pipeline type definitions — shared between desktop and web.
 *
 * All types that flow through the story generation pipeline are defined here
 * so both the desktop orchestrator and the web API engine consume the same
 * shapes, eliminating parity gaps.
 */

// ─── Stage Identifiers ───────────────────────────────────────────────────────

export type PipelineStage =
  | "setting-seed"
  | "concept"
  | "story-bible"
  | "chapter-plan"
  | "chapter"
  | "poster"
  | "finalize";

// ─── Progress Event ──────────────────────────────────────────────────────────

export type ProgressStatus = "started" | "completed";
export type OperationType = "outline" | "full" | "chapter" | "regenerate";

export interface ProgressEvent {
  operation: OperationType;
  stage: PipelineStage | `chapter-${number}`;
  stageNumber: number;
  label: string;
  detail: string;
  current: number;
  total: number;
  status: ProgressStatus;
  chapter?: PipelineChapter;
  storyPayload?: PipelineStoryPayload;
  meta?: Record<string, unknown>;
}

// ─── Pipeline Request (unified input) ────────────────────────────────────────

export interface PipelineGenerateRequest {
  linePreset: string;
  stylePreset: string;
  outputLanguage: OutputLanguage;
  titleHint?: string;
  audience?: {
    genderFocus: "female" | "male" | "mixed";
    ageBand: string;
    market: string;
  };
  storyControls?: {
    betrayalType: string;
    shameType: string;
    revengeMode: string;
    endingMode: string;
    intensity: number;
  };
  customCreativeInputs?: {
    dramaBranch?: string;
  };
  settingSeed?: string;
  chapterCount: number;
  draftControls?: {
    targetWordsPerChapter: number;
    dialogueRatio: number;
    hookDensity: "low" | "medium" | "high";
  };
}

export type OutputLanguage = "english" | "vietnamese" | "japanese" | "korean" | "portuguese" | "spanish";

// ─── Pipeline Chapter ────────────────────────────────────────────────────────

export interface PipelineChapter {
  chapterNumber: number;
  title: string;
  summary: string;
  text: string;
  modelUsed: string;
}

export interface ChapterPlanItem {
  chapterNumber: number;
  title: string;
  hook: string;
  mainBeat: string;
  humiliationProgression: string;
  revengeProgression: string;
  endingBeat: string;
}

export interface Concept {
  title: string;
  titleCandidates: string[];
  logline: string;
  promise: string;
  conflictEngine: string;
}

export interface StoryBible {
  premise: string;
  heroine: {
    name: string;
    wound: string;
    strengths: string[];
    blindSpots: string[];
    speechPattern?: {
      fillers: string[];
      syntaxQuirk: string;
      vocabularyBand: "formal" | "neutral" | "casual" | "crude";
      avoidedPhrases: string[];
    };
    addressRegister?: {
      selfReference: string;
      toOthers: Record<string, { call: string; notes?: string }>;
      forbiddenTerms: string[];
      narratorThirdPerson?: string;
    };
  };
  betrayer: {
    name: string;
    wound: string;
    cowardiceVector: string;
    speechPattern?: {
      fillers: string[];
      syntaxQuirk: string;
      vocabularyBand: "formal" | "neutral" | "casual" | "crude";
      avoidedPhrases: string[];
    };
    addressRegister?: {
      selfReference: string;
      toOthers: Record<string, { call: string; notes?: string }>;
      forbiddenTerms: string[];
      narratorThirdPerson?: string;
    };
  };
  rival: {
    name: string;
    socialPower: string;
    demeanor: string;
    speechPattern?: {
      fillers: string[];
      syntaxQuirk: string;
      vocabularyBand: "formal" | "neutral" | "casual" | "crude";
      avoidedPhrases: string[];
    };
    addressRegister?: {
      selfReference: string;
      toOthers: Record<string, { call: string; notes?: string }>;
      forbiddenTerms: string[];
      narratorThirdPerson?: string;
    };
  };
  classHierarchy: string[];
  supportingPressureCast: {
    name: string;
    role: string;
    relationshipToHeroine: string;
    pressureContribution: string;
  }[];
  betrayalEngine: string;
  classShameEngine: string;
  revengeEngine: string;
  endingMode: string;
}

// ─── Pipeline Story Payload (unified output) ─────────────────────────────────

export interface PipelineStoryPayload {
  title: string;
  request: PipelineGenerateRequest;
  concept: Concept;
  storyBible: StoryBible;
  chapterPlan: ChapterPlanItem[];
  chapters: PipelineChapter[];
  continuityLite: ContinuityLite;
  poster?: {
    status: "completed" | "failed";
    filePath?: string;
    error?: string;
    title: string;
    model: string;
    size: string;
    generatedAt: string;
  };
  meta: {
    generatedAt: string;
    modelAliases: Record<string, string>;
    seedFingerprint?: string;
  };
}

// ─── Continuity Lite (enhanced) ──────────────────────────────────────────────

export interface ContinuityLite {
  heroineName: string;
  betrayerName: string;
  rivalName: string;
  coreReveal: string;
  endingMode: string;
  speechPatterns: Record<string, {
    fillers: string[];
    syntaxQuirk: string;
    vocabularyBand: string;
    avoidedPhrases: string[];
  }>;
  addressRegisters: Record<string, {
    selfReference: string;
    toOthers: Record<string, { call: string; notes?: string }>;
    forbiddenTerms: string[];
    narratorThirdPerson?: string;
  }>;
  establishedAddressUsage: Array<{
    speaker: string;
    target: string;
    term: string;
    count: number;
  }>;
  chapterState: Array<{
    chapter: number;
    heroineAgency: number;
    emotionalTemperature: string;
  }>;
  canonFacts?: string[];
}

// ─── Quality Metrics ─────────────────────────────────────────────────────────

export interface ChapterQualityMetrics {
  wordCount: number;
  dialogueRatio: number;
  paragraphCount: number;
  maxShortParagraphStreak: number;
  aiTellScore: number;
  sentenceVarianceCv: number;
  phraseReuseScore: number;
  consistencyViolations: number;
  failures: string[];
}

// ─── Generation Context ──────────────────────────────────────────────────────

export interface GenerationContext {
  linePreset: Record<string, unknown>;
  stylePreset: Record<string, unknown>;
  models: {
    planner: string;
    bible: string;
    drafter: string;
    rewriter: string;
    fallback: string;
  };
}

// ─── Stage Temperatures ──────────────────────────────────────────────────────

export const PIPELINE_TEMPERATURES = Object.freeze({
  seed: 0.92,
  concept: 0.88,
  bible: 0.82,
  plan: 0.78,
  chapterDraft: 0.58,
  chapterRepair: 0.28,
  factExtraction: 0.2,
  consistencyValidation: 0.1,
} as const);

// ─── Stage Timeouts ──────────────────────────────────────────────────────────

export const PIPELINE_TIMEOUTS = Object.freeze({
  default: 300_000,
  planning: 240_000,
  chapter: 600_000,
  poster: 300_000,
} as const);

// ─── Repair Config ───────────────────────────────────────────────────────────

export const REPAIR_CONFIG = Object.freeze({
  maxAttempts: 2,
  maxAttemptsExtended: 3, // when consistency violations are present
} as const);
