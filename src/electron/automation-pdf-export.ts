import path from "node:path";

import { slugify } from "../lib/slug";
import type { StoryPayload } from "../types/story";

export function createAutomationPdfFilePath(storyPayload: StoryPayload, outputDirectory: string) {
  const titleSlug = slugify(storyPayload.title || "drama15-story");
  const timestamp = createPdfTimestamp(storyPayload.meta?.generatedAt);
  return path.resolve(outputDirectory, `${titleSlug}-${timestamp}.pdf`);
}

function createPdfTimestamp(value: string | undefined) {
  const date = value && Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  return date.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
}
