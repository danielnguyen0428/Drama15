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
  assert.match(source, /Made NovelKit\.Cc with ❤️ by Dũng Nguyễn/);
});

test('setup suggestion CTA uses script wording and shows the free daily quota fallback', () => {
  assert.match(source, />Gợi ý kịch bản</);
  assert.match(source, /10 lượt gợi ý kịch bản\/ngày/);
  assert.doesNotMatch(source, /Gợi ý mầm truyện/);
  assert.doesNotMatch(source, /lượt gợi ý mầm truyện/);
});

test('setup suggestion quota appears in the user account block', () => {
  const accountStart = source.indexOf('<section className="account-bar">');
  const workspaceStart = source.indexOf('<section className="workspace-grid">');
  const setupStart = source.indexOf('<aside className="setup-panel">');
  const storyPanelStart = source.indexOf('<section className="story-panel">');

  assert.ok(accountStart >= 0, 'account block must exist');
  assert.ok(workspaceStart > accountStart, 'workspace grid must appear after account block');
  assert.ok(setupStart >= 0, 'setup panel must exist');
  assert.ok(storyPanelStart > setupStart, 'story panel must appear after setup panel');

  const accountBlock = source.slice(accountStart, workspaceStart);
  const setupPanel = source.slice(setupStart, storyPanelStart);

  assert.match(accountBlock, /setupSuggestionQuotaCopy/);
  assert.doesNotMatch(setupPanel, /setupSuggestionQuotaCopy/);
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
  assert.match(source, />Viết tiếp truyện</);
  assert.match(source, /resumeStory\(storyId\)/);
});
