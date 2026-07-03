import type { DraftControls } from "../../types/story";
import type { OutputLanguage } from "../../types/story";
import {
  analyzeHookDensity,
  buildUserDraftScaling,
  HOOK_DENSITY_FAILURE,
  resolveEffectiveChapterDraftTargets,
  type HookDensityMetrics,
} from "../prompts/draft-controls-scaling";
import { detectAiTells, type AiTellReport } from "../core-pipeline/validators/ai-tell-detector";
import { analyzeSentenceVariance, type SentenceVarianceMetrics } from "../core-pipeline/validators/sentence-variance";
import { analyzeVietnameseAiVoice, type VietnameseAiVoiceReport } from "../core-pipeline/validators/vietnamese-ai-voice";
import { detectStructuralSlop, type StructuralSlopReport } from "../core-pipeline/validators/structural-slop";
import {
  createPhraseReuseIndex,
  scoreCandidate,
  indexChapter,
  type PhraseReuseIndex,
  type PhraseReuseReport,
} from "../core-pipeline/validators/phrase-reuse-tracker";
import {
  analyzeAddressRegister,
  ADDRESS_REGISTER_FAILURE,
  type AddressRegisterViolation,
} from "../core-pipeline/validators/address-register-validator";
import type { AddressRegisterMap } from "../core-pipeline/address-register";

export { indexChapter };

// ─── Singleton phrase reuse index (created once per story generation run) ────

let globalPhraseReuseIndex: PhraseReuseIndex | null = null;

export function getOrCreatePhraseReuseIndex(): PhraseReuseIndex {
  if (!globalPhraseReuseIndex) {
    globalPhraseReuseIndex = createPhraseReuseIndex();
  }
  return globalPhraseReuseIndex;
}

export function resetPhraseReuseIndex(): void {
  globalPhraseReuseIndex = null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const QUOTED_DIALOGUE_PATTERN = /["\u201c\u300c\u300e]([^"\u201d\u300d\u300f\n]+)["\u201d\u300d\u300f]/gu;
const CJK_WORD_UNIT_DIVISOR = 4;
const DIALOGUE_RATIO_FAILURE = "dialogue ratio is materially below the requested target";
const AI_TELL_FAILURE = "AI-tell phrases exceed acceptable threshold";
const SENTENCE_VARIANCE_FAILURE = "sentence length variance is too uniform (AI-like)";
const PHRASE_REUSE_FAILURE = "phrase reuse across chapters exceeds threshold";
const STRUCTURAL_SLOP_FAILURE = "structural slop patterns exceed acceptable threshold";
const VIETNAMESE_AI_VOICE_FAILURE = "vietnamese AI-voice patterns exceed threshold";
const SOFT_CHAPTER_QUALITY_FAILURES = new Set([
  DIALOGUE_RATIO_FAILURE,
  HOOK_DENSITY_FAILURE,
  AI_TELL_FAILURE,
  SENTENCE_VARIANCE_FAILURE,
  PHRASE_REUSE_FAILURE,
  STRUCTURAL_SLOP_FAILURE,
  VIETNAMESE_AI_VOICE_FAILURE,
]);

export type ChapterQualityMetrics = {
  wordCount: number;
  dialogueRatio: number;
  paragraphCount: number;
  maxShortParagraphStreak: number;
  hookDensity: HookDensityMetrics;
  aiTellScore: number;
  aiTellReport: AiTellReport;
  sentenceVariance: SentenceVarianceMetrics;
  vietnameseAiVoice: VietnameseAiVoiceReport;
  structuralSlop: StructuralSlopReport;
  phraseReuse: PhraseReuseReport;
  addressRegister: {
    violations: AddressRegisterViolation[];
    needsRepair: boolean;
  };
  failures: string[];
};

export function analyzeChapterQuality(
  text: string,
  controls: DraftControls,
  outputLanguage?: OutputLanguage,
  chapterNumber?: number,
  userIntensity?: number,
  addressRegisters?: AddressRegisterMap,
  phraseReuseIndex?: PhraseReuseIndex,
): ChapterQualityMetrics {
  const wordCount = countWordLikeUnits(text, outputLanguage);
  const paragraphs = text.split(/\n\s*\n/).filter((value) => value.trim().length > 0);
  const quotedSegments = [...text.matchAll(QUOTED_DIALOGUE_PATTERN)].map((match) => match[1]);
  const quotedWordCount = countWordLikeUnits(quotedSegments.join(" "), outputLanguage);

  let streak = 0;
  let maxStreak = 0;

  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.trim().split(/\s+/).filter(Boolean).length;
    if (paragraphWords <= 8) {
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
    }
  }

  // AI-Tell Detection
  const aiTellReport = detectAiTells(text, outputLanguage ?? "vietnamese");

  // Sentence Variance Analysis
  const sentenceVariance = analyzeSentenceVariance(text);

  // Vietnamese AI-voice (structural clichés / opener cadence) — only meaningful for VN.
  const vietnameseAiVoice = analyzeVietnameseAiVoice(text);

  // Structural Slop Detection (em-dash overload, "not just X but Y",
  // transition-opening addiction, hedge chains) — autonovel ANTI-PATTERNS.
  const structuralSlop = detectStructuralSlop(text);

  // Phrase Reuse Tracking
  const resolvedPhraseReuseIndex = phraseReuseIndex ?? getOrCreatePhraseReuseIndex();
  const phraseReuse = chapterNumber !== undefined
    ? scoreCandidate(resolvedPhraseReuseIndex, text, chapterNumber)
    : { reuseScore: 0, topRepeats: [], needsRepair: false };

  const scaling = buildUserDraftScaling(controls, userIntensity);
  const effectiveTargets = chapterNumber !== undefined
    ? resolveEffectiveChapterDraftTargets(chapterNumber, scaling)
    : {
        intensity: userIntensity ?? scaling.userIntensity ?? 0.84,
        dialogueRatio: controls.dialogueRatio,
        hookDensity: controls.hookDensity,
        hookType: "tension" as const,
      };
  const hookDensity = analyzeHookDensity(text, effectiveTargets.hookDensity);
  const addressRegister = analyzeAddressRegister(text, addressRegisters ?? {}, outputLanguage);

  const metrics: ChapterQualityMetrics = {
    wordCount,
    dialogueRatio: wordCount === 0 ? 0 : quotedWordCount / wordCount,
    paragraphCount: paragraphs.length,
    maxShortParagraphStreak: maxStreak,
    hookDensity,
    aiTellScore: aiTellReport.score,
    aiTellReport,
    sentenceVariance,
    vietnameseAiVoice,
    structuralSlop,
    phraseReuse,
    addressRegister,
    failures: [],
  };

  const minimumDialogueRatio = effectiveTargets.dialogueRatio * 0.5;
  if (metrics.dialogueRatio < minimumDialogueRatio) {
    metrics.failures.push(DIALOGUE_RATIO_FAILURE);
  }

  if (!hookDensity.meetsTarget) {
    metrics.failures.push(HOOK_DENSITY_FAILURE);
  }

  if (aiTellReport.needsRepair) {
    metrics.failures.push(AI_TELL_FAILURE);
  }

  if (sentenceVariance.needsRepair) {
    metrics.failures.push(SENTENCE_VARIANCE_FAILURE);
  }

  if (structuralSlop.needsRepair) {
    metrics.failures.push(STRUCTURAL_SLOP_FAILURE);
  }

  if ((outputLanguage ?? "vietnamese") === "vietnamese" && vietnameseAiVoice.needsRepair) {
    metrics.failures.push(VIETNAMESE_AI_VOICE_FAILURE);
  }

  if (phraseReuse.needsRepair) {
    metrics.failures.push(PHRASE_REUSE_FAILURE);
  }

  if (addressRegister.needsRepair) {
    metrics.failures.push(ADDRESS_REGISTER_FAILURE);
  }

  return metrics;
}

export function needsChapterRetry(metrics: ChapterQualityMetrics) {
  return metrics.failures.length > 0;
}

export function hasOnlySoftChapterQualityFailures(metrics: ChapterQualityMetrics) {
  return metrics.failures.length > 0 && metrics.failures.every((failure) => SOFT_CHAPTER_QUALITY_FAILURES.has(failure));
}

// A chapter is allowed to ship with a few individual soft-quality misses, but a
// chapter that trips many soft checks at once reads as broadly machine-written.
// Beyond this budget the accumulated soft failures are treated as blocking, which
// restores a real gate for languages (e.g. English) where the only hard check —
// the address register — does not apply.
export const SOFT_CHAPTER_QUALITY_FAILURE_BUDGET = 3;

export function countSoftChapterQualityFailures(metrics: ChapterQualityMetrics): number {
  return metrics.failures.filter((failure) => SOFT_CHAPTER_QUALITY_FAILURES.has(failure)).length;
}

/**
 * True when the chapter's soft-failure count is within the acceptable budget.
 * Used at the final accept/reject decision so a chapter that fails most soft
 * checks simultaneously is not silently published.
 */
export function isWithinSoftFailureBudget(metrics: ChapterQualityMetrics): boolean {
  return countSoftChapterQualityFailures(metrics) <= SOFT_CHAPTER_QUALITY_FAILURE_BUDGET;
}

/**
 * Composite penalty score for a chapter (lower is better). Used to decide
 * whether a rewritten/tightened chapter is actually an improvement before it is
 * allowed to overwrite the original. Hard failures dominate; the soft signal
 * scores (ai-tell, structural slop, phrase reuse) act as tie-breakers, and low
 * sentence-length variance is penalized because uniform prose reads as machine
 * written.
 */
export function scoreChapterQualityPenalty(metrics: ChapterQualityMetrics): number {
  const hardFailures = metrics.failures.filter((failure) => !SOFT_CHAPTER_QUALITY_FAILURES.has(failure)).length;
  const softFailures = metrics.failures.filter((failure) => SOFT_CHAPTER_QUALITY_FAILURES.has(failure)).length;
  const varianceGap = Math.max(0, 0.65 - metrics.sentenceVariance.cv);
  return (
    hardFailures * 1000 +
    softFailures * 100 +
    metrics.aiTellScore * 10 +
    metrics.structuralSlop.score * 10 +
    metrics.phraseReuse.reuseScore * 10 +
    varianceGap * 5
  );
}

/**
 * True when `candidate` is at least as good as `baseline` (its penalty is not
 * higher). Guards the adversarial-cut and revision passes so they can never
 * replace a chapter with a strictly worse one.
 */
export function isChapterQualityNotWorse(
  candidate: ChapterQualityMetrics,
  baseline: ChapterQualityMetrics,
): boolean {
  return scoreChapterQualityPenalty(candidate) <= scoreChapterQualityPenalty(baseline);
}

function countWordLikeUnits(text: string, outputLanguage?: OutputLanguage) {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }

  const whitespaceWords = trimmed.split(/\s+/).filter(Boolean).length;
  const cjkCharacters = [...trimmed.matchAll(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu)].length;

  if (!["japanese", "korean"].includes(outputLanguage ?? "") && cjkCharacters < whitespaceWords * 3) {
    return whitespaceWords;
  }

  const latinWords = [...trimmed.matchAll(/[\p{Script=Latin}\p{Number}]+(?:['-][\p{Script=Latin}\p{Number}]+)*/gu)].length;
  return Math.max(whitespaceWords, latinWords + Math.round(cjkCharacters / CJK_WORD_UNIT_DIVISOR));
}
