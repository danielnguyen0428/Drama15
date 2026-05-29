export type StoryListItem = {
  status: 'queued' | 'running' | 'completed' | 'failed';
  chapterCount: number;
  canResume?: boolean;
};

export type RelationshipNodeView = { id: string; name: string; role: string; description: string };
export type RelationshipEdgeView = { source: string; target: string; label: string; type: string; chapterNumber?: number; confidence?: 'explicit' | 'inferred' };
export type RelationshipGraphView = { nodes: RelationshipNodeView[]; edges: RelationshipEdgeView[]; updatedAt?: string };

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
