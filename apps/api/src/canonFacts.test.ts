import assert from 'node:assert/strict';
import test from 'node:test';

import { generateCanonFacts } from '../../../src/modules/postprocessors/canon-facts.js';

function fakeRouter(data: unknown) {
  return { generateJson: async <T>() => ({ data: data as T, modelUsed: 'planner' }) };
}

const base = {
  concept: { title: 'T', titleCandidates: ['T'], logline: 'l', promise: 'p', conflictEngine: 'c' },
  storyBible: {
    premise: 'pre', heroine: { name: 'A', wound: 'w', strengths: ['s'], blindSpots: ['b'] },
    betrayer: { name: 'B', wound: 'w', cowardiceVector: 'cv' },
    rival: { name: 'C', socialPower: 'sp', demeanor: 'd' },
    classHierarchy: ['x'], supportingPressureCast: [], betrayalEngine: 'be', classShameEngine: 'cse', revengeEngine: 're', endingMode: 'em',
  },
  chapterPlan: [{ chapterNumber: 1, title: 'c1', hook: 'h', mainBeat: 'm', humiliationProgression: 'h', revengeProgression: 'r', endingBeat: 'e' }],
  outputLanguage: 'vietnamese' as const,
  model: 'planner',
};

test('extracts facts from { facts: [...] } and dedups + caps', async () => {
  const facts = await generateCanonFacts({
    ...base,
    maxFacts: 3,
    routerClient: fakeRouter({ facts: ['A phản bội B', 'A phản bội B', 'C là kẻ giật dây', '  ', 'Kết là dignity-first', 'thừa'] }),
  });
  assert.deepEqual(facts, ['A phản bội B', 'C là kẻ giật dây', 'Kết là dignity-first']);
});

test('accepts a bare array too', async () => {
  const facts = await generateCanonFacts({ ...base, routerClient: fakeRouter(['x', 'y']) });
  assert.deepEqual(facts, ['x', 'y']);
});

test('fail-open returns [] on error', async () => {
  const facts = await generateCanonFacts({
    ...base,
    routerClient: { generateJson: async <T>(): Promise<{ data: T; modelUsed: string }> => { throw new Error('x'); } },
  });
  assert.deepEqual(facts, []);
});
