/**
 * Phrase-Reuse Tracker (Wave 5) — Shared Core
 *
 * Detects cross-chapter trigram repetition in prose.
 * Maintains an in-memory index of 3-word n-grams per story and scores new
 * chapter candidates against the accumulated index.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

export interface PhraseReuseIndex {
  trigramOccurrences: Map<string, Set<number>>;
  indexedChapters: Set<number>;
}

export interface PhraseReuseReport {
  reuseScore: number;
  topRepeats: Array<{
    phrase: string;
    chapters: number[];
    count: number;
  }>;
  needsRepair: boolean;
}

// ─── Stop Words (Vietnamese + English) ───────────────────────────────────────

const VIETNAMESE_STOP_WORDS: ReadonlySet<string> = new Set([
  "và", "của", "là", "có", "được", "cho", "với", "này", "đó",
  "trong", "khi", "thì", "để", "từ", "đã", "sẽ", "đang", "không",
  "một", "những", "các", "cũng", "như", "nhưng", "mà", "hay", "hoặc",
  "nếu", "vì", "do", "bởi", "nên", "rồi", "lại", "còn", "đều",
  "rất", "quá", "lắm", "ra", "vào", "lên", "xuống", "về", "tới",
  "sau", "trước", "trên", "dưới",
  "the", "and", "for", "are", "but", "not", "you", "all", "can",
  "her", "was", "one", "our", "out", "has", "have", "been", "with",
  "they", "this", "that", "from", "which", "their", "will", "each",
]);

// ─── Tokenization ────────────────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  const normalized = text
    .toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length === 0) return [];
  return normalized.split(" ");
}

export function extractTrigrams(tokens: string[]): Set<string> {
  const trigrams = new Set<string>();
  for (let i = 0; i <= tokens.length - 3; i++) {
    const a = tokens[i]!;
    const b = tokens[i + 1]!;
    const c = tokens[i + 2]!;
    if (VIETNAMESE_STOP_WORDS.has(a) && VIETNAMESE_STOP_WORDS.has(b) && VIETNAMESE_STOP_WORDS.has(c)) {
      continue;
    }
    trigrams.add(`${a} ${b} ${c}`);
  }
  return trigrams;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function createPhraseReuseIndex(): PhraseReuseIndex {
  return {
    trigramOccurrences: new Map(),
    indexedChapters: new Set(),
  };
}

export function indexChapter(idx: PhraseReuseIndex, chapterNumber: number, text: string): void {
  if (idx.indexedChapters.has(chapterNumber)) return;
  idx.indexedChapters.add(chapterNumber);

  const tokens = tokenize(text);
  const trigrams = extractTrigrams(tokens);

  for (const trigram of trigrams) {
    let chapters = idx.trigramOccurrences.get(trigram);
    if (!chapters) {
      chapters = new Set();
      idx.trigramOccurrences.set(trigram, chapters);
    }
    chapters.add(chapterNumber);
  }
}

export function scoreCandidate(
  idx: PhraseReuseIndex,
  candidateText: string,
  currentChapter: number,
): PhraseReuseReport {
  const tokens = tokenize(candidateText);
  const candidateTrigrams = extractTrigrams(tokens);

  if (candidateTrigrams.size === 0) {
    return { reuseScore: 0, topRepeats: [], needsRepair: false };
  }

  const reusedTrigrams: Array<{ phrase: string; chapters: number[]; count: number }> = [];

  for (const trigram of candidateTrigrams) {
    const chapters = idx.trigramOccurrences.get(trigram);
    if (!chapters) continue;

    const otherChapters = Array.from(chapters).filter((ch) => ch !== currentChapter);
    if (otherChapters.length >= 2) {
      reusedTrigrams.push({
        phrase: trigram,
        chapters: otherChapters,
        count: otherChapters.length,
      });
    }
  }

  const reuseScore = reusedTrigrams.length / candidateTrigrams.size;
  const topRepeats = reusedTrigrams
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    reuseScore,
    topRepeats,
    needsRepair: reuseScore > 0.15,
  };
}

export function buildReuseRepairInstruction(report: PhraseReuseReport): string {
  if (report.topRepeats.length === 0) return "";

  const phrases = report.topRepeats.slice(0, 10);
  const lines: string[] = [
    `This chapter has a phrase-reuse score of ${(report.reuseScore * 100).toFixed(1)}% (threshold: 15%). The following trigrams have been overused across prior chapters:`,
    "",
    ...phrases.map(
      (p) => `  - "${p.phrase}" (appeared in ${p.count} prior chapters)`,
    ),
    "",
    "Rewrite the chapter to rephrase or replace these repeated expressions. Use varied vocabulary, different sentence structures, or fresh metaphors. Do NOT change any plot facts, character names, dialogue meaning, or story progression. Only the phrasing should change.",
  ];
  return lines.join("\n");
}
