import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATIONS_URL = new URL('../../../supabase/migrations/', import.meta.url);

function readLatestQuotaMigration() {
  const files = readdirSync(MIGRATIONS_URL)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  const file = files.at(-1);
  assert.ok(file, 'Supabase migrations directory must contain SQL migrations');
  return readFileSync(new URL(file, MIGRATIONS_URL), 'utf8');
}

test('consume_story_quota migration qualifies created_count during increment', () => {
  const sql = readLatestQuotaMigration();

  assert.match(sql, /create or replace function public\.consume_story_quota/i);
  assert.match(sql, /set\s+created_count\s*=\s*sud\.created_count\s*\+\s*1/i);
  assert.match(sql, /returning\s+sud\.created_count\s+into\s+v_count/i);
});
