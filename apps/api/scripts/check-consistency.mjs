import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: stories } = await supabase
  .from('stories')
  .select('id,title,status,story_payload')
  .eq('status', 'completed')
  .order('updated_at', { ascending: false });

function bibleNames(p) {
  const b = p?.storyBible;
  if (!b) return [];
  const names = [];
  for (const key of ['heroine', 'betrayer', 'rival']) {
    const n = b[key]?.name;
    if (n) names.push(n.trim());
  }
  return names;
}

function countOccurrences(text, name) {
  if (!name) return 0;
  return text.split(name).length - 1;
}

for (const s of stories) {
  const p = s.story_payload;
  if (!Array.isArray(p?.chapters) || p.chapters.length < 15) continue;

  const chapterText = p.chapters.map((c) => c.text ?? '').join('\n');
  const names = bibleNames(p);
  const conceptText = [p.concept?.logline, p.concept?.promise, p.concept?.conflictEngine].filter(Boolean).join(' ');

  // For each bible character name, how often it appears in chapters.
  const presence = names.map((n) => `${n}=${countOccurrences(chapterText, n)}`);

  // Does each bible name appear in the concept text at all?
  const inConcept = names.map((n) => `${n}:${conceptText.includes(n) ? 'Y' : 'N'}`);

  const title = (s.title || '').slice(0, 40);
  console.log(`\n[${s.id.slice(0, 8)}] "${title}"`);
  console.log(`  bible names: ${names.join(', ')}`);
  console.log(`  in chapters: ${presence.join('  ')}`);
  console.log(`  bible name appears in concept? ${inConcept.join('  ')}`);
}
