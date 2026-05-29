import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const API_SOURCE = readFileSync(new URL('./startDev.ts', import.meta.url), 'utf8');

function readSetupSuggestRoute() {
  const start = API_SOURCE.indexOf("app.post('/story/setup-suggest'");
  const end = API_SOURCE.indexOf("app.get('/stories'", start);
  assert.ok(start >= 0, 'setup suggestion route must exist');
  assert.ok(end > start, 'setup suggestion route must appear before stories route');
  return API_SOURCE.slice(start, end);
}

test('setup suggestion route consumes free suggestion quota before generating a seed', () => {
  const route = readSetupSuggestRoute();
  const quotaIndex = route.indexOf('consumeSetupSuggestionQuota(user)');
  const generateIndex = route.indexOf('orchestrator.generateSettingSeed');

  assert.ok(quotaIndex >= 0, 'route must consume setup suggestion quota');
  assert.ok(generateIndex >= 0, 'route must generate a setup suggestion');
  assert.ok(quotaIndex < generateIndex, 'quota must be consumed before generating a setup suggestion');
  assert.match(route, /setup_suggestion_quota_exceeded/);
});
