import assert from "node:assert/strict";
import test from "node:test";

import { getLocalProsePolishConfig } from "../../src/modules/presets/prose-polish-config";
import { buildChapterDraftPrompt, buildSettingSeedPrompt } from "../../src/modules/prompts/story-prompts";
import type {
  ChapterPlanItem,
  ContinuityLite,
  DraftControls,
  NormalizedOutlineRequest,
  StoryBible,
} from "../../src/types/story";
import type { LinePreset, StylePreset } from "../../src/modules/presets/preset-loader";

const requestFixture: NormalizedOutlineRequest = {
  titleHint: "The Glass Reception",
  linePreset: "billionaire_rich_poor_romance",
  stylePreset: "billionaire_rich_poor_romance__tiktok_hook_pacing",
  outputLanguage: "english",
  audience: {
    genderFocus: "female",
    ageBand: "18_34",
    market: "global",
  },
  storyControls: {
    betrayalType: "public replacement",
    shameType: "polite class exclusion",
    revengeMode: "strategic withdrawal",
    endingMode: "dignity first",
    intensity: 0.84,
  },
  settingSeed: "Old-money hotel empire and startup gala circuit.",
  chapterCount: 10,
};

const linePresetFixture: LinePreset = {
  id: "billionaire_rich_poor_romance",
  displayName: "Niche 1: Billionaire / Rich-Poor Romance",
  description: "Rich-poor class romance.",
  tropeWeights: {
    billionaire_romance: 1,
  },
  chapterArcDefaults: {
    hookStyle: "sharp",
    shameEscalationStart: 2,
    revengeActivationChapter: 8,
    dignityRecoveryChapter: 10,
  },
  humiliationPacing: ["family dinner class shame"],
  revengeActivation: ["public choice"],
  dignityRecoveryTiming: "late",
  constraints: {
    fixedChapterCount: 10,
    minWordsPerChapter: 800,
    maxWordsPerChapter: 3000,
  },
};

const stylePresetFixture: StylePreset = {
  id: "billionaire_rich_poor_romance__tiktok_hook_pacing",
  displayName: "Billionaire hook pacing",
  description: "Fast hook, direct emotion.",
  emotionalDirectness: "high",
  hookSharpness: "high",
  dialogueRatioTarget: 0.55,
  melodramaLevel: "controlled_high",
  notes: ["scene-first"],
};

const storyBibleFixture: StoryBible = {
  premise: "A hotel founder's daughter is erased from the public future she built.",
  heroine: {
    name: "Mina Hart",
    wound: "She mistakes endurance for security.",
    strengths: ["observant"],
    blindSpots: ["stays loyal too long"],
  },
  betrayer: {
    name: "Evan Vale",
    wound: "He fears losing status once he has it.",
    cowardiceVector: "He protects his image before Mina.",
  },
  rival: {
    name: "Celeste Rowan",
    socialPower: "Old-money legitimacy.",
    demeanor: "polished and dismissive",
  },
  classHierarchy: ["hotel dynasty"],
  betrayalEngine: "He hides Mina and presents Celeste as the acceptable future.",
  classShameEngine: "Mina is useful in private and misplaced in public.",
  revengeEngine: "Mina withdraws her competence and returns with leverage.",
  endingMode: "dignity_first",
};

const chapterPlanItemFixture: ChapterPlanItem = {
  chapterNumber: 7,
  title: "The Wrong Table",
  hook: "Mina learns her seat card was moved.",
  mainBeat: "She endures the gala insult.",
  humiliationProgression: "Her invisibility becomes protocol.",
  revengeProgression: "She notices who depends on her work.",
  endingBeat: "She leaves before Evan can explain.",
};

const continuityLiteFixture: ContinuityLite = {
  heroineName: "Mina Hart",
  betrayerName: "Evan Vale",
  rivalName: "Celeste Rowan",
  coreReveal: "Mina built the investor deck.",
  endingMode: "dignity_first",
  chapterState: [],
};

const draftControlsFixture: DraftControls = {
  targetWordsPerChapter: 2500,
  dialogueRatio: 0.6,
  hookDensity: "high",
};

test("buildSettingSeedPrompt can inject local humanizer prose polish rules", () => {
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
    prosePolishConfig: getLocalProsePolishConfig(),
  });

  assert.match(prompt.userPrompt, /Humanizer \/ prose polish pass/);
  assert.match(prompt.userPrompt, /Make prose sound written by a person/);
  assert.match(prompt.userPrompt, /Preserve plot facts, character names/);
  assert.match(prompt.userPrompt, /Do not add new plot beats/);
});

test("buildChapterDraftPrompt can inject local humanizer prose polish rules", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: chapterPlanItemFixture,
    previousChapterSummaries: [],
    continuityLite: continuityLiteFixture,
    draftControls: draftControlsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
    prosePolishConfig: getLocalProsePolishConfig(),
  });

  assert.match(prompt.userPrompt, /Humanizer \/ prose polish pass/);
  assert.match(prompt.userPrompt, /Remove common AI tells/);
  assert.match(prompt.userPrompt, /Preserve plot facts, character names, chapter number, continuity/);
  assert.match(prompt.userPrompt, /Do not add new plot beats/);
});
