#!/usr/bin/env node
/**
 * Build the deployable corpus asset by merging two sources:
 *   1. AI excerpts (corpus/excerpts.jsonl) — verbatim, but ONLY those that already
 *      score human-like (no cliché, healthy variance). We own this text.
 *   2. Human structural profiles (corpus/human-profiles.jsonl) — abstract structure
 *      descriptions, NO verbatim text (copyright-safe). Kept as-is.
 *
 * Output: presets/corpus/vi-drama-corpus.json  (gitignored until owner approves).
 *
 * Usage:
 *   npx tsx scripts/build-corpus-asset.mjs --per 8 --max-chars 900
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PER = Number(getArg('--per', '8'));
const MAX_CHARS = Number(getArg('--max-chars', '900'));

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const AI_RAW = path.join(REPO_ROOT, 'corpus', 'excerpts.jsonl');
const HUMAN_RAW = path.join(REPO_ROOT, 'corpus', 'human-profiles.jsonl');
const OUT_DIR = path.join(REPO_ROOT, 'presets', 'corpus');
const OUT = path.join(OUT_DIR, 'vi-drama-corpus.json');

if (!existsSync(AI_RAW)) {
  console.error(`Missing ${AI_RAW}. Run build-corpus.mjs first.`);
  process.exit(1);
}

const { analyzeVietnameseAiVoice } = await import('../../../src/modules/core-pipeline/validators/vietnamese-ai-voice.js');
const { analyzeSentenceVariance } = await import('../../../src/modules/core-pipeline/validators/sentence-variance.js');

const readJsonl = (p) => (existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

// ─── AI excerpts: human-likeness gate + top-N per (niche, type) ────────────────
const CV_MIN = { opening: 0.55, character_intro: 0.55, chapter_ending: 0.6 };
const aiRows = readJsonl(AI_RAW);
const scored = [];
for (const e of aiRows) {
  const text = (e.text ?? '').trim();
  if (text.length < 40 || text.length > MAX_CHARS) continue;
  const vn = analyzeVietnameseAiVoice(text);
  const sv = analyzeSentenceVariance(text);
  if (vn.clicheHits > 0 || vn.adverbialMotCach > 0 || vn.maxSameSubjectStreak >= 4) continue;
  const cvMin = CV_MIN[e.excerpt_type];
  if (cvMin !== undefined && sv.cv < cvMin) continue;
  scored.push({ excerptType: e.excerpt_type, niche: e.niche, tags: e.tags ?? [], text, source: 'ai', _rank: sv.cv - vn.score });
}

const buckets = new Map();
for (const e of scored) {
  const key = `${e.niche}::${e.excerptType}`;
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(e);
}
const kept = [];
for (const list of buckets.values()) {
  list.sort((a, b) => b._rank - a._rank);
  for (const e of list.slice(0, PER)) kept.push({ excerptType: e.excerptType, niche: e.niche, tags: e.tags, text: e.text, source: 'ai' });
}

// ─── Human structural profiles: keep all (descriptions, not prose) ─────────────
const humanRows = readJsonl(HUMAN_RAW);
for (const p of humanRows) {
  if (!p.text) continue;
  kept.push({ excerptType: p.excerpt_type, niche: p.niche ?? 'human_general', tags: p.tags ?? ['human'], text: p.text, source: 'human' });
}

mkdirSync(OUT_DIR, { recursive: true });
const asset = {
  version: 1,
  generated_at: new Date().toISOString(),
  note: 'AI excerpts = own human-like output (verbatim). Human items = structural profiles only, NO verbatim third-party text. Gitignored pending owner approval.',
  count: kept.length,
  excerpts: kept,
};
writeFileSync(OUT, JSON.stringify(asset, null, 2), 'utf8');

const byType = {};
const bySource = {};
for (const e of kept) {
  byType[e.excerptType] = (byType[e.excerptType] ?? 0) + 1;
  bySource[e.source] = (bySource[e.source] ?? 0) + 1;
}
console.log(`AI raw            : ${aiRows.length} | passed gate: ${scored.length} | kept (top ${PER}/bucket): ${kept.filter((e) => e.source === 'ai').length}`);
console.log(`human profiles    : ${humanRows.length}`);
console.log(`total kept        : ${kept.length}`);
console.log(`by type           : ${JSON.stringify(byType)}`);
console.log(`by source         : ${JSON.stringify(bySource)}`);
console.log(`output            : ./presets/corpus/vi-drama-corpus.json`);
