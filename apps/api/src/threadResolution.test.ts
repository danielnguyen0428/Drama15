import assert from 'node:assert/strict';
import test from 'node:test';

import {
  detectThreadResolution,
  buildThreadResolutionRepairInstructions,
} from '../../../src/modules/core-pipeline/validators/thread-resolution.js';

test('flags a declared thread that never reappears in the closing chapters', () => {
  const report = detectThreadResolution(
    [
      { label: 'hợp đồng thưởng gắn ngày ký liên doanh', resolutionBeat: 'phơi bày trước hội đồng' },
      { label: 'chiếc áo cũ sỉ nhục trước gia đình', resolutionBeat: 'lấy lại phẩm giá công khai' },
    ],
    // Closing text only resolves the contract thread; the humiliation thread is dropped.
    'Cô đặt bản hợp đồng liên doanh lên bàn, chỉ đúng ngày ký. Sự thật phơi bày, hội đồng quyết định chấm dứt.',
  );

  const contract = report.threads.find((t) => t.label.includes('hợp đồng'));
  const shame = report.threads.find((t) => t.label.includes('áo cũ'));
  assert.equal(contract?.addressed, true);
  assert.equal(shame?.addressed, false);
  assert.equal(report.needsRepair, true);
  assert.ok(report.unresolvedLabels.some((l) => l.includes('áo cũ')));
});

test('passes when both threads are addressed and resolution vocabulary is present', () => {
  const report = detectThreadResolution(
    [
      { label: 'hợp đồng thưởng gian dối', resolutionBeat: 'phơi bày' },
      { label: 'chiếc áo cũ sỉ nhục', resolutionBeat: 'phẩm giá' },
    ],
    'Bản hợp đồng thưởng gian dối bị phơi bày. Chiếc áo cũ sỉ nhục năm xưa, cô công khai chọn rời đi, sự thật cuối cùng được thừa nhận.',
  );

  assert.equal(report.needsRepair, false);
  assert.equal(report.unresolvedLabels.length, 0);
});

test('never flags on empty threads', () => {
  const report = detectThreadResolution([], 'bất kỳ nội dung nào');
  assert.equal(report.needsRepair, false);
  assert.equal(report.threads.length, 0);
});

test('repair instruction lists only the unresolved threads', () => {
  const report = detectThreadResolution(
    [
      { label: 'bằng chứng hợp đồng liên doanh', resolutionBeat: 'x' },
      { label: 'chiếc áo cũ sỉ nhục trước gia đình', resolutionBeat: 'y' },
    ],
    // Only the contract thread is addressed; the humiliation thread's distinctive
    // tokens (áo, cũ, sỉ, nhục, gia đình) never reappear.
    'Bằng chứng hợp đồng liên doanh được phơi bày và giải quyết công khai trước hội đồng.',
  );
  const instruction = buildThreadResolutionRepairInstructions(report);
  assert.match(instruction, /THREAD-RESOLUTION REPAIR/);
  assert.match(instruction, /áo cũ sỉ nhục/);
});
