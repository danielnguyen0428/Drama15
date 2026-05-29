import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(currentDir, 'StoryWorkspace.css'), 'utf8');

test('relationship graph canvas remains visible on responsive layouts', () => {
  assert.doesNotMatch(css, /@media\s*\(max-width:\s*980px\)[\s\S]*?\.relationship-canvas\s*\{\s*display:\s*none;\s*\}/);
});

test('story workspace avoids ultra-heavy font weights', () => {
  assert.doesNotMatch(css, /font-weight:\s*(?:8\d\d|9\d\d)\b/);
  assert.doesNotMatch(css, /wght@[^";]*(?:800|900)/);
});
