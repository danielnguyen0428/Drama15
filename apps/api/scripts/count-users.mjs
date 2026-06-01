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

const { count: profileCount, error: profileError } = await supabase
  .from('user_profiles')
  .select('id', { count: 'exact', head: true });

if (profileError) {
  console.error('user_profiles error:', profileError.message);
  process.exit(1);
}

console.log(`user_profiles: ${profileCount}`);

// Tier breakdown.
const { data: tierRows, error: tierError } = await supabase
  .from('user_profiles')
  .select('tier');
if (!tierError && tierRows) {
  const byTier = {};
  for (const row of tierRows) {
    const tier = row.tier ?? 'free';
    byTier[tier] = (byTier[tier] ?? 0) + 1;
  }
  console.log('by tier:', JSON.stringify(byTier));
}

// Cross-check against the auth source of truth.
const { data: authData, error: authError } = await supabase.auth.admin.listUsers({ perPage: 1 });
if (!authError && authData) {
  const total = authData.total ?? authData.users?.length;
  if (total !== undefined) console.log(`auth.users (total): ${total}`);
}
