import assert from 'node:assert/strict';
import test from 'node:test';

import {
  unwrapEnvelope,
  unwrapArrayEnvelope,
  normalizeModelKeys,
  coerceAlias,
} from '../../../src/lib/envelope.js';

const goodSeed = {
  titleHint: 'x',
  linePreset: 'y',
  settingSeed: 'z',
  storyControls: {},
  draftControls: {},
};

test('unwrapEnvelope returns a bare payload unchanged', () => {
  assert.deepEqual(unwrapEnvelope(goodSeed, 'seedPackage'), goodSeed);
});

test('unwrapEnvelope descends into the requested key', () => {
  assert.deepEqual(unwrapEnvelope({ seedPackage: goodSeed }, 'seedPackage'), goodSeed);
});

test('unwrapEnvelope peels a double-wrapped payload (regression: all fields undefined)', () => {
  assert.deepEqual(
    unwrapEnvelope({ seedPackage: { seedPackage: goodSeed } }, 'seedPackage'),
    goodSeed,
  );
});

test('unwrapEnvelope unwraps a renamed single-key wrapper', () => {
  for (const wrapperKey of ['package', 'result', 'story', 'data']) {
    assert.deepEqual(
      unwrapEnvelope({ [wrapperKey]: goodSeed }, 'seedPackage'),
      goodSeed,
      `wrapper key ${wrapperKey}`,
    );
  }
});

test('unwrapEnvelope leaves a multi-key payload without the target key untouched', () => {
  assert.deepEqual(unwrapEnvelope(goodSeed, 'seedPackage'), goodSeed);
});

test('unwrapEnvelope does not loop forever on self-referential single-key nesting', () => {
  // A pathological deeply nested wrapper still terminates and returns an object.
  const deep = { a: { a: { a: { a: { a: { a: goodSeed } } } } } };
  const result = unwrapEnvelope(deep, 'seedPackage');
  assert.equal(typeof result, 'object');
});

test('unwrapArrayEnvelope normalizes a bare array', () => {
  assert.deepEqual(unwrapArrayEnvelope([1, 2], 'chapterPlan'), { chapterPlan: [1, 2] });
});

test('unwrapArrayEnvelope keeps the exact key shape', () => {
  assert.deepEqual(unwrapArrayEnvelope({ chapterPlan: [1] }, 'chapterPlan'), { chapterPlan: [1] });
});

test('unwrapArrayEnvelope unwraps a renamed single-key array wrapper', () => {
  assert.deepEqual(unwrapArrayEnvelope({ chapters: [1, 2] }, 'chapterPlan'), { chapterPlan: [1, 2] });
});

test('normalizeModelKeys rewrites snake_case keys to camelCase (regression: settingSeed undefined)', () => {
  const snake = {
    title_hint: 'x',
    line_preset: 'y',
    setting_seed: 'z',
    story_controls: { betrayal_type: 'a' },
    draft_controls: {},
  };
  assert.deepEqual(normalizeModelKeys(snake), {
    titleHint: 'x',
    linePreset: 'y',
    settingSeed: 'z',
    storyControls: { betrayalType: 'a' },
    draftControls: {},
  });
});

test('normalizeModelKeys handles kebab-case and nested arrays', () => {
  assert.deepEqual(
    normalizeModelKeys({ 'story-controls': [{ ending_mode: 'm' }] }),
    { storyControls: [{ endingMode: 'm' }] },
  );
});

test('normalizeModelKeys does not clobber an existing camelCase value', () => {
  const result = normalizeModelKeys({ settingSeed: 'good', setting_seed: '' }) as Record<string, unknown>;
  assert.equal(result.settingSeed, 'good');
});

test('coerceAlias fills a missing canonical field from a synonym', () => {
  assert.deepEqual(
    coerceAlias({ titleHint: 'x', seed: 'long world text' }, 'settingSeed', ['seed', 'setup', 'world']),
    { titleHint: 'x', seed: 'long world text', settingSeed: 'long world text' },
  );
});

test('coerceAlias leaves an existing canonical value untouched', () => {
  assert.deepEqual(
    coerceAlias({ settingSeed: 'original', seed: 'other' }, 'settingSeed', ['seed']),
    { settingSeed: 'original', seed: 'other' },
  );
});
