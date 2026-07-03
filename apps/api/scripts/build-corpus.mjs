#!/usr/bin/env node
/**
 * Build the raw AI corpus (excerpts) from completed Drama15 stories in Supabase.
 *
 * Source = our own generated output (status=completed), which we own. Character
 * names are anonymized so the corpus cannot leak identities or bleed names across
 * new stories. Mines STRUCTURE only (hook / intro / dialogue / ending).
 *
 * Usage:
 *   node apps/api/scripts/build-corpus.mjs
 *   node apps/api/scripts/build-corpus.mjs --limit 30 --min-chapters 10
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

import { splitParagraphs, scoreDialogue, thematicTags, anonymizeText } from './corpus-lib.mjs';

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const LIMIT = Number(getArg('--limit', '0')) || 0;
const MIN_CHAPTERS = Number(getArg('--min-chapters', '15'));

const OUT_DIR = fileURLToPath(new URL('../../../corpus/', import.meta.url));

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

function nicheOf(payload) {
  const req = payload?.request ?? {};
  return (req?.customCreativeInputs?.dramaBranch?.trim()) || req?.linePreset || 'unknown';
}
function styleOf(payload) {
  const req = payload?.request ?? {};
  return req?.stylePreset || 'unknown';
}
function bibleNames(payload) {
  const b = payload?.storyBible ?? {};
  return [b?.heroine?.name, b?.betrayer?.name, b?.rival?.name].filter(Boolean);
}

function pickOpening(paras) {
  if (paras.length === 0) return null;
  const end = Math.min(paras.length, 3);
  return { start: 0, end: end - 1, text: paras.slice(0, end).join('\n') };
}
function pickCharacterIntro(paras, names) {
  const scan = Math.min(paras.length, 12);
  for (let i = 0; i < scan; i += 1) {
    if (names.some((n) => paras[i].includes(n))) {
      return { start: i, end: i, text: paras[i] };
    }
  }
  return null;
}
function pickDialogue(paras) {
  let best = null;
  let bestScore = 0;
  for (let i = 0; i < paras.length; i += 1) {
    const s = scoreDialogue(paras[i]);
    if (s > bestScore) { bestScore = s; best = i; }
  }
  if (best === null || bestScore < 5) return null;
  return { start: best, end: Math.min(paras.length - 1, best + 1), text: paras.slice(best, Math.min(paras.length, best + 2)).join('\n'), score: bestScore };
}
function pickEnding(paras) {
  if (paras.length === 0) return null;
  const start = Math.max(0, paras.length - 3);
  return { start, end: paras.length - 1, text: paras.slice(start).join('\n') };
}

console.log(`Fetching completed stories (min ${MIN_CHAPTERS} chapters)...`);
const { data: stories, error } = await supabase
  .from('stories').select('id,title,status,story_payload,updated_at')
  .eq('status', 'completed').order('updated_at', { ascending: false });
if (error) { console.error('stories error:', error.message); process.exit(1); }

const profiles = [];
const excerpts = [];
let storiesUsed = 0;

for (const row of stories) {
  if (LIMIT && storiesUsed >= LIMIT) break;
  const payload = row.story_payload;
  const chapters = payload?.chapters;
  if (!Array.isArray(chapters) || chapters.length < MIN_CHAPTERS) continue;
  if ((payload?.request?.outputLanguage ?? 'vietnamese') !== 'vietnamese') continue;

  const storyId = row.id.slice(0, 8);
  const niche = nicheOf(payload);
  const style = styleOf(payload);
  const names = bibleNames(payload);
  const sorted = [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));
  storiesUsed += 1;

  profiles.push({ story_id: storyId, title: (row.title || '').trim(), niche, style, chapters: chapters.length });

  const pushExcerpt = (type, chapterNumber, span) => {
    if (!span || !span.text || span.text.length < 30) return;
    const text = anonymizeText(span.text, names);
    excerpts.push({
      excerpt_id: `${storyId}-c${chapterNumber}-${type}-${excerpts.length}`,
      story_id: storyId, niche, style, source: 'ai',
      chapter_number: chapterNumber, excerpt_type: type,
      tags: [...new Set([niche, style, type, ...thematicTags(text)])],
      text,
    });
  };

  // Openings + intros from the first 3 chapters (more coverage for these thin types).
  for (const ch of sorted.slice(0, 3)) {
    const paras = splitParagraphs(ch.text);
    pushExcerpt('opening', ch.chapterNumber ?? 0, pickOpening(paras));
    pushExcerpt('character_intro', ch.chapterNumber ?? 0, pickCharacterIntro(paras, names));
  }

  // Top-2 high-tension dialogue across the story.
  const cands = [];
  for (const ch of sorted) {
    const span = pickDialogue(splitParagraphs(ch.text));
    if (span) cands.push({ chapterNumber: ch.chapterNumber ?? 0, span });
  }
  cands.sort((a, b) => (b.span.score ?? 0) - (a.span.score ?? 0));
  for (const c of cands.slice(0, 2)) pushExcerpt('high_tension_dialogue', c.chapterNumber, c.span);

  // Chapter endings from every chapter.
  for (const ch of sorted) pushExcerpt('chapter_ending', ch.chapterNumber ?? 0, pickEnding(splitParagraphs(ch.text)));
}

mkdirSync(OUT_DIR, { recursive: true });
const writeJsonl = (name, rows) => writeFileSync(OUT_DIR + name, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
writeJsonl('story_profiles.jsonl', profiles);
writeJsonl('excerpts.jsonl', excerpts);

const byType = {};
for (const e of excerpts) byType[e.excerpt_type] = (byType[e.excerpt_type] ?? 0) + 1;
console.log(`stories used : ${storiesUsed}`);
console.log(`excerpts     : ${excerpts.length}`);
console.log(`by type      : ${JSON.stringify(byType)}`);
console.log(`names anonymized per story from story bible + frequency pass.`);
console.log(`output       : ./corpus/excerpts.jsonl`);
