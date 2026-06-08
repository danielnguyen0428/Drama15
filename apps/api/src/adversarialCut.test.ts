import assert from 'node:assert/strict';
import test from 'node:test';

import { tightenChapterText } from '../../../src/modules/postprocessors/adversarial-cut.js';

function routerReturning(text: unknown) {
  return { generateJson: async <T>() => ({ data: { text } as T, modelUsed: 'rewriter' }) };
}

// 400-word original so it clears the min-words floor.
const original = Array.from({ length: 400 }, (_, i) => `từ${i}`).join(' ');

const base = {
  outputLanguage: 'vietnamese' as const,
  model: 'rewriter',
};

test('accepts a moderately shorter rewrite', async () => {
  const shorter = Array.from({ length: 360 }, (_, i) => `từ${i}`).join(' ');
  const result = await tightenChapterText({ ...base, text: original, routerClient: routerReturning(shorter) });
  assert.equal(result, shorter);
});

test('rejects a rewrite that is not shorter', async () => {
  const longer = Array.from({ length: 420 }, (_, i) => `từ${i}`).join(' ');
  const result = await tightenChapterText({ ...base, text: original, routerClient: routerReturning(longer) });
  assert.equal(result, original);
});

test('rejects an over-aggressive cut (content loss)', async () => {
  const tooShort = Array.from({ length: 200 }, (_, i) => `từ${i}`).join(' '); // 50% cut
  const result = await tightenChapterText({ ...base, text: original, routerClient: routerReturning(tooShort) });
  assert.equal(result, original);
});

test('skips chapters below the min-words floor', async () => {
  const tiny = 'một hai ba bốn năm';
  let called = false;
  const result = await tightenChapterText({
    ...base,
    text: tiny,
    routerClient: { generateJson: async <T>() => { called = true; return { data: { text: 'x' } as T, modelUsed: 'm' }; } },
  });
  assert.equal(result, tiny);
  assert.equal(called, false);
});

test('is fail-open on router error', async () => {
  const result = await tightenChapterText({
    ...base,
    text: original,
    routerClient: { generateJson: async <T>(): Promise<{ data: T; modelUsed: string }> => { throw new Error('down'); } },
  });
  assert.equal(result, original);
});
