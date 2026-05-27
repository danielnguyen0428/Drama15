import assert from "node:assert/strict";
import test from "node:test";

import { summarizeChapterMetrics } from "../../scripts/evals/run-prompt-quality-smoke";
import type { ChapterQualityMetrics } from "../../src/modules/validators/chapter-quality";

test("summarizeChapterMetrics returns the compact rounded smoke-eval shape", () => {
  const metrics: ChapterQualityMetrics = {
    wordCount: 1234,
    dialogueRatio: 0.45678,
    paragraphCount: 19,
    maxShortParagraphStreak: 2,
    failures: ["dialogue ratio is materially below the requested target"],
  };

  assert.deepEqual(summarizeChapterMetrics(metrics), {
    wordCount: 1234,
    dialogueRatio: 0.457,
    paragraphCount: 19,
    maxShortParagraphStreak: 2,
    retryNeeded: true,
  });
});

test("summarizeChapterMetrics reports retryNeeded false when there are no failures", () => {
  const metrics: ChapterQualityMetrics = {
    wordCount: 1188,
    dialogueRatio: 0.2504,
    paragraphCount: 14,
    maxShortParagraphStreak: 0,
    failures: [],
  };

  assert.deepEqual(summarizeChapterMetrics(metrics), {
    wordCount: 1188,
    dialogueRatio: 0.25,
    paragraphCount: 14,
    maxShortParagraphStreak: 0,
    retryNeeded: false,
  });
});
