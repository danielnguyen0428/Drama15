import type { DraftControls } from "../../types/story";
import type { OutputLanguage } from "../../types/story";
import { getDrama15ChapterArchitecture } from "../prompts/drama15-chapter-architecture";
import { detectAiTells, type AiTellReport } from "../core-pipeline/validators/ai-tell-detector";
import { analyzeSentenceVariance, type SentenceVarianceMetrics } from "../core-pipeline/validators/sentence-variance";
import { detectStructuralSlop, type StructuralSlopReport } from "../core-pipeline/validators/structural-slop";
import {
  createPhraseReuseIndex,
  scoreCandidate,
  indexChapter,
  type PhraseReuseIndex,
  type PhraseReuseReport,
} from "../core-pipeline/validators/phrase-reuse-tracker";

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
const SOFT_CHAPTER_QUALITY_FAILURES = new Set([
  DIALOGUE_RATIO_FAILURE,
  AI_TELL_FAILURE,
  SENTENCE_VARIANCE_FAILURE,
  PHRASE_REUSE_FAILURE,
  STRUCTURAL_SLOP_FAILURE,
]);

export type ChapterQualityMetrics = {
  wordCount: number;
  dialogueRatio: number;
  paragraphCount: number;
  maxShortParagraphStreak: number;
  aiTellScore: number;
  aiTellReport: AiTellReport;
  sentenceVariance: SentenceVarianceMetrics;
  structuralSlop: StructuralSlopReport;
  phraseReuse: PhraseReuseReport;
  failures: string[];
};

export function analyzeChapterQuality(
  text: string,
  controls: DraftControls,
  outputLanguage?: OutputLanguage,
  chapterNumber?: number,
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

  // Structural Slop Detection (em-dash overload, "not just X but Y",
  // transition-opening addiction, hedge chains) — autonovel ANTI-PATTERNS.
  const structuralSlop = detectStructuralSlop(text);

  // Phrase Reuse Tracking
  const phraseReuseIndex = getOrCreatePhraseReuseIndex();
  const phraseReuse = chapterNumber !== undefined
    ? scoreCandidate(phraseReuseIndex, text, chapterNumber)
    : { reuseScore: 0, topRepeats: [], needsRepair: false };

  const metrics: ChapterQualityMetrics = {
    wordCount,
    dialogueRatio: wordCount === 0 ? 0 : quotedWordCount / wordCount,
    paragraphCount: paragraphs.length,
    maxShortParagraphStreak: maxStreak,
    aiTellScore: aiTellReport.score,
    aiTellReport,
    sentenceVariance,
    structuralSlop,
    phraseReuse,
    failures: [],
  };

  const minimumDialogueRatio = getMinimumAcceptedDialogueRatio(controls.dialogueRatio, chapterNumber);
  if (metrics.dialogueRatio < minimumDialogueRatio) {
    metrics.failures.push(DIALOGUE_RATIO_FAILURE);
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

  if (phraseReuse.needsRepair) {
    metrics.failures.push(PHRASE_REUSE_FAILURE);
  }

  return metrics;
}

export function needsChapterRetry(metrics: ChapterQualityMetrics) {
  return metrics.failures.length > 0;
}

export function hasOnlySoftChapterQualityFailures(metrics: ChapterQualityMetrics) {
  return metrics.failures.length > 0 && metrics.failures.every((failure) => SOFT_CHAPTER_QUALITY_FAILURES.has(failure));
}

function getMinimumAcceptedDialogueRatio(targetDialogueRatio: number, chapterNumber?: number) {
  const architecture = chapterNumber ? getDrama15ChapterArchitecture(chapterNumber) : null;
  return (architecture?.dialogueRatio ?? targetDialogueRatio) * 0.5;
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
