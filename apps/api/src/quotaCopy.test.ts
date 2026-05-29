import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const API_SOURCE = readFileSync(new URL('./startDev.ts', import.meta.url), 'utf8');
const WEB_SOURCE = readFileSync(new URL('../../web/src/story/StoryWorkspace.tsx', import.meta.url), 'utf8');

test('quota copy describes daily draft creation and setup suggestions in novel language', () => {
  const quotaCopy = `${API_SOURCE}\n${WEB_SOURCE}`;

  assert.match(quotaCopy, /bản thảo truyện có thể viết/i);
  assert.match(quotaCopy, /lượt gợi ý mầm truyện hôm nay/i);
  assert.doesNotMatch(quotaCopy, /bộ drama/i);
  assert.doesNotMatch(quotaCopy, /lượt viết truyện/i);
});
