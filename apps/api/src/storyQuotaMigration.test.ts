import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const MIGRATIONS_URL = new URL('../../../supabase/migrations/', import.meta.url);

function readQuotaMigration(pattern: RegExp) {
  const files = readdirSync(MIGRATIONS_URL)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files.slice().reverse()) {
    const sql = readFileSync(new URL(file, MIGRATIONS_URL), 'utf8');
    if (pattern.test(sql)) return sql;
  }
  assert.fail('Supabase migrations directory must contain the requested quota migration');
}

test('consume_story_quota migration qualifies created_count during increment', () => {
  const sql = readQuotaMigration(/consume_story_quota/i);

  assert.match(sql, /create or replace function public\.consume_story_quota/i);
  assert.match(sql, /set\s+created_count\s*=\s*sud\.created_count\s*\+\s*1/i);
  assert.match(sql, /returning\s+sud\.created_count\s+into\s+v_count/i);
});

test('setup suggestion quota migration tracks daily suggestion turns', () => {
  const sql = readQuotaMigration(/consume_setup_suggestion_quota/i);

  assert.match(sql, /create table if not exists public\.setup_suggestion_usage_days/i);
  assert.match(sql, /suggested_count integer not null default 0/i);
  assert.match(sql, /create or replace function public\.consume_setup_suggestion_quota/i);
  assert.match(sql, /set\s+suggested_count\s*=\s*ssud\.suggested_count\s*\+\s*1/i);
  assert.match(sql, /returning\s+ssud\.suggested_count\s+into\s+v_count/i);
});
