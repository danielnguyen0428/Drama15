import assert from "node:assert/strict";
import test from "node:test";

import { StoryOrchestrator } from "../../src/modules/orchestrator/story-orchestrator";
import { getLocalProsePolishConfig } from "../../src/modules/presets/prose-polish-config";
import type { LinePreset, ModelPreset, StylePreset } from "../../src/modules/presets/preset-loader";
import type { ChapterPlanItem, GenerateChapterRequest, StoryBible } from "../../src/types/story";

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

const modelPresetFixture: ModelPreset = {
  planner: "planner-model",
  bible: "bible-model",
  drafter: "drafter-model",
  rewriter: "rewriter-model",
  fallback: "fallback-model",
};

const storyBibleFixture: StoryBible = {
  premise: "A hotel founder's daughter is erased from the public future she built.",
  heroine: {
    name: "Mina Hart",
    wound: "She mistakes endurance for security.",
    strengths: ["observant", "competent"],
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

class FakePresetLoader {
  async loadLinePreset() {
    return linePresetFixture;
  }

  async loadStylePreset() {
    return stylePresetFixture;
  }

  async loadModelPreset() {
    return modelPresetFixture;
  }
}

class FakeRouterClient {
  public calls: Array<{ userPrompt: string }> = [];

  async generateJson<T>(params: { userPrompt: string }) {
    this.calls.push({ userPrompt: params.userPrompt });

    return {
      data: {
        chapter: {
          chapterNumber: 1,
          title: "Chapter 1",
          summary: "summary",
          text: Array.from({ length: 240 }, () => "\"Yes one two three four\" five six seven eight nine").join(" "),
        },
      } as T,
      modelUsed: "drafter-model",
    };
  }
}

function makeChapterPlan(): ChapterPlanItem[] {
  return Array.from({ length: 10 }, (_, index) => ({
    chapterNumber: index + 1,
    title: `Chapter ${index + 1}`,
    hook: `Hook ${index + 1}`,
    mainBeat: `Main beat ${index + 1}`,
    humiliationProgression: `Humiliation ${index + 1}`,
    revengeProgression: `Revenge ${index + 1}`,
    endingBeat: `Ending ${index + 1}`,
  }));
}

function makeRequest(): GenerateChapterRequest {
  return {
    storyTitle: "The Glass Reception",
    outputLanguage: "english",
    storyBible: storyBibleFixture,
    chapterPlan: makeChapterPlan(),
    chapterNumber: 1,
    previousChapterSummaries: [],
    draftControls: {
      targetWordsPerChapter: 1200,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
  };
}

test("generateChapter injects local humanizer prose polish rules into the draft prompt", async () => {
  const routerClient = new FakeRouterClient();
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as never,
    routerClient as never,
    "default-models",
    undefined,
    undefined,
    getLocalProsePolishConfig(),
  );

  await orchestrator.generateChapter(makeRequest());

  assert.equal(routerClient.calls.length, 1);
  assert.match(routerClient.calls[0]?.userPrompt ?? "", /Humanizer \/ prose polish pass/);
  assert.match(routerClient.calls[0]?.userPrompt ?? "", /Preserve plot facts, character names, chapter number, continuity/);
  assert.match(routerClient.calls[0]?.userPrompt ?? "", /Remove common AI tells/);
});
