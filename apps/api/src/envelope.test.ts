import assert from 'node:assert/strict';
import test from 'node:test';

import { unwrapEnvelope, unwrapArrayEnvelope } from '../../../src/lib/envelope.js';

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
