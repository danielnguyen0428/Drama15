/**
 * Character Summary Generator — produces chapter summaries organized by character
 * rather than chronological plot order.
 *
 * Replaces the existing `summarizeChapter()` output (200-char truncation) with
 * richer character-specific context for subsequent chapter generation via
 * `previousSummaries`.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 *
 * @module characterSummary
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CharacterSummaryEntry {
  characterName: string;
  actionsTaken: string;
  emotionalArc: string;
  relationshipInteractions: string;
  statusChanges: string;
}

export interface CharacterSummary {
  chapterNumber: number;
  primaryCharacters: CharacterSummaryEntry[]; // max 5
  collectiveSummary?: string; // for characters beyond top 5
  wordCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHARACTER_SUMMARY_MIN_WORDS = 300;
export const CHARACTER_SUMMARY_MAX_WORDS = 800;
export const MAX_PRIMARY_CHARACTERS = 5;

// ---------------------------------------------------------------------------
// Prompt Builders
// ---------------------------------------------------------------------------

/**
 * Build the system prompt for character summary generation.
 * Instructs the LLM to organize output by character name.
 *
 * Validates: Requirement 4.1
 */
export function buildCharacterSummarySystemPrompt(): string {
  return [
    'You are a character analysis assistant for a serialized drama story.',
    'Your task is to produce a chapter summary ORGANIZED BY CHARACTER rather than by plot chronology.',
    '',
    '## Output Format',
    'Return a valid JSON object with the following structure:',
    '{',
    '  "chapterNumber": <number>,',
    '  "primaryCharacters": [',
    '    {',
    '      "characterName": "<name>",',
    '      "actionsTaken": "<what the character did in this chapter>",',
    '      "emotionalArc": "<emotional journey within the chapter>",',
    '      "relationshipInteractions": "<interactions with other characters>",',
    '      "statusChanges": "<changes in social position, power, or reputation>"',
    '    }',
    '  ],',
    '  "collectiveSummary": "<optional: brief summary for characters beyond the top 5>",',
    '  "wordCount": <total word count of the summary content>',
    '}',
    '',
    '## Rules',
    '- Organize ALL information by character name, not by plot sequence.',
    '- Prioritize the 5 most plot-relevant characters as primaryCharacters.',
    '- If more than 5 named characters appear, include a collectiveSummary for the rest.',
    '- Each character entry must include: actionsTaken, emotionalArc, relationshipInteractions, and statusChanges.',
    `- Total summary word count must be between ${String(CHARACTER_SUMMARY_MIN_WORDS)} and ${String(CHARACTER_SUMMARY_MAX_WORDS)} words.`,
    '- Focus on character-specific details that maintain continuity for future chapters.',
    '- Use the same language as the chapter text.',
    '- Return ONLY the JSON object, no additional text.',
  ].join('\n');
}

/**
 * Build the user prompt for character summary generation.
 * Includes chapter text and story bible for context.
 *
 * Validates: Requirements 4.1, 4.2, 4.3
 */
export function buildCharacterSummaryUserPrompt(opts: {
  chapterText: string;
  chapterNumber: number;
  storyBible: string;
}): string {
  const { chapterText, chapterNumber, storyBible } = opts;

  return [
    `Generate a character-organized summary for Chapter ${String(chapterNumber)}.`,
    '',
    `Target word count: ${String(CHARACTER_SUMMARY_MIN_WORDS)}-${String(CHARACTER_SUMMARY_MAX_WORDS)} words total.`,
    `Maximum primary characters: ${String(MAX_PRIMARY_CHARACTERS)}.`,
    '',
    '--- STORY BIBLE (reference for character identification) ---',
    storyBible,
    '--- END STORY BIBLE ---',
    '',
    `--- CHAPTER ${String(chapterNumber)} TEXT ---`,
    chapterText,
    `--- END CHAPTER ${String(chapterNumber)} TEXT ---`,
    '',
    'Analyze the chapter and produce a JSON summary organized by character.',
    'Focus on: actions taken, emotional arc, relationship interactions, and status changes for each character.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that an unknown value conforms to the CharacterSummary interface.
 * Checks: structure validity, word count bounds (300-800), max 5 primary characters,
 * and collectiveSummary presence when more than 5 characters exist.
 *
 * Validates: Requirements 4.2, 4.4, 4.5
 */
export function validateCharacterSummary(data: unknown): data is CharacterSummary {
  if (data === null || typeof data !== 'object') {
    return false;
  }

  const obj = data as Record<string, unknown>;

  // Check chapterNumber
  if (typeof obj.chapterNumber !== 'number' || !Number.isInteger(obj.chapterNumber) || obj.chapterNumber < 1) {
    return false;
  }

  // Check primaryCharacters
  if (!Array.isArray(obj.primaryCharacters)) {
    return false;
  }

  // Max 5 primary characters
  if (obj.primaryCharacters.length > MAX_PRIMARY_CHARACTERS) {
    return false;
  }

  // Validate each entry
  for (const entry of obj.primaryCharacters) {
    if (!isValidCharacterSummaryEntry(entry)) {
      return false;
    }
  }

  // Check collectiveSummary if present
  if (obj.collectiveSummary !== undefined && typeof obj.collectiveSummary !== 'string') {
    return false;
  }

  // Check wordCount
  if (typeof obj.wordCount !== 'number' || !Number.isFinite(obj.wordCount)) {
    return false;
  }

  // Word count bounds
  if (obj.wordCount < CHARACTER_SUMMARY_MIN_WORDS || obj.wordCount > CHARACTER_SUMMARY_MAX_WORDS) {
    return false;
  }

  return true;
}

/**
 * Validate a single CharacterSummaryEntry.
 */
function isValidCharacterSummaryEntry(entry: unknown): entry is CharacterSummaryEntry {
  if (entry === null || typeof entry !== 'object') {
    return false;
  }

  const obj = entry as Record<string, unknown>;

  return (
    typeof obj.characterName === 'string' &&
    obj.characterName.length > 0 &&
    typeof obj.actionsTaken === 'string' &&
    typeof obj.emotionalArc === 'string' &&
    typeof obj.relationshipInteractions === 'string' &&
    typeof obj.statusChanges === 'string'
  );
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Convert a CharacterSummary to a readable string format suitable for
 * inclusion in `previousSummaries` array for LLM context.
 *
 * Validates: Requirement 4.3
 */
export function characterSummaryToString(summary: CharacterSummary): string {
  const lines: string[] = [];

  lines.push(`=== Chapter ${String(summary.chapterNumber)} Character Summary ===`);
  lines.push('');

  for (const entry of summary.primaryCharacters) {
    lines.push(`[${entry.characterName}]`);
    lines.push(`  Actions: ${entry.actionsTaken}`);
    lines.push(`  Emotional arc: ${entry.emotionalArc}`);
    lines.push(`  Relationships: ${entry.relationshipInteractions}`);
    lines.push(`  Status changes: ${entry.statusChanges}`);
    lines.push('');
  }

  if (summary.collectiveSummary) {
    lines.push('[Other Characters]');
    lines.push(`  ${summary.collectiveSummary}`);
    lines.push('');
  }

  lines.push(`=== End Chapter ${String(summary.chapterNumber)} Summary ===`);

  return lines.join('\n');
}
