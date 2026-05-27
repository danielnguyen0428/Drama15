import assert from "node:assert/strict";
import test from "node:test";

import { StoryOrchestrator, type StoryProgressEvent } from "../../src/modules/orchestrator/story-orchestrator";
import type { LinePreset, ModelPreset, StylePreset } from "../../src/modules/presets/preset-loader";
import type {
  ChapterPlanItem,
  GenerateChapterRequest,
  NormalizedFullGenerateRequest,
  StoryBible,
  StoryPayload,
} from "../../src/types/story";

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
    title: index === 0 ? "Chapter 1" : `Chapter ${index + 1}`,
    hook: `Hook ${index + 1}`,
    mainBeat: `Main beat ${index + 1}`,
    humiliationProgression: `Humiliation ${index + 1}`,
    revengeProgression: `Revenge ${index + 1}`,
    endingBeat: `Ending ${index + 1}`,
  }));
}

function makeRequest(): GenerateChapterRequest {
  return {
    storyTitle: "The Girl He Never Named",
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
  public calls: Array<{ userPrompt: string; systemPrompt?: string; timeoutMs?: number }> = [];

  constructor(private readonly responses: Array<{ data: unknown; modelUsed: string }>) {}

  async generateJson<T>(params: { userPrompt: string; systemPrompt?: string; timeoutMs?: number }) {
    if (params.userPrompt.includes("Post-process humanizer pass")) {
      return {
        data: { text: extractOriginalPostProcessText(params.userPrompt) } as T,
        modelUsed: "post-process-model",
      };
    }

    this.calls.push({
      userPrompt: params.userPrompt,
      systemPrompt: params.systemPrompt,
      timeoutMs: params.timeoutMs,
    });

    if (params.userPrompt.includes("Extract character facts")) {
      return { data: { characters: [] }, modelUsed: "fact-extractor-model" } as { data: T; modelUsed: string };
    }

    if (params.systemPrompt?.includes("Character Consistency Validator")) {
      return { data: { violations: [] }, modelUsed: "consistency-validator-model" } as { data: T; modelUsed: string };
    }

    const next = this.responses.shift();
    if (!next) {
      throw new Error("No fake response remaining.");
    }

    return next as { data: T; modelUsed: string };
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

function makeTooLongDraft(chapterNumber = 1) {
  return {
    data: {
      chapter: {
        chapterNumber,
        title: `Chapter ${chapterNumber}`,
        summary: "summary",
        text: Array.from({ length: 420 }, () => "She stood very still and thought about the humiliation.").join(" "),
      },
    },
    modelUsed: "drafter-model",
  };
}

function architectureWordUnits(chapterNumber: number) {
  const targets: Record<number, number> = {
    1: 240,
    2: 250,
    3: 250,
    4: 260,
    5: 270,
    6: 270,
    7: 240,
    8: 260,
    9: 280,
    10: 190,
  };

  return targets[chapterNumber] ?? 210;
}

function makeBalancedDraft(chapterNumber = 1) {
  const chapterLexeme = `chapter${chapterNumber}`;
  return {
    data: {
      chapter: {
        chapterNumber,
        title: `Chapter ${chapterNumber}`,
        summary: "summary",
        text: Array.from({ length: architectureWordUnits(chapterNumber) }, () =>
          `\"${chapterLexeme} yes ${chapterLexeme} one ${chapterLexeme} two\" ${chapterLexeme} five ${chapterLexeme} six ${chapterLexeme} seven`,
        ).join(" "),
      },
    },
    modelUsed: "drafter-model",
  };
}

function makeNearMaximumDraft(chapterNumber = 1) {
  return {
    data: {
      chapter: {
        chapterNumber,
        title: `Chapter ${chapterNumber}`,
        summary: "summary",
        text: Array.from({ length: 220 }, () =>
          "\"Yes one two three four\" five six seven eight nine",
        ).join(" "),
      },
    },
    modelUsed: "rewriter-model",
  };
}

test("generateChapter retries once when the first draft misses quality thresholds", async () => {
  const routerClient = new FakeRouterClient([makeTooLongDraft(), makeBalancedDraft()]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );
  const progressEvents: StoryProgressEvent[] = [];

  const chapter = await orchestrator.generateChapter(requestFixtureWithStoryTitle(), undefined, undefined, undefined, {
    onProgress: (event) => progressEvents.push(event),
  });

  assert.equal(chapter.chapterNumber, 1);
  assert.equal(routerClient.calls.length, 2);
  assert.match(routerClient.calls[1]?.userPrompt ?? "", /The previous draft missed quality targets and must be rewritten to pass them\./);
  assert.match(routerClient.calls[1]?.userPrompt ?? "", /Current failures:/);
  assert.match(routerClient.calls[1]?.userPrompt ?? "", /Reference length target: 2300-2600 words\./);
  assert.doesNotMatch(routerClient.calls[1]?.userPrompt ?? "", /word count drifted outside the allowed chapter range/);
  assert.match(routerClient.calls[1]?.userPrompt ?? "", /Use smart dialogue quotation marks \(U\+201C and U\+201D\) for spoken dialogue inside chapter text\./);
  assert.doesNotMatch(routerClient.calls[1]?.userPrompt ?? "", /Use only straight double quotes for spoken dialogue\./);
  assert.match(routerClient.calls[1]?.userPrompt ?? "", /Previous draft:/);
  assert.match(routerClient.calls[1]?.userPrompt ?? "", /"title": "The Girl He Never Named"/);
  assert.deepEqual(
    progressEvents
      .filter((event) => event.stageId === "repair-chapter")
      .map((event) => [event.status, event.detail]),
    [
      ["started", "Đang kiểm tra chất lượng, tính nhất quán nhân vật và thử sửa nếu cần."],
      ["completed", "Đã sửa xong chương 1."],
    ],
  );
});

test("generateChapter makes a second targeted repair when the first repair still misses dialogue quality", async () => {
  const routerClient = new FakeRouterClient([makeTooLongDraft(), makeTooLongDraft(), makeBalancedDraft()]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );

  const chapter = await orchestrator.generateChapter(requestFixtureWithStoryTitle());

  assert.equal(chapter.chapterNumber, 1);
  assert.equal(routerClient.calls.length, 3);
  assert.match(routerClient.calls[2]?.userPrompt ?? "", /Repair attempt 2 of 2/);
  assert.match(routerClient.calls[2]?.userPrompt ?? "", /Current failures:/);
  assert.match(routerClient.calls[2]?.userPrompt ?? "", /dialogue ratio is materially below the requested target/);
  assert.doesNotMatch(routerClient.calls[2]?.userPrompt ?? "", /word count drifted outside the allowed chapter range/);
});

test("generateChapter keeps the first draft when quality passes", async () => {
  const routerClient = new FakeRouterClient([makeBalancedDraft()]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );

  const chapter = await orchestrator.generateChapter(requestFixtureWithStoryTitle());

  assert.equal(chapter.chapterNumber, 1);
  assert.equal(routerClient.calls.length, 1);
});

test("generateChapter accepts a repaired draft at the configured maximum chapter size", async () => {
  const routerClient = new FakeRouterClient([makeTooLongDraft(), makeNearMaximumDraft()]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );

  const chapter = await orchestrator.generateChapter(requestFixtureWithStoryTitle());

  assert.equal(chapter.chapterNumber, 1);
  assert.equal(routerClient.calls.length, 2);
});

test("generateChapter uses extended router timeouts for long chapter drafting and repair", async () => {
  const routerClient = new FakeRouterClient([makeTooLongDraft(), makeBalancedDraft()]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );

  await orchestrator.generateChapter(requestFixtureWithStoryTitle());

  assert.equal(routerClient.calls.length, 2);
  assert.equal(routerClient.calls[0]?.timeoutMs, 600_000);
  assert.equal(routerClient.calls[1]?.timeoutMs, 600_000);
});

test("generateChapter accepts the final repaired draft when only dialogue ratio still misses after repairs", async () => {
  const routerClient = new FakeRouterClient([makeTooLongDraft(), makeTooLongDraft(), makeTooLongDraft()]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );
  const progressEvents: StoryProgressEvent[] = [];

  const chapter = await orchestrator.generateChapter(requestFixtureWithStoryTitle(), undefined, undefined, undefined, {
    onProgress: (event) => progressEvents.push(event),
  });

  assert.equal(chapter.chapterNumber, 1);
  assert.equal(routerClient.calls.length, 3);
  assert.deepEqual(
    progressEvents
      .filter((event) => event.stageId === "repair-chapter")
      .map((event) => event.status),
    ["started", "completed"],
  );
});

function requestFixtureWithStoryTitle() {
  return makeRequest();
}

function makeFullGenerateRequest(): NormalizedFullGenerateRequest {
  return {
    titleHint: "The Girl He Never Named",
    linePreset: "betrayal_romance_revenge_class_shame",
    stylePreset: "wharton_class_shame_elegance",
    outputLanguage: "english",
    audience: {
      genderFocus: "female",
      ageBand: "18_34",
      market: "global",
    },
    storyControls: {
      betrayalType: "hidden_relationship_replaced_by_fiancee",
      shameType: "polite_class_exclusion",
      revengeMode: "strategic_withdrawal_status_reversal",
      endingMode: "bittersweet_dignity_first",
      intensity: 0.84,
    },
    chapterCount: 10,
    draftControls: {
      targetWordsPerChapter: 1200,
      dialogueRatio: 0.55,
      hookDensity: "high",
    },
  };
}

function makeOutlinePayload(request: NormalizedFullGenerateRequest): StoryPayload {
  return {
    title: "The Girl He Never Named",
    request,
    concept: {
      title: "The Girl He Never Named",
      titleCandidates: ["The Girl He Never Named"],
      logline: "A woman erased from her own future learns the price of polite exclusion.",
      promise: "Public humiliation becomes strategic revenge.",
      conflictEngine: "The man she raised into status replaces her in daylight.",
    },
    storyBible: storyBibleFixture,
    chapterPlan: makeChapterPlan(),
    chapters: [],
    continuityLite: {
      heroineName: "Mina Hart",
      betrayerName: "Evan Vale",
      rivalName: "Celeste Rowan",
      coreReveal: "Mina built the investor deck Evan is taking public.",
      endingMode: "bittersweet_dignity_first",
      chapterState: [],
    },
    meta: {
      generatedAt: new Date().toISOString(),
      modelAliases: modelPresetFixture,
    },
  };
}

test("generateFull forwards repair activity into the outer chapter progress detail", async () => {
  const routerClient = new FakeRouterClient([
    makeTooLongDraft(1),
    makeBalancedDraft(1),
    ...Array.from({ length: 14 }, (_, index) => makeBalancedDraft(index + 2)),
  ]);
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
  );
  const request = makeFullGenerateRequest();
  const progressEvents: StoryProgressEvent[] = [];

  (orchestrator as StoryOrchestrator & {
    generateOutline: (request: NormalizedFullGenerateRequest) => Promise<StoryPayload>;
  }).generateOutline = async () => makeOutlinePayload(request);

  await orchestrator.generateFull(request, {
    onProgress: (event) => progressEvents.push(event),
  });

  const chapterOneEvents = progressEvents.filter((event) => event.stageId === "chapter-1");
  const chapterReadyEvent = chapterOneEvents.find((event) => "storyPayload" in event) as
    | (StoryProgressEvent & { storyPayload?: StoryPayload; chapter?: { title: string } })
    | undefined;

  assert.ok(chapterOneEvents.some((event) => event.status === "started"));
  assert.ok(chapterOneEvents.some((event) => event.status === "completed"));
  assert.equal(chapterReadyEvent?.chapter?.title, "Chapter 1");
  assert.equal(chapterReadyEvent?.storyPayload?.chapters.length, 1);
  assert.equal(chapterReadyEvent?.storyPayload?.chapters[0]?.title, "Chapter 1");
  assert.ok(chapterOneEvents.every((event) => event.current === 6 && event.total <= 21));
});

test("generateFull starts poster generation after outline without blocking chapter drafting", async () => {
  const routerClient = new FakeRouterClient([]);
  const request = makeFullGenerateRequest();
  const markers: string[] = [];
  let resolvePoster: (() => void) | null = null;
  const posterResult = {
    status: "completed",
    title: "The Girl He Never Named",
    model: "gpt-image-2",
    size: "1536x1024",
    generatedAt: "2026-05-07T16:40:00.000Z",
    filePath: "D:/outputs/posters/the-girl-he-never-named-poster.png",
  };
  const posterService = {
    generatePoster: async () => {
      markers.push("poster-start");
      await new Promise<void>((resolve) => {
        resolvePoster = () => {
          markers.push("poster-resolve");
          resolve();
        };
      });
      return posterResult;
    },
  };
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
    undefined,
    posterService as unknown as never,
  );

  (orchestrator as StoryOrchestrator & {
    generateOutline: (request: NormalizedFullGenerateRequest) => Promise<StoryPayload>;
    generateChapter: (request: GenerateChapterRequest) => Promise<ReturnType<typeof makeBalancedDraft>["data"]["chapter"]>;
  }).generateOutline = async () => {
    markers.push("outline");
    return makeOutlinePayload(request);
  };

  (orchestrator as StoryOrchestrator & {
    generateChapter: (request: GenerateChapterRequest) => Promise<ReturnType<typeof makeBalancedDraft>["data"]["chapter"]>;
  }).generateChapter = async (chapterRequest) => {
    markers.push(`chapter-${chapterRequest.chapterNumber}`);
    return {
      chapterNumber: chapterRequest.chapterNumber,
      title: `Chapter ${chapterRequest.chapterNumber}`,
      summary: "summary",
      text: "Mina kept her voice level while the room turned toward her.",
    };
  };

  const run = orchestrator.generateFull(request);
  await waitForMarker(markers, "chapter-1");
  assert.deepEqual(markers.slice(0, 3), ["outline", "poster-start", "chapter-1"]);
  resolvePoster?.();
  const story = await run;

  assert.equal(story.chapters.length, 10);
  assert.deepEqual(story.meta.poster, posterResult);
});

test("generateFull does not generate thumbnails after chapters are drafted", async () => {
  const routerClient = new FakeRouterClient([]);
  const request = makeFullGenerateRequest();
  const markers: string[] = [];
  const thumbnailService = {
    generatePoster: async () => ({
      status: "skipped",
      title: "The Girl He Never Named",
      model: "gpt-image-2",
      size: "1536x864",
      generatedAt: "2026-05-11T04:29:00.000Z",
      error: "poster skipped in thumbnail test",
    }),
    generateThumbnails: async () => {
      markers.push("thumbnails-called");
      throw new Error("thumbnail generation should not run");
    },
  };
  const orchestrator = new StoryOrchestrator(
    new FakePresetLoader() as unknown as never,
    routerClient as unknown as never,
    "default-models",
    undefined,
    thumbnailService as unknown as never,
  );

  (orchestrator as StoryOrchestrator & {
    generateOutline: (request: NormalizedFullGenerateRequest) => Promise<StoryPayload>;
    generateChapter: (request: GenerateChapterRequest) => Promise<ReturnType<typeof makeBalancedDraft>["data"]["chapter"]>;
  }).generateOutline = async () => {
    markers.push("outline");
    return makeOutlinePayload(request);
  };

  (orchestrator as StoryOrchestrator & {
    generateChapter: (request: GenerateChapterRequest) => Promise<ReturnType<typeof makeBalancedDraft>["data"]["chapter"]>;
  }).generateChapter = async (chapterRequest) => {
    markers.push(`chapter-${chapterRequest.chapterNumber}`);
    return {
      chapterNumber: chapterRequest.chapterNumber,
      title: `Chapter ${chapterRequest.chapterNumber}`,
      summary: "summary",
      text: "Mina kept her voice level while the room turned toward her.",
    };
  };

  const story = await orchestrator.generateFull(request);

  assert.ok(markers.includes("chapter-10"));
  assert.equal(markers.includes("thumbnails-called"), false);
  assert.equal("thumbnails" in story.meta, false);
});

async function waitForMarker(markers: string[], marker: string) {
  const startedAt = Date.now();
  while (!markers.includes(marker)) {
    if (Date.now() - startedAt > 500) {
      throw new Error(`Timed out waiting for ${marker}. Markers: ${markers.join(", ")}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
