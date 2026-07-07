import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeSentenceVariance,
  longestShortRun,
  buildVarianceRepairInstruction,
} from '../../../src/modules/core-pipeline/validators/sentence-variance.js';

// ─── longestShortRun unit behavior ───────────────────────────────────────────

test('longestShortRun counts the longest consecutive run of short sentences', () => {
  // lengths: three short (≤6), one long, then two short
  assert.equal(longestShortRun([4, 5, 6, 20, 3, 4]), 3);
  // a long sentence resets the run
  assert.equal(longestShortRun([4, 30, 4, 30, 4]), 1);
  // no short sentences at all
  assert.equal(longestShortRun([12, 18, 25]), 0);
});

// ─── The core regression: a choppy CLUMP inside an otherwise varied chapter ───
// Global cv is healthy (long clause-heavy sentences inflate stdev), so the cv
// gate reads "fine" — but the staccato run still reads machine-written. This is
// the exact case the reporter hit and that the cv-only gate missed.

test('mixed chapter with a choppy clump is flagged even when global cv is high', () => {
  const text = [
    'Minh Anh đặt bút xuống, nhìn bức tranh vẫn còn ướt màu, rồi lau vội tay vào vạt áo đã lấm lem từ sáng đến giờ.',
    // choppy staccato clump — six clipped lines in a row
    'Cô nhìn bức tranh. Màu vẫn chưa khô. Cô lau tay. Điện thoại rung. Một tin nhắn lạ. Tay cô run.',
    'Cô không trả lời, chỉ đứng dậy đi về phía cửa sổ đang mở toang, nơi gió lùa vào thổi tung những tờ phác thảo cô đã thức trắng đêm để hoàn thành.',
  ].join(' ');

  const report = analyzeSentenceVariance(text);
  assert.ok(report.cv >= 0.55, `expected healthy global cv, got ${report.cv.toFixed(3)}`);
  assert.ok(report.maxShortRun >= 4, `expected a choppy run, got ${report.maxShortRun}`);
  assert.equal(report.needsRepair, true);
});

test('genuinely varied prose with only brief clipped emphasis is not flagged', () => {
  const text = [
    'Lan Anh đặt cốc nước xuống bàn, ánh mắt không rời khỏi khuôn mặt đang tái đi của người đàn ông đối diện.',
    'Cô hỏi. Anh im lặng.',
    'Rồi cô đứng dậy, kéo ghế, và bước ra khỏi căn phòng nơi mọi lời hứa đã vỡ vụn từ rất lâu trước khi cô nhận ra.',
  ].join(' ');

  const report = analyzeSentenceVariance(text);
  assert.ok(report.maxShortRun < 4, `expected no long choppy run, got ${report.maxShortRun}`);
  assert.equal(report.needsRepair, false);
});

test('a pure choppy passage is flagged by both cv and the local run', () => {
  const text = 'Cô đặt bút xuống. Cô nhìn bức tranh. Màu vẫn chưa khô. Cô lau tay. Điện thoại rung. Tay cô run.';
  const report = analyzeSentenceVariance(text);
  assert.ok(report.cv < 0.55);
  assert.ok(report.maxShortRun >= 4);
  assert.equal(report.needsRepair, true);
});

test('repair instruction calls out the choppy clump when maxShortRun is high', () => {
  const choppy = analyzeSentenceVariance(
    'Cô đứng dậy. Cô bỏ đi. Trời mưa. Cô không quay lại. Lòng cô trống rỗng.',
  );
  const instruction = buildVarianceRepairInstruction(choppy);
  assert.match(instruction, /consecutive short sentences|choppy|staccato/i);
});
