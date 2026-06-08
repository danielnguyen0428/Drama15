import assert from 'node:assert/strict';
import test from 'node:test';

import { runReaderPanel } from '../../../src/modules/postprocessors/reader-panel.js';

function fakeRouter(data: unknown, modelUsed = 'test-model') {
  return {
    generateJson: async <T>() => ({ data: data as T, modelUsed }),
  };
}

function throwingRouter() {
  return {
    generateJson: async <T>(): Promise<{ data: T; modelUsed: string }> => {
      throw new Error('router down');
    },
  };
}

const chapters = [
  { chapterNumber: 1, title: 'Mở màn', summary: 's1', text: 'Nội dung chương một.' },
  { chapterNumber: 2, title: 'Lật kèo', summary: 's2', text: 'Nội dung chương hai.' },
];

const baseInput = {
  title: 'Truyện thử',
  concept: { logline: 'logline', promise: 'promise' },
  chapters,
  outputLanguage: 'vietnamese' as const,
  model: 'rewriter',
};

test('reader panel normalizes a well-formed report', async () => {
  const report = await runReaderPanel({
    ...baseInput,
    routerClient: fakeRouter({
      overallScore: 7.4,
      personas: [
        { persona: 'Người cày drama', score: 8, liked: 'hook tốt', concern: 'giữa hơi chậm' },
        { persona: 'Người khó tính', score: 6, liked: 'lật kèo ổn', concern: 'phản diện mỏng' },
      ],
      topIssues: [
        { issue: 'Phản diện thiếu chiều sâu', severity: 'high', chapters: [2] },
      ],
    }),
  });

  assert.ok(report);
  assert.equal(report.overallScore, 7.4);
  assert.equal(report.personas.length, 2);
  assert.equal(report.topIssues[0].severity, 'high');
  assert.equal(report.model, 'test-model');
});

test('reader panel derives overallScore from personas when missing', async () => {
  const report = await runReaderPanel({
    ...baseInput,
    routerClient: fakeRouter({
      personas: [
        { persona: 'A', score: 8 },
        { persona: 'B', score: 6 },
      ],
    }),
  });

  assert.ok(report);
  assert.equal(report.overallScore, 7);
});

test('reader panel drops invalid issues and out-of-range chapters', async () => {
  const report = await runReaderPanel({
    ...baseInput,
    routerClient: fakeRouter({
      overallScore: 5,
      personas: [],
      topIssues: [
        { issue: '', severity: 'high', chapters: [1] },
        { issue: 'Hợp lệ', severity: 'weird', chapters: [2, 99, 0] },
      ],
    }),
  });

  assert.ok(report);
  assert.equal(report.topIssues.length, 1);
  assert.equal(report.topIssues[0].severity, 'medium');
  assert.deepEqual(report.topIssues[0].chapters, [2]);
});

test('reader panel is fail-open on router error', async () => {
  const report = await runReaderPanel({ ...baseInput, routerClient: throwingRouter() });
  assert.equal(report, null);
});

test('reader panel returns null with no chapters', async () => {
  const report = await runReaderPanel({ ...baseInput, chapters: [], routerClient: fakeRouter({}) });
  assert.equal(report, null);
});