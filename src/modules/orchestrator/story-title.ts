import type { Concept } from "../../types/story";

export function resolveFinalStoryTitle(concept: Concept, requestTitleHint?: string) {
  const requestedTitle = requestTitleHint?.trim();
  if (requestedTitle) return requestedTitle;

  return concept.title || concept.titleCandidates[0] || "Drama chưa đặt tên";
}
