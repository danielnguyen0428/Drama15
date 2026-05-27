import assert from "node:assert/strict";
import test from "node:test";

import { StoryOrchestrator, type StoryProgressEvent } from "../../src/modules/orchestrator/story-orchestrator";
import type { LinePreset, ModelPreset, StylePreset } from "../../src/modules/presets/preset-loader";
import type { ChapterPlanItem, GenerateChapterRequest, StoryBible } from "../../src/types/story";

const linePresetFixture: LinePreset = {
  id: "betrayal_romance_revenge_class_shame",
  displayName: "H. Betrayal romance + revenge + class shame",
  description: "Commercial humiliation and comeback arc.",
  tropeWeights: {
    betrayal: 1,
    revenge: 1,
    class_shame: 1,
  },
  chapterArcDefaults: {
    hookStyle: "sharp",
    shameEscalationStart: 4,
    revengeActivationChapter: 10,
    dignityRecoveryChapter: 14,
  },
  humiliationPacing: ["polite exclusion", "public misrecognition"],
  revengeActivation: ["strategic withdrawal", "status reversal"],
  dignityRecoveryTiming: "late",
  constraints: {
    fixedChapterCount: 10,
    minWordsPerChapter: 800,
    maxWordsPerChapter: 3000,
  },
};

const stylePresetFixture: StylePreset = {
  id: "wharton_class_shame_elegance",
  displayName: "Edith Wharton - class shame elegance",
  description: "Tight hooks and emotionally direct scenes.",
  emotionalDirectness: "high",
  hookSharpness: "high",
  dialogueRatioTarget: 0.6,
  melodramaLevel: "controlled_high",
  notes: ["scene-first", "social detail", "high readability"],
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

function makeChapterPlan(): ChapterPlanItem[] {
  return Array.from({ length: 10 }, (_, index) => ({
    chapterNumber: index + 1,
    title: index === 6 ? "The Wrong Table" : `Chapter ${index + 1}`,
    hook: `Hook ${index + 1}`,
    mainBeat: `Main beat ${index + 1}`,
    humiliationProgression: `Humiliation ${index + 1}`,
    revengeProgression: `Revenge ${index + 1}`,
    endingBeat: `Ending ${index + 1}`,
  }));
}

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
  public lastUserPrompt = "";

  async generateJson<T>(params: { userPrompt: string }) {
    this.lastUserPrompt = params.userPrompt;

    return {
      data: {
        chapter: {
          chapterNumber: 7,
          title: "A Generated Title That Drifted",
          summary: "Mina is publicly displaced at the gala.",
          text: Array.from({ length: 220 }, (_, index) =>
            index % 2 === 0
              ? "\"You moved my seat without telling me,\" Mina said."
              : "The donors kept watching from the next table while Evan let the silence stand.",
          ).join(" "),
        },
      } as T,
      modelUsed: "drafter-model",
    };
  }
}

test("generateChapter treats request.storyTitle as story title while progress detail uses the chapter title", async () => {
  const routerClient = new FakeRouterClient();
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );
  const chapterPlan = makeChapterPlan();
  const progressEvents: StoryProgressEvent[] = [];
  const request: GenerateChapterRequest = {
    storyTitle: "The Glass Reception",
    outputLanguage: "vietnamese",
    storyBible: storyBibleFixture,
    chapterPlan,
    chapterNumber: 7,
    previousChapterSummaries: ["Mina handled the gala setup while Evan stayed publicly vague."],
  };

  const chapter = await orchestrator.generateChapter(
    request,
    "wharton_class_shame_elegance",
    undefined,
    undefined,
    {
      onProgress: (event) => progressEvents.push(event),
    },
  );

  const draftEvent = progressEvents.find((event) => event.stageId === "draft-chapter" && event.status === "started");
  assert.ok(draftEvent);
  assert.equal(chapter.title, "The Wrong Table");
  assert.equal(draftEvent.detail, 'Đang viết "The Wrong Table".');
  assert.match(routerClient.lastUserPrompt, /Story title:/);
  assert.match(routerClient.lastUserPrompt, /"title": "The Glass Reception"/);
  assert.match(routerClient.lastUserPrompt, /Target chapter plan item:/);
  assert.match(routerClient.lastUserPrompt, /"title": "The Wrong Table"/);
  assert.match(routerClient.lastUserPrompt, /Write the chapter title, summary, and full prose in Vietnamese\./);
});
