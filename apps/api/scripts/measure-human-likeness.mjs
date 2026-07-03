#!/usr/bin/env node
/**
 * Baseline "human-likeness" meter for Drama15 chapters.
 *
 * Runs the existing quality analyzers (sentence-variance cv, ai-tell score,
 * structural-slop score) over completed stories in Supabase and reports the
 * distribution against reference thresholds. This gives a hard number to judge
 * prose against BEFORE building corpus retrieval, and to separate "config" from
 * "model ceiling" later.
 *
 * Reference thresholds (from the analyzers themselves):
 *   - sentence-length variance cv: human >= 0.65, AI-like <= 0.50, repair flag < 0.55
 *   - ai-tell score / structural-slop score: lower is better; each has a needsRepair flag
 *
 * Usage:
 *   npx tsx scripts/measure-human-likeness.mjs                 # all completed VN stories
 *   npx tsx scripts/measure-human-likeness.mjs --limit 30      # cap stories
 *   npx tsx scripts/measure-human-likeness.mjs --by-style      # breakdown per style preset
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const hasFlag = (name) => argv.includes(name);
const LIMIT = Number(getArg('--limit', '0')) || 0;
const BY_STYLE = hasFlag('--by-style');

const dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(dirname, '..', '..');
process.env.DRAMA15_APP_ROOT ??= projectRoot;
process.env.DRAMA15_ASSET_ROOT ??= projectRoot;

// ─── env / supabase ──────────────────────────────────────────────────────────
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── analyzers (TS via tsx) ────────────────────────────────────────────────────
const { analyzeChapterQuality } = await import('../../../src/modules/validators/chapter-quality.js');
const { resolveDraftControls } = await import('../../../src/modules/validators/story-validator.js');
const { analyzeVietnameseAiVoice } = await import('../../../src/modules/core-pipeline/validators/vietnamese-ai-voice.js');
const draftControls = resolveDraftControls({ dialogueRatio: 0.5, hookDensity: 'medium' });

// ─── stats helpers ──────────────────────────────────────────────────────────────
const pct = (n, total) => (total ? ((100 * n) / total).toFixed(1) + '%' : '-');
const mean = (arr) => (arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : 0);
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function summarize(label, rows) {
  if (!rows.length) return;
  const cvs = rows.map((r) => r.cv).sort((a, b) => a - b);
  const ai = rows.map((r) => r.aiTell);
  const struct = rows.map((r) => r.structural);
  const total = rows.length;
  const cvAiLike = rows.filter((r) => r.cv <= 0.5).length;
  const cvRepair = rows.filter((r) => r.cv < 0.55).length;
  const cvHuman = rows.filter((r) => r.cv >= 0.65).length;
  const aiRepair = rows.filter((r) => r.aiTellRepair).length;
  const structRepair = rows.filter((r) => r.structRepair).length;
  const anyFail = rows.filter((r) => r.failures > 0).length;

  console.log(`\n=== ${label} (${total} chapters) ===`);
  console.log(`sentence-variance cv : mean ${mean(cvs).toFixed(3)} | median ${quantile(cvs, 0.5).toFixed(3)} | p25 ${quantile(cvs, 0.25).toFixed(3)} | p75 ${quantile(cvs, 0.75).toFixed(3)} | min ${cvs[0].toFixed(3)} | max ${cvs[cvs.length - 1].toFixed(3)}`);
  console.log(`  cv <= 0.50 (AI-like)     : ${cvAiLike}/${total} (${pct(cvAiLike, total)})`);
  console.log(`  cv <  0.55 (repair flag) : ${cvRepair}/${total} (${pct(cvRepair, total)})`);
  console.log(`  cv >= 0.65 (human-like)  : ${cvHuman}/${total} (${pct(cvHuman, total)})`);
  console.log(`ai-tell score        : mean ${mean(ai).toFixed(2)} | needsRepair ${aiRepair}/${total} (${pct(aiRepair, total)})`);
  console.log(`structural-slop score: mean ${mean(struct).toFixed(2)} | needsRepair ${structRepair}/${total} (${pct(structRepair, total)})`);
  console.log(`chapters with >=1 quality failure: ${anyFail}/${total} (${pct(anyFail, total)})`);

  // Vietnamese AI-voice (structural) signals
  const vnRepair = rows.filter((r) => r.vnRepair).length;
  const anyCliche = rows.filter((r) => r.clichePer1000 > 0).length;
  const highShare = rows.filter((r) => r.sameSubjectShare >= 0.45).length;
  const longStreak = rows.filter((r) => r.maxSameSubjectStreak >= 4).length;
  const anyMotCach = rows.filter((r) => r.motCachPer1000 > 0).length;
  console.log(`VN ai-voice          : mean score ${mean(rows.map((r) => r.vnScore)).toFixed(3)} | needsRepair ${vnRepair}/${total} (${pct(vnRepair, total)})`);
  console.log(`  cliché-variant /1000w : mean ${mean(rows.map((r) => r.clichePer1000)).toFixed(2)} | chapters with >=1: ${anyCliche}/${total} (${pct(anyCliche, total)})`);
  console.log(`  "một cách+adj" /1000w : mean ${mean(rows.map((r) => r.motCachPer1000)).toFixed(2)} | chapters with >=1: ${anyMotCach}/${total} (${pct(anyMotCach, total)})`);
  console.log(`  same-subject opener share: mean ${mean(rows.map((r) => r.sameSubjectShare)).toFixed(3)} | >=0.45: ${highShare}/${total} (${pct(highShare, total)})`);
  console.log(`  max same-subject streak >=4: ${longStreak}/${total} (${pct(longStreak, total)})`);
}

// ─── fetch + measure ────────────────────────────────────────────────────────────
console.log('Fetching completed stories from Supabase...');
const { data: stories, error } = await supabase
  .from('stories')
  .select('id,title,status,story_payload,updated_at')
  .eq('status', 'completed')
  .order('updated_at', { ascending: false });
if (error) {
  console.error('stories error:', error.message);
  process.exit(1);
}

const rows = []; // { cv, aiTell, structural, aiTellRepair, structRepair, failures, style }
let storiesUsed = 0;

for (const row of stories) {
  if (LIMIT && storiesUsed >= LIMIT) break;
  const payload = row.story_payload;
  const chapters = payload?.chapters;
  if (!Array.isArray(chapters) || chapters.length < 15) continue;
  if ((payload?.request?.outputLanguage ?? 'vietnamese') !== 'vietnamese') continue;
  const style = payload?.request?.stylePreset || 'unknown';
  storiesUsed += 1;

  for (const ch of chapters) {
    if (!ch?.text || ch.text.length < 200) continue;
    const m = analyzeChapterQuality(ch.text, draftControls, 'vietnamese', ch.chapterNumber);
    const v = analyzeVietnameseAiVoice(ch.text);
    rows.push({
      cv: m.sentenceVariance.cv,
      aiTell: m.aiTellScore,
      structural: m.structuralSlop.score,
      aiTellRepair: m.aiTellReport.needsRepair,
      structRepair: m.structuralSlop.needsRepair,
      failures: m.failures.length,
      vnScore: v.score,
      vnRepair: v.needsRepair,
      clichePer1000: v.clichePer1000,
      motCachPer1000: v.motCachPer1000,
      transitionPer1000: v.transitionPer1000,
      sameSubjectShare: v.sameSubjectOpenerShare,
      maxSameSubjectStreak: v.maxSameSubjectStreak,
      style,
    });
  }
}

console.log(`\nStories measured: ${storiesUsed} | chapters measured: ${rows.length}`);
summarize('ALL Drama15 chapters (current production prose)', rows);

if (BY_STYLE) {
  const styles = [...new Set(rows.map((r) => r.style))];
  for (const s of styles.sort()) {
    summarize(`style=${s}`, rows.filter((r) => r.style === s));
  }
}

console.log('\nReference: cv >= 0.65 reads human; cv <= 0.50 reads AI; repair flag fires < 0.55.');
console.log('Note: this corpus is Drama15 output (AI-generated), so it is a self-baseline,');
console.log('not a real human-author benchmark. A human-written VN corpus is needed for that.');
