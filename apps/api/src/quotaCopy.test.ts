import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const API_SOURCE = readFileSync(new URL('./startDev.ts', import.meta.url), 'utf8');
const WEB_SOURCE = readFileSync(new URL('../../web/src/story/StoryWorkspace.tsx', import.meta.url), 'utf8');

test('quota copy describes daily complete drama creation, not generic writing turns', () => {
  const quotaCopy = `${API_SOURCE}\n${WEB_SOURCE}`;

  assert.match(quotaCopy, /bộ drama có thể sáng tác/i);
  assert.match(quotaCopy, /bộ drama hôm nay/i);
  assert.doesNotMatch(quotaCopy, /lượt viết truyện/i);
});
