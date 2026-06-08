import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateFoundation } from '../../../src/modules/postprocessors/foundation-gate.js';

function fakeRouter(data: unknown, modelUsed = 'planner') {
  return { generateJson: async <T>() => ({ data: data as T, modelUsed }) };
}

const base = {
  concept: { title: 'T', titleCandidates: ['T'], logline: 'l', promise: 'p', conflictEngine: 'c' },
  storyBible: {
    premise: 'pre', heroine: { name: 'A', wound: 'w', strengths: ['s'], blindSpots: ['b'] },
    betrayer: { name: 'B', wound: 'w', cowardiceVector: 'cv' },
    rival: { name: 'C', socialPower: 'sp', demeanor: 'd' },
    classHierarchy: ['x'], betrayalEngine: 'be', classShameEngine: 'cse', revengeEngine: 're', endingMode: 'em',
  },
  chapterPlan: [{ chapterNumber: 1, title: 'c1', hook: 'h', mainBeat: 'm', humiliationProgression: 'h', revengeProgression: 'r', endingBeat: 'e' }],
  outputLanguage: 'vietnamese' as const,
  linePreset: 'billionaire_rich_poor_romance',
  model: 'planner',
};

test('normalizes a foundation report and clamps scores', async () => {
  const report = await evaluateFoundation({
    ...base,
    routerClient: fakeRouter({
      overallScore: 8.2,
      dimensions: [{ name: 'hook', score: 12, note: 'mạnh' }, { name: 'originality', score: 6 }],
      issues: ['phản diện hơi mỏng', ''],
      suggestions: ['thêm động cơ cho phản diện'],
    }),
  });
  assert.ok(report);
  assert.equal(report.overallScore, 8.2);
  assert.equal(report.dimensions[0].score, 10); // clamped from 12
  assert.equal(report.issues.length, 1); // empty dropped
  assert.equal(report.suggestions.length, 1);
});

test('derives overallScore from dimensions when missing', async () => {
  const report = await evaluateFoundation({
    ...base,
    routerClient: fakeRouter({ dimensions: [{ name: 'a', score: 6 }, { name: 'b', score: 8 }] }),
  });
  assert.ok(report);
  assert.equal(report.overallScore, 7);
});

test('fail-open returns null on router error', async () => {
  const report = await evaluateFoundation({
    ...base,
    routerClient: { generateJson: async <T>(): Promise<{ data: T; modelUsed: string }> => { throw new Error('x'); } },
  });
  assert.equal(report, null);
});
