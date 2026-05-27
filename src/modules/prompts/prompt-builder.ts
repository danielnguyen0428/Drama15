/**
 * Unified Prompt Builder — shared between desktop and web.
 *
 * Single source of truth for all stage-specific prompt construction.
 * Eliminates the duplication between desktop story-prompts.ts and
 * web api storyEngine.ts prompt builders.
 */

import type {
  Concept,
  StoryBible,
  ChapterPlanItem,
  NormalizedOutlineRequest,
  OutputLanguage,
  ContinuityLite,
  DraftControls,
} from "../../types/story";
import type { LinePreset, StylePreset } from "../presets/preset-loader";
import type { SeedBlueprint, SeedHistoryEntry } from "./seed-blueprint";
import {
  getDrama15ChapterArchitecture,
  getDrama15ChapterOperationalWordCountRange,
  renderChapterArchitectureForPrompt,
  renderDrama15ArchitectureOverview,
} from "./drama15-chapter-architecture";
import {
  renderTrendAwareSeedEngineForPrompt,
  renderNicheAwareTitleGrammarForPrompt,
} from "./drama15-seed-engine";
import {
  renderRecentSeedHistoryForPrompt,
  renderSeedBlueprintForPrompt,
} from "./seed-blueprint";
import { renderFictionMeReferenceForPrompt } from "./fictionme-reference";
import {
  buildConceptSystemPrompt,
  buildStoryBibleSystemPrompt,
  buildChapterPlanSystemPrompt,
  buildChapterDraftSystemPrompt,
  buildChapterRepairSystemPrompt,
  buildRegenerateChapterSystemPrompt,
  JSON_OUTPUT_GUARD,
} from "./prompt-templates";
import {
  detectAiTells,
  buildAiTellRepairInstructions,
  VIETNAMESE_BANNED_PHRASES,
} from "../core-pipeline/validators/ai-tell-detector";
import {
  buildVarianceRepairInstruction,
  analyzeSentenceVariance,
} from "../core-pipeline/validators/sentence-variance";

const OUTPUT_LANGUAGE_NAMES: Record<OutputLanguage, string> = {
  english: "English",
  vietnamese: "Vietnamese",
  japanese: "Japanese",
  korean: "Korean",
  portuguese: "Portuguese",
  spanish: "Spanish",
};

// ─── Setting Seed Prompt ─────────────────────────────────────────────────────

export function buildSettingSeedPrompt(params: {
  request: NormalizedOutlineRequest;
  linePreset: LinePreset;
  stylePreset: StylePreset;
  seedBlueprint: SeedBlueprint;
  recentSeedHistory: SeedHistoryEntry[];
  recentStoryTitles?: string[];
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = [
    "You are a Setting Seed Generator for commercial short drama.",
    "Create a unique seed blueprint that captures the plot DNA for a new story.",
    "The seed must be specific enough to generate a compelling 10-chapter arc.",
    JSON_OUTPUT_GUARD,
  ].join("\n");

  const userPrompt = [
    `Create a setting seed for a drama in the niche: ${params.request.linePreset}.`,
    `Output language: ${OUTPUT_LANGUAGE_NAMES[params.request.outputLanguage]}.`,
    "",
    renderTrendAwareSeedEngineForPrompt(),
    renderNicheAwareTitleGrammarForPrompt(params.request.linePreset),
    renderRecentSeedHistoryForPrompt(params.recentSeedHistory),
    params.recentStoryTitles && params.recentStoryTitles.length > 0
      ? `Recent story titles — generate something completely different: ${params.recentStoryTitles.slice(0, 20).join(", ")}`
      : "",
    "",
    "Return JSON with keys: linePreset, titleHint, settingDescription.",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ─── Concept Prompt ──────────────────────────────────────────────────────────

export function buildConceptPrompt(params: {
  request: NormalizedOutlineRequest;
  linePreset: LinePreset;
  stylePreset: StylePreset;
  seedBlueprint: SeedBlueprint;
  recentSeedHistory: SeedHistoryEntry[];
  recentStoryTitles?: string[];
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildConceptSystemPrompt();

  const userPrompt = [
    "Create the concept package for a 10-chapter short drama.",
    `Output language: ${OUTPUT_LANGUAGE_NAMES[params.request.outputLanguage]}.`,
    "Return JSON with exactly these keys: title, titleCandidates, logline, promise, conflictEngine.",
    renderNicheAwareTitleGrammarForPrompt(params.request.linePreset),
    "Design the concept so it can sustain the fixed 10-chapter architecture.",
    "The concept must support a concrete foreshadow detail in chapter 2 that can return naturally in chapter 5.",
    "The heroine's core strength must be visible enough to power the chapter 7 internal pivot.",
    "Do not repeat any title, premise shape, or conflict engine from recent stories.",
    "Do NOT name any characters in this stage. Refer to roles only.",
    params.recentStoryTitles && params.recentStoryTitles.length > 0
      ? `Recent story titles — generate something completely different: ${params.recentStoryTitles.slice(0, 20).join(", ")}`
      : "",
    "",
    `Request: ${JSON.stringify({
      niche: params.request.linePreset,
      outputLanguage: params.request.outputLanguage,
      titleHint: params.request.titleHint || undefined,
      settingSeed: params.request.settingSeed,
    })}`,
    "",
    `Seed blueprint (plot DNA): ${renderSeedBlueprintForPrompt(params.seedBlueprint)}`,
    "",
    `Drama 10-chapter architecture: ${renderDrama15ArchitectureOverview()}`,
    params.linePreset
      ? `Line preset (genre-specific rules): ${JSON.stringify(params.linePreset)}`
      : "",
    renderFictionMeReferenceForPrompt(params.request.linePreset) || "",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ─── Story Bible Prompt ──────────────────────────────────────────────────────

export function buildStoryBiblePrompt(params: {
  request: NormalizedOutlineRequest;
  linePreset: LinePreset;
  stylePreset: StylePreset;
  concept: Concept;
  seedBlueprint: SeedBlueprint;
  recentCharacterNames?: string[];
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildStoryBibleSystemPrompt();

  const userPrompt = [
    "Create a story bible for the given short drama concept.",
    `Output language: ${OUTPUT_LANGUAGE_NAMES[params.request.outputLanguage]}.`,
    "Return JSON with exactly these keys:",
    "premise, heroine, betrayer, rival, classHierarchy, betrayalEngine, classShameEngine, revengeEngine, endingMode.",
    "Heroine must include: name, wound, strengths, blindSpots.",
    "Betrayer must include: name, wound, cowardiceVector.",
    "Rival must include: name, socialPower, demeanor.",
    "",
    // Character name diversity rules (shared with desktop)
    "CHARACTER NAME DIVERSITY RULE (hard constraint, applies to heroine, betrayer, rival, AND every supporting character with a name):",
    "1. Use a fresh full name for EVERY named character.",
    "2. Vietnamese full names are 2 or 3 syllables. You MUST diversify ALL positions, not just the given (last) name.",
    "3. BANNED overused given names: Linh, Mai, Lan, Hoa, Ngọc, Anh, Hằng, Huyền, Trang, Phương, Thảo, Yến.",
    "4. BANNED overused middle-name tokens: Minh, Thị, Văn, Hồng, Thanh, Thu, Kim.",
    "5. PREFERRED diverse given-name pool: Tâm, Khuê, Diệp, Trúc, Quyên, Bích, Tuyền, Diễm, Như, Quỳnh, Hiền, Bảo, Châu, Giang, Hương, Lâm, Mỹ, Ngân, Nhung, Phan, Uyên, Vân, Xuân, Chi, Đào, Hà, Huệ, Loan, Ly, Nga, Nhi, Nụ, Quyên, Tâm, Thư, Thúy, Tiên, Trinh, Tươi, Tuyết, Vy.",
    params.recentCharacterNames && params.recentCharacterNames.length > 0
      ? `Recent character names to avoid: ${params.recentCharacterNames.join(", ")}`
      : "",
    "",
    // Speech pattern requirement (Wave 6 idiolect)
    "SPEECH PATTERN RULE (hard constraint for heroine, betrayer, rival):",
    "Each major character (heroine, betrayer, rival) MUST have a `speechPattern` object with:",
    "- `fillers`: 2-3 verbal tics they use",
    "- `syntaxQuirk`: one syntactic habit",
    "- `vocabularyBand`: one of 'formal' | 'neutral' | 'casual' | 'crude'",
    "- `avoidedPhrases`: 1-3 phrases this character would NEVER say",
    "",
    "Strengths must include one concrete behavior-based capability that can be proven in chapter 1 and reactivated in chapter 7.",
    "Betrayal and class shame engines must support: masked threat in chapter 2, reveal without confrontation in chapter 5, no-rescue nadir in chapter 6, and public truth reveal in chapter 9.",
    "",
    `Request: ${JSON.stringify({ niche: params.request.linePreset, outputLanguage: params.request.outputLanguage })}`,
    `Concept: ${JSON.stringify(params.concept)}`,
    `Seed blueprint: ${renderSeedBlueprintForPrompt(params.seedBlueprint)}`,
    params.linePreset
      ? `Line preset: ${JSON.stringify(params.linePreset)}`
      : "",
    params.stylePreset
      ? `Style preset: ${JSON.stringify(params.stylePreset)}`
      : "",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ─── Chapter Plan Prompt ─────────────────────────────────────────────────────

export function buildChapterPlanPrompt(params: {
  request: NormalizedOutlineRequest;
  linePreset: LinePreset;
  stylePreset: StylePreset;
  concept: Concept;
  storyBible: StoryBible;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildChapterPlanSystemPrompt();

  const userPrompt = [
    "Create a 10-chapter plan for the given short drama concept and story bible.",
    `Output language: ${OUTPUT_LANGUAGE_NAMES[params.request.outputLanguage]}.`,
    "Return JSON with a single key 'chapterPlan' containing an array of 10 objects.",
    "Each object must have: chapterNumber, title, hook, mainBeat, humiliationProgression, revengeProgression, endingBeat.",
    "",
    "Architecture requirements:",
    "- Chapter 1: Setup with commercial hook, establish heroine's strength through behavior",
    "- Chapter 2: Foreshadow — plant one concrete detail for chapter 5",
    "- Chapter 3-4: Escalation — deepen conflict, false safety",
    "- Chapter 5: Foreshadow activation — the planted detail returns with new meaning",
    "- Chapter 6: No-rescue nadir — maximum loss, no outside rescue",
    "- Chapter 7: Internal pivot — heroine shifts from reactive to active",
    "- Chapter 8: Strategic buildup — heroines's agency grows",
    "- Chapter 9: Public reveal — truth comes out in concrete, dramatic way",
    "- Chapter 10: Short climax and aftershock — resolve with dignity",
    "",
    `Concept: ${JSON.stringify(params.concept)}`,
    `Story Bible: ${JSON.stringify(params.storyBible)}`,
    params.linePreset
      ? `Line preset: ${JSON.stringify(params.linePreset)}`
      : "",
    params.stylePreset
      ? `Style preset: ${JSON.stringify(params.stylePreset)}`
      : "",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ─── Chapter Draft Prompt ────────────────────────────────────────────────────

export function buildChapterDraftPrompt(params: {
  storyTitle: string;
  storyBible: StoryBible;
  chapterPlanItem: ChapterPlanItem;
  previousChapterSummaries: string[];
  continuityLite?: ContinuityLite;
  draftControls?: DraftControls;
  outputLanguage?: OutputLanguage;
  stylePreset?: StylePreset;
  linePreset?: LinePreset;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildChapterDraftSystemPrompt();

  const outputLang = params.outputLanguage ?? "english";
  const chapterArch = getDrama15ChapterArchitecture(params.chapterPlanItem.chapterNumber);
  const wordRange = chapterArch ? getDrama15ChapterOperationalWordCountRange(chapterArch.chapterNumber) : [1500, 3000];
  const dialogueFloor = chapterArch?.dialogueRatio ?? params.draftControls?.dialogueRatio ?? 0.45;
  const chapterArchText = chapterArch ? renderChapterArchitectureForPrompt(chapterArch.chapterNumber) : "";

  const userPrompt = [
    `Write Chapter ${params.chapterPlanItem.chapterNumber} of "${params.storyTitle}".`,
    `Output language: ${OUTPUT_LANGUAGE_NAMES[outputLang]}.`,
    "",
    `Chapter plan: ${JSON.stringify(params.chapterPlanItem)}`,
    chapterArchText ? `Chapter architecture: ${chapterArchText}` : "",
    wordRange ? `Target word range: ${wordRange[0]}-${wordRange[1]} words.` : "",
    `Minimum dialogue ratio: ${(dialogueFloor * 100).toFixed(0)}%.`,
    "",
    // Previous chapter context
    params.previousChapterSummaries.length > 0
      ? `Previous chapter summaries:\n${params.previousChapterSummaries.join("\n")}`
      : "",
    "",
    // Continuity context (enhanced)
    params.continuityLite
      ? `Continuity context: ${JSON.stringify(params.continuityLite)}`
      : "",
    "",
    // AI-tell ban list (shared between desktop and web)
    "AVOID these AI-cliché phrases:",
    ...Object.values(VIETNAMESE_BANNED_PHRASES).flat().slice(0, 20).map((p) => `- ${p}`),
    "",
    // Speech pattern enforcement
    "SPEECH PATTERNS — each character must use their established voice:",
    params.storyBible.heroine.speechPattern
      ? `${params.storyBible.heroine.name}: fillers=[${params.storyBible.heroine.speechPattern.fillers.join(", ")}], quirk="${params.storyBible.heroine.speechPattern.syntaxQuirk}", band="${params.storyBible.heroine.speechPattern.vocabularyBand}"`
      : "",
    params.storyBible.betrayer.speechPattern
      ? `${params.storyBible.betrayer.name}: fillers=[${params.storyBible.betrayer.speechPattern.fillers.join(", ")}], quirk="${params.storyBible.betrayer.speechPattern.syntaxQuirk}", band="${params.storyBible.betrayer.speechPattern.vocabularyBand}"`
      : "",
    params.storyBible.rival.speechPattern
      ? `${params.storyBible.rival.name}: fillers=[${params.storyBible.rival.speechPattern.fillers.join(", ")}], quirk="${params.storyBible.rival.speechPattern.syntaxQuirk}", band="${params.storyBible.rival.speechPattern.vocabularyBand}"`
      : "",
    "",
    "Return JSON with keys: chapterNumber, title, summary, text.",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ─── Chapter Repair Prompt ───────────────────────────────────────────────────

export function buildChapterRepairPrompt(params: {
  previousDraft: string;
  failures: string[];
  draftControls?: DraftControls;
  chapterPlanItem?: ChapterPlanItem;
  repairAttempt: number;
  maxRepairAttempts: number;
  previousMetrics: {
    wordCount: number;
    dialogueRatio: number;
  };
  aiTellScore?: number;
  sentenceVarianceCv?: number;
  phraseReuseScore?: number;
  driftViolations?: Array<{ type: string; character: string; excerpt: string; description: string }>;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildChapterRepairSystemPrompt();

  const failureInstructions: string[] = [];

  // Map each failure type to a specific repair instruction
  for (const failure of params.failures) {
    if (failure.includes("dialogue ratio")) {
      const targetDialogueRatio = params.draftControls?.dialogueRatio ?? 0.55;
      failureInstructions.push(
        `DIALOGUE REPAIR: Current dialogue ratio is ${(params.previousMetrics.dialogueRatio * 100).toFixed(0)}%. ` +
        `Target is ${(targetDialogueRatio * 100).toFixed(0)}%. ` +
        `Convert some narration into character dialogue while preserving plot beats.`
      );
    }
    if (failure.includes("AI-tell")) {
      const aiTellReport = detectAiTells(params.previousDraft);
      failureInstructions.push(buildAiTellRepairInstructions(aiTellReport));
    }
    if (failure.includes("sentence variance")) {
      const variance = analyzeSentenceVariance(params.previousDraft);
      failureInstructions.push(buildVarianceRepairInstruction(variance));
    }
    if (failure.includes("phrase reuse")) {
      failureInstructions.push(
        "PHRASE REUSE REPAIR: Replace repeated trigram phrases with fresh expressions. " +
        "Keep all plot facts, character names, and dialogue meaning identical."
      );
    }
    if (failure.includes("word count")) {
      failureInstructions.push(
        `WORD COUNT REPAIR: Expand scene descriptions and internal beats. ` +
        `Do NOT add padding — add concrete sensory details and character interactions.`
      );
    }
  }

  // Add consistency violation instructions if present
  if (params.driftViolations && params.driftViolations.length > 0) {
    failureInstructions.push(
      "CHARACTER CONSISTENCY REPAIR:",
      ...params.driftViolations.map((v) =>
        `  - ${v.character}: ${v.description} (violated: ${v.type}). ` +
        `Rewrite the flagged text to match established character traits.`
      )
    );
  }

  const userPrompt = [
    `Repair attempt ${params.repairAttempt} of ${params.maxRepairAttempts}.`,
    `Previous draft word count: ${params.previousMetrics.wordCount}.`,
    `Previous draft dialogue ratio: ${(params.previousMetrics.dialogueRatio * 100).toFixed(0)}%.`,
    "",
    "=== PREVIOUS DRAFT ===",
    params.previousDraft,
    "=== END PREVIOUS DRAFT ===",
    "",
    "Failures to repair:",
    ...failureInstructions,
    "",
    "RULES:",
    "- Address ONLY the failures listed above.",
    "- Do NOT change plot facts, character names, or story progression.",
    "- Return the full repaired chapter text.",
    `This is attempt ${params.repairAttempt} of ${params.maxRepairAttempts}.`,
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}

// ─── Regenerate Chapter Prompt ───────────────────────────────────────────────

export function buildRegenerateChapterPrompt(params: {
  storyTitle: string;
  storyBible: StoryBible;
  chapterPlanItem: ChapterPlanItem;
  previousChapterSummaries: string[];
  previousDraft?: string;
  preserveConstraints?: {
    names?: string[];
    mainReveal?: string;
    endingMode?: string;
  };
  continuityLite?: ContinuityLite;
  outputLanguage?: OutputLanguage;
  regenerationMode?: string;
}): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = buildRegenerateChapterSystemPrompt();

  const outputLang = params.outputLanguage ?? "english";

  const userPrompt = [
    `Rewrite Chapter ${params.chapterPlanItem.chapterNumber} of "${params.storyTitle}".`,
    `Output language: ${OUTPUT_LANGUAGE_NAMES[outputLang]}.`,
    "",
    `Chapter plan: ${JSON.stringify(params.chapterPlanItem)}`,
    "",
    params.previousChapterSummaries.length > 0
      ? `Previous chapter summaries:\n${params.previousChapterSummaries.join("\n")}`
      : "",
    "",
    params.previousDraft
      ? `=== PREVIOUS DRAFT (rewrite this chapter, keeping its core) ===\n${params.previousDraft}\n=== END PREVIOUS DRAFT ===`
      : "",
    "",
    // Preservation constraints
    params.preserveConstraints?.names && params.preserveConstraints.names.length > 0
      ? `DO NOT change these character names: ${params.preserveConstraints.names.join(", ")}`
      : "",
    params.preserveConstraints?.mainReveal
      ? `DO NOT change the main reveal: ${params.preserveConstraints.mainReveal}`
      : "",
    params.preserveConstraints?.endingMode
      ? `DO NOT change the ending mode: ${params.preserveConstraints.endingMode}`
      : "",
    "",
    params.continuityLite
      ? `Continuity context: ${JSON.stringify(params.continuityLite)}`
      : "",
    "",
    params.regenerationMode
      ? `Regeneration mode: ${params.regenerationMode} — focus on improving this aspect while keeping everything else stable.`
      : "",
    "",
    "Return JSON with keys: chapterNumber, title, summary, text.",
  ].filter(Boolean).join("\n");

  return { systemPrompt, userPrompt };
}
