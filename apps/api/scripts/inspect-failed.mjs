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

const { data, error } = await supabase
  .from('stories')
  .select('id,title,status,error,created_at,updated_at,story_payload')
  .eq('status', 'failed')
  .order('updated_at', { ascending: false });

if (error) {
  console.error('error:', error.message);
  process.exit(1);
}

console.log(`failed stories: ${data.length}\n`);
for (const s of data) {
  const chapters = Array.isArray(s.story_payload?.chapters) ? s.story_payload.chapters.length : 0;
  const lang = s.story_payload?.request?.outputLanguage ?? s.config?.outputLanguage ?? '?';
  console.log(`• "${s.title}"`);
  console.log(`  id=${s.id.slice(0, 8)}  lang=${lang}  chapters=${chapters}/15  updated=${s.updated_at}`);
  console.log(`  error: ${s.error ?? '(none recorded)'}`);
  console.log('');
}

// Group errors by a normalized signature to spot patterns.
const buckets = {};
for (const s of data) {
  const raw = (s.error ?? '(none recorded)').slice(0, 60);
  buckets[raw] = (buckets[raw] ?? 0) + 1;
}
console.log('=== error signatures ===');
for (const [sig, count] of Object.entries(buckets).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${count}x  ${sig}`);
}
