import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  getRemainingChapterPlanItems,
  hasResumableStoryPayload,
} from '../../../src/modules/orchestrator/story-resume.js';
import type { StoryPayload } from '../../../src/types/story.js';

const apiSourcePath = fileURLToPath(new URL('./startDev.ts', import.meta.url));
const storyStoreSourcePath = fileURLToPath(new URL('./storyStore.ts', import.meta.url));

function makeStoryPayload(chapterNumbers: number[]): StoryPayload {
  return {
    chapterPlan: Array.from({ length: 10 }, (_, index) => ({
      chapterNumber: index + 1,
      title: `Chương ${index + 1}`,
      hook: 'Một móc câu hợp lệ.',
      mainBeat: 'Một nhịp chính hợp lệ.',
      humiliationProgression: 'Một nhịp hạ thấp hợp lệ.',
      revengeProgression: 'Một nhịp phản đòn hợp lệ.',
      endingBeat: 'Một nhịp kết hợp lệ.',
    })),
    chapters: chapterNumbers.map((chapterNumber) => ({
      chapterNumber,
      title: `Chương ${chapterNumber}`,
      summary: `Tóm tắt chương ${chapterNumber}.`,
      text: `Nội dung chương ${chapterNumber}.`,
    })),
  } as StoryPayload;
}

test('resume selects only missing chapter plan items after saved chapters', () => {
  const payload = makeStoryPayload([1, 2, 3]);

  assert.deepEqual(
    getRemainingChapterPlanItems(payload).map((chapter) => chapter.chapterNumber),
    [4, 5, 6, 7, 8, 9, 10],
  );
});

test('resume has no remaining chapters when all planned chapters are saved', () => {
  const payload = makeStoryPayload([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  assert.deepEqual(getRemainingChapterPlanItems(payload), []);
});

test('partial payloads with saved outline or saved chapters are resumable', () => {
  assert.equal(hasResumableStoryPayload(makeStoryPayload([1])), true);
  assert.equal(hasResumableStoryPayload(makeStoryPayload([])), true);
  assert.equal(hasResumableStoryPayload(makeStoryPayload([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])), false);
});

test('resume endpoint uses the orchestrator resume path without consuming quota', async () => {
  const source = await readFile(apiSourcePath, 'utf8');
  const resumeRoute = source.match(/app\.post\('\/stories\/:id\/resume',[\s\S]*?\n}\);/);

  assert.ok(resumeRoute, 'API must define POST /stories/:id/resume');
  assert.match(resumeRoute[0], /resumePayload: story\.storyPayload/);
  assert.match(source, /orchestrator\.resumeFull\(job\.resumePayload/);
  assert.doesNotMatch(resumeRoute[0], /consumeStoryQuota\(/);
});

test('story summaries expose resumable partial payloads to the web client', async () => {
  const source = await readFile(storyStoreSourcePath, 'utf8');

  assert.match(source, /canResume\??: boolean/);
  assert.match(source, /canResume:\s*Boolean\(payload\)\s*&&\s*hasResumableStoryPayload\(payload\)/);
});
