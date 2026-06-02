/**
 * Character Fact Sheet Extractor — extracts structured character facts from a
 * chapter using LLM-based analysis at low temperature (0.2).
 *
 * Falls back to regex-based name extraction when LLM fails, ensuring the
 * pipeline never blocks on fact extraction.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

import { env } from "../../lib/env";
import type { RouterClient } from "../router/router-client";
import type { StoryBible } from "../core-pipeline/pipeline-types";
import type { CharacterFactSheet } from "./character-memory-store";

export const TEMPERATURE_FACT_EXTRACTION = 0.2;
export const TEMPERATURE_FACT_EXTRACTION_RETRY = 0.1;

// Fast, cheap model for auxiliary analysis (fact extraction / consistency).
// Must be a model the configured provider actually serves, so it is env-driven
// (AUXILIARY_ANALYSIS_MODEL). Defaults to a ckey.vn model. The previous
// hardcoded values ("gpt-4o-mini", then "cx/gpt-5.4-mini") only existed on
// specific providers and 404'd elsewhere, silently disabling LLM fact
// extraction (it falls back to regex).
export const AUXILIARY_ANALYSIS_MODEL = env.auxiliaryAnalysisModel;

const COMMON_NON_NAME_WORDS = new Set([
  "The", "When", "Chapter", "And", "But", "Then", "Now", "Not",
  "She", "He", "It", "They", "His", "Her", "Their", "This", "That",
  "With", "From", "Into", "Through", "After", "Before", "Between",
  "What", "Where", "Why", "How", "Who",
  "Là", "Có", "Đã", "Đang", "Sẽ", "Không", "Một", "Những", "Các",
  "Và", "Của", "Cho", "Với", "Trong", "Khi", "Thì", "Để", "Từ",
  "Nhưng", "Mà", "Hay", "Nếu", "Vì", "Do", "Bởi", "Nên", "Rồi",
  "Lại", "Còn", "Đều", "Rất", "Quá", "Lắm", "Ra", "Vào", "Lên",
  "Xuống", "Về", "Tới", "Sau", "Trước", "Trên", "Dưới",
  "Chapter", "Part", "Scene",
]);

// ─── Prompt Builders ─────────────────────────────────────────────────────────

export function buildFactExtractionSystemPrompt(): string {
  return [
    "You are a Character Fact Sheet Extractor for serialized fiction.",
    "Your task is to read a chapter and extract structured facts about each named character.",
    "",
    "Output a JSON object with:",
    "- chapterNumber: the chapter number",
    "- characters: array of CharacterFact objects",
    "- extractedAt: ISO-8601 timestamp",
    "",
    "Each CharacterFact must have:",
    "- characterName: string",
    "- emotionalState: string (current emotional state in this chapter)",
    "- relationshipChanges: array of { targetCharacter, change }",
    "- socialPosition: string (social position/hierarchy in this chapter)",
    "- newlyEstablishedFacts: array of { fact, confidence: 'explicit'|'inferred', confidenceLevel?: number }",
    "",
    "Rules:",
    "- Extract facts about ALL named characters who appear in this chapter.",
    "- emotionalState should describe their emotional state WITHIN this chapter.",
    "- relationshipChanges should capture shifts in relationships revealed in this chapter.",
    "- socialPosition should reflect their current standing in the social hierarchy.",
    "- newlyEstablishedFacts should include concrete facts established for the first time.",
    "- Use the Story Bible as reference for character identification.",
    "- Keep each field concise (1-2 sentences max).",
    "- Return ONLY valid JSON, no markdown, no explanation.",
  ].join("\n");
}

export function buildFactExtractionUserPrompt(opts: {
  chapterText: string;
  chapterNumber: number;
  storyBible: StoryBible;
  outputLanguage: string;
}): string {
  return [
    `Extract character facts from Chapter ${opts.chapterNumber}.`,
    `Output language context: ${opts.outputLanguage}.`,
    "",
    "=== STORY BIBLE (Reference for character identification) ===",
    JSON.stringify(opts.storyBible, null, 2),
    "=== END STORY BIBLE ===",
    "",
    `=== CHAPTER ${opts.chapterNumber} TEXT ===`,
    opts.chapterText,
    "=== END CHAPTER TEXT ===",
    "",
    "Return a JSON object with the extracted character facts.",
  ].join("\n");
}

// ─── LLM-based Extraction ────────────────────────────────────────────────────

export async function extractCharacterFacts(
  chapterText: string,
  chapterNumber: number,
  storyBible: StoryBible,
  outputLanguage: string,
  routerClient: RouterClient,
): Promise<CharacterFactSheet> {
  const systemPrompt = buildFactExtractionSystemPrompt();
  const userPrompt = buildFactExtractionUserPrompt({
    chapterText,
    chapterNumber,
    storyBible,
    outputLanguage,
  });

  try {
    const result = await routerClient.generateJson<unknown>({
      model: AUXILIARY_ANALYSIS_MODEL,
      systemPrompt,
      userPrompt,
      temperature: TEMPERATURE_FACT_EXTRACTION,
      timeoutMs: 60_000,
    });

    const data = result.data as Record<string, unknown>;
    const characters = Array.isArray(data?.characters) ? data.characters : [];

    return {
      chapterNumber,
      characters: characters.map((c: Record<string, unknown>) => ({
        characterName: String(c?.characterName || "Unknown"),
        emotionalState: String(c?.emotionalState || ""),
        relationshipChanges: Array.isArray(c?.relationshipChanges)
          ? c.relationshipChanges.map((r: Record<string, unknown>) => ({
              targetCharacter: String(r?.targetCharacter || ""),
              change: String(r?.change || ""),
            }))
          : [],
        socialPosition: String(c?.socialPosition || ""),
        newlyEstablishedFacts: Array.isArray(c?.newlyEstablishedFacts)
          ? c.newlyEstablishedFacts.map((f: Record<string, unknown>) => ({
              fact: String(f?.fact || ""),
              confidence: (f?.confidence === "explicit" || f?.confidence === "inferred")
                ? f.confidence
                : "inferred",
              confidenceLevel: typeof f?.confidenceLevel === "number" ? f.confidenceLevel : undefined,
            }))
          : [],
      })),
      extractedAt: new Date().toISOString(),
    };
  } catch {
    // Fail-open: use regex-based fallback
    return extractCharacterNamesFallback(chapterText, chapterNumber);
  }
}

// ─── Regex-based Fallback ────────────────────────────────────────────────────

/**
 * Extract character names using regex as a fallback when LLM extraction fails.
 * Finds capitalized words appearing 2+ times, filtering common non-name words.
 */
export function extractCharacterNamesFallback(
  text: string,
  chapterNumber: number = 0,
): CharacterFactSheet {
  const nameCounts = new Map<string, number>();

  // Match capitalized words (potential names)
  const capitalizedWords = text.match(/\b[A-ZÀ-Ỹ][a-zà-ỹ]*(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]*)*\b/g) || [];

  for (const word of capitalizedWords) {
    const trimmed = word.trim();
    if (trimmed.length < 2) continue;
    if (COMMON_NON_NAME_WORDS.has(trimmed)) continue;
    // Skip single-letter words
    if (/^[A-ZÀ-Ỹ]$/.test(trimmed)) continue;

    nameCounts.set(trimmed, (nameCounts.get(trimmed) || 0) + 1);
  }

  // Only include names appearing 2+ times
  const characters = Array.from(nameCounts.entries())
    .filter(([, count]) => count >= 2)
    .map(([name]) => ({
      characterName: name,
      emotionalState: "",
      relationshipChanges: [],
      socialPosition: "",
      newlyEstablishedFacts: [],
    }));

  return {
    chapterNumber,
    characters,
    extractedAt: new Date().toISOString(),
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateCharacterFactSheet(data: unknown): data is CharacterFactSheet {
  if (data === null || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;

  if (typeof obj.chapterNumber !== "number" || !Number.isInteger(obj.chapterNumber)) return false;
  if (!Array.isArray(obj.characters)) return false;
  if (typeof obj.extractedAt !== "string") return false;

  for (const char of obj.characters) {
    if (!isValidCharacterFact(char)) return false;
  }

  return true;
}

function isValidCharacterFact(entry: unknown): boolean {
  if (entry === null || typeof entry !== "object") return false;

  const obj = entry as Record<string, unknown>;

  return (
    typeof obj.characterName === "string" &&
    obj.characterName.length > 0 &&
    typeof obj.emotionalState === "string" &&
    typeof obj.socialPosition === "string" &&
    Array.isArray(obj.relationshipChanges) &&
    Array.isArray(obj.newlyEstablishedFacts)
  );
}
