import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Estimate per-story output size from completed stories so we can ground
// token/cost projections. Counts words/chars across chapters + outline text.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('stories')
  .select('id,status,story_payload')
  .eq('status', 'completed');
if (error) {
  console.error('error:', error.message);
  process.exit(1);
}

function charsOf(payload) {
  let chars = 0;
  const chapters = Array.isArray(payload?.chapters) ? payload.chapters : [];
  for (const c of chapters) chars += (c.text ?? '').length;
  // Approximate outline/bible JSON size too (concept, plan, bible).
  const outline = JSON.stringify({
    concept: payload?.concept,
    chapterPlan: payload?.chapterPlan,
    storyBible: payload?.storyBible,
  });
  return { chapterChars: chars, outlineChars: outline.length, chapterCount: chapters.length };
}

const rows = [];
for (const s of data) {
  const m = charsOf(s.story_payload);
  if (m.chapterCount >= 15) rows.push(m);
}

const n = rows.length;
const avgChapterChars = Math.round(rows.reduce((a, r) => a + r.chapterChars, 0) / n);
const avgOutlineChars = Math.round(rows.reduce((a, r) => a + r.outlineChars, 0) / n);

// Token heuristic: Vietnamese/mixed text ~ 1 token per 3-4 chars. Use 3.5.
const CHARS_PER_TOKEN = 3.5;
const avgOutputTokens = Math.round((avgChapterChars + avgOutlineChars) / CHARS_PER_TOKEN);

console.log(`completed full stories analyzed: ${n}`);
console.log(`avg chapter chars/story: ${avgChapterChars}`);
console.log(`avg outline(JSON) chars/story: ${avgOutlineChars}`);
console.log(`~avg OUTPUT tokens/story (final text only): ${avgOutputTokens}`);
console.log('');
console.log('Note: real token spend is higher than final output because each');
console.log('chapter request re-sends system prompt + bible + prior summaries as');
console.log('INPUT, and repair passes re-generate. Rough multiplier 2.5-3.5x on');
console.log('output for total billable tokens.');
console.log('');
for (const mult of [2.5, 3.0, 3.5]) {
  console.log(`  est total billable tokens/story @${mult}x: ${Math.round(avgOutputTokens * mult)}`);
}
