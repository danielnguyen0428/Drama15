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
