import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_USER_DIALOGUE_RATIO,
  DEFAULT_USER_INTENSITY,
  analyzeHookDensity,
  resolveEffectiveChapterDraftTargets,
  scaleChapterDialogueRatio,
  scaleChapterIntensity,
} from '../../../src/modules/prompts/draft-controls-scaling.js';
import { analyzeChapterQuality } from '../../../src/modules/validators/chapter-quality.js';

test('default sliders preserve chapter 1 architecture targets', () => {
  const targets = resolveEffectiveChapterDraftTargets(1, {
    userIntensity: DEFAULT_USER_INTENSITY,
    userDialogueRatio: DEFAULT_USER_DIALOGUE_RATIO,
    hookDensity: 'high',
  });

  assert.equal(targets.intensity, 0.66);
  assert.equal(targets.dialogueRatio, 0.48);
  assert.equal(targets.hookDensity, 'high');
});

test('user intensity deviation is amplified by gain and clamped', () => {
  // Deviation from default (0.84) is multiplied by INTENSITY_GAIN (1.7) so the
  // slider has real pull. (0.9-0.84)*1.7 = 0.102 → 0.66+0.102 = 0.76.
  assert.equal(scaleChapterIntensity(0.66, 0.9), 0.76);
  // High baseline + upward push clamps at the raised ceiling (0.97).
  assert.equal(scaleChapterIntensity(0.94, 0.9), 0.97);
  // Strong downward push: (0.7-0.84)*1.7 = -0.238 → 0.56-0.238 = 0.322 → floor 0.5.
  assert.equal(scaleChapterIntensity(0.56, 0.7), 0.5);
  // At the default, the deviation is 0, so output equals the architecture value.
  assert.equal(scaleChapterIntensity(0.66, 0.84), 0.66);
});

test('user dialogue ratio deviation is amplified by gain and clamped', () => {
  // (0.7-0.56)*1.3 = 0.182 → 0.48+0.182 = 0.662 → 0.66.
  assert.equal(scaleChapterDialogueRatio(0.48, 0.7), 0.66);
  // Strong downward push clamps at the floor 0.2.
  assert.equal(scaleChapterDialogueRatio(0.4, 0.3), 0.2);
  // At the default, output equals the architecture value.
  assert.equal(scaleChapterDialogueRatio(0.48, 0.56), 0.48);
});

test('hook density validator accepts chapters with multiple short tension beats', () => {
  const text = [
    'Lan Anh bước vào phòng. Không ai chào.',
    '"Cô là ai?"',
    'Cô im lặng.',
    'Anh cầm lá thư lên.',
    'Cửa đóng lại sau lưng cô.',
    'Một tiếng khóa vang lên.',
    'Cô không quay đầu.',
  ].join('\n\n');

  const metrics = analyzeHookDensity(text, 'high');
  assert.equal(metrics.meetsTarget, true);
});

test('hook density validator rejects flat prose at high density', () => {
  const text = [
    'Lan Anh đi vào phòng họp và ngồi xuống ghế gần cửa sổ trong khi mọi người vẫn tiếp tục trao đổi những chi tiết nhỏ về lịch trình sắp tới.',
    'Cô lắng nghe từng câu chuyện xung quanh và cố gắng giữ vẻ bình thản để không ai nhận ra sự bất an đang dồn lên trong lòng.',
    'Buổi họp kết thúc trong sự yên ả mà không để lại dấu vết nào đáng chú ý cho đến khi cô bước ra hành lang.',
  ].join('\n\n');

  const metrics = analyzeHookDensity(text, 'high');
  assert.equal(metrics.meetsTarget, false);

  const quality = analyzeChapterQuality(
    text,
    { dialogueRatio: 0.56, hookDensity: 'high' },
    'vietnamese',
    1,
    0.84,
  );
  assert.ok(quality.failures.some((failure) => failure.includes('hook density')));
});
