#!/usr/bin/env node
/**
 * Build a Vietnamese web-novel corpus (profiles + tagged excerpts + index) from
 * completed Drama15 stories in Supabase.
 *
 * Port of the Chinese-WebNovel-Skill corpus builder, adapted to Vietnamese prose
 * (smart-quote dialogue U+201C/U+201D) and the Drama15 StoryPayload shape.
 *
 * Philosophy: "retrieve real material first, then compose, then write." This only
 * mines STRUCTURE (where the hook lands, how dialogue carries pressure, where a
 * chapter stops) — never for verbatim copying.
 *
 * Seed source = our own human-reviewed output (status=completed), so there is no
 * third-party copyright exposure.
 *
 * Usage:
 *   node apps/api/scripts/build-corpus.mjs                 # all completed VN stories
 *   node apps/api/scripts/build-corpus.mjs --limit 30      # cap number of stories
 *   node apps/api/scripts/build-corpus.mjs --min-chapters 10
 *   node apps/api/scripts/build-corpus.mjs --out corpus    # output dir (repo-root relative)
 *
 * Output (default ./corpus/):
 *   story_profiles.jsonl, excerpts.jsonl, index.md, stats.json
 */

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ─── args ────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const LIMIT = Number(getArg('--limit', '0')) || 0; // 0 = no cap
const MIN_CHAPTERS = Number(getArg('--min-chapters', '15'));
const OUT_DIR_NAME = getArg('--out', 'corpus');

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT_DIR = fileURLToPath(new URL(`../../../${OUT_DIR_NAME}/`, import.meta.url));

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

// ─── heuristics (Vietnamese) ───────────────────────────────────────────────────
const CONFLICT_WORDS = /(yêu|chết|cút|cưới|giết|ly hôn|hủy hôn|phản bội|đừng|dám|biến|xin lỗi|ghét|nhục|quỳ|tha|cầu xin|thề|hối hận|đuổi|phá sản)/i;

function splitParagraphs(text) {
  if (!text) return [];
  let paras = String(text).split(/\n{2,}/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (paras.length < 2) {
    paras = String(text).split(/\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }
  return paras;
}

function countSentences(paragraph) {
  return (paragraph.match(/[.!?…。！？]+/g) || []).length || 1;
}

function scoreDialogue(paragraph) {
  let score = 0;
  const smartPairs = Math.min(
    (paragraph.match(/\u201C/g) || []).length,
    (paragraph.match(/\u201D/g) || []).length,
  );
  if (smartPairs > 0) score += 3;
  else if (/"[^"]+"/.test(paragraph)) score += 2;
  if (/[!?！？]/.test(paragraph)) score += 2;
  if (CONFLICT_WORDS.test(paragraph)) score += 2;
  const len = paragraph.length;
  if (len >= 20 && len <= 220) score += 1;
  return score;
}

function pickOpening(paras) {
  if (paras.length === 0) return null;
  const end = Math.min(paras.length, 3);
  return { start: 0, end: end - 1, text: paras.slice(0, end).join('\n') };
}

function pickCharacterIntro(paras, heroineName) {
  if (!heroineName) return null;
  const scan = Math.min(paras.length, 10);
  for (let i = 0; i < scan; i += 1) {
    if (paras[i].includes(heroineName)) {
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
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  if (best === null || bestScore < 5) return null;
  const start = best;
  const end = Math.min(paras.length - 1, best + 1); // include one follow-up beat
  return { start, end, text: paras.slice(start, end + 1).join('\n') };
}

function pickEnding(paras) {
  if (paras.length === 0) return null;
  const start = Math.max(0, paras.length - 3);
  return { start, end: paras.length - 1, text: paras.slice(start).join('\n') };
}

// ─── tagging ───────────────────────────────────────────────────────────────────
function nicheOf(payload) {
  const req = payload?.request ?? {};
  const custom = req?.customCreativeInputs?.dramaBranch?.trim();
  return custom || req?.linePreset || 'unknown';
}

function styleOf(payload) {
  const req = payload?.request ?? {};
  return req?.stylePreset || req?.customCreativeInputs?.stylePreset || 'unknown';
}

function thematicTags(text) {
  const tags = [];
  const add = (re, tag) => { if (re.test(text)) tags.push(tag); };
  add(/ly hôn|hủy hôn|phản bội|ngoại tình|tiểu tam/i, 'quan_he_ran_nut');
  add(/nhục|khinh|coi thường|sỉ nhục|đuổi/i, 'si_nhuc');
  add(/hợp đồng|thừa kế|cổ phần|kiểm toán|di chúc/i, 'giay_to_quyen_luc');
  add(/quỳ|cầu xin|hối hận|van xin/i, 'ha_minh_hoi_han');
  add(/bí mật|thân phận|giấu|hoá ra/i, 'than_phan_bi_mat');
  return tags;
}

// ─── main ──────────────────────────────────────────────────────────────────────
console.log(`Fetching completed stories from Supabase (min ${MIN_CHAPTERS} chapters)...`);
const { data: stories, error } = await supabase
  .from('stories')
  .select('id,title,status,story_payload,updated_at')
  .eq('status', 'completed')
  .order('updated_at', { ascending: false });
if (error) {
  console.error('stories error:', error.message);
  process.exit(1);
}

const profiles = [];
const excerpts = [];
let storiesUsed = 0;

for (const row of stories) {
  if (LIMIT && storiesUsed >= LIMIT) break;
  const payload = row.story_payload;
  const chapters = payload?.chapters;
  if (!Array.isArray(chapters) || chapters.length < MIN_CHAPTERS) continue;

  const outputLanguage = payload?.request?.outputLanguage ?? 'vietnamese';
  if (outputLanguage !== 'vietnamese') continue;

  const storyId = row.id.slice(0, 8);
  const niche = nicheOf(payload);
  const style = styleOf(payload);
  const heroineName = payload?.storyBible?.heroine?.name?.trim() ?? '';
  const summary = (payload?.concept?.logline || payload?.concept?.promise || '').trim();

  profiles.push({
    story_id: storyId,
    title: (row.title || payload?.title || '').trim(),
    niche,
    style,
    heroine: heroineName,
    chapters: chapters.length,
    summary,
  });
  storiesUsed += 1;

  const pushExcerpt = (type, chapterNumber, span) => {
    if (!span || !span.text || span.text.length < 20) return;
    const tags = [niche, style, type, ...thematicTags(span.text)];
    excerpts.push({
      excerpt_id: `${storyId}-c${chapterNumber}-${type}`,
      story_id: storyId,
      title: (row.title || '').trim(),
      niche,
      style,
      chapter_number: chapterNumber,
      excerpt_type: type,
      tags: [...new Set(tags)],
      para_start: span.start,
      para_end: span.end,
      text: span.text,
    });
  };

  // Sort chapters by number to be safe.
  const sorted = [...chapters].sort((a, b) => (a.chapterNumber ?? 0) - (b.chapterNumber ?? 0));

  // Opening + character intro from chapter 1.
  const first = sorted[0];
  if (first?.text) {
    const paras = splitParagraphs(first.text);
    pushExcerpt('opening', first.chapterNumber ?? 1, pickOpening(paras));
    pushExcerpt('character_intro', first.chapterNumber ?? 1, pickCharacterIntro(paras, heroineName));
  }

  // Best high-tension dialogue across the whole story (top 2 chapters by score).
  const dialogueCandidates = [];
  for (const ch of sorted) {
    const paras = splitParagraphs(ch.text);
    const span = pickDialogue(paras);
    if (span) dialogueCandidates.push({ chapterNumber: ch.chapterNumber ?? 0, span, score: scoreDialogue(paras[span.start]) });
  }
  dialogueCandidates.sort((a, b) => b.score - a.score);
  for (const cand of dialogueCandidates.slice(0, 2)) {
    pushExcerpt('high_tension_dialogue', cand.chapterNumber, cand.span);
  }

  // Chapter endings from every chapter (this is the reusable "追更" skill).
  for (const ch of sorted) {
    const paras = splitParagraphs(ch.text);
    pushExcerpt('chapter_ending', ch.chapterNumber ?? 0, pickEnding(paras));
  }
}

// ─── write outputs ───────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true });
const writeJsonl = (name, rows) => {
  writeFileSync(OUT_DIR + name, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
};
writeJsonl('story_profiles.jsonl', profiles);
writeJsonl('excerpts.jsonl', excerpts);

// stats
const byType = {};
const byNiche = {};
for (const e of excerpts) {
  byType[e.excerpt_type] = (byType[e.excerpt_type] ?? 0) + 1;
  byNiche[e.niche] = (byNiche[e.niche] ?? 0) + 1;
}
const stats = {
  generated_at: new Date().toISOString(),
  stories_scanned: stories.length,
  stories_used: storiesUsed,
  excerpt_count: excerpts.length,
  excerpt_type_counts: byType,
  niche_counts: byNiche,
};
writeFileSync(OUT_DIR + 'stats.json', JSON.stringify(stats, null, 2), 'utf8');

// index.md grouped by type -> niche
const EXCERPT_TYPES = ['opening', 'character_intro', 'high_tension_dialogue', 'chapter_ending'];
const lines = ['# Kho ngữ liệu Drama15 (mô phỏng cấu trúc, KHÔNG chép câu)\n'];
lines.push(`Sinh từ ${storiesUsed} truyện completed. Tổng ${excerpts.length} excerpt.\n`);
lines.push('Mục đích: học "đoạn mấy dựng xung đột, thoại nào gánh áp lực, chương dừng ở biến hoá gì" — không chép câu.\n');
for (const type of EXCERPT_TYPES) {
  const group = excerpts.filter((e) => e.excerpt_type === type);
  if (!group.length) continue;
  lines.push(`\n## ${type} (${group.length})\n`);
  const byN = {};
  for (const e of group) (byN[e.niche] ??= []).push(e);
  for (const [n, items] of Object.entries(byN).sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`### ${n} (${items.length})\n`);
    for (const e of items.slice(0, 8)) {
      lines.push(`- \`${e.excerpt_id}\` | tags: ${e.tags.join(', ')}`);
      lines.push(`  > ${e.text.replace(/\n/g, '\n  > ')}`);
    }
    lines.push('');
  }
}
writeFileSync(OUT_DIR + 'index.md', lines.join('\n'), 'utf8');

console.log(`\nDone.`);
console.log(`  stories scanned : ${stats.stories_scanned}`);
console.log(`  stories used    : ${stats.stories_used}`);
console.log(`  excerpts        : ${stats.excerpt_count}`);
console.log(`  by type         : ${JSON.stringify(byType)}`);
console.log(`  output dir      : ${OUT_DIR.replace(REPO_ROOT, './')}`);
