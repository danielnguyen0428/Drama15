/**
 * Character Consistency Validator — detects character drift by comparing a new
 * chapter against the Story Bible and Character Memory Store.
 *
 * Uses LLM-based analysis at very low temperature (0.1) for maximum accuracy.
 * Produces a structured DriftReport with violation type, severity, excerpt,
 * contradicted fact, and character name.
 *
 * Shared module used by both desktop orchestrator and web API engine.
 */

import type { RouterClient } from "../router/router-client";
import type { StoryBible } from "./pipeline-types";
import type { CharacterMemoryStore } from "./character-memory-store";
import { AUXILIARY_ANALYSIS_MODEL } from "./character-fact-extractor";

export const TEMPERATURE_VALIDATION = 0.1;

export type ViolationType =
  | "name_misspelling"
  | "personality_contradiction"
  | "relationship_violation"
  | "social_position_drift"
  | "emotional_discontinuity"
  | "speech_idiolect"
  | "address_register_drift";

export type ViolationSeverity = "critical" | "warning";

export interface Violation {
  type: ViolationType;
  severity: ViolationSeverity;
  excerpt: string;
  contradictedFact: string;
  characterName: string;
}

export interface DriftReport {
  chapterNumber: number;
  violations: Violation[];
  validatedAt: string;
}

// ─── Prompt Builders ─────────────────────────────────────────────────────────

export function buildValidationSystemPrompt(): string {
  return [
    "You are a Character Consistency Validator for serialized fiction.",
    "Compare the new chapter against the Story Bible and Character Memory Store to detect inconsistencies.",
    "",
    "Check these categories:",
    "1. NAME CONSISTENCY: Misspellings, variations, or name changes.",
    "2. PERSONALITY: Contradictions of established traits (strengths, wounds, blind spots).",
    "3. RELATIONSHIP LOGIC: Interactions contradicting established relationships.",
    "4. SOCIAL POSITION: Acting outside established hierarchy or role.",
    "5. EMOTIONAL CONTINUITY: Abrupt emotional shifts contradicting trajectory.",
    "6. SPEECH IDIOLECT: Using phrases from avoidedPhrases list, or violating vocabularyBand.",
    "7. ADDRESS REGISTER (Vietnamese xưng hô): Inconsistent self-reference (e.g. 'Tôi' then 'Anh' for same speaker) or mixed vocatives (e.g. 'anh' then 'cậu' for same addressee).",
    "",
    "Severity rules:",
    "- CRITICAL: Contradicts Story Bible core facts (names, core traits, established engines) OR address_register_drift.",
    "- WARNING: Contradicts Character Memory Store accumulated state.",
    "- speech_idiolect violations are ALWAYS classified as WARNING.",
    "- address_register_drift violations are ALWAYS classified as CRITICAL when output is Vietnamese.",
    "",
    "Return JSON: { \"violations\": [{ \"type\", \"severity\", \"excerpt\", \"contradictedFact\", \"characterName\" }] }",
    "If no violations: { \"violations\": [] }",
    "Return ONLY valid JSON, no markdown, no explanation.",
  ].join("\n");
}

export function buildValidationUserPrompt(opts: {
  chapterText: string;
  chapterNumber: number;
  storyBible: StoryBible;
  memoryStoreContext: string;
}): string {
  const sections: string[] = [
    `=== CHAPTER ${opts.chapterNumber} (TO VALIDATE) ===`,
    opts.chapterText,
    "=== END CHAPTER ===",
    "",
    "=== STORY BIBLE (Core Reference) ===",
    JSON.stringify(opts.storyBible, null, 2),
    "=== END STORY BIBLE ===",
  ];

  if (opts.memoryStoreContext.length > 0) {
    sections.push(
      "",
      "=== CHARACTER MEMORY STORE (Accumulated State) ===",
      opts.memoryStoreContext,
      "=== END CHARACTER MEMORY STORE ===",
    );
  }

  // Add speech patterns if present
  const speechPatterns: Record<string, unknown> = {};
  if (opts.storyBible.heroine.speechPattern) {
    speechPatterns[opts.storyBible.heroine.name] = opts.storyBible.heroine.speechPattern;
  }
  if (opts.storyBible.betrayer.speechPattern) {
    speechPatterns[opts.storyBible.betrayer.name] = opts.storyBible.betrayer.speechPattern;
  }
  if (opts.storyBible.rival.speechPattern) {
    speechPatterns[opts.storyBible.rival.name] = opts.storyBible.rival.speechPattern;
  }

  if (Object.keys(speechPatterns).length > 0) {
    sections.push(
      "",
      "=== SPEECH PATTERNS (Idiolect Reference) ===",
      JSON.stringify(speechPatterns, null, 2),
      "=== END SPEECH PATTERNS ===",
    );
  }

  const addressRegisters: Record<string, unknown> = {};
  if (opts.storyBible.heroine.addressRegister) {
    addressRegisters[opts.storyBible.heroine.name] = opts.storyBible.heroine.addressRegister;
  }
  if (opts.storyBible.betrayer.addressRegister) {
    addressRegisters[opts.storyBible.betrayer.name] = opts.storyBible.betrayer.addressRegister;
  }
  if (opts.storyBible.rival.addressRegister) {
    addressRegisters[opts.storyBible.rival.name] = opts.storyBible.rival.addressRegister;
  }

  if (Object.keys(addressRegisters).length > 0) {
    sections.push(
      "",
      "=== ADDRESS REGISTERS (Vietnamese xưng hô — hard lock) ===",
      JSON.stringify(addressRegisters, null, 2),
      "=== END ADDRESS REGISTERS ===",
    );
  }

  sections.push(
    "",
    `Validate Chapter ${opts.chapterNumber} for character consistency.`,
    "Return JSON with violations array.",
  );

  return sections.join("\n");
}

// ─── Validation ──────────────────────────────────────────────────────────────

export async function validateConsistency(
  chapterText: string,
  chapterNumber: number,
  storyBible: StoryBible,
  memoryStore: CharacterMemoryStore,
  routerClient: RouterClient,
): Promise<DriftReport> {
  const { memoryStoreToPromptContext } = await import("./character-memory-store");

  const systemPrompt = buildValidationSystemPrompt();
  const memoryContext = memoryStoreToPromptContext(memoryStore);
  const userPrompt = buildValidationUserPrompt({
    chapterText,
    chapterNumber,
    storyBible,
    memoryStoreContext: memoryContext,
  });

  try {
    const result = await routerClient.generateJson<unknown>({
      model: AUXILIARY_ANALYSIS_MODEL,
      systemPrompt,
      userPrompt,
      temperature: TEMPERATURE_VALIDATION,
      timeoutMs: 30_000,
    });

    return parseDriftReport(result.data, chapterNumber);
  } catch {
    // Fail-open: return empty report so pipeline continues
    return createEmptyDriftReport(chapterNumber);
  }
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

export function parseDriftReport(raw: unknown, chapterNumber: number): DriftReport {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;

    if (parsed === null || typeof parsed !== "object" || !("violations" in parsed)) {
      return createEmptyDriftReport(chapterNumber);
    }

    const obj = parsed as Record<string, unknown>;

    if (!Array.isArray(obj.violations)) {
      return createEmptyDriftReport(chapterNumber);
    }

    const validTypes: ViolationType[] = [
      "name_misspelling",
      "personality_contradiction",
      "relationship_violation",
      "social_position_drift",
      "emotional_discontinuity",
      "speech_idiolect",
      "address_register_drift",
    ];
    const validSeverities: ViolationSeverity[] = ["critical", "warning"];

    const violations: Violation[] = [];

    for (const item of obj.violations) {
      if (item === null || typeof item !== "object") continue;

      const v = item as Record<string, unknown>;

      if (
        typeof v.type !== "string" ||
        typeof v.severity !== "string" ||
        typeof v.excerpt !== "string" ||
        typeof v.contradictedFact !== "string" ||
        typeof v.characterName !== "string"
      ) continue;

      if (
        !validTypes.includes(v.type as ViolationType) ||
        !validSeverities.includes(v.severity as ViolationSeverity)
      ) continue;

      violations.push({
        type: v.type as ViolationType,
        severity: v.severity as ViolationSeverity,
        excerpt: v.excerpt,
        contradictedFact: v.contradictedFact,
        characterName: v.characterName,
      });
    }

    return {
      chapterNumber,
      violations,
      validatedAt: new Date().toISOString(),
    };
  } catch {
    return createEmptyDriftReport(chapterNumber);
  }
}

export function classifyViolationSeverity(
  violation: { type: ViolationType; contradictedFact: string },
  storyBibleFacts: string[],
): ViolationSeverity {
  if (violation.type === "address_register_drift") return "critical";
  if (violation.type === "speech_idiolect") return "warning";

  const isStoryBibleFact = storyBibleFacts.some(
    (fact) => fact === violation.contradictedFact,
  );

  return isStoryBibleFact ? "critical" : "warning";
}

export function hasCriticalViolations(report: DriftReport): boolean {
  return report.violations.some((v) => v.severity === "critical");
}

export function createEmptyDriftReport(chapterNumber: number): DriftReport {
  return {
    chapterNumber,
    violations: [],
    validatedAt: new Date().toISOString(),
  };
}

// ─── Idiolect Repair Instructions ────────────────────────────────────────────

export function buildIdiolectRepairInstruction(
  idiolectWarnings: Violation[],
  speechPatterns?: Record<string, { fillers: string[]; syntaxQuirk: string; vocabularyBand: string; avoidedPhrases: string[] }>,
): string {
  const lines: string[] = [
    "IDIOLECT REPAIR INSTRUCTION",
    "",
    "The following dialogue lines violate established character speech patterns.",
    "Rewrite ONLY the flagged dialogue lines to match each character's voice. Keep all plot facts unchanged.",
    "",
  ];

  const byCharacter = new Map<string, Violation[]>();
  for (const w of idiolectWarnings) {
    const existing = byCharacter.get(w.characterName) ?? [];
    existing.push(w);
    byCharacter.set(w.characterName, existing);
  }

  for (const [charName, warnings] of byCharacter) {
    lines.push(`CHARACTER: ${charName}`);
    if (speechPatterns && speechPatterns[charName]) {
      const sp = speechPatterns[charName];
      lines.push(`  Speech patterns:`);
      lines.push(`    Fillers/verbal tics: ${sp.fillers.join(", ")}`);
      lines.push(`    Syntax quirk: ${sp.syntaxQuirk}`);
      lines.push(`    Vocabulary band: ${sp.vocabularyBand}`);
      lines.push(`    Avoided phrases (NEVER use): ${sp.avoidedPhrases.join(", ")}`);
    }
    lines.push(`  Flagged lines:`);
    for (const w of warnings) {
      lines.push(`    - "${w.excerpt}" (violated: ${w.contradictedFact})`);
    }
    lines.push("");
  }

  lines.push("RULES:");
  lines.push("- Rewrite ONLY the flagged dialogue lines above.");
  lines.push("- Each character must use their fillers and syntax quirk naturally.");
  lines.push("- Respect the vocabularyBand — do not shift register.");
  lines.push("- NEVER use any phrase from the avoidedPhrases list.");
  lines.push("- Keep all plot facts, character actions, and narrative beats identical.");
  lines.push("- Return the full chapter text with corrections applied.");

  return lines.join("\n");
}

export function buildAddressRegisterDriftRepairInstruction(
  driftViolations: Violation[],
  addressRegisters?: Record<string, {
    selfReference: string;
    toOthers: Record<string, { call: string; notes?: string }>;
    forbiddenTerms: string[];
    narratorThirdPerson?: string;
  }>,
): string {
  const lines: string[] = [
    "ADDRESS REGISTER DRIFT REPAIR",
    "",
    "Fix Vietnamese xưng hô inconsistencies. Rewrite ONLY affected dialogue.",
    "",
  ];

  for (const violation of driftViolations) {
    lines.push(`CHARACTER: ${violation.characterName}`);
    lines.push(`  Violation: ${violation.excerpt}`);
    lines.push(`  Required: ${violation.contradictedFact}`);
    const register = addressRegisters?.[violation.characterName];
    if (register) {
      lines.push(`  Locked self-reference: "${register.selfReference}"`);
      for (const [target, targetRegister] of Object.entries(register.toOthers)) {
        lines.push(`  Calls ${target}: "${targetRegister.call}"`);
      }
    }
    lines.push("");
  }

  lines.push("Return the full chapter text with corrections applied.");
  return lines.join("\n");
}
