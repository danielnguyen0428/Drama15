import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeVoiceFingerprint,
  buildVoiceLockInstruction,
} from '../../../src/modules/core-pipeline/validators/voice-fingerprint.js';

test('returns null for empty input', () => {
  assert.equal(analyzeVoiceFingerprint([]), null);
  assert.equal(analyzeVoiceFingerprint(['', '   ']), null);
});

test('computes a fingerprint with sane fields', () => {
  const text = [
    'Cô bước vào phòng. "Anh đã làm gì?" cô hỏi, giọng lạnh.',
    'Anh ta im lặng rất lâu, rồi cuối cùng cũng ngẩng đầu lên nhìn cô với ánh mắt né tránh.',
    'Không ai nói gì thêm.',
  ].join('\n\n');

  const fp = analyzeVoiceFingerprint([text]);
  assert.ok(fp);
  assert.equal(fp.sampleChapters, 1);
  assert.ok(fp.meanSentenceWords > 0);
  assert.ok(fp.dialogueRatio >= 0 && fp.dialogueRatio <= 1);
  assert.ok(fp.meanParagraphWords > 0);
});

test('voice lock instruction references the fingerprint stats', () => {
  const fp = analyzeVoiceFingerprint(['Câu một dài hơn ở đây. Ngắn. Một câu khác vừa phải để tính trung bình.']);
  assert.ok(fp);
  const instruction = buildVoiceLockInstruction(fp);
  assert.match(instruction, /VOICE LOCK/);
  assert.match(instruction, /sentence length/i);
});
