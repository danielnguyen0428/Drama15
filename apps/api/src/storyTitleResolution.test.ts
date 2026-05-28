import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFinalStoryTitle } from '../../../src/modules/orchestrator/story-title.js';

const concept = {
  title: 'Tiêu Đề Concept Khác',
  titleCandidates: ['Ứng Viên Một'],
  logline: 'Một logline hợp lệ.',
  promise: 'Một lời hứa thể loại hợp lệ.',
  conflictEngine: 'Một trục xung đột hợp lệ.',
};

test('requested title hint wins over generated concept title', () => {
  assert.equal(resolveFinalStoryTitle(concept, 'Chiếc Thẻ Xám'), 'Chiếc Thẻ Xám');
});

test('concept title is used when request has no title hint', () => {
  assert.equal(resolveFinalStoryTitle(concept, '   '), 'Tiêu Đề Concept Khác');
});
