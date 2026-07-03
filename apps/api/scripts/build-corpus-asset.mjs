#!/usr/bin/env node
/**
 * Build the deployable corpus asset from the raw corpus (corpus/excerpts.jsonl).
 *
 * Keeps ONLY excerpts that already score human-like (no cliché variants, healthy
 * sentence variance, no machine opener cadence), so retrieval pulls the drafter
 * toward the model's own best output instead of its average. Caps per
 * (niche, type) to keep the asset small and prompt-cheap.
 *
 * Output: presets/corpus/vi-drama-corpus.json  (gitignored until owner approves).
 *
 * Usage:
 *   npx tsx scripts/build-corpus-asset.mjs
 *   npx tsx scripts/build-corpus-asset.mjs --per 6 --max-chars 900
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PER = Number(getArg('--per', '6'));
const MAX_CHARS = Number(getArg('--max-chars', '900'));

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const RAW = path.join(REPO_ROOT, 'corpus', 'excerpts.jsonl');
const OUT_DIR = path.join(REPO_ROOT, 'presets', 'corpus');
const OUT = path.join(OUT_DIR, 'vi-drama-corpus.json');

if (!existsSync(RAW)) {
  console.error(`Missing ${RAW}. Run build-corpus.mjs first.`);
  process.exit(1);
}

const { analyzeVietnameseAiVoice } = await import('../../../src/modules/core-pipeline/validators/vietnamese-ai-voice.js');
const { analyzeSentenceVariance } = await import('../../../src/modules/core-pipeline/validators/sentence-variance.js');

const NARRATIVE_TYPES = new Set(['opening', 'character_intro', 'chapter_ending']);

const rows = readFileSync(RAW, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

const scored = [];
for (const e of rows) {
  const text = (e.text ?? '').trim();
  if (text.length < 40 || text.length > MAX_CHARS) continue;

  const vn = analyzeVietnameseAiVoice(text);
  const sv = analyzeSentenceVariance(text);

  // Human-likeness gate.
  if (vn.clicheHits > 0) continue;
  if (vn.maxSameSubjectStreak >= 4) continue;
  if (vn.adverbialMotCach > 0) continue;
  if (NARRATIVE_TYPES.has(e.excerpt_type) && sv.cv < 0.6) continue;

  // Human-likeness rank: higher cv, lower AI-voice score.
  const rank = sv.cv - vn.score;
  scored.push({
    excerptType: e.excerpt_type,
    niche: e.niche,
    tags: Array.isArray(e.tags) ? e.tags : [],
    text,
    _rank: rank,
  });
}

// Top-N per (niche, type).
const buckets = new Map();
for (const e of scored) {
  const key = `${e.niche}::${e.excerptType}`;
  (buckets.get(key) ?? buckets.set(key, []).get(key)).push(e);
}
const kept = [];
for (const list of buckets.values()) {
  list.sort((a, b) => b._rank - a._rank);
  for (const e of list.slice(0, PER)) {
    kept.push({ excerptType: e.excerptType, niche: e.niche, tags: e.tags, text: e.text });
  }
}

mkdirSync(OUT_DIR, { recursive: true });
const asset = {
  version: 1,
  generated_at: new Date().toISOString(),
  note: 'Curated human-like excerpts from Drama15 completed stories. Structure references only; do not commit without owner approval (may contain user story content).',
  count: kept.length,
  excerpts: kept,
};
writeFileSync(OUT, JSON.stringify(asset, null, 2), 'utf8');

const byType = {};
for (const e of kept) byType[e.excerptType] = (byType[e.excerptType] ?? 0) + 1;
console.log(`raw excerpts      : ${rows.length}`);
console.log(`passed human gate : ${scored.length}`);
console.log(`kept (top ${PER}/bucket): ${kept.length}`);
console.log(`by type           : ${JSON.stringify(byType)}`);
console.log(`buckets           : ${buckets.size}`);
console.log(`output            : ${OUT.replace(REPO_ROOT, './')}`);
