export type StoryListItem = {
  status: 'queued' | 'running' | 'completed' | 'failed';
  chapterCount: number;
  canResume?: boolean;
};

export type RelationshipNodeView = { id: string; name: string; role: string; description: string };
export type RelationshipEdgeView = { source: string; target: string; label: string; type: string; chapterNumber?: number; confidence?: 'explicit' | 'inferred' };
export type RelationshipGraphView = { nodes: RelationshipNodeView[]; edges: RelationshipEdgeView[]; updatedAt?: string };
export type RelationshipGraphPreview = RelationshipGraphView & { hiddenNodeCount: number; hiddenEdgeCount: number };

const MAX_RELATIONSHIP_PREVIEW_NODES = 8;
const MAX_RELATIONSHIP_PREVIEW_EDGES = 12;

export function canResumeStory(story: StoryListItem) {
  return story.status !== 'completed' && (story.canResume === true || (story.chapterCount > 0 && story.chapterCount < 10));
}

export function normalizeRelationshipGraph(value: unknown): RelationshipGraphView | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.nodes)) return undefined;

  const nodes = record.nodes.filter(isRelationshipNode);
  if (nodes.length === 0) return undefined;

  return {
    nodes,
    edges: Array.isArray(record.edges) ? record.edges.filter(isRelationshipEdge) : [],
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  };
}

export function createRelationshipGraphPreview(value: unknown): RelationshipGraphPreview | undefined {
  const graph = normalizeRelationshipGraph(value);
  if (!graph) return undefined;

  const degreeByNode = new Map<string, number>();
  for (const edge of graph.edges) {
    degreeByNode.set(edge.source, (degreeByNode.get(edge.source) ?? 0) + 1);
    degreeByNode.set(edge.target, (degreeByNode.get(edge.target) ?? 0) + 1);
  }

  const nodes = graph.nodes
    .map((node, index) => ({ node, index, degree: degreeByNode.get(node.id) ?? 0 }))
    .sort((left, right) => right.degree - left.degree || left.index - right.index)
    .slice(0, MAX_RELATIONSHIP_PREVIEW_NODES)
    .sort((left, right) => left.index - right.index)
    .map((item) => item.node);

  const visibleNodeIds = new Set(nodes.map((node) => node.id));
  const compactEdges = new Map<string, { edge: RelationshipEdgeView; count: number }>();
  for (const edge of graph.edges) {
    if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) continue;
    const key = `${edge.source}->${edge.target}`;
    const current = compactEdges.get(key);
    if (current) {
      current.count += 1;
      continue;
    }
    compactEdges.set(key, { edge, count: 1 });
  }

  const edges = Array.from(compactEdges.values())
    .slice(0, MAX_RELATIONSHIP_PREVIEW_EDGES)
    .map(({ edge, count }) => count > 1 ? { ...edge, label: `${edge.label} (+${count - 1})` } : edge);

  return {
    nodes,
    edges,
    updatedAt: graph.updatedAt,
    hiddenNodeCount: Math.max(graph.nodes.length - nodes.length, 0),
    hiddenEdgeCount: Math.max(graph.edges.length - edges.length, 0),
  };
}

function isRelationshipNode(value: unknown): value is RelationshipNodeView {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && typeof record.name === 'string' && typeof record.role === 'string';
}

function isRelationshipEdge(value: unknown): value is RelationshipEdgeView {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return typeof record.source === 'string' && typeof record.target === 'string' && typeof record.label === 'string' && typeof record.type === 'string';
}
