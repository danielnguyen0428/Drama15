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
  .select('id,user_id,title,status,error,created_at,updated_at,story_payload')
  .eq('status', 'running')
  .order('updated_at', { ascending: false });

if (error) {
  console.error('error:', error.message);
  process.exit(1);
}

function remainingChapters(payload) {
  const plan = Array.isArray(payload?.chapterPlan) ? payload.chapterPlan : [];
  const drafted = new Set((Array.isArray(payload?.chapters) ? payload.chapters : []).map((c) => c.chapterNumber));
  return plan.filter((c) => !drafted.has(c.chapterNumber));
}

console.log(`running stories: ${data.length}\n`);
const now = Date.now();
for (const s of data) {
  const payload = s.story_payload;
  const chapters = Array.isArray(payload?.chapters) ? payload.chapters.length : 0;
  const planLen = Array.isArray(payload?.chapterPlan) ? payload.chapterPlan.length : 0;
  const remaining = payload ? remainingChapters(payload).length : 0;
  const resumable = Boolean(payload && planLen > 0 && remaining > 0);
  const ageMin = Math.round((now - new Date(s.updated_at).getTime()) / 60000);
  const lang = payload?.request?.outputLanguage ?? s.config?.outputLanguage ?? '?';
  console.log(`• "${s.title}"`);
  console.log(`  id=${s.id}  user=${s.user_id.slice(0, 8)}  lang=${lang}`);
  console.log(`  chapters=${chapters}/${planLen || '?'}  remaining=${remaining}  resumable=${resumable ? 'YES' : 'no'}`);
  console.log(`  updated=${s.updated_at} (${ageMin}m ago)  hasPayload=${Boolean(payload)}`);
  console.log('');
}

const stats = { resumable: 0, noPayload: 0, noRemaining: 0 };
for (const s of data) {
  const payload = s.story_payload;
  if (!payload) stats.noPayload += 1;
  else if (remainingChapters(payload).length === 0) stats.noRemaining += 1;
  else stats.resumable += 1;
}
console.log('=== summary ===');
console.log(JSON.stringify(stats));
