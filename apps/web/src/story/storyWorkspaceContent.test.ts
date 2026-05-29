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
