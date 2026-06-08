export type StoryListItem = {
  status: 'queued' | 'running' | 'completed' | 'failed';
  chapterCount: number;
  canResume?: boolean;
};

/** Fixed number of chapters in a full Drama15 draft. */
export const TOTAL_CHAPTERS = 15;

export type RelationshipNodeView = { id: string; name: string; role: string; description: string };
export type RelationshipEdgeView = { source: string; target: string; label: string; type: string; chapterNumber?: number; confidence?: 'explicit' | 'inferred' };
export type RelationshipGraphView = { nodes: RelationshipNodeView[]; edges: RelationshipEdgeView[]; updatedAt?: string };
export type RelationshipGraphPreview = RelationshipGraphView & { hiddenNodeCount: number; hiddenEdgeCount: number };

const MAX_RELATIONSHIP_PREVIEW_NODES = 8;
const MAX_RELATIONSHIP_PREVIEW_EDGES = 12;

export function canResumeStory(story: StoryListItem) {
  return story.status !== 'completed' && (story.canResume === true || (story.chapterCount > 0 && story.chapterCount < TOTAL_CHAPTERS));
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

// ─── Quality reports (autonovel reader panel / review / propagation debt) ─────

export type Severity = 'low' | 'medium' | 'high';
export type EvaluationIssueView = { issue: string; severity: Severity; chapters: number[] };
export type ReaderPanelView = {
  overallScore: number;
  personas: Array<{ persona: string; score: number; liked: string; concern: string }>;
  topIssues: EvaluationIssueView[];
};
export type ManuscriptReviewView = {
  verdict: string;
  items: Array<EvaluationIssueView & { persona: 'critic' | 'professor' }>;
};
export type PropagationDebtView = {
  kind: 'missed_foreshadow' | 'pending_foreshadow' | 'unachieved_beat' | 'late_fact';
  detail: string;
  chapters: number[];
  severity: Severity;
};
export type FoundationReportView = {
  overallScore: number;
  dimensions: Array<{ name: string; score: number; note: string }>;
  issues: string[];
  suggestions: string[];
  attempts?: number;
};
export type QualityReportView = {
  readerPanel?: ReaderPanelView;
  manuscriptReview?: ManuscriptReviewView;
  propagationDebt?: PropagationDebtView[];
  foundation?: FoundationReportView;
};

const SEVERITIES: Severity[] = ['low', 'medium', 'high'];
const DEBT_KINDS = ['missed_foreshadow', 'pending_foreshadow', 'unachieved_beat', 'late_fact'] as const;

export function normalizeQualityReports(meta: unknown): QualityReportView | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const record = meta as Record<string, unknown>;

  const readerPanel = normalizeReaderPanel(record.readerPanel);
  const manuscriptReview = normalizeManuscriptReview(record.manuscriptReview);
  const propagationDebt = normalizePropagationDebt(record.propagationDebt);
  const foundation = normalizeFoundation(record.foundationReport);

  if (!readerPanel && !manuscriptReview && !foundation && (!propagationDebt || propagationDebt.length === 0)) {
    return undefined;
  }
  return {
    ...(readerPanel ? { readerPanel } : {}),
    ...(manuscriptReview ? { manuscriptReview } : {}),
    ...(propagationDebt && propagationDebt.length > 0 ? { propagationDebt } : {}),
    ...(foundation ? { foundation } : {}),
  };
}

function normalizeFoundation(value: unknown): FoundationReportView | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.overallScore !== 'number') return undefined;
  const dimensions = Array.isArray(record.dimensions)
    ? record.dimensions
        .map((entry) => {
          const d = entry as Record<string, unknown>;
          if (typeof d.name !== 'string' || typeof d.score !== 'number') return undefined;
          return { name: d.name, score: d.score, note: typeof d.note === 'string' ? d.note : '' };
        })
        .filter((d): d is NonNullable<typeof d> => d !== undefined)
    : [];
  const toStrings = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  return {
    overallScore: record.overallScore,
    dimensions,
    issues: toStrings(record.issues),
    suggestions: toStrings(record.suggestions),
    attempts: typeof record.attempts === 'number' ? record.attempts : undefined,
  };
}

function normalizeReaderPanel(value: unknown): ReaderPanelView | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.overallScore !== 'number') return undefined;
  const personas = Array.isArray(record.personas)
    ? record.personas
        .map((entry) => {
          const p = entry as Record<string, unknown>;
          if (typeof p.persona !== 'string' || typeof p.score !== 'number') return undefined;
          return {
            persona: p.persona,
            score: p.score,
            liked: typeof p.liked === 'string' ? p.liked : '',
            concern: typeof p.concern === 'string' ? p.concern : '',
          };
        })
        .filter((p): p is NonNullable<typeof p> => p !== undefined)
    : [];
  return {
    overallScore: record.overallScore,
    personas,
    topIssues: normalizeIssues(record.topIssues),
  };
}

function normalizeManuscriptReview(value: unknown): ManuscriptReviewView | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items)
    ? record.items
        .map((entry) => {
          const issue = normalizeIssue(entry);
          if (!issue) return undefined;
          const persona = (entry as Record<string, unknown>).persona === 'professor' ? 'professor' : 'critic';
          return { ...issue, persona } as ManuscriptReviewView['items'][number];
        })
        .filter((i): i is NonNullable<typeof i> => i !== undefined)
    : [];
  const verdict = typeof record.verdict === 'string' ? record.verdict : '';
  if (!verdict && items.length === 0) return undefined;
  return { verdict, items };
}

function normalizePropagationDebt(value: unknown): PropagationDebtView[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return undefined;
      const record = entry as Record<string, unknown>;
      if (!DEBT_KINDS.includes(record.kind as PropagationDebtView['kind'])) return undefined;
      if (typeof record.detail !== 'string') return undefined;
      return {
        kind: record.kind as PropagationDebtView['kind'],
        detail: record.detail,
        chapters: normalizeChapters(record.chapters),
        severity: SEVERITIES.includes(record.severity as Severity) ? (record.severity as Severity) : 'medium',
      };
    })
    .filter((d): d is PropagationDebtView => d !== undefined);
}

function normalizeIssues(value: unknown): EvaluationIssueView[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeIssue).filter((i): i is EvaluationIssueView => i !== undefined);
}

function normalizeIssue(value: unknown): EvaluationIssueView | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const text = typeof record.issue === 'string' ? record.issue : typeof record.item === 'string' ? record.item : undefined;
  if (!text || text.trim().length === 0) return undefined;
  return {
    issue: text.trim(),
    severity: SEVERITIES.includes(record.severity as Severity) ? (record.severity as Severity) : 'medium',
    chapters: normalizeChapters(record.chapters),
  };
}

function normalizeChapters(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= TOTAL_CHAPTERS);
}
