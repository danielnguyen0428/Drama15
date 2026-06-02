import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Restore a story's status to `running` (used to undo a failed resume attempt
// when no chapter data was actually lost). Pass --id <storyId>.
const args = process.argv.slice(2);
const idIndex = args.indexOf('--id');
const id = idIndex >= 0 ? args[idIndex + 1] : undefined;
if (!id) {
  console.error('usage: node restore-running.mjs --id <storyId>');
  process.exit(1);
}

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
  .update({ status: 'running', error: null, updated_at: new Date().toISOString() })
  .eq('id', id)
  .select('id,title,status')
  .maybeSingle();

if (error) {
  console.error('error:', error.message);
  process.exit(1);
}
console.log(data ? `restored ${data.id.slice(0, 8)} "${data.title}" -> ${data.status}` : 'story not found');
