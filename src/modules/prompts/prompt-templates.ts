/**
 * Unified Prompt Templates — shared between desktop and web.
 *
 * All stage-specific system prompt supplements are defined here so both
 * platforms use the exact same prompt construction, eliminating parity gaps.
 */

import { loadDrama15SystemPrompt } from "./system-prompt-loader";

export const JSON_OUTPUT_GUARD = [
  "CRITICAL: You MUST return valid, parseable JSON.",
  "Do NOT wrap the JSON in markdown code fences or add any text outside the JSON object.",
  "All JSON string values must use the exact keys specified — no extra keys, no missing keys.",
  "If you cannot generate valid content for a field, use an empty string, not null.",
].join("\n");

export const CONCEPT_SYSTEM_PROMPT_SUPPLEMENT = [
  "You are designing a commercial short drama concept.",
  "Focus on: emotional hook within first 500 words, clear protagonist desire, escalating conflict engine.",
  "The concept must support a 10-chapter arc with a concrete foreshadow detail planted in chapter 2.",
  "Avoid literary prose — this is commercial entertainment, not literary fiction.",
  "The heroine must have visible agency that can be demonstrated through behavior, not exposition.",
].join("\n");

export const STORY_BIBLE_SYSTEM_PROMPT_SUPPLEMENT = [
  "You are building the story bible for a commercial short drama.",
  "Every character must have a concrete, behavior-based wound that drives their choices.",
  "The betrayal engine must be actionable — not a vague feeling but a specific mechanism.",
  "The class shame engine must define how social hierarchy creates pressure on the heroine.",
  "The revenge engine must show how the heroine reclaims dignity through strategic action.",
  "The ending mode must match the niche's emotional promise.",
].join("\n");

export const CHAPTER_PLAN_SYSTEM_PROMPT_SUPPLEMENT = [
  "You are planning a 10-chapter short drama with fixed architecture.",
  "Each chapter must have: a hook, a main beat, humiliation progression, revenge progression, and an ending beat.",
  "Chapter 2 MUST plant a concrete foreshadow detail that Chapter 5 will reuse.",
  "Chapter 6 is the nadir — maximum loss, no rescue.",
  "Chapter 7 is the internal pivot — the heroine shifts from reactive to active.",
  "Chapter 9 is the public reveal — truth comes out in a concrete, dramatic way.",
  "Chapter 10 is the short climax-and-aftershock — resolve with dignity, not revenge.",
].join("\n");

export const CHAPTER_DRAFT_SYSTEM_PROMPT_SUPPLEMENT = [
  "You are writing a chapter for a commercial short drama.",
  "Open on a concrete situation — not background explanation or internal monologue.",
  "Show the heroine's agency through behavior, not exposition.",
  "Use dialogue to advance the plot — at least 40% of the chapter should be dialogue.",
  "End on a hook that creates curiosity or tension for the next chapter.",
  "Avoid AI-cliché phrases: 'shiver down spine', 'heart skipped a beat', 'world came crashing down'.",
  "Vary sentence length — mix short fragments with longer complex sentences.",
  "Each character must speak in their distinct voice (use their established speech pattern).",
].join("\n");

export const REGENERATE_CHAPTER_SYSTEM_PROMPT_SUPPLEMENT = [
  "You are rewriting a chapter while preserving core story elements.",
  "Do NOT change: character names, the betrayal reveal, the ending mode, established plot facts.",
  "DO change: sentence variety, dialogue rhythm, scene ordering, metaphor freshness.",
  "Improve the hook, tighten pacing, and increase dialogue ratio if below target.",
].join("\n");

export const CHAPTER_REPAIR_SYSTEM_PROMPT_SUPPLEMENT = [
  "You are repairing a chapter draft that failed quality checks.",
  "Address ONLY the specific failures identified — do not rewrite the entire chapter.",
  "If the failure is dialogue ratio: add more back-and-forth exchanges while preserving plot.",
  "If the failure is word count: expand scene descriptions and internal beats without padding.",
  "If the failure is AI-tell phrases: replace clichés with concrete, specific sensory details.",
  "If the failure is sentence variance: vary sentence length and rhythm throughout.",
  "If the failure is phrase reuse: replace repeated trigrams with fresh expressions.",
  "Keep all character names, plot facts, and story progression identical.",
].join("\n");

// ─── Composition Helper ──────────────────────────────────────────────────────

export function composeSystemPrompt(base: string, ...supplements: string[]): string {
  const parts = [base];
  for (const supplement of supplements) {
    if (supplement.trim()) {
      parts.push("", "---", "", supplement.trim());
    }
  }
  return parts.join("\n");
}

// ─── Full System Prompt Builders ─────────────────────────────────────────────

export function buildConceptSystemPrompt(): string {
  return composeSystemPrompt(
    loadDrama15SystemPrompt(),
    JSON_OUTPUT_GUARD,
    CONCEPT_SYSTEM_PROMPT_SUPPLEMENT,
  );
}

export function buildStoryBibleSystemPrompt(): string {
  return composeSystemPrompt(
    loadDrama15SystemPrompt(),
    JSON_OUTPUT_GUARD,
    STORY_BIBLE_SYSTEM_PROMPT_SUPPLEMENT,
  );
}

export function buildChapterPlanSystemPrompt(): string {
  return composeSystemPrompt(
    loadDrama15SystemPrompt(),
    JSON_OUTPUT_GUARD,
    CHAPTER_PLAN_SYSTEM_PROMPT_SUPPLEMENT,
  );
}

export function buildChapterDraftSystemPrompt(): string {
  return composeSystemPrompt(
    loadDrama15SystemPrompt(),
    JSON_OUTPUT_GUARD,
    CHAPTER_DRAFT_SYSTEM_PROMPT_SUPPLEMENT,
  );
}

export function buildChapterRepairSystemPrompt(): string {
  return composeSystemPrompt(
    loadDrama15SystemPrompt(),
    JSON_OUTPUT_GUARD,
    CHAPTER_REPAIR_SYSTEM_PROMPT_SUPPLEMENT,
  );
}

export function buildRegenerateChapterSystemPrompt(): string {
  return composeSystemPrompt(
    loadDrama15SystemPrompt(),
    JSON_OUTPUT_GUARD,
    REGENERATE_CHAPTER_SYSTEM_PROMPT_SUPPLEMENT,
  );
}
