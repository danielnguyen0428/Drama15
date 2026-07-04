import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectExplanatoryCoda,
  buildExplanatoryCodaRepairInstructions,
} from '../../../src/modules/core-pipeline/validators/explanatory-coda.js';

test('clean scene-driven prose produces no explanatory-coda failure', () => {
  const text = [
    'Diệp Ninh đặt hai tờ sơ đồ lên bàn. Cô đối chiếu từng hàng số.',
    'Ngoài sảnh, khách bắt đầu vào. Đèn chùm sáng lên từng chuỗi.',
    'Cô cầm cốc cà phê lên, thấy nguội, đặt xuống. Rồi cô với lấy điện thoại.',
  ].join('\n\n');

  const report = detectExplanatoryCoda(text);
  assert.equal(report.needsRepair, false);
});

test('flags the redefinition + abstract-summary coda block', () => {
  const text = [
    'Cô đặt máy quay xuống, bước ra cửa.',
    'Cô gọi sự chịu đựng là chung thủy. Được cần đến không phải được chọn. Hữu dụng không phải xứng đáng.',
  ].join('\n\n');

  const report = detectExplanatoryCoda(text);
  assert.ok(report.hits.length >= 2, 'should flag multiple restatement sentences');
  assert.ok(report.hits.some((h) => h.kind === 'abstract_summary' || h.kind === 'redefinition'));
});

test('flags a meaning-gloss opener', () => {
  const text = [
    'Anh bước lên sân khấu, nắm tay người khác, không quay đầu.',
    'Nghĩa là ba năm của cô chỉ còn là một dòng ghi chú bị gạch bỏ.',
  ].join('\n\n');

  const report = detectExplanatoryCoda(text);
  assert.ok(report.hits.some((h) => h.kind === 'meaning_gloss'));
});

test('does not flag dialogue that happens to use "không phải"', () => {
  const text = [
    '"Đây không phải chỗ của cô," bà nói.',
    '"Tôi đến làm việc, không phải đến ngồi," cô đáp.',
  ].join('\n\n');

  const report = detectExplanatoryCoda(text);
  assert.equal(report.needsRepair, false);
});

test('weights paragraph-end codas over mid-paragraph restatements', () => {
  const atEnd = detectExplanatoryCoda(
    [
      'Cô ký tên mình. Nét bút dứt khoát.',
      'Nhẫn nại không phải là tình yêu.',
    ].join('\n\n'),
  );
  const midParagraph = detectExplanatoryCoda(
    'Nhẫn nại không phải là tình yêu, và cô đứng dậy, xách túi máy lên vai, bước ra khỏi căn phòng chật.',
  );
  const endHit = atEnd.hits.find((h) => h.atParagraphEnd);
  assert.ok(endHit, 'end-of-paragraph coda should be detected');
  assert.ok(atEnd.score >= midParagraph.score);
});

test('repair instructions only emitted when repair is needed', () => {
  const clean = detectExplanatoryCoda('Trời mưa. Cô bước đi. Không ai nói gì.');
  assert.equal(buildExplanatoryCodaRepairInstructions(clean), '');

  const slop = detectExplanatoryCoda(
    [
      'Cô tắt đèn bếp.',
      'Cô gọi sự chịu đựng là chung thủy. Hữu dụng không phải xứng đáng. Được cần đến không phải được yêu.',
    ].join('\n\n'),
  );
  if (slop.needsRepair) {
    assert.match(
      buildExplanatoryCodaRepairInstructions(slop),
      /EXPLANATORY-CODA DE-SLOP INSTRUCTION/,
    );
  }
});
