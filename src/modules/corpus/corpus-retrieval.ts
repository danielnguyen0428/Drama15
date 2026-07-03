/**
 * Corpus retrieval — "retrieve real material first, then write".
 *
 * Loads a curated Vietnamese drama excerpt asset and selects a few real chapter
 * excerpts (opening hook / character intro / high-tension dialogue / chapter
 * ending) to hand the drafter as STRUCTURE references. The drafter mirrors the
 * technique and rhythm, never the wording/names/plot.
 *
 * The asset is built offline by scripts/build-corpus-asset.mjs and only keeps
 * excerpts that already scored human-like (low cliché, healthy sentence variance),
 * so retrieval pulls the model toward its own best output rather than the average.
 *
 * Fully fail-open: if the asset is missing (e.g. not deployed yet), every function
 * returns empty and the prompt simply omits the reference block.
 */

import fs from "node:fs";

import { resolveAssetPath, getEmbeddedTextAsset } from "../../lib/runtime";

export type CorpusExcerpt = {
  excerptType: string;
  niche: string;
  tags: string[];
  text: string;
};

type CorpusFile = { version?: number; excerpts?: CorpusExcerpt[] };

const ASSET_SEGMENTS = ["presets", "corpus", "vi-drama-corpus.json"];
const ASSET_KEY = "presets/corpus/vi-drama-corpus.json";

let cache: CorpusExcerpt[] | null = null;

export function loadCorpus(): CorpusExcerpt[] {
  if (cache) return cache;

  let raw = "";
  try {
    raw = fs.readFileSync(resolveAssetPath(...ASSET_SEGMENTS), "utf-8");
  } catch {
    raw = getEmbeddedTextAsset(ASSET_KEY) ?? "";
  }

  if (!raw) {
    cache = [];
    return cache;
  }

  try {
    const parsed = JSON.parse(raw) as CorpusFile;
    cache = Array.isArray(parsed.excerpts)
      ? parsed.excerpts.filter((e) => e && typeof e.text === "string" && e.text.length > 0 && typeof e.excerptType === "string")
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function pickRandom<T>(arr: T[], k: number, random: () => number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  while (copy.length > 0 && out.length < k) {
    const i = Math.floor(random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

/**
 * Select up to `perType` excerpts for each requested type, preferring the given
 * niche and falling back to cross-niche when the niche pool is too small.
 */
export function selectCorpusExamples(opts: {
  niche?: string;
  types: string[];
  perType?: number;
  random?: () => number;
}): CorpusExcerpt[] {
  const all = loadCorpus();
  if (all.length === 0) return [];

  const perType = opts.perType ?? 1;
  const random = opts.random ?? Math.random;
  const out: CorpusExcerpt[] = [];

  for (const type of opts.types) {
    const ofType = all.filter((e) => e.excerptType === type);
    if (ofType.length === 0) continue;
    let pool = opts.niche ? ofType.filter((e) => e.niche === opts.niche) : ofType;
    if (pool.length < perType) pool = ofType; // fallback: cross-niche
    out.push(...pickRandom(pool, perType, random));
  }
  return out;
}

const TYPE_LABEL: Record<string, string> = {
  opening: "MỞ ĐẦU / HOOK",
  character_intro: "RA MẮT NHÂN VẬT",
  high_tension_dialogue: "ĐỐI THOẠI CAO TRÀO",
  chapter_ending: "KẾT CHƯƠNG",
};

/**
 * Render selected excerpts into a prompt block. The instruction is deliberately
 * strict: borrow structure/rhythm, never wording, names, plot, or images.
 */
export function renderCorpusReferenceBlock(examples: CorpusExcerpt[]): string {
  if (examples.length === 0) return "";

  const lines: string[] = [
    "STRUCTURE REFERENCES — real Vietnamese drama excerpts below. Study HOW they build the opening hook, carry pressure through dialogue, and land the chapter beat, then mirror only the TECHNIQUE, pacing, and sentence rhythm.",
    "Hard rule: do NOT copy their wording, character names, plot, or images, and do not blend them into a familiar pastiche. Write fully original prose in this story's own voice and the selected style blueprint.",
  ];
  for (const e of examples) {
    lines.push(`--- [${TYPE_LABEL[e.excerptType] ?? e.excerptType}] ---\n${e.text}`);
  }
  return lines.join("\n\n");
}

/** Convenience: pick references appropriate to a chapter position. */
export function buildChapterCorpusReference(opts: {
  niche?: string;
  chapterNumber: number;
  random?: () => number;
}): string {
  const isOpeningChapter = opts.chapterNumber <= 2;
  const types = isOpeningChapter
    ? ["opening", "character_intro", "chapter_ending"]
    : ["high_tension_dialogue", "chapter_ending"];
  const examples = selectCorpusExamples({ niche: opts.niche, types, perType: 1, random: opts.random });
  return renderCorpusReferenceBlock(examples);
}
