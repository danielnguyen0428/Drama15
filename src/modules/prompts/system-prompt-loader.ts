import fs from "node:fs";
import path from "node:path";

import { AppError } from "../../lib/errors";
import { getEmbeddedTextAsset, resolveAssetPath } from "../../lib/runtime";

const PROMPT_ASSET_SEGMENTS = ["presets", "prompts", "drama15_lite_system_prompt.md"] as const;
const PROMPT_ASSET_KEY = path.posix.join(...PROMPT_ASSET_SEGMENTS);
const SYSTEM_PROMPT_HEADING = "## SYSTEM PROMPT";
const OPTIONAL_DEVELOPER_NOTE_HEADING = "## Optional Developer Note";

let cachedSystemPrompt: string | null = null;

export function loadDrama15SystemPrompt() {
  if (cachedSystemPrompt) {
    return cachedSystemPrompt;
  }

  const filePath = resolveAssetPath(...PROMPT_ASSET_SEGMENTS);
  let rawMarkdown = "";

  try {
    rawMarkdown = fs.readFileSync(filePath, "utf8");
  } catch {
    rawMarkdown = getEmbeddedTextAsset(PROMPT_ASSET_KEY) ?? "";
  }

  if (!rawMarkdown) {
    throw new AppError("UNKNOWN_ERROR", "System prompt asset could not be loaded.", 500, {
      assetKey: PROMPT_ASSET_KEY,
      filePath,
    });
  }

  const promptBody = extractSystemPromptBody(rawMarkdown);
  if (!promptBody) {
    throw new AppError("UNKNOWN_ERROR", "System prompt asset is missing the SYSTEM PROMPT body.", 500, {
      assetKey: PROMPT_ASSET_KEY,
      filePath,
    });
  }

  cachedSystemPrompt = promptBody;
  return promptBody;
}

function extractSystemPromptBody(rawMarkdown: string) {
  const normalized = rawMarkdown.replace(/\r\n/g, "\n").trim();
  const headingIndex = normalized.indexOf(SYSTEM_PROMPT_HEADING);
  if (headingIndex === -1) {
    return "";
  }

  const bodyStartIndex = headingIndex + SYSTEM_PROMPT_HEADING.length;
  const developerNoteIndex = normalized.indexOf(OPTIONAL_DEVELOPER_NOTE_HEADING, bodyStartIndex);
  const bodyEndIndex = developerNoteIndex === -1 ? normalized.length : developerNoteIndex;
  const body = normalized.slice(bodyStartIndex, bodyEndIndex).trim();
  const cleaned = body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed === "---") {
        return trimmed;
      }

      if (/^#{1,6}\s+/.test(trimmed)) {
        return trimmed.replace(/^#{1,6}\s+/, "");
      }

      return line;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}
