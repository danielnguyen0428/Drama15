import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canResumeStory,
  normalizeRelationshipGraph,
} from './storyViewModel.js';

test('story list shows resume when API marks a zero-chapter partial story resumable', () => {
  assert.equal(canResumeStory({ status: 'failed', chapterCount: 0, canResume: true }), true);
});

test('story list does not show resume for completed stories even when stale metadata says resumable', () => {
  assert.equal(canResumeStory({ status: 'completed', chapterCount: 10, canResume: true }), false);
});

test('relationship graph normalization tolerates missing edges from stored rows', () => {
  const graph = normalizeRelationshipGraph({
    nodes: [{ id: 'lan-anh', name: 'Lan Anh', role: 'Nhân vật chính', description: 'Bị xem thường.' }],
    updatedAt: '2026-05-29T00:00:00.000Z',
  });

  assert.deepEqual(graph?.edges, []);
  assert.equal(graph?.nodes[0].name, 'Lan Anh');
});

test('relationship graph normalization returns undefined for invalid graph payloads', () => {
  assert.equal(normalizeRelationshipGraph({ nodes: 'bad', edges: [] }), undefined);
  assert.equal(normalizeRelationshipGraph(null), undefined);
});
