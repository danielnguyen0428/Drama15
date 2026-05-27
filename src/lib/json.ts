import { jsonrepair } from "jsonrepair";
import { AppError } from "./errors";

export function parseJsonText<T>(raw: string): T {
  const stripped = stripMarkdownFences(raw);

  const direct = tryParseJson(stripped);
  if (direct.ok) return direct.value as T;

  const extracted = extractFirstJsonBlock(stripped);
  if (extracted) {
    const extractedDirect = tryParseJson(extracted);
    if (extractedDirect.ok) return extractedDirect.value as T;

    const extractedRepair = tryRepairJson(extracted);
    if (extractedRepair.ok) return extractedRepair.value as T;

    const chapterLike = parseChapterLikeMalformedJson(extracted);
    if (chapterLike) return chapterLike as T;
  }

  const repaired = tryRepairJson(stripped);
  if (repaired.ok) return repaired.value as T;

  const chapterLike = parseChapterLikeMalformedJson(stripped);
  if (chapterLike) return chapterLike as T;

  throw new AppError("MODEL_OUTPUT_INVALID", "Model response contained malformed JSON.", 502, { raw });
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value = JSON.parse(text) as unknown;
    return isModelJsonValue(value) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function tryRepairJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value = JSON.parse(jsonrepair(text)) as unknown;
    return isModelJsonValue(value) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function isModelJsonValue(value: unknown) {
  return typeof value === "object" && value !== null;
}

function stripMarkdownFences(raw: string): string {
  const text = raw.trim();
  const fenceStart = /^```(?:json|JSON)?[ \t]*\r?\n/;
  const fenceEnd = /\r?\n[ \t]*```[ \t]*$/;
  if (fenceStart.test(text)) {
    return text.replace(fenceStart, "").replace(fenceEnd, "").trim();
  }
  return text;
}

function parseChapterLikeMalformedJson(raw: string): Record<string, unknown> | null {
  if (!/"chapterNumber"\s*:/.test(raw) || !/"text"\s*:/.test(raw)) {
    return null;
  }

  const chapterNumberMatch = raw.match(/"chapterNumber"\s*:\s*(\d+)/);
  const title = captureStringBeforeNextKey(raw, "title", "summary");
  const summary = captureStringBeforeNextKey(raw, "summary", "text");
  const text = captureFinalStringValue(raw, "text");

  if (!chapterNumberMatch || !title || !summary || !text) {
    return null;
  }

  return {
    chapterNumber: Number(chapterNumberMatch[1]),
    title: cleanMalformedString(title),
    summary: cleanMalformedString(summary),
    text: cleanMalformedString(text),
  };
}

function captureStringBeforeNextKey(raw: string, key: string, nextKey: string) {
  const pattern = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"\\s*,\\s*"${nextKey}"\\s*:`);
  return raw.match(pattern)?.[1] ?? null;
}

function captureFinalStringValue(raw: string, key: string) {
  const keyPattern = new RegExp(`"${key}"\\s*:\\s*"`);
  const keyMatch = keyPattern.exec(raw);
  if (!keyMatch) return null;
  const start = keyMatch.index + keyMatch[0].length;
  const tail = raw.slice(start);
  const end = tail.lastIndexOf('"');
  if (end < 0) return null;
  return tail.slice(0, end).replace(/"\s*}\s*$/, "");
}

function cleanMalformedString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .trim();
}

function extractFirstJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  for (const [open, close] of [["{", "}"], ["[", "]"]] as Array<[string, string]>) {
    const start = trimmed.indexOf(open);
    if (start < 0) continue;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) { escaped = false; continue; }
        if (ch === "\\") { escaped = true; continue; }
        if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") { inString = true; continue; }
      if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) return trimmed.slice(start, i + 1);
      }
    }
  }
  return null;
}
