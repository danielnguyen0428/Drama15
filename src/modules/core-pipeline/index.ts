/**
 * Core Pipeline — shared story generation engine.
 *
 * This module exports the unified pipeline that both desktop and web use.
 * All character consistency, quality validation, and prompt building logic
 * lives here — eliminating the desktop/web parity gap.
 *
 * Usage:
 *   Desktop: import { PipelineOrchestrator } from '../core-pipeline';
 *   Web API: import { PipelineOrchestrator } from '../../../src/modules/core-pipeline';
 */

// ─── Types ───────────────────────────────────────────────────────────────────
export type {
  PipelineStage,
  ProgressEvent,
  ProgressStatus,
  OperationType,
  PipelineGenerateRequest,
  PipelineStoryPayload,
  PipelineChapter,
  ChapterPlanItem,
  Concept,
  StoryBible,
  ContinuityLite,
  ChapterQualityMetrics,
  GenerationContext,
  OutputLanguage,
} from "./pipeline-types";

export {
  PIPELINE_TEMPERATURES,
  PIPELINE_TIMEOUTS,
  REPAIR_CONFIG,
} from "./pipeline-types";

// ─── Progress ────────────────────────────────────────────────────────────────
export {
  emitProgress,
  runProgressStage,
  resolveProgressOptions,
  createDesktopProgressReporter,
  createSseProgressReporter,
  type ProgressReporter,
  type StageDescriptor,
  type ProgressReporterCallback,
} from "./pipeline-progress";

// ─── Orchestrator ────────────────────────────────────────────────────────────
export {
  PipelineOrchestrator,
} from "./pipeline-orchestrator";

// ─── Character Memory ────────────────────────────────────────────────────────
export {
  createEmptyMemoryStore,
  addFactSheet,
  queryByCharacter,
  serializeMemoryStore,
  deserializeMemoryStore,
  memoryStoreToPromptContext,
  type CharacterMemoryStore,
  type CharacterFact,
  type CharacterFactSheet,
} from "./character-memory-store";

// ─── Character Fact Extraction ───────────────────────────────────────────────
export {
  extractCharacterFacts,
  extractCharacterNamesFallback,
  validateCharacterFactSheet,
  buildFactExtractionSystemPrompt,
  buildFactExtractionUserPrompt,
  TEMPERATURE_FACT_EXTRACTION,
  TEMPERATURE_FACT_EXTRACTION_RETRY,
} from "./character-fact-extractor";

// ─── Character Consistency ───────────────────────────────────────────────────
export {
  validateConsistency,
  parseDriftReport,
  classifyViolationSeverity,
  hasCriticalViolations,
  createEmptyDriftReport,
  buildIdiolectRepairInstruction,
  buildValidationSystemPrompt,
  buildValidationUserPrompt,
  TEMPERATURE_VALIDATION,
  type Violation,
  type ViolationType,
  type ViolationSeverity,
  type DriftReport,
} from "./character-consistency";

// ─── Continuity Tracker ──────────────────────────────────────────────────────
export {
  ContinuityTracker,
  type ContinuityTrackerOptions,
  type ForeshadowItem,
  type PlotBeat,
} from "./continuity-tracker";

// ─── AI-Tell Detection ───────────────────────────────────────────────────────
export {
  detectAiTells,
  buildAiTellRepairInstructions,
  VIETNAMESE_BANNED_PHRASES,
  ENGLISH_BANNED_PHRASES,
  type AiTellMatch,
  type AiTellReport,
} from "./validators/ai-tell-detector";

// ─── Phrase Reuse Tracking ───────────────────────────────────────────────────
export {
  createPhraseReuseIndex,
  indexChapter,
  scoreCandidate,
  buildReuseRepairInstruction,
  type PhraseReuseIndex,
  type PhraseReuseReport,
} from "./validators/phrase-reuse-tracker";

// ─── Sentence Variance ───────────────────────────────────────────────────────
export {
  analyzeSentenceVariance,
  buildVarianceRepairInstruction,
  segmentSentences,
  isFragment,
  countWords,
  type SentenceVarianceMetrics,
} from "./validators/sentence-variance";

// ─── Structural Slop Detection ───────────────────────────────────────────────
export {
  detectStructuralSlop,
  buildStructuralSlopRepairInstructions,
  type StructuralSlopKind,
  type StructuralSlopHit,
  type StructuralSlopReport,
} from "./validators/structural-slop";

// ─── Explanatory-Coda Detection ──────────────────────────────────────────────
export {
  detectExplanatoryCoda,
  buildExplanatoryCodaRepairInstructions,
  type ExplanatoryCodaKind,
  type ExplanatoryCodaHit,
  type ExplanatoryCodaReport,
} from "./validators/explanatory-coda";

// ─── Voice Fingerprint ───────────────────────────────────────────────────────
export {
  analyzeVoiceFingerprint,
  buildVoiceLockInstruction,
  type VoiceFingerprint,
} from "./validators/voice-fingerprint";

// ─── Propagation Ledger ──────────────────────────────────────────────────────
export {
  buildPropagationLedger,
  type PropagationDebt,
  type PropagationDebtKind,
  type PropagationLedgerInput,
} from "./validators/propagation-ledger";

