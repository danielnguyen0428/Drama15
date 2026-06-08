import assert from 'node:assert/strict';
import test from 'node:test';

import { planChapterRevisions, buildRevisionInstruction } from '../../../src/modules/postprocessors/revision-planner.js';

function readerReport(topIssues: Array<{ issue: string; severity: 'low' | 'medium' | 'high'; chapters: number[] }>) {
  return { overallScore: 6, personas: [], topIssues, model: 'm', generatedAt: 'now' };
}

function reviewReport(items: Array<{ issue: string; severity: 'low' | 'medium' | 'high'; chapters: number[]; persona: 'critic' | 'professor' }>) {
  return { verdict: 'v', items, model: 'm', generatedAt: 'now' };
}

test('only high-severity chapter issues are planned by default', () => {
  const briefs = planChapterRevisions(
    readerReport([
      { issue: 'Phản diện mỏng', severity: 'high', chapters: [4] },
      { issue: 'Câu hơi dài', severity: 'low', chapters: [2] },
    ]),
    null,
  );
  assert.equal(briefs.length, 1);
  assert.equal(briefs[0].chapterNumber, 4);
});

test('merges issues from both reports for the same chapter', () => {
  const briefs = planChapterRevisions(
    readerReport([{ issue: 'A', severity: 'high', chapters: [3] }]),
    reviewReport([{ issue: 'B', severity: 'high', chapters: [3], persona: 'critic' }]),
  );
  assert.equal(briefs.length, 1);
  assert.equal(briefs[0].chapterNumber, 3);
  assert.deepEqual(briefs[0].issues.sort(), ['A', 'B']);
});

test('caps the number of chapters', () => {
  const briefs = planChapterRevisions(
    readerReport([
      { issue: 'a', severity: 'high', chapters: [1] },
      { issue: 'b', severity: 'high', chapters: [2] },
      { issue: 'c', severity: 'high', chapters: [3] },
      { issue: 'd', severity: 'high', chapters: [4] },
    ]),
    null,
    { maxChapters: 2 },
  );
  assert.equal(briefs.length, 2);
});

test('revision instruction lists every issue', () => {
  const instruction = buildRevisionInstruction({ chapterNumber: 5, issues: ['X', 'Y'], priority: 3 });
  assert.match(instruction, /1\. X/);
  assert.match(instruction, /2\. Y/);
});
