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
  /**
   * Longest run of consecutive short sentences (≤ SHORT_SENTENCE_WORDS words).
   * Global cv can look healthy when a chapter mixes long clause-heavy passages
   * with a clump of clipped staccato lines — the long sentences inflate stdev
   * and mask the local machine-cadence run. This measures that clump directly.
   */
  maxShortRun: number;
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

// ─── Local choppy-run detection ──────────────────────────────────────────────

// A sentence at or below this length counts as "short" for run detection.
const SHORT_SENTENCE_WORDS = 6;
// A run of this many consecutive short sentences reads as machine staccato even
// when the whole-chapter cv looks fine. Chosen so ordinary 2-3 clipped lines
// used for emphasis do not trip the gate, but a sustained clump does.
const MAX_SHORT_RUN_ALLOWED = 4;

export function longestShortRun(lengths: number[]): number {
  let maxRun = 0;
  let run = 0;
  for (const len of lengths) {
    if (len <= SHORT_SENTENCE_WORDS) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  return maxRun;
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
      maxShortRun: 0,
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

  // Whole-chapter cv misses a choppy CLUMP: a chapter that mixes long
  // clause-heavy sentences with a run of clipped ones has a high global cv, so
  // the cv gate reads "fine" while the staccato clump still reads machine-like.
  // A local run of consecutive short sentences catches that clump directly.
  const maxShortRun = longestShortRun(lengths);

  const needsRepair =
    (cv < 0.55 && sentenceCount >= 3) ||
    (maxShortRun >= MAX_SHORT_RUN_ALLOWED && sentenceCount >= 3);

  return {
    sentenceCount,
    meanLengthWords: meanLength,
    stdevLengthWords: stdevLength,
    cv,
    fragmentRatio,
    maxShortRun,
    needsRepair,
  };
}

export function buildVarianceRepairInstruction(metrics: SentenceVarianceMetrics): string {
  const lines = [
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
  ];

  if (metrics.maxShortRun >= MAX_SHORT_RUN_ALLOWED) {
    lines.push(
      "",
      `Local staccato clump detected: a run of ${metrics.maxShortRun} consecutive short sentences (≤ ${SHORT_SENTENCE_WORDS} words each). Whole-chapter variance can look fine while a clipped middle still reads machine-written.`,
      "- Find the run of short choppy lines and merge several into longer sentences with subordinate clauses, so no more than 3 short sentences sit back-to-back.",
    );
  }

  return lines.join("\n");
}
