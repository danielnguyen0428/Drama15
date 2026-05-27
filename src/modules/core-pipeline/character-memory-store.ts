/**
 * Character Memory Store — cumulative storage of character facts across chapters.
 *
 * Provides an immutable data structure indexed by chapter number, with
 * serialization/deserialization for persistence and prompt context generation
 * for LLM consumption.
 *
 * @module characterMemoryStore
 */

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface CharacterFact {
  characterName: string;
  emotionalState: string;
  relationshipChanges: Array<{
    targetCharacter: string;
    change: string;
  }>;
  socialPosition: string;
  newlyEstablishedFacts: Array<{
    fact: string;
    confidence: 'explicit' | 'inferred';
    confidenceLevel?: number; // 0.0-1.0, only for inferred
  }>;
}

export interface CharacterFactSheet {
  chapterNumber: number;
  characters: CharacterFact[];
  extractedAt: string; // ISO-8601
}

export interface CharacterMemoryStore {
  /** All fact sheets indexed by chapter number */
  chapters: Map<number, CharacterFactSheet>;
}

// ---------------------------------------------------------------------------
// Serialization format
// ---------------------------------------------------------------------------

interface SerializedMemoryStore {
  version: 1;
  chapters: Record<string, CharacterFactSheet>;
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Create a new empty CharacterMemoryStore with no chapters.
 */
export function createEmptyMemoryStore(): CharacterMemoryStore {
  return { chapters: new Map() };
}

/**
 * Add a fact sheet to the store, returning a new store (immutable pattern).
 * If a fact sheet for the same chapter number already exists, it is replaced.
 */
export function addFactSheet(
  store: CharacterMemoryStore,
  factSheet: CharacterFactSheet,
): CharacterMemoryStore {
  const newChapters = new Map(store.chapters);
  newChapters.set(factSheet.chapterNumber, factSheet);
  return { chapters: newChapters };
}

/**
 * Query all facts for a specific character across all chapters.
 * Returns facts in chapter order (ascending by chapter number).
 */
export function queryByCharacter(
  store: CharacterMemoryStore,
  characterName: string,
): CharacterFact[] {
  const results: Array<{ chapterNumber: number; fact: CharacterFact }> = [];

  for (const [chapterNumber, factSheet] of store.chapters) {
    for (const fact of factSheet.characters) {
      if (fact.characterName === characterName) {
        results.push({ chapterNumber, fact });
      }
    }
  }

  // Sort by chapter number ascending for chronological order
  results.sort((a, b) => a.chapterNumber - b.chapterNumber);

  return results.map((r) => r.fact);
}

/**
 * Serialize a CharacterMemoryStore to a JSON string.
 * The output includes a `version: 1` field for forward compatibility.
 */
export function serializeMemoryStore(store: CharacterMemoryStore): string {
  const serialized: SerializedMemoryStore = {
    version: 1,
    chapters: {},
  };

  for (const [chapterNumber, factSheet] of store.chapters) {
    serialized.chapters[String(chapterNumber)] = factSheet;
  }

  return JSON.stringify(serialized);
}

/**
 * Deserialize a JSON string back into a CharacterMemoryStore.
 * Handles the `version: 1` serialization format.
 */
export function deserializeMemoryStore(json: string): CharacterMemoryStore {
  const parsed: SerializedMemoryStore = JSON.parse(json);

  if (parsed.version !== 1) {
    throw new Error(
      `Unsupported CharacterMemoryStore version: ${String(parsed.version)}`,
    );
  }

  const chapters = new Map<number, CharacterFactSheet>();

  for (const [key, factSheet] of Object.entries(parsed.chapters)) {
    const chapterNumber = Number(key);
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
      continue; // skip invalid keys gracefully
    }
    chapters.set(chapterNumber, factSheet);
  }

  return { chapters };
}

/**
 * Convert the memory store into a prompt-friendly string context for LLM consumption.
 * Organizes information by chapter in ascending order, listing each character's
 * state within that chapter.
 */
export function memoryStoreToPromptContext(
  store: CharacterMemoryStore,
): string {
  if (store.chapters.size === 0) {
    return '';
  }

  const sortedChapters = [...store.chapters.entries()].sort(
    ([a], [b]) => a - b,
  );

  const sections: string[] = [];

  for (const [chapterNumber, factSheet] of sortedChapters) {
    const characterLines: string[] = [];

    for (const character of factSheet.characters) {
      const lines: string[] = [];
      lines.push(`  - ${character.characterName}:`);
      lines.push(`    Emotional state: ${character.emotionalState}`);
      lines.push(`    Social position: ${character.socialPosition}`);

      if (character.relationshipChanges.length > 0) {
        lines.push(`    Relationship changes:`);
        for (const rel of character.relationshipChanges) {
          lines.push(`      • ${rel.targetCharacter}: ${rel.change}`);
        }
      }

      if (character.newlyEstablishedFacts.length > 0) {
        lines.push(`    Established facts:`);
        for (const f of character.newlyEstablishedFacts) {
          const confidence =
            f.confidence === 'inferred'
              ? ` [inferred, confidence: ${String(f.confidenceLevel ?? 'N/A')}]`
              : ' [explicit]';
          lines.push(`      • ${f.fact}${confidence}`);
        }
      }

      characterLines.push(lines.join('\n'));
    }

    sections.push(
      `Chapter ${String(chapterNumber)}:\n${characterLines.join('\n')}`,
    );
  }

  return `=== CHARACTER MEMORY CONTEXT ===\n${sections.join('\n\n')}\n=== END CHARACTER MEMORY CONTEXT ===`;
}
