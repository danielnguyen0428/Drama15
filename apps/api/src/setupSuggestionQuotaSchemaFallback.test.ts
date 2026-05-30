import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isMissingSetupSuggestionQuotaSchemaError } from './supabaseServer.js';

const SUPABASE_SERVER_SOURCE = readFileSync(new URL('./supabaseServer.ts', import.meta.url), 'utf8');

test('setup suggestion quota fallback recognizes missing Supabase schema objects', () => {
  assert.equal(isMissingSetupSuggestionQuotaSchemaError({ code: 'PGRST205' }), true);
  assert.equal(isMissingSetupSuggestionQuotaSchemaError({ code: '42P01' }), true);
  assert.equal(
    isMissingSetupSuggestionQuotaSchemaError({
      message: "Could not find the table 'public.setup_suggestion_usage_days' in the schema cache",
    }),
    true,
  );
  assert.equal(
    isMissingSetupSuggestionQuotaSchemaError({
      message: 'Could not find the function public.consume_setup_suggestion_quota',
    }),
    true,
  );
});

test('setup suggestion quota fallback ignores unrelated Supabase errors', () => {
  assert.equal(isMissingSetupSuggestionQuotaSchemaError({ code: '42501', message: 'permission denied' }), false);
  assert.equal(isMissingSetupSuggestionQuotaSchemaError(new Error('network timeout')), false);
  assert.equal(isMissingSetupSuggestionQuotaSchemaError(null), false);
});

test('setup suggestion quota queries return no quota when schema is not migrated yet', () => {
  const snapshotStart = SUPABASE_SERVER_SOURCE.indexOf('export async function getSetupSuggestionQuotaSnapshot');
  const consumeStart = SUPABASE_SERVER_SOURCE.indexOf('export async function consumeSetupSuggestionQuota');
  const nextExport = SUPABASE_SERVER_SOURCE.indexOf('export function isAdminRequest', consumeStart);
  assert.ok(snapshotStart >= 0, 'snapshot function must exist');
  assert.ok(consumeStart > snapshotStart, 'consume function must exist after snapshot function');
  assert.ok(nextExport > consumeStart, 'next export must exist after consume function');

  const snapshotFunction = SUPABASE_SERVER_SOURCE.slice(snapshotStart, consumeStart);
  const consumeFunction = SUPABASE_SERVER_SOURCE.slice(consumeStart, nextExport);
  assert.match(snapshotFunction, /if \(isMissingSetupSuggestionQuotaSchemaError\(error\)\) return null;/);
  assert.match(consumeFunction, /if \(isMissingSetupSuggestionQuotaSchemaError\(error\)\) return null;/);
});
