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

function readCreateStoryRoute() {
  const start = API_SOURCE.indexOf("app.post('/stories'");
  const end = API_SOURCE.indexOf("app.get('/stories/:id'", start);
  assert.ok(start >= 0, 'create story route must exist');
  assert.ok(end > start, 'create story route must appear before story detail route');
  return API_SOURCE.slice(start, end);
}

test('setup suggestion route does not consume or enforce a daily quota', () => {
  const route = readSetupSuggestRoute();
  const generateIndex = route.indexOf('.generateSettingSeed');

  assert.ok(generateIndex >= 0, 'route must generate a setup suggestion');
  assert.doesNotMatch(route, /consumeSetupSuggestionQuota|setup_suggestion_quota_exceeded/);
});

test('create story route does not consume or enforce a daily quota', () => {
  const route = readCreateStoryRoute();

  assert.match(route, /createQueuedStory/);
  assert.doesNotMatch(route, /consumeStoryQuota|quota_exceeded/);
});
