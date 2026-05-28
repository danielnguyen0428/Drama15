import type { CharacterFactSheet } from "../core-pipeline/character-memory-store";
import type { RelationshipEdge, RelationshipGraph, RelationshipNode, StoryBible } from "../../types/story";

export function createInitialRelationshipGraph(storyBible: StoryBible, now = new Date()): RelationshipGraph {
  const nodes: RelationshipNode[] = [
    {
      id: toNodeId(storyBible.heroine.name),
      name: storyBible.heroine.name,
      role: "Nhân vật chính",
      description: storyBible.heroine.wound,
    },
    {
      id: toNodeId(storyBible.betrayer.name),
      name: storyBible.betrayer.name,
      role: "Người phản bội",
      description: storyBible.betrayer.cowardiceVector,
    },
    {
      id: toNodeId(storyBible.rival.name),
      name: storyBible.rival.name,
      role: "Đối thủ",
      description: storyBible.rival.socialPower,
    },
  ];

  const heroineId = nodes[0].id;
  const betrayerId = nodes[1].id;
  const rivalId = nodes[2].id;

  return {
    nodes,
    edges: compactEdges([
      {
        source: heroineId,
        target: betrayerId,
        label: storyBible.betrayalEngine,
        type: "betrayal",
        confidence: "explicit",
      },
      {
        source: heroineId,
        target: rivalId,
        label: storyBible.classShameEngine,
        type: "rivalry",
        confidence: "explicit",
      },
      {
        source: heroineId,
        target: betrayerId,
        label: storyBible.revengeEngine,
        type: "revenge",
        confidence: "explicit",
      },
    ]),
    updatedAt: now.toISOString(),
  };
}

export function applyCharacterFactsToRelationshipGraph(
  graph: RelationshipGraph,
  factSheet: CharacterFactSheet,
  now = new Date(),
): RelationshipGraph {
  const nodesByName = new Map(graph.nodes.map((node) => [normalizeName(node.name), node]));
  const nodes = [...graph.nodes];
  const edges = [...graph.edges];

  for (const character of factSheet.characters) {
    const source = ensureNode(nodes, nodesByName, character.characterName, "Nhân vật", character.socialPosition);

    for (const relationship of character.relationshipChanges) {
      const target = ensureNode(nodes, nodesByName, relationship.targetCharacter, "Nhân vật", "Được nhắc trong diễn biến chương");
      const nextEdge: RelationshipEdge = {
        source: source.id,
        target: target.id,
        label: relationship.change,
        type: "chapter_change",
        chapterNumber: factSheet.chapterNumber,
        confidence: "explicit",
      };
      upsertEdge(edges, nextEdge);
    }
  }

  return { nodes, edges: compactEdges(edges), updatedAt: now.toISOString() };
}

function ensureNode(
  nodes: RelationshipNode[],
  nodesByName: Map<string, RelationshipNode>,
  name: string,
  role: string,
  description: string,
) {
  const normalized = normalizeName(name);
  const existing = nodesByName.get(normalized);
  if (existing) return existing;

  const node: RelationshipNode = {
    id: toNodeId(name),
    name,
    role,
    description: description || "Được nhắc trong diễn biến chương",
  };
  nodes.push(node);
  nodesByName.set(normalized, node);
  return node;
}

function upsertEdge(edges: RelationshipEdge[], next: RelationshipEdge) {
  const existingIndex = edges.findIndex((edge) =>
    edge.source === next.source &&
    edge.target === next.target &&
    edge.type === next.type &&
    edge.chapterNumber === next.chapterNumber
  );

  if (existingIndex >= 0) {
    edges[existingIndex] = next;
    return;
  }

  edges.push(next);
}

function compactEdges(edges: RelationshipEdge[]) {
  return edges.filter((edge, index) =>
    edges.findIndex((candidate) =>
      candidate.source === edge.source &&
      candidate.target === edge.target &&
      candidate.type === edge.type &&
      candidate.chapterNumber === edge.chapterNumber &&
      candidate.label === edge.label
    ) === index
  );
}

function normalizeName(value: string) {
  return value.trim().toLocaleLowerCase("vi-VN");
}

function toNodeId(value: string) {
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "nhan-vat";
}
