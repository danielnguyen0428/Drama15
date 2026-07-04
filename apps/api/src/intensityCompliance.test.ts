import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectIntensityCompliance,
  buildIntensityComplianceRepairInstructions,
} from '../../../src/modules/core-pipeline/validators/intensity-compliance.js';

// Build a paragraph of N sentences each with `wordsPerSentence` words, so the
// detector's mean-sentence-length proxy is deterministic.
function sentencesOf(count: number, wordsPerSentence: number): string {
  const body = Array.from({ length: wordsPerSentence }, (_, i) => `từ${i}`).join(' ');
  return Array.from({ length: count }, () => `${body}.`).join(' ');
}

test('short clipped prose satisfies a high intensity target', () => {
  const text = sentencesOf(12, 8); // mean ~8 words -> within high window (6-16)
  const report = detectIntensityCompliance(text, 0.92);
  assert.equal(report.needsRepair, false);
  assert.equal(report.direction, 'ok');
});

test('long slow prose fails a high intensity target (too_slow)', () => {
  const text = sentencesOf(12, 32); // mean ~32 words -> well above high window
  const report = detectIntensityCompliance(text, 0.92);
  assert.equal(report.direction, 'too_slow');
  assert.equal(report.needsRepair, true);
});

test('very choppy prose fails a low intensity target (too_choppy)', () => {
  const text = sentencesOf(12, 4); // mean ~4 words -> below low window (9-26)
  const report = detectIntensityCompliance(text, 0.6);
  assert.equal(report.direction, 'too_choppy');
  assert.equal(report.needsRepair, true);
});

test('does not judge chapters with too few sentences to measure', () => {
  const text = sentencesOf(4, 40); // only 4 sentences -> below MIN_SENTENCES_TO_JUDGE
  const report = detectIntensityCompliance(text, 0.92);
  assert.equal(report.needsRepair, false);
});

test('repair instruction only emitted when repair is needed', () => {
  const clean = detectIntensityCompliance(sentencesOf(12, 10), 0.92);
  assert.equal(buildIntensityComplianceRepairInstructions(clean), '');

  const slow = detectIntensityCompliance(sentencesOf(12, 32), 0.92);
  assert.match(buildIntensityComplianceRepairInstructions(slow), /INTENSITY-COMPLIANCE REPAIR INSTRUCTION/);
});
