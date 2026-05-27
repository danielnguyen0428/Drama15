import assert from "node:assert/strict";
import test from "node:test";

import { StoryOrchestrator } from "../../src/modules/orchestrator/story-orchestrator";
import type { LinePreset, ModelPreset, StylePreset } from "../../src/modules/presets/preset-loader";
import type { SeedHistoryEntry } from "../../src/modules/prompts/seed-blueprint";
import type { NormalizedOutlineRequest } from "../../src/types/story";

const linePresetFixture: LinePreset = {
  id: "billionaire_rich_poor_romance",
  displayName: "Niche 1: Billionaire / Rich-Poor Romance",
  description: "Rich-poor class gap.",
  tropeWeights: {
    billionaire_romance: 1,
  },
  chapterArcDefaults: {
    hookStyle: "visible class gap",
    shameEscalationStart: 2,
    revengeActivationChapter: 9,
    dignityRecoveryChapter: 12,
  },
  humiliationPacing: ["rich family rejects poor bride"],
  revengeActivation: ["poor bride proves value"],
  dignityRecoveryTiming: "late",
  constraints: {
    fixedChapterCount: 10,
    minWordsPerChapter: 800,
    maxWordsPerChapter: 3000,
  },
};

const stylePresetFixture: StylePreset = {
  id: "billionaire_rich_poor_romance__tiktok_hook_pacing",
  displayName: "Billionaire - TikTok hook pacing",
  description: "Fast hook rhythm.",
  emotionalDirectness: "high",
  hookSharpness: "very high",
  dialogueRatioTarget: 0.55,
  melodramaLevel: "viral but controlled",
  notes: ["short scenes"],
};

const modelPresetFixture: ModelPreset = {
  planner: "planner-model",
  bible: "bible-model",
  drafter: "drafter-model",
  rewriter: "rewriter-model",
  fallback: "fallback-model",
};

const requestFixture: NormalizedOutlineRequest = {
  titleHint: "Poor Girl Marries A Billionaire",
  linePreset: "billionaire_rich_poor_romance",
  stylePreset: "billionaire_rich_poor_romance__tiktok_hook_pacing",
  outputLanguage: "english",
  audience: {
    genderFocus: "female",
    ageBand: "18_34",
    market: "global",
  },
  storyControls: {
    betrayalType: "rich family rejects the poor bride",
    shameType: "class shame through hospital donor etiquette",
    revengeMode: "the poor bride proves hidden value",
    endingMode: "love after public respect",
    intensity: 0.84,
  },
  settingSeed: "private hospital donor wing",
  chapterCount: 10,
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
  public lastUserPrompt = "";

  async generateJson<T>(params: { userPrompt: string }) {
    if (params.userPrompt.includes("Post-process humanizer pass")) {
      return {
        data: { text: extractOriginalPostProcessText(params.userPrompt) } as T,
        modelUsed: "post-process-model",
      };
    }

    this.lastUserPrompt = params.userPrompt;

    return {
      data: {
        seedPackage: {
          titleHint: "Hospital Contract Bride",
          linePreset: "billionaire_rich_poor_romance",
          settingSeed:
            "In a private hospital donor wing, a poor contract bride is treated as a temporary inconvenience by the billionaire family, while her unpaid care records and visitor logs prove she quietly protected the person their fortune depends on.",
          storyControls: {
            betrayalType: "the billionaire hides behind family approval when she is humiliated in the donor wing",
            shameType: "hospital donor etiquette makes her look like hired help beside his family",
            revengeMode: "visitor logs and care records reveal she held the family together",
            endingMode: "romance continues only after public respect is paid",
            intensity: 0.84,
          },
          draftControls: {
            dialogueRatio: 0.55,
            hookDensity: "high",
          },
        },
      } as T,
      modelUsed: "planner-model",
    };
  }
}

function extractOriginalPostProcessText(userPrompt: string) {
  const marker = "Original text:";
  const markerIndex = userPrompt.indexOf(marker);
  if (markerIndex === -1) {
    return "";
  }

  try {
    const parsed = JSON.parse(userPrompt.slice(markerIndex + marker.length).trim()) as { text?: unknown };
    return typeof parsed.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

class FakeSeedHistoryStore {
  public appended: SeedHistoryEntry[] = [];

  async load(): Promise<SeedHistoryEntry[]> {
    return [
      {
        fingerprint: "old-fingerprint",
        linePreset: "billionaire_rich_poor_romance",
        titleHint: "Old Seed",
        createdAt: "2026-05-02T00:00:00.000Z",
      },
    ];
  }

  async append(entry: SeedHistoryEntry) {
    this.appended.push(entry);
    return [entry];
  }
}

test("generateSettingSeed injects app blueprint, includes recent history, and records generated seed", async () => {
  const routerClient = new FakeRouterClient();
  const seedHistoryStore = new FakeSeedHistoryStore();
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as never,
    routerClient as never,
    "default",
    seedHistoryStore,
  );

  const result = await orchestrator.generateSettingSeed(requestFixture);

  assert.match(routerClient.lastUserPrompt, /Seed blueprint selected by app/);
  assert.match(routerClient.lastUserPrompt, /Recent seed fingerprints to avoid/);
  assert.match(routerClient.lastUserPrompt, /Old Seed/);
  assert.equal(seedHistoryStore.appended.length, 1);
  assert.equal(seedHistoryStore.appended[0]?.titleHint, "Hospital Contract Bride");
  assert.equal(seedHistoryStore.appended[0]?.linePreset, "billionaire_rich_poor_romance");
  assert.ok(seedHistoryStore.appended[0]?.blueprint);
  assert.equal(result.meta.seedFingerprint, seedHistoryStore.appended[0]?.fingerprint);
});

test("generateSettingSeed routes custom workplace medical and school niches into matching seed banks", async () => {
  const cases = [
    {
      customNiche: "Office CEO layoff revenge after a stolen startup pitch",
      expectedBlueprintPreset: "workplace_ceo_power_struggle",
    },
    {
      customNiche: "Hidden doctor saves patient after hospital triage abuse",
      expectedBlueprintPreset: "medical_hidden_doctor_life_care",
    },
    {
      customNiche: "Campus scholarship student bullied by donor classmates",
      expectedBlueprintPreset: "school_campus_bullying_identity",
    },
  ];

  for (const scenario of cases) {
    const routerClient = new FakeRouterClient();
    const orchestrator = new StoryOrchestrator(
      new FakePresetLoader() as never,
      routerClient as never,
      "default",
      new FakeSeedHistoryStore(),
    );

    await orchestrator.generateSettingSeed({
      ...requestFixture,
      customCreativeInputs: {
        dramaBranch: scenario.customNiche,
      },
    });

    assert.match(routerClient.lastUserPrompt, new RegExp(`"linePreset": "${scenario.expectedBlueprintPreset}"`));
    assert.match(routerClient.lastUserPrompt, new RegExp(scenario.expectedBlueprintPreset));
  }
});
