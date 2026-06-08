import assert from 'node:assert/strict';
import test from 'node:test';

import { reviewManuscript } from '../../../src/modules/postprocessors/manuscript-review.js';

function fakeRouter(data: unknown, modelUsed = 'test-model') {
  return { generateJson: async <T>() => ({ data: data as T, modelUsed }) };
}

const baseInput = {
  title: 'Truyện thử',
  concept: { logline: 'logline', promise: 'promise' },
  chapters: [{ chapterNumber: 1, title: 'C1', summary: 's', text: 'nội dung' }],
  outputLanguage: 'vietnamese' as const,
  model: 'rewriter',
};

test('manuscript review normalizes items and persona', async () => {
  const report = await reviewManuscript({
    ...baseInput,
    routerClient: fakeRouter({
      verdict: 'Khá ổn nhưng giữa truyện chùng.',
      items: [
        { item: 'Nhịp chương 3 chậm', severity: 'medium', persona: 'professor', chapters: [3] },
        { issue: 'Câu thoại lặp', severity: 'low', persona: 'critic', chapters: [2] },
      ],
    }),
  });

  assert.ok(report);
  assert.equal(report.verdict, 'Khá ổn nhưng giữa truyện chùng.');
  assert.equal(report.items.length, 2);
  assert.equal(report.items[0].persona, 'professor');
  assert.equal(report.items[1].issue, 'Câu thoại lặp');
});

test('manuscript review defaults persona to critic', async () => {
  const report = await reviewManuscript({
    ...baseInput,
    routerClient: fakeRouter({ verdict: 'ok', items: [{ item: 'X', severity: 'high' }] }),
  });
  assert.ok(report);
  assert.equal(report.items[0].persona, 'critic');
});

test('manuscript review returns null when empty', async () => {
  const report = await reviewManuscript({
    ...baseInput,
    routerClient: fakeRouter({ verdict: '', items: [] }),
  });
  assert.equal(report, null);
});

test('manuscript review is fail-open on router error', async () => {
  const report = await reviewManuscript({
    ...baseInput,
    routerClient: { generateJson: async <T>(): Promise<{ data: T; modelUsed: string }> => { throw new Error('boom'); } },
  });
  assert.equal(report, null);
});
