/**
 * Sentence Variance Analyzer — Shared Core
 *
 * Computes the coefficient of variation (cv) of sentence lengths in a chapter.
 * Human writers typically produce cv ≥ 0.65; AI writers tend toward cv ≤ 0.50.
 * When cv < 0.55 (and sentenceCount ≥ 3), the chapter is flagged for a soft
 * repair pass that injects more length variation.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

export interface SentenceVarianceMetrics {
  sentenceCount: number;
  meanLengthWords: number;
  stdevLengthWords: number;
  cv: number;
  fragmentRatio: number;
  needsRepair: boolean;
}

// ─── Vietnamese Pronoun + Verb Heuristic ─────────────────────────────────────

const VIETNAMESE_PRONOUNS: ReadonlySet<string> = new Set([
  "tôi", "tao", "mình", "ta", "chúng tôi", "chúng ta",
  "bạn", "mày", "cậu", "anh", "chị", "em", "ông", "bà",
  "nó", "hắn", "cô", "họ", "chúng nó", "người ta",
  "con", "thằng", "đứa", "gã", "lão", "nàng", "chàng",
]);

const VIETNAMESE_VERB_MARKERS: ReadonlySet<string> = new Set([
  "là", "có", "được", "bị", "phải", "nên", "cần", "muốn",
  "đã", "đang", "sẽ", "vừa", "mới", "từng", "hay", "luôn",
  "làm", "đi", "đến", "về", "lên", "xuống", "ra", "vào",
  "nói", "nhìn", "thấy", "biết", "nghĩ", "hiểu", "yêu",
  "ghét", "sợ", "chạy", "đứng", "ngồi", "nằm", "cười", "khóc",
]);

// ─── Sentence Segmentation ───────────────────────────────────────────────────

export function segmentSentences(text: string): string[] {
  if (!text || text.trim().length === 0) return [];
  const raw = text.split(/(?<=[.!?…])\s+/);
  return raw.map((s) => s.trim()).filter((s) => s.length > 0);
}

export function countWords(sentence: string): number {
  return sentence.split(/\s+/).filter(Boolean).length;
}

// ─── Fragment Detection ──────────────────────────────────────────────────────

export function isFragment(sentence: string): boolean {
  const words = sentence
    .toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  if (words.length < 4) return true;

  let hasPronoun = false;
  let hasVerb = false;

  for (const word of words) {
    if (VIETNAMESE_PRONOUNS.has(word)) hasPronoun = true;
    if (VIETNAMESE_VERB_MARKERS.has(word)) hasVerb = true;
    if (hasPronoun && hasVerb) return false;
  }

  return true;
}

// ─── Statistics ──────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const squaredDiffs = values.reduce((sum, v) => sum + (v - m) ** 2, 0);
  return Math.sqrt(squaredDiffs / values.length);
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function analyzeSentenceVariance(text: string): SentenceVarianceMetrics {
  const sentences = segmentSentences(text);
  const sentenceCount = sentences.length;

  if (sentenceCount === 0) {
    return {
      sentenceCount: 0,
      meanLengthWords: 0,
      stdevLengthWords: 0,
      cv: 0,
      fragmentRatio: 0,
      needsRepair: false,
    };
  }

  const lengths = sentences.map(countWords);
  const fragmentCount = sentences.filter(isFragment).length;
  const fragmentRatio = fragmentCount / sentenceCount;

  const meanLength = mean(lengths);
  const stdevLength = stdev(lengths);

  let cv: number;
  if (meanLength === 0) {
    cv = 0;
  } else {
    cv = stdevLength / meanLength;
  }

  const needsRepair = cv < 0.55 && sentenceCount >= 3;

  return {
    sentenceCount,
    meanLengthWords: meanLength,
    stdevLengthWords: stdevLength,
    cv,
    fragmentRatio,
    needsRepair,
  };
}

export function buildVarianceRepairInstruction(metrics: SentenceVarianceMetrics): string {
  return [
    `This chapter has low sentence length variance (cv = ${metrics.cv.toFixed(2)}, target ≥ 0.65).`,
    `Current stats: ${metrics.sentenceCount} sentences, mean ${metrics.meanLengthWords.toFixed(1)} words, stdev ${metrics.stdevLengthWords.toFixed(1)} words.`,
    `Fragment ratio: ${(metrics.fragmentRatio * 100).toFixed(0)}% (aim for 5-15%).`,
    "",
    "Vary sentence length more aggressively. Mix 3-word fragments with 25+ word complex sentences. Aim for cv > 0.65.",
    "Specific instructions:",
    "- Break some long sentences into 2-4 word fragments for rhythm.",
    "- Combine some short sentences into longer, complex ones with subordinate clauses.",
    "- Vary paragraph opening lengths — avoid starting every paragraph with a medium-length sentence.",
    "- Keep all plot facts, character names, dialogue meaning, and story progression identical.",
    "- Only restructure sentence lengths and rhythm.",
  ].join("\n");
}
