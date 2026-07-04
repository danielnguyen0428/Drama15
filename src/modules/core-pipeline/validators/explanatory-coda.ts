/**
 * Explanatory-Coda Detector — Shared Core
 *
 * Catches a specific structural AI tell that survives the phrase-level
 * (`ai-tell-detector`) and structural (`structural-slop`) checks: the
 * **explanatory coda**. After a scene or an image has already *shown* the
 * point, the model appends one or more sentences that *tell* the reader what it
 * meant — restating the theme in abstract terms.
 *
 * Human authors trust the image and stop. LLMs reflexively gloss it:
 *
 *   Shown:  "Ngoài ống kính, cô ngồi trên chiếc ghế nhựa, làm cho hạnh phúc
 *            của người ta trông trọn vẹn."   ← good, keep
 *   Told:   "Cô gọi sự chịu đựng là chung thủy. Được cần đến không phải được
 *            chọn. Hữu dụng không phải xứng đáng."   ← explanatory coda, cut
 *
 * The detector flags sentences that match the recognizable *shapes* of this
 * gloss so a repair pass (or a human editor) can cut them. It is deliberately
 * conservative: it targets restatement grammar, not ordinary narration, and it
 * weights matches that sit at the END of a paragraph (where codas live).
 *
 * Signals (Vietnamese primary, English secondary):
 *   1. Redefinition     — "Cô gọi X là Y", "X không phải (là) Y", "A là B, không
 *                         phải C"; EN "X is not Y", "to call X Y".
 *   2. Meaning-gloss    — a sentence opening with "Nghĩa là", "Hóa ra", "Thì ra",
 *                         "Tức là"; EN "It meant", "Which meant", "As if".
 *   3. Abstract summary — a short end-of-paragraph sentence built mostly from
 *                         theme abstractions (nhẫn nại, phẩm giá, hữu dụng,
 *                         xứng đáng, chịu đựng, cô đơn...) with no concrete
 *                         actor/action — the "moral of the scene" line.
 *
 * Mirrors the sibling detectors: a 0..1 score, a structured report, a
 * `needsRepair` flag, and a repair-instruction builder. Shared by both the
 * desktop orchestrator and the web API engine.
 */

export type ExplanatoryCodaKind =
  | "redefinition"
  | "meaning_gloss"
  | "abstract_summary";

export type ExplanatoryCodaHit = {
  kind: ExplanatoryCodaKind;
  sentence: string;
  atParagraphEnd: boolean;
};

export type ExplanatoryCodaReport = {
  score: number; // 0.0-1.0, higher = more explanatory-coda slop
  hits: ExplanatoryCodaHit[];
  sentenceCount: number;
  needsRepair: boolean;
};

// ─── Markers ─────────────────────────────────────────────────────────────────

// Sentence-opening meaning glosses. Matched at the start of a sentence after
// stripping leading quotes/dashes/whitespace.
const MEANING_GLOSS_OPENINGS: readonly string[] = Object.freeze([
  // Vietnamese
  "nghĩa là", "có nghĩa là", "tức là", "hóa ra", "thì ra", "rốt cuộc thì",
  "nói cho cùng", "suy cho cùng", "đến cuối cùng thì",
  // English
  "it meant", "which meant", "that meant", "in other words", "as if to say",
]);

// Redefinition grammar — "X (là) không phải Y" / "Cô gọi X là Y" and the
// English equivalents. Diacritics break ASCII \b, so anchor on whitespace.
const REDEFINITION_PATTERNS: readonly RegExp[] = Object.freeze([
  // "... không phải (là) ..." — the negative-definition crutch.
  /\bkhông\s+phải\s+(?:là\s+)?/giu,
  // "Cô/anh/nó gọi X là Y" — naming an abstraction.
  /\bgọi\s[^.!?\n]{1,40}?\slà\s/giu,
  // "X, không phải Y" handled by the first pattern; add EN "is not / was not".
  /\b(?:is|was|are|were)\s+not\s+(?:really\s+)?/gi,
]);

// Theme abstractions. A short end-of-paragraph sentence built mostly from these
// (with no concrete actor doing a physical action) reads as a moral-of-scene
// coda rather than narration.
const THEME_ABSTRACTIONS: readonly string[] = Object.freeze([
  "nhẫn nại", "chịu đựng", "chung thủy", "phẩm giá", "hữu dụng", "xứng đáng",
  "được chọn", "được cần", "được cần đến", "biết điều", "cô đơn", "cô độc",
  "tình yêu", "yêu thương", "dịu dàng", "tổn thương", "danh phận", "thân phận",
  "kiên nhẫn", "tủi thân", "cam chịu", "nhún nhường", "lòng tự trọng",
  // English
  "patience", "endurance", "loyalty", "dignity", "useful", "worthy",
  "chosen", "needed", "loneliness", "tenderness", "self-respect",
]);

// ─── Thresholds ──────────────────────────────────────────────────────────────

const ABSTRACT_SUMMARY_MAX_WORDS = 14; // codas are short, punchy restatements
const ABSTRACT_SUMMARY_MIN_DENSITY = 0.18; // >=18% of words are theme abstractions
const PARAGRAPH_END_WEIGHT = 1.0; // coda at paragraph end
const MID_PARAGRAPH_WEIGHT = 0.4; // same shape mid-paragraph is likelier legit
const SCORE_REPAIR_THRESHOLD = 0.3;

// ─── Detection ───────────────────────────────────────────────────────────────

export function detectExplanatoryCoda(text: string): ExplanatoryCodaReport {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) {
    return { score: 0, hits: [], sentenceCount: 0, needsRepair: false };
  }

  const paragraphs = trimmed.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const hits: ExplanatoryCodaHit[] = [];
  let sentenceCount = 0;

  for (const paragraph of paragraphs) {
    // Skip dialogue-only paragraphs: codas are narration, and a quoted line that
    // happens to use "không phải" is a character speaking, not the narrator
    // glossing. A paragraph that starts with a quote mark is treated as dialogue.
    const isDialogue = /^["'“”‘’«»]/.test(paragraph);
    const sentences = splitSentences(paragraph);
    sentenceCount += sentences.length;
    if (isDialogue) continue;

    sentences.forEach((sentence, index) => {
      const atParagraphEnd = index === sentences.length - 1;
      const kind = classifySentence(sentence);
      if (kind) {
        hits.push({ kind, sentence: clip(sentence), atParagraphEnd });
      }
    });
  }

  // Weight each hit by position (codas live at paragraph ends), sum, normalize.
  const weighted = hits.reduce(
    (sum, hit) => sum + (hit.atParagraphEnd ? PARAGRAPH_END_WEIGHT : MID_PARAGRAPH_WEIGHT),
    0,
  );
  // Normalize against paragraph count so a long chapter is not penalized just for
  // being long: roughly "how many paragraphs end on a gloss".
  const denom = Math.max(3, paragraphs.length);
  const score = clamp01(weighted / denom * 2.5);

  return {
    score,
    hits,
    sentenceCount,
    needsRepair: score > SCORE_REPAIR_THRESHOLD && hits.length >= 2,
  };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function classifySentence(sentence: string): ExplanatoryCodaKind | null {
  const normalized = sentence.replace(/^["'“”‘’«»\s\-–—]+/u, "");
  const lower = normalized.toLowerCase();

  // 1. Meaning gloss opener — strongest signal.
  if (MEANING_GLOSS_OPENINGS.some((marker) => startsWithMarker(lower, marker))) {
    return "meaning_gloss";
  }

  // 2. Abstract summary — short sentence, high theme-abstraction density, no
  //    concrete physical verb. Checked before redefinition so a line like
  //    "Hữu dụng không phải xứng đáng" is reported as the (more descriptive)
  //    abstract_summary rather than a bare redefinition.
  if (isAbstractSummary(lower)) {
    return "abstract_summary";
  }

  // 3. Redefinition grammar.
  for (const pattern of REDEFINITION_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(normalized)) {
      return "redefinition";
    }
  }

  return null;
}

function isAbstractSummary(lowerSentence: string): boolean {
  const words = lowerSentence.split(/\s+/).map(stripPunct).filter(Boolean);
  if (words.length === 0 || words.length > ABSTRACT_SUMMARY_MAX_WORDS) return false;

  // Count theme-abstraction coverage (multi-word markers counted as one hit
  // spanning their length).
  const joined = ` ${words.join(" ")} `;
  let abstractionWordSpan = 0;
  for (const marker of THEME_ABSTRACTIONS) {
    if (joined.includes(` ${marker} `)) {
      abstractionWordSpan += marker.split(" ").length;
    }
  }
  if (abstractionWordSpan === 0) return false;

  const density = abstractionWordSpan / words.length;
  return density >= ABSTRACT_SUMMARY_MIN_DENSITY;
}

function startsWithMarker(normalized: string, marker: string): boolean {
  if (!normalized.startsWith(marker)) return false;
  const nextChar = normalized.charAt(marker.length);
  return nextChar === "" || /[\s,;:]/.test(nextChar);
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function stripPunct(word: string): string {
  return word.replace(/[^\p{L}\p{N}]/gu, "");
}

function clip(sentence: string): string {
  const s = sentence.trim();
  return s.length <= 120 ? s : `${s.slice(0, 117)}...`;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

// ─── Repair Instructions ─────────────────────────────────────────────────────

export function buildExplanatoryCodaRepairInstructions(report: ExplanatoryCodaReport): string {
  if (!report.needsRepair) return "";

  const lines: string[] = [
    "EXPLANATORY-CODA DE-SLOP INSTRUCTION",
    "",
    `This chapter scored ${report.score.toFixed(2)} on the explanatory-coda detector (threshold: ${SCORE_REPAIR_THRESHOLD.toFixed(2)}).`,
    "The prose SHOWS a point well, then adds a sentence that TELLS the reader what it meant. Trust the image and cut the gloss.",
    "",
    "Cut or fold the following restatement sentences. Keep the concrete scene/image that precedes each one; delete only the abstract explanation that follows:",
    "",
  ];

  const byKind = new Map<ExplanatoryCodaKind, ExplanatoryCodaHit[]>();
  for (const hit of report.hits) {
    const existing = byKind.get(hit.kind) ?? [];
    existing.push(hit);
    byKind.set(hit.kind, existing);
  }

  const label: Record<ExplanatoryCodaKind, string> = {
    meaning_gloss: 'Meaning gloss (opens with "Nghĩa là / Hóa ra / It meant")',
    redefinition: 'Redefinition ("X không phải Y" / "Cô gọi X là Y")',
    abstract_summary: "Abstract moral-of-scene summary (short, theme-word line)",
  };

  for (const [kind, kindHits] of byKind) {
    lines.push(`${label[kind]}:`);
    for (const hit of kindHits) {
      const where = hit.atParagraphEnd ? "end of paragraph" : "mid-paragraph";
      lines.push(`  - [${where}] "${hit.sentence}"`);
    }
    lines.push("");
  }

  lines.push("RULES:");
  lines.push("- Delete the restatement. Do NOT rewrite it into a subtler explanation; remove it.");
  lines.push("- Keep the concrete action, image, or dialogue that already carried the meaning.");
  lines.push("- Never explain an image you just wrote. End the paragraph on the image.");
  lines.push("- Keep all plot facts, character names, and dialogue meaning identical.");
  lines.push("- Return the full chapter text with the codas removed.");

  return lines.join("\n");
}
