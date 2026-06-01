import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// One-time beta upgrade: promote every free account to the Pro tier.
// Reads credentials from the repo-root .env without printing secret values.
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

// Show the breakdown before the change.
const { data: before, error: beforeError } = await supabase
  .from('user_profiles')
  .select('tier');
if (beforeError) {
  console.error('read error:', beforeError.message);
  process.exit(1);
}
const beforeBreakdown = {};
for (const row of before) {
  const tier = row.tier ?? 'free';
  beforeBreakdown[tier] = (beforeBreakdown[tier] ?? 0) + 1;
}
console.log('before:', JSON.stringify(beforeBreakdown));

// Promote every free account to pro. Premium accounts are left untouched so we
// never downgrade a higher tier.
const { data: updated, error: updateError } = await supabase
  .from('user_profiles')
  .update({ tier: 'pro', updated_at: new Date().toISOString() })
  .eq('tier', 'free')
  .select('id');
if (updateError) {
  console.error('update error:', updateError.message);
  process.exit(1);
}
console.log(`upgraded free -> pro: ${updated?.length ?? 0}`);

// Confirm the breakdown after the change.
const { data: after, error: afterError } = await supabase
  .from('user_profiles')
  .select('tier');
if (afterError) {
  console.error('read error:', afterError.message);
  process.exit(1);
}
const afterBreakdown = {};
for (const row of after) {
  const tier = row.tier ?? 'free';
  afterBreakdown[tier] = (afterBreakdown[tier] ?? 0) + 1;
}
console.log('after:', JSON.stringify(afterBreakdown));
