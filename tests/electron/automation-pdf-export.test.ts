import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { createAutomationPdfFilePath } from "../../src/electron/automation-pdf-export";
import type { StoryPayload } from "../../src/types/story";

function createStoryPayload(title: string, generatedAt: string): StoryPayload {
  return {
    title,
    request: {
      titleHint: title,
      linePreset: "workplace_ceo_power_struggle",
      stylePreset: "workplace_ceo_power_struggle__tiktok_hook_pacing",
      outputLanguage: "english",
      audience: {
        genderFocus: "female",
        ageBand: "18_34",
        market: "global",
      },
      storyControls: {
        betrayalType: "stolen pitch",
        shameType: "office humiliation",
        revengeMode: "audit reveal",
        endingMode: "career restitution",
        intensity: 0.84,
      },
      settingSeed: "Office seed",
      chapterCount: 10,
      draftControls: {
        dialogueRatio: 0.55,
        hookDensity: "high",
      },
    },
    concept: {
      title,
      titleCandidates: [title],
      logline: "A fired assistant proves the pitch was hers.",
      promise: "Career humiliation turns into boardroom justice.",
      conflictEngine: "Her work was stolen by the boss who fired her.",
    },
    storyBible: {
      premise: "Office betrayal.",
      heroine: {
        name: "Mina",
        wound: "She stayed silent too long.",
        strengths: ["records everything"],
        blindSpots: ["trusts HR"],
      },
      betrayer: {
        name: "Evan",
        wound: "He fears losing status.",
        cowardiceVector: "He steals credit.",
      },
      rival: {
        name: "Clara",
        socialPower: "Board access.",
        demeanor: "polished",
      },
      classHierarchy: ["board", "CEO", "contractor"],
      betrayalEngine: "Credit theft.",
      classShameEngine: "Badge shame.",
      revengeEngine: "Audit trail.",
      endingMode: "career restitution",
    },
    chapterPlan: [],
    chapters: [
      {
        chapterNumber: 1,
        title: "The Pitch",
        summary: "Mina is fired.",
        text: "Mina watched the board open her stolen deck.",
      },
    ],
    continuityLite: {
      heroineName: "Mina",
      betrayerName: "Evan",
      rivalName: "Clara",
      coreReveal: "The deck metadata names Mina.",
      endingMode: "career restitution",
      chapterState: [],
    },
    meta: {
      generatedAt,
      modelAliases: {
        planner: "cx/gpt-5.5",
        bible: "cx/gpt-5.5",
        drafter: "cx/gpt-5.5",
        rewriter: "cx/gpt-5.5",
        fallback: "cx/gpt-5.5",
      },
    },
  };
}

test("createAutomationPdfFilePath uses configured directory, slug title, and generated timestamp", () => {
  const outputDirectory = path.join("D:", "Drama15", "PDF");
  const story = createStoryPayload("The CEO Walked Into HR!", "2026-05-05T12:34:56.000Z");

  const filePath = createAutomationPdfFilePath(story, outputDirectory);

  assert.equal(filePath, path.resolve(outputDirectory, "the-ceo-walked-into-hr-20260505123456.pdf"));
});
