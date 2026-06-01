import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Load .env from repo root without printing any secret values.
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Total stories.
const { count: total, error: totalError } = await supabase
  .from('stories')
  .select('id', { count: 'exact', head: true });
if (totalError) {
  console.error('stories error:', totalError.message);
  process.exit(1);
}
console.log(`stories (total): ${total}`);

// Breakdown by status + distinct authors.
const { data: rows, error: rowsError } = await supabase
  .from('stories')
  .select('status,user_id');
if (!rowsError && rows) {
  const byStatus = {};
  const authors = new Set();
  for (const row of rows) {
    const status = row.status ?? 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    if (row.user_id) authors.add(row.user_id);
  }
  console.log('by status:', JSON.stringify(byStatus));
  console.log(`distinct authors: ${authors.size}`);
}
