import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectStructuralSlop,
  buildStructuralSlopRepairInstructions,
} from '../../../src/modules/core-pipeline/validators/structural-slop.js';

test('clean prose produces no structural-slop failure', () => {
  const text = [
    'Lan Anh đặt cốc nước xuống bàn. Cô nhìn thẳng vào Minh Quân.',
    '"Anh đã ký vào đâu?" Giọng cô bình thản.',
    'Ông luật sư lật trang hồ sơ. Im lặng kéo dài. Rồi ông gật đầu.',
  ].join('\n\n');

  const report = detectStructuralSlop(text);
  assert.equal(report.needsRepair, false);
  assert.equal(report.notJustButCount, 0);
});

test('detects "not just X, but Y" crutch in English and Vietnamese', () => {
  const en = detectStructuralSlop('This was not just a betrayal, but a calculated move to destroy her.');
  assert.ok(en.notJustButCount >= 1);

  const vi = detectStructuralSlop('Đây không chỉ là sự phản bội mà còn là một âm mưu được tính toán.');
  assert.ok(vi.notJustButCount >= 1);
});

test('flags em-dash overload', () => {
  const text = 'She paused — looked away — then spoke — slowly — and finally — quietly — left.';
  const report = detectStructuralSlop(text);
  assert.ok(report.emDashPer1000Words > 6);
  assert.ok(report.hits.some((h) => h.kind === 'em_dash_overload'));
});

test('flags transition-opening addiction', () => {
  const text = [
    'However, the room went quiet.',
    'Furthermore, nobody moved.',
    'Moreover, the door stayed shut.',
    'Additionally, the lights flickered.',
  ].join(' ');
  const report = detectStructuralSlop(text);
  assert.ok(report.hits.some((h) => h.kind === 'transition_openings'));
});

test('flags hedge chains but not isolated hedges', () => {
  const chained = detectStructuralSlop('Có thể có lẽ cô ấy đã biết sự thật từ trước.');
  assert.ok(chained.hedgeChainCount >= 1);

  const isolated = detectStructuralSlop('Cô có thể bước vào phòng họp bất cứ lúc nào cô muốn ngay.');
  assert.equal(isolated.hedgeChainCount, 0);
});

test('repair instructions only emitted when repair is needed', () => {
  const clean = detectStructuralSlop('Trời mưa. Cô bước đi. Không ai nói gì.');
  assert.equal(buildStructuralSlopRepairInstructions(clean), '');

  const slop = detectStructuralSlop(
    'However, this was not just a loss — but a defeat — and perhaps possibly — the end.',
  );
  if (slop.needsRepair) {
    assert.match(buildStructuralSlopRepairInstructions(slop), /STRUCTURAL DE-SLOP INSTRUCTION/);
  }
});

test('"maybe" does not false-trigger the "may" hedge token', () => {
  const report = detectStructuralSlop('Maybe she left. The house was empty by noon.');
  assert.equal(report.hedgeChainCount, 0);
});
