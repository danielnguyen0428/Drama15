/**
 * Structural Slop Detector — Shared Core
 *
 * Complements the phrase-level `ai-tell-detector` (which catches emotional
 * cliché *phrases*) by catching the *structural* AI tells described in the
 * NousResearch/autonovel ANTI-SLOP / ANTI-PATTERNS reference:
 *
 *   1. Em-dash overload     — LLMs reach for "—" / "--" where a human would use
 *                             a comma, parentheses, or two sentences.
 *   2. "Not just X, but Y"  — the single most over-used LLM rhetorical crutch.
 *   3. Transition addiction — every paragraph opening with However/Furthermore/
 *                             Moreover (VI: Tuy nhiên / Hơn nữa / Bên cạnh đó).
 *   4. Hedge parade         — chained hedges ("may potentially", "could
 *                             possibly"; VI: "có thể ... có lẽ").
 *
 * These signals are largely language-agnostic; markers are provided for both
 * Vietnamese (the primary output language) and English. The module mirrors the
 * shape of the sibling detectors: a 0..1 score, a structured report, a
 * `needsRepair` flag, and a repair-instruction builder.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

export type StructuralSlopKind =
  | "em_dash_overload"
  | "not_just_but"
  | "transition_openings"
  | "hedge_parade";

export type StructuralSlopHit = {
  kind: StructuralSlopKind;
  count: number;
  detail: string;
};

export type StructuralSlopReport = {
  score: number; // 0.0-1.0, higher = more structurally AI-like
  hits: StructuralSlopHit[];
  emDashPer1000Words: number;
  notJustButCount: number;
  transitionOpeningRatio: number;
  hedgeChainCount: number;
  needsRepair: boolean;
};

// ─── Markers (Vietnamese + English) ──────────────────────────────────────────

// Paragraph/sentence-opening transition words. Lowercased, matched at the start
// of a sentence (after stripping leading quotes/whitespace).
const TRANSITION_OPENINGS: readonly string[] = Object.freeze([
  // English
  "however", "furthermore", "moreover", "additionally", "consequently",
  "nevertheless", "nonetheless", "therefore", "thus", "hence", "indeed",
  "ultimately", "in addition", "on the other hand", "in conclusion",
  // Vietnamese
  "tuy nhiên", "hơn nữa", "bên cạnh đó", "ngoài ra", "do đó", "vì vậy",
  "vì thế", "chính vì vậy", "cuối cùng", "thật vậy", "không những thế",
  "mặt khác", "tóm lại", "nói cách khác", "đồng thời",
]);

// "Not just X, but Y" rhetorical crutch — multilingual variants.
const NOT_JUST_BUT_PATTERNS: readonly RegExp[] = Object.freeze([
  // English: not just/only ... but (also)
  /\bnot\s+(?:just|only|merely|simply)\b[^.!?\n]{1,80}?\bbut\b/gi,
  // Vietnamese: không chỉ ... mà (còn) / chẳng những ... mà còn / không những ... mà.
  // Vietnamese diacritics break ASCII \b boundaries, so anchor on whitespace instead.
  /không\s+chỉ\s[^.!?\n]{1,80}?\smà(?:\s|$)/giu,
  /chẳng\s+những\s[^.!?\n]{1,80}?\smà(?:\s|$)/giu,
  /không\s+những\s[^.!?\n]{1,80}?\smà(?:\s|$)/giu,
]);

// Hedge tokens. A "hedge chain" = 2+ hedge tokens inside one short window.
const HEDGE_TOKENS: readonly string[] = Object.freeze([
  // English
  "may", "might", "could", "possibly", "potentially", "perhaps", "arguably",
  "seemingly", "somewhat", "relatively", "presumably",
  // Vietnamese
  "có thể", "có lẽ", "dường như", "hình như", "phần nào", "tương đối",
  "khá là", "đôi khi", "ít nhiều",
]);

// ─── Thresholds ──────────────────────────────────────────────────────────────

// autonovel: "One or two em dashes per page is fine. Five per paragraph is a
// tell." A trade page is ~250-300 words, so ~6/1000 words is the comfortable
// ceiling; above that the prose starts to feel machine-punctuated.
const EM_DASH_PER_1000_BUDGET = 6;
const TRANSITION_OPENING_BUDGET = 0.18; // >18% of sentences opening on a transition
const HEDGE_CHAIN_WINDOW_WORDS = 6;
const SCORE_REPAIR_THRESHOLD = 0.3;

// ─── Detection ───────────────────────────────────────────────────────────────

export function detectStructuralSlop(text: string): StructuralSlopReport {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return {
      score: 0,
      hits: [],
      emDashPer1000Words: 0,
      notJustButCount: 0,
      transitionOpeningRatio: 0,
      hedgeChainCount: 0,
      needsRepair: false,
    };
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length || 1;
  const sentences = splitSentences(trimmed);

  const emDashCount = countEmDashes(trimmed);
  const emDashPer1000Words = (emDashCount / wordCount) * 1000;

  const notJustButCount = countNotJustBut(trimmed);
  const transitionOpenings = countTransitionOpenings(sentences);
  const transitionOpeningRatio = sentences.length > 0 ? transitionOpenings / sentences.length : 0;
  const hedgeChainCount = countHedgeChains(trimmed);

  const hits: StructuralSlopHit[] = [];

  // Each signal contributes a sub-score in 0..1, then we average the active ones
  // weighted by severity. Keeping each sub-score bounded avoids one noisy signal
  // dominating the gate.
  const emDashScore = clamp01((emDashPer1000Words - EM_DASH_PER_1000_BUDGET) / (EM_DASH_PER_1000_BUDGET * 2));
  if (emDashPer1000Words > EM_DASH_PER_1000_BUDGET) {
    hits.push({
      kind: "em_dash_overload",
      count: emDashCount,
      detail: `${emDashCount} em dashes (${emDashPer1000Words.toFixed(1)} per 1000 words, budget ${EM_DASH_PER_1000_BUDGET})`,
    });
  }

  const notJustScore = clamp01(notJustButCount / 2);
  if (notJustButCount > 0) {
    hits.push({
      kind: "not_just_but",
      count: notJustButCount,
      detail: `${notJustButCount} "not just X, but Y" construction(s)`,
    });
  }

  const transitionScore = clamp01((transitionOpeningRatio - TRANSITION_OPENING_BUDGET) / TRANSITION_OPENING_BUDGET);
  if (transitionOpeningRatio > TRANSITION_OPENING_BUDGET && transitionOpenings >= 2) {
    hits.push({
      kind: "transition_openings",
      count: transitionOpenings,
      detail: `${transitionOpenings}/${sentences.length} sentences open on a transition word (${(transitionOpeningRatio * 100).toFixed(0)}%)`,
    });
  }

  const hedgeScore = clamp01(hedgeChainCount / 3);
  if (hedgeChainCount > 0) {
    hits.push({
      kind: "hedge_parade",
      count: hedgeChainCount,
      detail: `${hedgeChainCount} hedge chain(s) (2+ hedge words within ${HEDGE_CHAIN_WINDOW_WORDS} words)`,
    });
  }

  const subScores = [emDashScore, notJustScore, transitionScore, hedgeScore].filter((s) => s > 0);
  const score = subScores.length === 0
    ? 0
    : Math.min(1, subScores.reduce((sum, s) => sum + s, 0) / Math.max(2, subScores.length));

  return {
    score,
    hits,
    emDashPer1000Words,
    notJustButCount,
    transitionOpeningRatio,
    hedgeChainCount,
    needsRepair: score > SCORE_REPAIR_THRESHOLD,
  };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function countEmDashes(text: string): number {
  // Real em dash (—), en dash used as separator (–), and the "--" ASCII stand-in.
  const unicode = (text.match(/[—–]/g) ?? []).length;
  const ascii = (text.match(/(?<!-)--(?!-)/g) ?? []).length;
  return unicode + ascii;
}

function countNotJustBut(text: string): number {
  let count = 0;
  for (const pattern of NOT_JUST_BUT_PATTERNS) {
    pattern.lastIndex = 0;
    count += (text.match(pattern) ?? []).length;
  }
  return count;
}

function countTransitionOpenings(sentences: string[]): number {
  let count = 0;
  for (const sentence of sentences) {
    const normalized = sentence
      .replace(/^["'“”‘’«»\s\-–—]+/u, "")
      .toLowerCase();
    if (TRANSITION_OPENINGS.some((marker) => startsWithMarker(normalized, marker))) {
      count += 1;
    }
  }
  return count;
}

function startsWithMarker(normalized: string, marker: string): boolean {
  if (!normalized.startsWith(marker)) return false;
  const nextChar = normalized.charAt(marker.length);
  // Marker must be followed by a word boundary (space, comma, end) so that
  // "thus" does not match "thusly" and "may" does not match "maybe".
  return nextChar === "" || /[\s,;:]/.test(nextChar);
}

function countHedgeChains(text: string): number {
  const lower = text.toLowerCase();
  // Tokenize on whitespace; also fold multi-word VI hedges into single markers
  // by scanning a sliding window of words.
  const words = lower.split(/\s+/).filter(Boolean);
  let chains = 0;
  let windowHits = 0;
  const queue: number[] = []; // indices where a hedge token started

  for (let i = 0; i < words.length; i += 1) {
    const isHedge = isHedgeAt(words, i);
    if (isHedge) {
      queue.push(i);
      windowHits += 1;
    }
    // drop hedges that fell outside the window
    while (queue.length > 0 && i - queue[0] >= HEDGE_CHAIN_WINDOW_WORDS) {
      queue.shift();
      windowHits -= 1;
    }
    if (queue.length >= 2) {
      chains += 1;
      // reset the window so a long run of hedges counts proportionally, not
      // combinatorially.
      queue.length = 0;
      windowHits = 0;
    }
  }
  return chains;
}

function isHedgeAt(words: string[], index: number): boolean {
  const single = stripPunct(words[index]);
  if (!single) return false;
  for (const token of HEDGE_TOKENS) {
    if (!token.includes(" ")) {
      if (single === token) return true;
      continue;
    }
    // multi-word marker, e.g. "có thể"
    const parts = token.split(" ");
    const slice = words
      .slice(index, index + parts.length)
      .map(stripPunct);
    if (slice.length === parts.length && slice.every((w, j) => w === parts[j])) {
      return true;
    }
  }
  return false;
}

function stripPunct(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, "");
}

// ─── Repair Instructions ─────────────────────────────────────────────────────

export function buildStructuralSlopRepairInstructions(report: StructuralSlopReport): string {
  if (!report.needsRepair) return "";

  const lines: string[] = [
    "STRUCTURAL DE-SLOP INSTRUCTION",
    "",
    `This chapter scored ${report.score.toFixed(2)} on the structural-slop detector (threshold: ${SCORE_REPAIR_THRESHOLD.toFixed(2)}).`,
    "Fix the structural AI tells below while keeping every plot fact, character name, and dialogue meaning identical.",
    "",
  ];

  for (const hit of report.hits) {
    switch (hit.kind) {
      case "em_dash_overload":
        lines.push(`- Em-dash overload: ${hit.detail}. Replace most dashes with commas, periods, or restructured clauses. Keep at most 1-2 per scene.`);
        break;
      case "not_just_but":
        lines.push(`- "Not just X, but Y" crutch: ${hit.detail}. Rewrite these as plain declarative statements; do not balance two halves with "but".`);
        break;
      case "transition_openings":
        lines.push(`- Transition-opening addiction: ${hit.detail}. Start those sentences with the actual subject/action instead of However/Furthermore/Tuy nhiên/Hơn nữa.`);
        break;
      case "hedge_parade":
        lines.push(`- Hedge parade: ${hit.detail}. Cut stacked hedges (có thể/có lẽ/may/might). State what happens directly.`);
        break;
    }
  }

  lines.push("");
  lines.push("Only restructure phrasing and punctuation. Do not add new plot beats, characters, or aftermath. Return the full chapter text with corrections applied.");

  return lines.join("\n");
}
