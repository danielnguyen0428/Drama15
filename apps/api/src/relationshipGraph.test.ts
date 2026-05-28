import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCharacterFactsToRelationshipGraph,
  createInitialRelationshipGraph,
} from '../../../src/modules/relationship/relationship-graph.js';

const storyBible = {
  premise: 'Một câu chuyện trả đũa trong giới thượng lưu.',
  heroine: {
    name: 'Lan Anh',
    wound: 'Bị xem là người ngoài cuộc.',
    strengths: ['kiên định'],
    blindSpots: ['tin người quá lâu'],
  },
  betrayer: {
    name: 'Minh Quân',
    wound: 'Sợ mất địa vị.',
    cowardiceVector: 'Chọn danh tiếng thay vì bảo vệ cô.',
  },
  rival: {
    name: 'Bảo Trâm',
    socialPower: 'Con gái nhà tài trợ.',
    demeanor: 'Lịch sự nhưng độc địa.',
  },
  classHierarchy: ['gia đình tài phiệt'],
  betrayalEngine: 'Minh Quân phủ nhận Lan Anh trước gia đình.',
  classShameEngine: 'Bảo Trâm dùng gia thế để hạ thấp Lan Anh.',
  revengeEngine: 'Lan Anh rời đi và lấy lại quyền kiểm soát.',
  endingMode: 'dignity first',
};

test('initial relationship graph uses story bible characters and core edges', () => {
  const graph = createInitialRelationshipGraph(storyBible, new Date('2026-05-28T00:00:00.000Z'));

  assert.deepEqual(graph.nodes.map((node) => node.name), ['Lan Anh', 'Minh Quân', 'Bảo Trâm']);
  assert.equal(graph.edges.length, 3);
  assert.equal(graph.edges[0].type, 'betrayal');
});

test('chapter facts add relationship edges and new characters', () => {
  const graph = createInitialRelationshipGraph(storyBible, new Date('2026-05-28T00:00:00.000Z'));
  const next = applyCharacterFactsToRelationshipGraph(graph, {
    chapterNumber: 2,
    extractedAt: '2026-05-28T00:05:00.000Z',
    characters: [
      {
        characterName: 'Lan Anh',
        emotionalState: 'Bình tĩnh hơn',
        socialPosition: 'Người bị xem thường',
        relationshipChanges: [{ targetCharacter: 'Luật sư Hạ', change: 'Tin tưởng cô sau khi thấy chứng cứ.' }],
        newlyEstablishedFacts: [],
      },
    ],
  });

  assert.ok(next.nodes.some((node) => node.name === 'Luật sư Hạ'));
  assert.ok(next.edges.some((edge) => edge.type === 'chapter_change' && edge.chapterNumber === 2));
});
