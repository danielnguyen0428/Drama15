/**
 * Vietnamese address register (xưng hô) — canonical pronoun/vocative rules per character.
 *
 * Locked at story-bible time and enforced during chapter draft, validation, and repair.
 */

import type { OutputLanguage, StoryBible } from "../../types/story";

export interface AddressTarget {
  call: string;
  notes?: string;
}

export interface AddressRegister {
  selfReference: string;
  toOthers: Record<string, AddressTarget>;
  forbiddenTerms: string[];
  narratorThirdPerson?: string;
}

export type AddressRegisterMap = Record<string, AddressRegister>;

export interface EstablishedAddressUsage {
  speaker: string;
  target: string;
  term: string;
  count: number;
}

const SELF_REFERENCE_VARIANTS: Record<string, string[]> = {
  toi: ["tôi", "toi"],
  anh: ["anh"],
  em: ["em"],
  chi: ["chị", "chi"],
  co: ["cô", "co"],
  toi_day: ["tôi đây"],
};

function normalizeTerm(term: string): string {
  return term
    .normalize("NFC")
    .toLowerCase()
    .trim();
}

function selfReferenceKey(term: string): string | null {
  const normalized = normalizeTerm(term);
  for (const [key, variants] of Object.entries(SELF_REFERENCE_VARIANTS)) {
    if (variants.includes(normalized)) {
      return key;
    }
  }
  return null;
}

export function collectAddressRegistersFromBible(storyBible: StoryBible): AddressRegisterMap {
  const map: AddressRegisterMap = {};
  const entries: Array<{ name: string; register?: AddressRegister }> = [
    { name: storyBible.heroine.name, register: storyBible.heroine.addressRegister },
    { name: storyBible.betrayer.name, register: storyBible.betrayer.addressRegister },
    { name: storyBible.rival.name, register: storyBible.rival.addressRegister },
  ];

  for (const entry of entries) {
    if (entry.register) {
      map[entry.name] = entry.register;
    }
  }

  return map;
}

export function collectSpeechPatternsFromBible(storyBible: StoryBible): Record<string, NonNullable<StoryBible["heroine"]["speechPattern"]>> {
  const patterns: Record<string, NonNullable<StoryBible["heroine"]["speechPattern"]>> = {};
  if (storyBible.heroine.speechPattern) {
    patterns[storyBible.heroine.name] = storyBible.heroine.speechPattern;
  }
  if (storyBible.betrayer.speechPattern) {
    patterns[storyBible.betrayer.name] = storyBible.betrayer.speechPattern;
  }
  if (storyBible.rival.speechPattern) {
    patterns[storyBible.rival.name] = storyBible.rival.speechPattern;
  }
  return patterns;
}

function defaultRegisterForRole(
  role: "heroine" | "betrayer" | "rival",
  storyBible: StoryBible,
): AddressRegister {
  const heroine = storyBible.heroine.name;
  const betrayer = storyBible.betrayer.name;
  const rival = storyBible.rival.name;

  if (role === "heroine") {
    return {
      selfReference: "em",
      toOthers: {
        [betrayer]: { call: "anh", notes: "intimate or respectful male lead" },
        [rival]: { call: "chị", notes: "female rival / senior woman" },
      },
      forbiddenTerms: ["cậu", "tôi"],
      narratorThirdPerson: "cô",
    };
  }

  if (role === "betrayer") {
    return {
      selfReference: "tôi",
      toOthers: {
        [heroine]: { call: "em", notes: "female lead" },
        [rival]: { call: "chị", notes: "female rival" },
      },
      forbiddenTerms: ["anh"],
      narratorThirdPerson: "anh",
    };
  }

  return {
    selfReference: "tôi",
    toOthers: {
      [heroine]: { call: "cô", notes: "female lead" },
      [betrayer]: { call: "anh", notes: "male lead / betrayer" },
    },
    forbiddenTerms: ["em"],
    narratorThirdPerson: "cô",
  };
}

/** Fill missing address registers after bible parse (Vietnamese only). */
export function enrichStoryBibleAddressRegisters(
  storyBible: StoryBible,
  outputLanguage: OutputLanguage,
): StoryBible {
  if (outputLanguage !== "vietnamese") {
    return storyBible;
  }

  const heroineRegister = storyBible.heroine.addressRegister ?? defaultRegisterForRole("heroine", storyBible);
  const betrayerRegister = storyBible.betrayer.addressRegister ?? defaultRegisterForRole("betrayer", storyBible);
  const rivalRegister = storyBible.rival.addressRegister ?? defaultRegisterForRole("rival", storyBible);

  return {
    ...storyBible,
    heroine: { ...storyBible.heroine, addressRegister: heroineRegister },
    betrayer: { ...storyBible.betrayer, addressRegister: betrayerRegister },
    rival: { ...storyBible.rival, addressRegister: rivalRegister },
  };
}

export function renderAddressRegisterBibleInstructions(outputLanguage: OutputLanguage): string[] {
  if (outputLanguage !== "vietnamese") {
    return [];
  }

  return [
    "ADDRESS REGISTER RULE (hard constraint for heroine, betrayer, rival — Vietnamese xưng hô):",
    "Each major character MUST have an `addressRegister` object with:",
    "- `selfReference`: ONE fixed self-reference in dialogue (e.g. 'tôi', 'em', 'anh' for male intimate register).",
    "- `toOthers`: map of other character names → { call: how this character addresses them (e.g. 'anh', 'em', 'cô') }.",
    "- `forbiddenTerms`: terms this character must NEVER use for self-reference or for the mapped targets (e.g. ['cậu', 'anh'] when self is 'tôi').",
    "- `narratorThirdPerson` (optional): third-person narration label (e.g. 'cô', 'anh').",
    "Pick ONE consistent intimacy register per pair. Do not mix 'tôi' and 'anh' self-reference for the same male character.",
    "Do not mix 'anh' and 'cậu' when addressing the same male character unless a deliberate relationship shift is planned and noted in notes.",
    "",
    "SPEECH PATTERN RULE (hard constraint for heroine, betrayer, rival):",
    "Each major character MUST also have a `speechPattern` object with:",
    "- `fillers`: 2-3 verbal tics they use",
    "- `syntaxQuirk`: one syntactic habit",
    "- `vocabularyBand`: one of 'formal' | 'neutral' | 'casual' | 'crude'",
    "- `avoidedPhrases`: 1-3 phrases this character would NEVER say",
  ];
}

export function renderAddressRegisterPromptBlock(
  registers: AddressRegisterMap,
  outputLanguage: OutputLanguage,
  establishedUsage?: EstablishedAddressUsage[],
): string[] {
  if (outputLanguage !== "vietnamese" || Object.keys(registers).length === 0) {
    return [];
  }

  const lines: string[] = [
    "ADDRESS REGISTER (hard lock — Vietnamese xưng hô):",
    "Within this chapter, each character MUST keep the same self-reference and the same way of addressing each other person.",
    "FORBIDDEN in the same chapter without an explicit scene-level relationship shift:",
    "- switching self-reference (e.g. 'Tôi' then 'Anh' for the same speaker)",
    "- switching how one character calls another (e.g. 'anh' then 'cậu' for the same addressee)",
  ];

  for (const [name, register] of Object.entries(registers)) {
    lines.push(`- ${name}:`);
    lines.push(`    self-reference in dialogue: "${register.selfReference}"`);
    if (register.forbiddenTerms.length > 0) {
      lines.push(`    forbidden: ${register.forbiddenTerms.join(", ")}`);
    }
    for (const [target, targetRegister] of Object.entries(register.toOthers)) {
      lines.push(`    calls ${target}: "${targetRegister.call}"`);
    }
    if (register.narratorThirdPerson) {
      lines.push(`    narration third-person: "${register.narratorThirdPerson}"`);
    }
  }

  if (establishedUsage && establishedUsage.length > 0) {
    lines.push("");
    lines.push("Established address usage in prior chapters (do not contradict):");
    for (const usage of establishedUsage) {
      lines.push(`- ${usage.speaker} → ${usage.target}: "${usage.term}" (${usage.count}×)`);
    }
  }

  return lines;
}

export function renderSpeechPatternPromptBlock(storyBible: StoryBible): string[] {
  const lines: string[] = ["SPEECH PATTERNS — each character must use their established voice:"];
  const entries = [
    { name: storyBible.heroine.name, pattern: storyBible.heroine.speechPattern },
    { name: storyBible.betrayer.name, pattern: storyBible.betrayer.speechPattern },
    { name: storyBible.rival.name, pattern: storyBible.rival.speechPattern },
  ];

  let hasPattern = false;
  for (const entry of entries) {
    if (!entry.pattern) continue;
    hasPattern = true;
    lines.push(
      `${entry.name}: fillers=[${entry.pattern.fillers.join(", ")}], quirk="${entry.pattern.syntaxQuirk}", band="${entry.pattern.vocabularyBand}", avoid=[${entry.pattern.avoidedPhrases.join(", ")}]`,
    );
  }

  return hasPattern ? lines : [];
}

export function buildAddressRegisterRepairInstruction(
  violations: Array<{ character: string; kind: string; terms: string[]; expected: string; excerpt: string }>,
  registers: AddressRegisterMap,
): string {
  const lines: string[] = [
    "ADDRESS REGISTER REPAIR INSTRUCTION (Vietnamese xưng hô)",
    "",
    "The following dialogue violates locked address registers. Rewrite ONLY the flagged dialogue lines.",
    "Keep all plot facts, beats, and narration unchanged.",
    "",
  ];

  for (const violation of violations) {
    lines.push(`CHARACTER: ${violation.character}`);
    lines.push(`  Issue: ${violation.kind} — found [${violation.terms.join(", ")}], expected "${violation.expected}"`);
    lines.push(`  Excerpt: "${violation.excerpt}"`);
    const register = registers[violation.character];
    if (register) {
      lines.push(`  Locked self-reference: "${register.selfReference}"`);
      if (register.forbiddenTerms.length > 0) {
        lines.push(`  Forbidden terms: ${register.forbiddenTerms.join(", ")}`);
      }
      for (const [target, targetRegister] of Object.entries(register.toOthers)) {
        lines.push(`  Calls ${target}: "${targetRegister.call}"`);
      }
    }
    lines.push("");
  }

  lines.push("RULES:");
  lines.push("- Use ONE self-reference per character throughout the chapter.");
  lines.push("- Use ONE address term per speaker→listener pair throughout the chapter.");
  lines.push("- Return the full chapter text with corrections applied.");

  return lines.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Scan prior chapter text for established xưng hô usage. */
export function extractEstablishedAddressUsage(
  text: string,
  registers: AddressRegisterMap,
): EstablishedAddressUsage[] {
  const characterNames = Object.keys(registers);
  if (characterNames.length === 0) {
    return [];
  }

  const counts = new Map<string, EstablishedAddressUsage>();
  const attributed = extractAttributedDialogues(text, characterNames);

  for (const { speaker, line } of attributed) {
    const register = registers[speaker];
    if (!register) continue;

    for (const [target, targetRegister] of Object.entries(register.toOthers)) {
      const callPattern = new RegExp(`\\b${escapeRegExp(targetRegister.call)}\\b`, "gi");
      const matches = line.match(callPattern);
      if (!matches) continue;

      const key = `${speaker}::${target}::${normalizeTerm(targetRegister.call)}`;
      const existing = counts.get(key) ?? {
        speaker,
        target,
        term: targetRegister.call,
        count: 0,
      };
      existing.count += matches.length;
      counts.set(key, existing);
    }
  }

  return [...counts.values()].sort((a, b) => b.count - a.count);
}

export function extractAttributedDialogues(
  text: string,
  characterNames: string[],
): Array<{ speaker: string; line: string }> {
  const results: Array<{ speaker: string; line: string }> = [];
  const namePattern = characterNames.map(escapeRegExp).join("|");

  const beforeQuote = new RegExp(
    `(${namePattern})[^\\n.!?]{0,120}?(?:nói|đáp|hỏi|thì thầm|lên tiếng|quay sang|nhìn)[^\\n.!?]{0,40}?[\\u201c"]([^\\u201d"\\n]+)[\\u201d"]`,
    "giu",
  );

  const afterQuote = new RegExp(
    `[\\u201c"]([^\\u201d"\\n]+)[\\u201d"][^\\n.!?]{0,80}?(${namePattern})\\s+(?:nói|đáp|hỏi|thì thầm|lên tiếng)`,
    "giu",
  );

  const colonTag = new RegExp(
    `(${namePattern})\\s*[:：]\\s*[\\u201c"]([^\\u201d"\\n]+)[\\u201d"]`,
    "giu",
  );

  for (const pattern of [beforeQuote, afterQuote, colonTag]) {
    for (const match of text.matchAll(pattern)) {
      if (pattern === afterQuote) {
        results.push({ speaker: match[2], line: match[1] });
      } else {
        results.push({ speaker: match[1], line: match[2] });
      }
    }
  }

  return results;
}

export function detectSelfReferenceInDialogue(line: string, register?: AddressRegister): string[] {
  const found: string[] = [];
  const sentences = line.split(/[.!?…]+/).map((part) => part.trim()).filter(Boolean);
  const allowed = register ? expectedSelfReferenceKeys(register) : null;
  const forbidden = new Set(
    (register?.forbiddenTerms ?? []).map((term) => normalizeTerm(term)),
  );

  for (const sentence of sentences) {
    const match = sentence.match(/^(Tôi|tôi|Anh|anh|Em|em|Chị|chị|Cô|cô)\b/);
    if (!match) continue;

    const term = normalizeTerm(match[1]);
    const key = selfReferenceKey(match[1]);
    if (!key) continue;

    if (!register) {
      found.push(match[1]);
      continue;
    }

    if (allowed?.has(key) || forbidden.has(term)) {
      found.push(match[1]);
    }
  }

  return found;
}

export function expectedSelfReferenceKeys(register: AddressRegister): Set<string> {
  const key = selfReferenceKey(register.selfReference);
  const keys = new Set<string>();
  if (key) {
    keys.add(key);
  }
  for (const forbidden of register.forbiddenTerms) {
    const forbiddenKey = selfReferenceKey(forbidden);
    if (forbiddenKey) {
      keys.delete(forbiddenKey);
    }
  }
  return keys;
}

export { normalizeTerm, selfReferenceKey };
