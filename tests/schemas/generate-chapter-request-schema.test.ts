import assert from "node:assert/strict";
import test from "node:test";

import { DraftControlsSchema, GeneratedSettingSeedSchema, GenerateChapterRequestSchema } from "../../src/schemas/story";

const storyBibleFixture = {
  premise: "A woman is erased from the future she helped build.",
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

const chapterPlanFixture = Array.from({ length: 10 }, (_, index) => ({
  chapterNumber: index + 1,
  title: `Chapter ${index + 1}`,
  hook: `Hook ${index + 1}`,
  mainBeat: `Main beat ${index + 1}`,
  humiliationProgression: `Humiliation ${index + 1}`,
  revengeProgression: `Revenge ${index + 1}`,
  endingBeat: `Ending ${index + 1}`,
}));

test("GenerateChapterRequestSchema normalizes legacy title into storyTitle", () => {
  const parsed = GenerateChapterRequestSchema.parse({
    title: "The Glass Reception",
    storyBible: storyBibleFixture,
    chapterPlan: chapterPlanFixture,
    chapterNumber: 4,
  });

  assert.equal(parsed.storyTitle, "The Glass Reception");
  assert.ok(!("title" in parsed));
});

test("GenerateChapterRequestSchema rejects conflicting storyTitle and legacy title values", () => {
  assert.throws(
    () =>
      GenerateChapterRequestSchema.parse({
        title: "Legacy Title",
        storyTitle: "Canonical Title",
        storyBible: storyBibleFixture,
        chapterPlan: chapterPlanFixture,
        chapterNumber: 4,
      }),
    /storyTitle and title must match when both are provided\./,
  );
});

test("GenerateChapterRequestSchema preserves continuation style and continuity context", () => {
  const continuityLite = {
    heroineName: "Mina Hart",
    betrayerName: "Evan Vale",
    rivalName: "Celeste Rowan",
    coreReveal: "Mina owns the emergency voting rights.",
    endingMode: "dignity before reunion",
    chapterState: [
      {
        chapter: 6,
        heroineAgency: 48,
        emotionalTemperature: "controlled humiliation",
      },
    ],
  };
  const parsed = GenerateChapterRequestSchema.parse({
    storyTitle: "Fake Wife Of A Billionaire",
    storyBible: storyBibleFixture,
    chapterPlan: chapterPlanFixture,
    chapterNumber: 7,
    stylePreset: "billionaire_rich_poor_romance__tiktok_hook_pacing",
    continuityLite,
  });

  assert.equal(parsed.stylePreset, "billionaire_rich_poor_romance__tiktok_hook_pacing");
  assert.deepEqual(parsed.continuityLite, {
    ...continuityLite,
    speechPatterns: {},
  });
});

test("DraftControlsSchema does not inject deprecated chapter word target", () => {
  const parsed = DraftControlsSchema.parse({});

  assert.equal("targetWordsPerChapter" in parsed, false);
  assert.equal(parsed.dialogueRatio, 0.55);
  assert.equal(parsed.hookDensity, "high");
});

test("DraftControlsSchema accepts legacy chapter targets and rejects oversized targets", () => {
  assert.equal(
    DraftControlsSchema.parse({
      targetWordsPerChapter: 2500,
      dialogueRatio: 0.55,
      hookDensity: "high",
    }).targetWordsPerChapter,
    2500,
  );

  assert.throws(
    () =>
      DraftControlsSchema.parse({
        targetWordsPerChapter: 3001,
        dialogueRatio: 0.55,
        hookDensity: "high",
      }),
    /Too big|less than or equal to 3000/i,
  );
});

test("GeneratedSettingSeedSchema accepts complete form drafting controls", () => {
  const parsed = GeneratedSettingSeedSchema.parse({
    titleHint: "The Seat They Moved",
    linePreset: "secret_identity_hidden_heiress",
    settingSeed: Array.from({ length: 18 }, () => "A polished hotel gala hides a public replacement scheme.").join(" "),
    storyControls: {
      betrayalType: "public replacement at a family-backed gala",
      shameType: "polite seating exclusion by class-coded etiquette",
      revengeMode: "quiet withdrawal followed by status reversal",
      endingMode: "dignity first with no reunion",
      intensity: 0.86,
    },
    draftControls: {
      dialogueRatio: 0.58,
      hookDensity: "high",
    },
  });

  assert.equal(parsed.linePreset, "secret_identity_hidden_heiress");
  assert.equal("stylePreset" in parsed, false);
  assert.equal(parsed.draftControls.dialogueRatio, 0.58);
  assert.equal(parsed.draftControls.hookDensity, "high");
});
