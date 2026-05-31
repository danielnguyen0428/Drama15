import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canResumeStory,
  createRelationshipGraphPreview,
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
  assert.equal(graph?.nodes[0]?.name, 'Lan Anh');
});

test('relationship graph normalization returns undefined for invalid graph payloads', () => {
  assert.equal(normalizeRelationshipGraph({ nodes: 'bad', edges: [] }), undefined);
  assert.equal(normalizeRelationshipGraph(null), undefined);
});

test('relationship graph preview limits dense graphs to readable nodes and edges', () => {
  const graph = {
    nodes: Array.from({ length: 24 }, (_, index) => ({
      id: `node-${index}`,
      name: `Nhân vật ${index}`,
      role: 'Nhân vật',
      description: 'Có quan hệ trong truyện.',
    })),
    edges: Array.from({ length: 80 }, (_, index) => ({
      source: `node-${index % 24}`,
      target: `node-${(index + 1) % 24}`,
      label: `Cập nhật ${index}`,
      type: 'chapter_change',
      chapterNumber: 3,
      confidence: 'explicit' as const,
    })),
    updatedAt: '2026-05-29T00:00:00.000Z',
  };

  const preview = createRelationshipGraphPreview(graph);

  assert.ok(preview);
  assert.ok(preview.nodes.length <= 8);
  assert.ok(preview.edges.length <= 12);
  assert.equal(preview.hiddenNodeCount, 16);
  assert.ok(preview.hiddenEdgeCount > 0);
  assert.ok(preview.edges.every((edge) => preview.nodes.some((node) => node.id === edge.source) && preview.nodes.some((node) => node.id === edge.target)));
});
