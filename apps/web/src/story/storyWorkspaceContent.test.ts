import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(currentDir, 'StoryWorkspace.tsx'), 'utf8');

test('workspace footer links to NovelKit properties and credits the maker', () => {
  assert.match(source, /href="https:\/\/novelkit\.cc"/);
  assert.match(source, /href="https:\/\/meowsolo\.com"/);
  assert.match(source, /href="https:\/\/beta\.novelkit\.cc"/);
  assert.match(source, /footer\.tagline/);
});

test('setup suggestion CTA uses script wording without daily quota copy or gates', () => {
  assert.match(source, /setup\.suggest_btn/);
  assert.doesNotMatch(source, /setupSuggestionQuota|outOfSetupSuggestionQuota/);
  assert.doesNotMatch(source, /outOfQuota|account-quota|account\.quota_|setup_quota_/);
  assert.doesNotMatch(source, /Gợi ý mầm truyện/);
  assert.doesNotMatch(source, /lượt gợi ý mầm truyện/);
});

test('stream disconnect refreshes saved stories so resume controls can appear', () => {
  const onErrorStart = source.indexOf('source.onerror = () => {');
  const onErrorEnd = source.indexOf('};', onErrorStart);

  assert.ok(onErrorStart >= 0, 'stream disconnect handler must exist');
  assert.ok(onErrorEnd > onErrorStart, 'stream disconnect handler must close');

  const onErrorBlock = source.slice(onErrorStart, onErrorEnd);
  assert.match(onErrorBlock, /void loadSavedStories\(\);/);
});

test('failed current draft exposes a direct continue-story button', () => {
  assert.match(source, /canResumeCurrentStory/);
  assert.match(source, /story\.resume_btn/);
  assert.match(source, /resumeStory\(storyId\)/);
});

test('account block exposes resume when a saved story can continue', () => {
  const accountStart = source.indexOf('<section className="account-bar">');
  const workspaceStart = source.indexOf('<section className="workspace-grid">');

  assert.ok(accountStart >= 0, 'account block must exist');
  assert.ok(workspaceStart > accountStart, 'workspace grid must appear after account block');

  const accountBlock = source.slice(accountStart, workspaceStart);
  assert.match(source, /resumableStory/);
  assert.match(accountBlock, /account\.resume_btn/);
  assert.match(accountBlock, /resumeStory\(resumableStory\.id\)/);
});
