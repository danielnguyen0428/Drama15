import assert from "node:assert/strict";
import test from "node:test";

import {
  buildChapterRepairPrompt,
  buildChapterDraftPrompt,
  buildChapterPlanPrompt,
  buildConceptPrompt,
  buildRegenerateChapterPrompt,
  buildSettingSeedPrompt,
  buildStoryBiblePrompt,
} from "../../src/modules/prompts/story-prompts";
import { createSeedBlueprint } from "../../src/modules/prompts/seed-blueprint";
import type {
  ChapterPlanItem,
  Concept,
  ContinuityLite,
  DraftControls,
  NormalizedOutlineRequest,
  PreserveConstraints,
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
    betrayalType: "public_replacement",
    shameType: "polite_class_exclusion",
    revengeMode: "strategic_withdrawal_status_reversal",
    endingMode: "bittersweet_dignity_first",
    intensity: 0.84,
  },
  settingSeed: "Old-money hotel empire and startup gala circuit.",
  chapterCount: 10,
};

const nineChapterRequestFixture: NormalizedOutlineRequest = {
  ...requestFixture,
  chapterCount: 9,
};

const linePresetFixture: LinePreset = {
  id: "billionaire_rich_poor_romance",
  displayName: "Niche 1: Billionaire / Rich-Poor Romance",
  description: "Chênh lệch giai cấp, cô gái nghèo gặp người giàu, gia đình nhà giàu phản đối.",
  tropeWeights: {
    billionaire_romance: 1,
    rich_poor_gap: 1,
    class_shame: 1,
  },
  chapterArcDefaults: {
    hookStyle: "sharp",
    shameEscalationStart: 4,
    revengeActivationChapter: 10,
    dignityRecoveryChapter: 14,
  },
  humiliationPacing: ["rich family rejects the poor bride", "contract marriage pressure"],
  revengeActivation: ["poor bride proves hidden value", "billionaire chooses her publicly"],
  dignityRecoveryTiming: "late",
  constraints: {
    fixedChapterCount: 10,
    minWordsPerChapter: 800,
    maxWordsPerChapter: 3000,
  },
};

const stylePresetFixture: StylePreset = {
  id: "billionaire_rich_poor_romance__tiktok_hook_pacing",
  displayName: "Billionaire Rich Poor Romance - TikTok hook pacing",
  description: "Fast hook, visible wound, high readability, and chapter-end addiction.",
  emotionalDirectness: "high",
  hookSharpness: "high",
  dialogueRatioTarget: 0.6,
  melodramaLevel: "controlled_high",
  notes: ["scene-first", "social detail", "high readability"],
};

const storyBibleFixture: StoryBible = {
  premise: "A hotel founder's daughter is erased from the public future she built.",
  heroine: {
    name: "Mina Hart",
    wound: "She mistakes endurance for security.",
    strengths: ["observant", "competent", "graceful under pressure"],
    blindSpots: ["stays loyal too long"],
  },
  betrayer: {
    name: "Evan Vale",
    wound: "He fears losing status once he has it.",
    cowardiceVector: "He protects his image before the woman who built him.",
  },
  rival: {
    name: "Celeste Rowan",
    socialPower: "Old-money legitimacy and board influence.",
    demeanor: "polished and quietly dismissive",
  },
  classHierarchy: ["hotel dynasty", "investor circle", "service staff shadows"],
  betrayalEngine: "He hides Mina and presents Celeste as the acceptable future.",
  classShameEngine: "Mina is always useful in private and misplaced in public.",
  revengeEngine: "Mina withdraws her competence and returns with independent leverage.",
  endingMode: "bittersweet_dignity_first",
};

const conceptFixture: Concept = {
  title: "The Glass Reception",
  titleCandidates: ["The Glass Reception", "Reserved in Public"],
  logline: "A woman erased from her own future learns how expensive polite exclusion can become.",
  promise: "Public humiliation turns into a strategic dignity comeback.",
  conflictEngine: "The heroine built the hero's rise, but class pressure makes him replace her in daylight.",
};

const chapterPlanItemFixture: ChapterPlanItem = {
  chapterNumber: 7,
  title: "The Wrong Table",
  hook: "Mina learns her seat card was quietly moved to the staff annex.",
  mainBeat: "She endures the gala insult while Celeste occupies the official place beside Evan.",
  humiliationProgression: "Her invisibility becomes public protocol.",
  revengeProgression: "She notices who truly depends on her work.",
  endingBeat: "She leaves before Evan can explain.",
};

const draftControlsFixture: DraftControls = {
  targetWordsPerChapter: 2500,
  dialogueRatio: 0.6,
  hookDensity: "high",
};

const continuityLiteFixture: ContinuityLite = {
  heroineName: "Mina Hart",
  betrayerName: "Evan Vale",
  rivalName: "Celeste Rowan",
  coreReveal: "Mina built the investor deck Evan is taking public.",
  endingMode: "bittersweet_dignity_first",
  chapterState: [],
};

const preserveConstraintsFixture: PreserveConstraints = {
  preserveNames: true,
  preserveMainReveal: true,
  preserveEndingMode: true,
};

test("buildConceptPrompt composes the vendored system prompt with concept instructions", () => {
  const prompt = buildConceptPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.systemPrompt, /specialized fiction-generation engine/);
  assert.match(prompt.systemPrompt, /Output strict JSON only/);
  assert.match(prompt.systemPrompt, /Generate only the concept package requested by the user prompt\./);
  assert.match(prompt.userPrompt, /Create the concept package for a 10-chapter short drama\./);
});

test("buildConceptPrompt derives chapter count from the request", () => {
  const prompt = buildConceptPrompt({
    request: nineChapterRequestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Create the concept package for a 9-chapter short drama\./);
  assert.doesNotMatch(prompt.userPrompt, /10-chapter short drama/);
});

test("buildSettingSeedPrompt asks AI to generate a complete settings form package", () => {
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Generate a complete story settings package for the desktop form\./);
  assert.match(prompt.userPrompt, /seedPackage must include: titleHint, linePreset, settingSeed, storyControls, draftControls\./);
  assert.match(prompt.userPrompt, /linePreset must be one of the twelve configured Niche ids/);
  assert.match(prompt.userPrompt, /Poor Girl Marries A Billionaire/);
  assert.match(prompt.userPrompt, /He Mocked The Delivery Girl, Then Discovered She Owned The Company/);
  assert.match(prompt.userPrompt, /Contract Wife For The CEO Heir/);
  assert.match(prompt.userPrompt, /Hiding Twins From The Ruthless Billionaire/);
  assert.match(prompt.userPrompt, /After Divorce She Bought His Company/);
  assert.match(prompt.userPrompt, /One Night With The Wrong CEO/);
  assert.match(prompt.userPrompt, /Intern Became The CEO/);
  assert.match(prompt.userPrompt, /Hidden Surgeon Saved The Patient/);
  assert.match(prompt.userPrompt, /Scholarship Girl Owned The School/);
  assert.match(prompt.userPrompt, /Rejected Luna Returned Under A Blood Moon/);
  assert.match(prompt.userPrompt, /Alien Commander Claimed The Captive Who Defied Him/);
  assert.match(prompt.userPrompt, /Viral Video Cleared The Woman They Shamed/);
  assert.match(prompt.userPrompt, /Lost Heiress Worked The Hotel Night Shift/);
  assert.match(prompt.userPrompt, /Mother-In-Law Hid The Custody Papers/);
  assert.match(prompt.userPrompt, /Mistress Took The Bride's Name/);
  assert.match(prompt.userPrompt, /Single Mom Won The Custody Hearing/);
  assert.match(prompt.userPrompt, /Restaurant Refused The Owner In A Wheelchair/);
  assert.match(prompt.userPrompt, /Hostile Board Needed The Fired Assistant/);
  assert.match(prompt.userPrompt, /Hidden Surgeon Exposed The VIP Cover Up/);
  assert.match(prompt.userPrompt, /Scholarship Girl Beat The Rich Clique/);
  assert.match(prompt.userPrompt, /Rejected Omega Became The Luna/);
  assert.match(prompt.userPrompt, /Alien Emperor Signed Her Freedom/);
  assert.match(prompt.userPrompt, /draftControls must include: dialogueRatio, hookDensity\./);
  assert.match(prompt.userPrompt, /Fill title, niche, setting seed, hidden story config, and drafting controls/);
  assert.match(prompt.userPrompt, /titleHint must be newly generated for the chosen Niche/);
  assert.match(prompt.userPrompt, /Do not reuse the incoming request titleHint/);
  assert.match(prompt.userPrompt, /Create a high-CTR webnovel title for a ROMANCE short drama about love across class lines/);
  assert.match(prompt.userPrompt, /titleHint must follow the selected outputLanguage/);
  assert.match(prompt.userPrompt, /ROMANTIC TENSION/);
  assert.match(prompt.userPrompt, /LOVE STORY/);
  assert.match(prompt.userPrompt, /For billionaire_rich_poor_romance, titleHint must center the rich-poor love story/);
  assert.match(prompt.userPrompt, /He Chose The Poor Bride In Front Of His Family/);
  assert.match(prompt.userPrompt, /Cinderella Of The Charity Gala/);
  assert.match(prompt.userPrompt, /For workplace_ceo_power_struggle, titleHint must use first-person webnovel viral format with corporate-power reversal/);
  assert.match(prompt.userPrompt, /Hidden Heiress Signed As His Secretary/);
  assert.match(prompt.userPrompt, /Pregnant Secretary Refused The CEO's Buyout/);
  assert.match(prompt.userPrompt, /After Divorce She Bought His Company/);
  assert.match(prompt.userPrompt, /topicAnchor/);
  assert.match(prompt.userPrompt, /at least 30 hot motif anchors per Niche/);
  assert.match(prompt.userPrompt, /Do not default back to fake wife or contract marriage/);
  assert.doesNotMatch(prompt.userPrompt, /Keep the selected drama branch, style preset/);
  assert.doesNotMatch(prompt.userPrompt, /targetWordsPerChapter/);
});

test("buildSettingSeedPrompt treats a custom niche as the active creative branch", () => {
  const customNicheRequest: NormalizedOutlineRequest = {
    ...requestFixture,
    customCreativeInputs: {
      dramaBranch: "Workplace Layoff Revenge / Corporate Betrayal",
    },
  };
  const prompt = buildSettingSeedPrompt({
    request: customNicheRequest,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Custom Niche lock/);
  assert.match(prompt.userPrompt, /Workplace Layoff Revenge \/ Corporate Betrayal/);
  assert.match(prompt.userPrompt, /seedPackage\.linePreset must equal the custom Niche text exactly/);
  assert.match(prompt.userPrompt, /Use the configured Line preset only as routing fallback/);
  assert.doesNotMatch(prompt.userPrompt, /linePreset must be one of the twelve configured Niche ids/);
});

test("buildSettingSeedPrompt injects trend-aware seed quality controls", () => {
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Trend-aware seed engine/);
  assert.match(prompt.userPrompt, /Market signal pack/);
  assert.match(prompt.userPrompt, /short-form vertical drama/);
  assert.match(prompt.userPrompt, /Social pain bank/);
  assert.match(prompt.userPrompt, /care labor/);
  assert.match(prompt.userPrompt, /inheritance paperwork/);
  assert.match(prompt.userPrompt, /restaurant accessibility/);
  assert.match(prompt.userPrompt, /Internal seed quality gate/);
  assert.match(prompt.userPrompt, /Viral hook score/);
  assert.match(prompt.userPrompt, /Originality distance/);
});

test("buildSettingSeedPrompt requires concrete seed atoms before filling the form", () => {
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /viralPremise/);
  assert.match(prompt.userPrompt, /socialWound/);
  assert.match(prompt.userPrompt, /humiliationScene/);
  assert.match(prompt.userPrompt, /hiddenLeverage/);
  assert.match(prompt.userPrompt, /betrayerPressure/);
  assert.match(prompt.userPrompt, /publicRevealPotential/);
  assert.match(prompt.userPrompt, /originalityGuard/);
  assert.match(prompt.userPrompt, /Do not output these seed atoms as separate JSON keys/);
});

test("buildSettingSeedPrompt injects app-selected seed blueprint and recent history", () => {
  const seedBlueprint = createSeedBlueprint({
    linePreset: requestFixture.linePreset,
    random: () => 0,
  });
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
    seedBlueprint,
    recentSeedHistory: [
      {
        fingerprint: seedBlueprint.fingerprint,
        linePreset: seedBlueprint.linePreset,
        titleHint: "Poor Bride Contract",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ],
  });

  assert.match(prompt.userPrompt, /Seed blueprint selected by app/);
  assert.match(prompt.userPrompt, /Recent seed fingerprints to avoid/);
  assert.match(prompt.userPrompt, new RegExp(seedBlueprint.arena.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(prompt.userPrompt, /Poor Bride Contract/);
  assert.match(prompt.userPrompt, /Do not replace this blueprint with a generic/);
});

test("buildSettingSeedPrompt tells AI to honor expanded context instead of defaulting to hospital or wedding", () => {
  const seedBlueprint = createSeedBlueprint({
    linePreset: requestFixture.linePreset,
    random: () => 0,
  });
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
    seedBlueprint,
  });

  assert.match(prompt.userPrompt, /arena/);
  assert.match(prompt.userPrompt, /publicRevealVenue/);
  assert.match(prompt.userPrompt, /Do not default to hospital/i);
  assert.match(prompt.userPrompt, /wedding/i);
  assert.match(prompt.userPrompt, /gala/i);
});

test("buildSettingSeedPrompt blocks repeated skeletons inside the same niche", () => {
  const seedBlueprint = createSeedBlueprint({
    linePreset: requestFixture.linePreset,
    random: () => 0,
  });
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
    seedBlueprint,
    recentSeedHistory: [
      {
        fingerprint: seedBlueprint.fingerprint,
        linePreset: seedBlueprint.linePreset,
        titleHint: "Poor Bride Contract",
        createdAt: "2026-05-02T00:00:00.000Z",
        blueprint: seedBlueprint,
      },
    ],
  });

  assert.match(prompt.userPrompt, /relationshipDynamic/);
  assert.match(prompt.userPrompt, /protagonistAgency/);
  assert.match(prompt.userPrompt, /revealMechanism/);
  assert.match(prompt.userPrompt, /endingShape/);
  assert.match(prompt.userPrompt, /Do not reuse the same story skeleton/i);
  assert.match(prompt.userPrompt, /five different axes: pressure engine, arena, humiliation method, leverage object, and reveal venue/i);
});

test("buildSettingSeedPrompt keeps generated titles in output-language webnovel grammar", () => {
  const prompt = buildSettingSeedPrompt({
    request: {
      ...requestFixture,
      outputLanguage: "vietnamese",
    },
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Write all human-readable JSON values in Vietnamese/);
  assert.match(prompt.userPrompt, /Create a high-CTR webnovel title for a ROMANCE short drama about love across class lines/);
  assert.match(prompt.userPrompt, /titleHint must follow the selected outputLanguage/);
  assert.match(prompt.userPrompt, /ROMANTIC TENSION/);
  assert.match(prompt.userPrompt, /LOVE STORY/);
  assert.match(prompt.userPrompt, /Do not force titleHint into English unless outputLanguage is English/);
  assert.match(prompt.userPrompt, /STRONG Vietnamese ROMANCE title examples/);
  assert.match(prompt.userPrompt, /STRONG English ROMANCE title examples/);
  assert.match(prompt.userPrompt, /He Chose The Poor Bride In Front Of His Family/);
});

test("buildStoryBiblePrompt composes the vendored system prompt with bible instructions", () => {
  const prompt = buildStoryBiblePrompt({
    request: requestFixture,
    concept: conceptFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.systemPrompt, /Generate only the story bible requested by the user prompt\./);
  assert.match(prompt.userPrompt, /Return JSON with exactly these keys:/);
  assert.match(prompt.userPrompt, /classShameEngine, revengeEngine, endingMode\./);
});

test("buildChapterPlanPrompt derives chapter count from the request", () => {
  const prompt = buildChapterPlanPrompt({
    request: nineChapterRequestFixture,
    concept: conceptFixture,
    storyBible: storyBibleFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.systemPrompt, /Generate only the chapter plan requested by the user prompt\./);
  assert.match(prompt.userPrompt, /Create a 9-chapter plan for this short drama\./);
  assert.match(prompt.userPrompt, /chapterPlan containing an array of 9 objects\./);
  assert.doesNotMatch(prompt.userPrompt, /array of 10 objects/);
});

test("buildChapterPlanPrompt injects the fixed 10-chapter architecture map", () => {
  const prompt = buildChapterPlanPrompt({
    request: requestFixture,
    concept: conceptFixture,
    storyBible: storyBibleFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Chapter 2 must plant a concrete foreshadow detail/);
  assert.match(prompt.userPrompt, /Ch\.5 betrayal_reveal_foreshadow_activation:/);
  assert.match(prompt.userPrompt, /Ch\.9 public_trap_confrontation:/);
  assert.match(prompt.userPrompt, /Ch\.10 climax_aftershock_new_equilibrium:/);
});

test("buildChapterDraftPrompt composes the vendored system prompt with draft instructions", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: chapterPlanItemFixture,
    previousChapterSummaries: [
      "Mina helped secure the gala while Evan avoided publicly naming her role.",
      "Celeste began appearing in places Mina used to stand.",
    ],
    continuityLite: continuityLiteFixture,
    draftControls: draftControlsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.systemPrompt, /class shame must show up through scenes/i);
  assert.match(prompt.systemPrompt, /Honor target length and dialogue-density controls/);
  assert.match(prompt.userPrompt, /Write the chapter title, summary, and full prose in English\./);
  assert.match(prompt.userPrompt, /Target chapter architecture:/);
  assert.match(prompt.userPrompt, /Chapter 7 architecture: internal_pivot_private_choice \(pivot\)\./);
  assert.match(prompt.userPrompt, /quiet aftermath after the nadir/);
  assert.match(prompt.userPrompt, /she makes one private irreversible choice/);
  assert.match(prompt.userPrompt, /Prose profile: quiet, precise interior clarity translated into one concrete action/);
  assert.match(prompt.userPrompt, /Intensity 0\.68: allow longer setup sentences, sensory grounding, and calmer scene rhythm/);
  assert.match(prompt.userPrompt, /Hook execution: curiosity ending; end on a specific odd detail, not an explained mystery/);
  assert.match(prompt.userPrompt, /Dialogue execution: target 42% quoted speech; include action beats and silence as part of dialogue/);
  assert.match(prompt.userPrompt, /No quoted speech turn over 80 words/);
  assert.match(prompt.userPrompt, /Target length: 2300-2600 words\./);
  assert.match(prompt.userPrompt, /Operational target: 2300-2600 words so the draft lands safely inside the allowed range\./);
  assert.match(prompt.userPrompt, /Dialogue target: \d+-\d+% of the words in quoted speech\./);
  assert.match(prompt.userPrompt, /Minimum quoted-dialogue floor: \d+% of total words, but aim above that floor\./);
  assert.match(prompt.userPrompt, /If you reach the ending beat early, stop instead of extending aftermath\./);
  assert.doesNotMatch(prompt.userPrompt, /Quality acceptance window/);
  assert.doesNotMatch(prompt.userPrompt, /Quality ceiling/);
  assert.match(prompt.userPrompt, /Use smart dialogue quotation marks \(U\+201C and U\+201D\) for spoken dialogue inside chapter text\./);
  assert.doesNotMatch(prompt.userPrompt, /Use only straight double quotes for spoken dialogue\./);
  assert.match(prompt.userPrompt, /Do not use banned empty drama phrases such as "her heart clenched" or "the world collapsed"\./);
  assert.match(prompt.userPrompt, /Use 4-7 scenes and about 32-60 paragraphs total for this long chapter target\./);
  assert.match(prompt.userPrompt, /Follow the chapter architecture target; build enough scene turns to land near 2400 words while staying inside 2300-2600 words\./);
  assert.match(prompt.userPrompt, /Do not run more than two narration-only paragraphs in a row when dialogue target is high\./);
  assert.match(prompt.userPrompt, /Story title:/);
  assert.match(prompt.userPrompt, /"title": "The Glass Reception"/);
});

test("buildChapterDraftPrompt keeps internal architecture tags out of user-visible summary instructions", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: {
      ...chapterPlanItemFixture,
      chapterNumber: 10,
      title: "The First Win",
    },
    previousChapterSummaries: [],
    continuityLite: continuityLiteFixture,
    draftControls: draftControlsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Return JSON with exactly these keys: chapterNumber, title, summary, text\./);
  assert.doesNotMatch(prompt.userPrompt, /Summary memory tags|FIRST_WIN|PRESSURE_RELEASE|PROTAGONIST_STATE_END|CLOSING_LINE/);
  assert.doesNotMatch(prompt.userPrompt, /The summary must preserve any important architecture memory tags/);
});

test("buildChapterDraftPrompt carries chapter 10 as a short new equilibrium target", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: {
      ...chapterPlanItemFixture,
      chapterNumber: 10,
      title: "A Name She Keeps",
      endingBeat: "Mina leaves with her own name intact.",
    },
    previousChapterSummaries: ["ANTAGONIST_EXPOSED_TRUE: Evan was exposed in public."],
    continuityLite: continuityLiteFixture,
    draftControls: draftControlsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Chapter 10 architecture: climax_aftershock_new_equilibrium/);
  assert.match(prompt.userPrompt, /Target length: 1700-2000 words\./);
  assert.doesNotMatch(prompt.userPrompt, /Hard ceiling/);
  assert.match(prompt.userPrompt, /leave a clean new equilibrium/);
});

test("buildChapterDraftPrompt carries prompt-template prose locks for pivotal chapters", () => {
  const makePrompt = (chapterNumber: number, title: string) =>
    buildChapterDraftPrompt({
      storyTitle: "The Glass Reception",
      storyBible: storyBibleFixture,
      chapterPlanItem: {
        ...chapterPlanItemFixture,
        chapterNumber,
        title,
      },
      previousChapterSummaries: [],
      continuityLite: continuityLiteFixture,
      draftControls: draftControlsFixture,
      outputLanguage: "english",
      stylePreset: stylePresetFixture,
    }).userPrompt;

  assert.match(makePrompt(1, "The Lobby Opens"), /Template style lock: chapter 1 opens in-scene with niche pressure already active; no character biography, no encyclopedic worldbuilding\./);
  assert.match(makePrompt(5, "The Signed Page"), /Template style lock: chapter 5 activates the chapter 2 detail and reveals designed betrayal without full revenge or a villain monologue\./);
  assert.match(makePrompt(7, "The Empty Room"), /Template style lock: chapter 7 is quiet pivot; the heroine makes a private irreversible choice and recovers one usable truth or tool\./);
  assert.match(makePrompt(9, "The Table Turns"), /Template style lock: chapter 9 is the public trap; evidence, timing, and rules expose the decisive truth while emotional outcome stays unfinished\./);
  assert.match(makePrompt(6, "The Room Reads"), /Template style lock: chapter 6 is the no-rescue nadir; survival is allowed, victory is not\./);
  assert.match(makePrompt(10, "A Name She Keeps"), /Template style lock: chapter 10 is a short aftershock under 2,000 words; no new plot thread, no second climax, and agency stays with the heroine\./);
});

test("buildChapterDraftPrompt uses chapter 1 architecture target without conflicting 2500-word guidance", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: {
      ...chapterPlanItemFixture,
      chapterNumber: 1,
      title: "The Lobby Opens",
      endingBeat: "Mina notices a reserved elevator key no guest admits owning.",
    },
    previousChapterSummaries: [],
    continuityLite: continuityLiteFixture,
    draftControls: draftControlsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Chapter 1 architecture: commercial_hook_world_entry/);
  assert.match(prompt.userPrompt, /Target length: 2300-2600 words\./);
  assert.match(prompt.userPrompt, /Operational target: 2300-2600 words/);
  assert.doesNotMatch(prompt.userPrompt, /Hard ceiling/);
  assert.match(prompt.userPrompt, /land near 2400 words/);
});

test("buildChapterDraftPrompt ignores legacy targetWordsPerChapter and uses chapter architecture length", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: {
      ...chapterPlanItemFixture,
      chapterNumber: 7,
      title: "The Nadir",
      endingBeat: "Mina leaves with no rescue in sight.",
    },
    previousChapterSummaries: [],
    continuityLite: continuityLiteFixture,
    draftControls: {
      ...draftControlsFixture,
      targetWordsPerChapter: 1200,
    },
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Chapter 7 architecture: internal_pivot_private_choice/);
  assert.match(prompt.userPrompt, /Target length: 2300-2600 words\./);
  assert.match(prompt.userPrompt, /Operational target: 2300-2600 words/);
  assert.doesNotMatch(prompt.userPrompt, /Quality acceptance window/);
  assert.doesNotMatch(prompt.userPrompt, /Quality ceiling/);
  assert.doesNotMatch(prompt.userPrompt, /1200/);
  assert.doesNotMatch(prompt.userPrompt, /1020-1320 words/);
});

test("buildChapterDraftPrompt uses architecture dialogue ratio without global-control conflict", () => {
  const prompt = buildChapterDraftPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: {
      ...chapterPlanItemFixture,
      chapterNumber: 8,
      title: "The Empty Room",
      endingBeat: "Mina unlocks the archive cabinet herself.",
    },
    previousChapterSummaries: ["MAX_LOSS_EVENT: Mina lost the gala account and left alone."],
    continuityLite: continuityLiteFixture,
    draftControls: {
      ...draftControlsFixture,
      dialogueRatio: 0.65,
    },
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Dialogue execution: target 55% quoted speech/);
  assert.match(prompt.userPrompt, /Dialogue target: 45-65% of the words in quoted speech\./);
  assert.match(prompt.userPrompt, /Minimum quoted-dialogue floor: 28% of total words, but aim above that floor\./);
  assert.doesNotMatch(prompt.userPrompt, /35-75% of the words in quoted speech/);
});

test("buildChapterDraftPrompt omits story title when unavailable", () => {
  const prompt = buildChapterDraftPrompt({
    storyBible: storyBibleFixture,
    chapterPlanItem: chapterPlanItemFixture,
    previousChapterSummaries: [],
    continuityLite: continuityLiteFixture,
    draftControls: draftControlsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.doesNotMatch(prompt.userPrompt, /Story title:/);
  assert.match(prompt.userPrompt, /Target chapter plan item:/);
  assert.match(prompt.userPrompt, /"title": "The Wrong Table"/);
});

test("buildRegenerateChapterPrompt composes the vendored system prompt with rewrite instructions", () => {
  const prompt = buildRegenerateChapterPrompt({
    storyTitle: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlanItem: chapterPlanItemFixture,
    currentChapter: {
      chapterNumber: 7,
      title: "The Wrong Table",
      summary: "Mina is publicly displaced at the gala.",
      text: "Mina watched the usher glance at her name tag and then at Celeste's smile.",
    },
    continuityLite: continuityLiteFixture,
    instruction: "Sharpen the humiliation beat without changing the outcome.",
    mode: "rewrite_class_shame",
    preserveConstraints: preserveConstraintsFixture,
    outputLanguage: "english",
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.systemPrompt, /Revise only the target chapter requested by the user prompt\./);
  assert.match(prompt.userPrompt, /Revision mode: rewrite_class_shame\./);
  assert.match(prompt.userPrompt, /Instruction: Sharpen the humiliation beat without changing the outcome\./);
  assert.match(prompt.userPrompt, /Preserve constraints:/);
  assert.match(prompt.userPrompt, /Chapter 7 architecture: internal_pivot_private_choice/);
});

test("buildConceptPrompt respects the configured output language", () => {
  const prompt = buildConceptPrompt({
    request: {
      ...requestFixture,
      outputLanguage: "japanese",
    },
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /Write all human-readable JSON values in Japanese\./);
});

test("buildConceptPrompt preserves output-language viral title grammar when titleHint uses it", () => {
  const prompt = buildConceptPrompt({
    request: {
      ...requestFixture,
      titleHint: "Vợ Giả Của Tỷ Phú",
      outputLanguage: "vietnamese",
    },
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
  });

  assert.match(prompt.userPrompt, /For title and titleCandidates, follow request\.outputLanguage/);
  assert.match(prompt.userPrompt, /If request\.titleHint is already strong, keep it and generate 4 diverse alternatives/);
  assert.match(prompt.userPrompt, /Keep titles compact; put longer explanation into logline, promise, or conflictEngine/);
});

test("buildChapterRepairPrompt repairs dialogue without length-gate instructions", () => {
  const prompt = buildChapterRepairPrompt({
    previousDraft: "Mina stood too long in the ballroom while repeating the same thought.",
    failures: [
      "word count drifted outside the allowed chapter range",
      "dialogue ratio is materially below the requested target",
    ],
    draftControls: draftControlsFixture,
    chapterPlanItem: chapterPlanItemFixture,
    previousMetrics: {
      wordCount: 3200,
      dialogueRatio: 0.26,
    },
  });

  assert.match(prompt, /Current draft metrics: 3200 words and 26% quoted speech\./);
  assert.match(prompt, /Reference length target: 2300-2600 words\./);
  assert.match(prompt, /Operational rewrite target: 2300-2600 words\./);
  assert.doesNotMatch(prompt, /Cut at least/);
  assert.doesNotMatch(prompt, /quality acceptance window/);
  assert.match(prompt, /Chapter 7 architecture: internal_pivot_private_choice/);
  assert.match(prompt, /Minimum quoted-dialogue floor: 21% of total words\./);
  assert.match(prompt, /Replace narration with at least 20 more words of quoted dialogue while keeping the total length inside range\./);
  assert.match(prompt, /Use smart dialogue quotation marks \(U\+201C and U\+201D\) for spoken dialogue inside chapter text\./);
  assert.doesNotMatch(prompt, /Use only straight double quotes for spoken dialogue\./);
  assert.match(prompt, /Keep the rewrite to 4-7 scenes and roughly 32-60 paragraphs total for this long chapter target\./);
  assert.doesNotMatch(prompt, /If both length and dialogue failed/);
  assert.match(prompt, /Do not add new beats, extra aftermath, or explanatory recap beyond what the chapter plan already requires\./);
  assert.match(prompt, /End on or within one short beat after: She leaves before Evan can explain\./);
});

test("buildSettingSeedPrompt injects recent story titles as diversity lock", () => {
  const seedBlueprint = createSeedBlueprint({
    linePreset: requestFixture.linePreset,
    random: () => 0,
  });
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
    seedBlueprint,
    recentStoryTitles: ["Hiding Twins From The CEO", "Contract Wife Returns", "Poor Maid Saves Billionaire"],
  });

  assert.match(prompt.userPrompt, /Recent story titles to avoid/);
  assert.match(prompt.userPrompt, /Hiding Twins From The CEO/);
  assert.match(prompt.userPrompt, /Contract Wife Returns/);
});

test("buildSettingSeedPrompt omits story titles block when list is empty", () => {
  const seedBlueprint = createSeedBlueprint({
    linePreset: requestFixture.linePreset,
    random: () => 0,
  });
  const prompt = buildSettingSeedPrompt({
    request: requestFixture,
    linePreset: linePresetFixture,
    stylePreset: stylePresetFixture,
    seedBlueprint,
    recentStoryTitles: [],
  });

  assert.doesNotMatch(prompt.userPrompt, /Recent story titles to avoid/);
});
