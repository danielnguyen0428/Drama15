import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../../../supabase/migrations/202606220001_user_llm_settings.sql', import.meta.url),
  'utf8',
);

test('migration stores one encrypted LLM profile per user with RLS enabled', () => {
  assert.match(migration, /create table if not exists public\.user_llm_settings/i);
  assert.match(migration, /user_id uuid primary key references auth\.users\(id\) on delete cascade/i);
  assert.match(migration, /api_key_ciphertext text/i);
  assert.doesNotMatch(migration, /\bapi_key\s+text/i);
  assert.match(migration, /alter table public\.user_llm_settings enable row level security/i);
});
