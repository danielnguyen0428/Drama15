import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

import { getLocalStoryControls, type StoryControlsByNiche } from "../../src/modules/presets/story-controls";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..", "..");

function createFakeElement(id: string) {
  return {
    id,
    value: "",
    options: [],
    innerHTML: "",
    textContent: "",
    disabled: false,
    dataset: {},
    style: {},
    className: "",
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    addEventListener() {},
    focus() {},
    prepend() {},
    querySelectorAll() {
      return [];
    },
  };
}

async function loadRendererTestApi() {
  const elements = new Map<string, ReturnType<typeof createFakeElement>>();
  const document = {
    createElement: createFakeElement,
    getElementById(id: string) {
      if (!elements.has(id)) {
        elements.set(id, createFakeElement(id));
      }

      return elements.get(id);
    },
    querySelectorAll() {
      return [];
    },
  };

  const window = {
    dramaStudio: {
      init: async () => ({
        linePresets: [
          "billionaire_rich_poor_romance",
          "humiliation_revenge_justice",
          "secret_identity_hidden_heiress",
          "toxic_family_betrayal",
          "cheating_ex_wedding_drama",
          "single_mom_poor_woman_comeback",
          "social_injustice_discrimination_drama",
          "workplace_ceo_power_struggle",
          "medical_hidden_doctor_life_care",
          "school_campus_bullying_identity",
          "werewolf_luna_alpha_soulmate",
          "steamy_alien_captive_romance",
        ],
        sampleOutlineRequest: {
          linePreset: "billionaire_rich_poor_romance",
          outputLanguage: "english",
          storyControls: {},
        },
        configRoot: "test",
        automationConfig: {
          pdfOutputDirectory: "D:\\\\Drama15\\\\PDF",
        },
        storyControls: getLocalStoryControls(),
      }),
      getTtsConfig: async () => ({
        ok: true,
        data: {
          apiBase: "http://127.0.0.1:8001",
          selectedVoiceId: "",
          speed: 1,
          pitch: 0,
        },
      }),
      saveTtsConfig: async (payload: unknown) => ({
        ok: true,
        data: payload,
      }),
      listTtsVoices: async () => ({
        ok: true,
        data: [],
      }),
      generateStoryVoice: async () => ({
        ok: true,
        data: {
          filePaths: [],
          directoryPath: "",
        },
      }),
      onProgress() {},
      onTtsProgress() {},
    },
    setTimeout,
    clearTimeout,
  };

  const rendererPath = path.join(repoRoot, "desktop", "renderer", "renderer.js");
  const source = fs.readFileSync(rendererPath, "utf8").replace(
    /\n\}\)\(\);\s*$/,
    `
  window.__rendererTestApi = {
    RANDOM_STORY_CONTROL_VALUE,
    RANDOM_SETTING_SEED_VALUE,
    SETTING_SEED_RANDOM_PROMPT,
    nicheStoryControls,
    pickAutoFillLinePreset,
    buildSeedPayload,
    getAutomationStoryCount,
    buildAutomationSeedPayload,
    buildAutomationFullPayload,
    getAutomationPdfOutputDirectory,
    buildAutoStoryControls,
    resolveSettingSeedValue,
    normalizeLinePresetValue,
    applyGeneratedSeedPackage,
    getFirstMissingChapterNumber,
    buildContinueChapterPayload,
    mergeGeneratedChapter,
    runBusyTask,
    syncButtons,
    state,
    elements,
  };
})();`,
  );

  const sandbox = {
    window,
    document,
    console,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  new vm.Script(source, { filename: rendererPath }).runInContext(sandbox);
  await Promise.resolve();
  await Promise.resolve();

  return (window as typeof window & { __rendererTestApi?: RendererTestApi }).__rendererTestApi;
}

type RendererTestApi = {
  RANDOM_STORY_CONTROL_VALUE: string;
  RANDOM_SETTING_SEED_VALUE: string;
  SETTING_SEED_RANDOM_PROMPT: string;
  nicheStoryControls: StoryControlsByNiche;
  pickAutoFillLinePreset: (random?: () => number) => string;
  buildSeedPayload: () => Record<string, unknown>;
  getAutomationStoryCount: (rawValue?: string | number) => number;
  buildAutomationSeedPayload: (linePreset: string) => Record<string, unknown>;
  buildAutomationFullPayload: (seedPackage: Record<string, unknown>, fallbackLinePreset?: string) => Record<string, unknown>;
  getAutomationPdfOutputDirectory: () => string;
  buildAutoStoryControls: (branchId: string) => {
    betrayalType: string;
    shameType: string;
    revengeMode: string;
    endingMode: string;
    intensity: number;
  };
  resolveSettingSeedValue: (mode: string, customSeed: string) => string;
  normalizeLinePresetValue: (value: string) => string;
  applyGeneratedSeedPackage: (seedPackage: Record<string, unknown>, options?: Record<string, unknown>) => void;
  getFirstMissingChapterNumber: (story?: RendererStoryPayload | null) => number | null;
  buildContinueChapterPayload: (chapterNumber: number, story?: RendererStoryPayload | null) => Record<string, unknown>;
  mergeGeneratedChapter: (story: RendererStoryPayload, chapter: RendererChapter) => RendererStoryPayload;
  runBusyTask: (mode: string, task: () => Promise<void> | void) => Promise<void>;
  syncButtons: () => void;
  state: {
    storyBusy?: boolean;
    busy?: boolean;
    lastConcreteLinePreset?: string;
    currentStory?: RendererStoryPayload | null;
  };
  elements: Record<string, ReturnType<typeof createFakeElement>>;
};

type RendererChapter = {
  chapterNumber: number;
  title: string;
  summary?: string;
  text: string;
};

type RendererStoryPayload = {
  title: string;
  request: {
    outputLanguage: string;
    stylePreset: string;
    draftControls?: {
      dialogueRatio?: number;
      hookDensity?: string;
    };
  };
  storyBible: Record<string, unknown>;
  chapterPlan: Array<{
    chapterNumber: number;
    title: string;
  }>;
  chapters: RendererChapter[];
  continuityLite?: Record<string, unknown>;
  meta?: Record<string, unknown>;
};

function createPartialStoryPayload(chapterCount = 6): RendererStoryPayload {
  return {
    title: "Fake Wife Of A Billionaire",
    request: {
      outputLanguage: "english",
      stylePreset: "billionaire_rich_poor_romance__tiktok_hook_pacing",
      draftControls: {
        dialogueRatio: 0.55,
        hookDensity: "high",
      },
    },
    storyBible: {
      premise: "A poor bride enters a hostile rich family.",
    },
    chapterPlan: Array.from({ length: 10 }, (_, index) => ({
      chapterNumber: index + 1,
      title: `Plan ${index + 1}`,
    })),
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      chapterNumber: index + 1,
      title: `Chapter ${index + 1}`,
      summary: `Summary ${index + 1}`,
      text: `Text ${index + 1}`,
    })),
    continuityLite: {
      heroineName: "Maya",
      betrayerName: "Julian",
      rivalName: "Celeste",
      coreReveal: "Maya owns the rescue fund.",
      endingMode: "respect before love",
      chapterState: [],
    },
    meta: {
      generatedAt: "2026-05-02T00:00:00.000Z",
    },
  };
}

test("renderer exposes niche-driven preset helpers without runtime crashes", async () => {
  const api = await loadRendererTestApi();

  assert.equal(typeof api?.buildAutoStoryControls, "function");
  assert.equal(Object.keys(api?.nicheStoryControls ?? {}).length, 12);
});

test("each drama niche produces hidden story controls for full generation", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  assert.equal(Object.keys(api.nicheStoryControls).length, 12);
  for (const branchId of Object.keys(api.nicheStoryControls)) {
    const controls = api.buildAutoStoryControls(branchId);
    assert.equal(typeof controls.betrayalType, "string");
    assert.equal(typeof controls.shameType, "string");
    assert.equal(typeof controls.revengeMode, "string");
    assert.equal(typeof controls.endingMode, "string");
    assert.ok(controls.intensity >= 0.72 && controls.intensity <= 0.95);
  }
});

test("billionaire niche keeps rich-poor romance controls focused on courtship and family opposition", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  const controls = api.nicheStoryControls.billionaire_rich_poor_romance;
  const serialized = JSON.stringify(controls);
  assert.match(serialized, /rich family hates her/i);
  assert.match(serialized, /poor girl rich boy|poor boy loved by rich girl|hidden heir/i);
  assert.match(serialized, /publicly chooses her|public choice|stand up to his family|stands up to|walks away to protect/i);
  assert.match(serialized, /service entrance|arranged match|gala|family lunch|engagement/i);
  // contract / divorce / pregnant secretary belong to Niche 8 now
  assert.doesNotMatch(serialized, /contract marriage/i);
  assert.doesNotMatch(serialized, /paper marriage/i);
  assert.doesNotMatch(serialized, /pregnant secretary/i);
});

test("workplace ceo niche absorbs CEO contract / paper marriage / divorce / pregnant secretary controls", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  const controls = api.nicheStoryControls.workplace_ceo_power_struggle;
  const serialized = JSON.stringify(controls);
  assert.match(serialized, /contract wife|contract marriage|paper marriage/i);
  assert.match(serialized, /pregnant secretary/i);
  assert.match(serialized, /ex-wife|divorce regret|female billionaire/i);
  assert.match(serialized, /hidden heiress/i);
});

test("auto-fill can pick a non-default niche when the user has not chosen one manually", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  assert.equal(api.pickAutoFillLinePreset(() => 0), "billionaire_rich_poor_romance");
  assert.equal(api.pickAutoFillLinePreset(() => 0.999_999), "steamy_alien_captive_romance");
  assert.equal(api.pickAutoFillLinePreset(() => 0.4), "cheating_ex_wedding_drama");
});

test("new workplace medical and school niches expose concrete hidden story controls", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  assert.match(JSON.stringify(api.nicheStoryControls.workplace_ceo_power_struggle), /startup pitch|layoff|board/i);
  assert.match(JSON.stringify(api.nicheStoryControls.medical_hidden_doctor_life_care), /triage|patient|doctor/i);
  assert.match(JSON.stringify(api.nicheStoryControls.school_campus_bullying_identity), /scholarship|campus|bully/i);
});

test("new werewolf and steamy alien niches expose concrete hidden story controls", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  assert.match(JSON.stringify(api.nicheStoryControls.werewolf_luna_alpha_soulmate), /werewolf|Luna|Alpha soulmate|second chance/i);
  assert.match(JSON.stringify(api.nicheStoryControls.steamy_alien_captive_romance), /alien captive|dominant|sensual|consent/i);
});

test("renderer migrates saved legacy branch ids before building payloads", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  assert.equal(api.normalizeLinePresetValue("betrayal_romance_revenge_class_shame"), "billionaire_rich_poor_romance");
  assert.equal(api.normalizeLinePresetValue("social_class_power_drama"), "social_injustice_discrimination_drama");
});

test("auto-fill payload preserves a manually entered custom niche as the active creative branch", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  api.elements.linePreset.value = "__custom__";
  api.elements.customLinePreset.value = "Workplace Layoff Revenge / Corporate Betrayal";
  api.state.lastConcreteLinePreset = "humiliation_revenge_justice";

  const payload = api.buildSeedPayload();

  assert.equal(payload.linePreset, "humiliation_revenge_justice");
  assert.equal(
    (payload.customCreativeInputs as { dramaBranch?: string } | undefined)?.dramaBranch,
    "Workplace Layoff Revenge / Corporate Betrayal",
  );
});

test("automation story count uses a safe default and clamps user input", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  assert.equal(api.getAutomationStoryCount(""), 10);
  assert.equal(api.getAutomationStoryCount("0"), 1);
  assert.equal(api.getAutomationStoryCount("7"), 7);
  assert.equal(api.getAutomationStoryCount("60"), 50);
  assert.equal(api.getAutomationStoryCount("abc"), 10);
});

test("automation seed payload uses the random niche passed by the batch runner", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  api.elements.outputLanguage.value = "english";
  api.elements.intensity.value = "0.84";
  api.elements.dialogueRatio.value = "0.55";
  api.elements.hookDensity.value = "high";
  api.elements.settingSeedMode.value = "__random_setting_seed__";
  api.elements.settingSeed.value = "";

  const payload = api.buildAutomationSeedPayload("medical_hidden_doctor_life_care");

  assert.equal(payload.linePreset, "medical_hidden_doctor_life_care");
  assert.equal(payload.stylePreset, "medical_hidden_doctor_life_care__tiktok_hook_pacing");
  assert.equal("titleHint" in payload, false);
  assert.equal((payload.storyControls as { betrayalType?: string }).betrayalType?.length ? true : false, true);
  assert.equal((payload.customCreativeInputs as unknown) ?? undefined, undefined);
});

test("automation full payload converts a generated seed package into a complete full-story request", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  api.elements.outputLanguage.value = "vietnamese";

  const payload = api.buildAutomationFullPayload(
    {
      titleHint: "B\u00e1c S\u0129 \u1ea8n Danh",
      linePreset: "medical_hidden_doctor_life_care",
      settingSeed: "A hidden doctor is humiliated at triage before a chart audit reveals the truth.",
      storyControls: {
        betrayalType: "triage abuse",
        shameType: "patient dignity shame",
        revengeMode: "chart audit reveal",
        endingMode: "care before status",
        intensity: 0.86,
      },
      draftControls: {
        dialogueRatio: 0.52,
        hookDensity: "high",
      },
    },
    "billionaire_rich_poor_romance",
  );

  assert.equal(payload.titleHint, "B\u00e1c S\u0129 \u1ea8n Danh");
  assert.equal(payload.linePreset, "medical_hidden_doctor_life_care");
  assert.equal(payload.stylePreset, "medical_hidden_doctor_life_care__tiktok_hook_pacing");
  assert.equal(payload.outputLanguage, "vietnamese");
  assert.equal(payload.chapterCount, 10);
  assert.equal((payload.draftControls as { dialogueRatio?: number }).dialogueRatio, 0.52);
  assert.equal((payload.draftControls as { hookDensity?: string }).hookDensity, "high");
});

test("automation pdf output directory comes from the saved config field", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  api.elements.automationPdfDirectory.value = "  D:\\\\Drama15\\\\Batch PDFs  ";

  assert.equal(api.getAutomationPdfOutputDirectory(), "D:\\\\Drama15\\\\Batch PDFs");
});

test("auto-fill keeps the visible niche custom even if a model returns a routed preset id", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  api.elements.linePreset.value = "__custom__";
  api.elements.customLinePreset.value = "Workplace Layoff Revenge / Corporate Betrayal";
  api.elements.linePreset.options = [
    { value: "billionaire_rich_poor_romance", textContent: "Niche 1: Billionaire / Rich-Poor Romance" },
    { value: "humiliation_revenge_justice", textContent: "Niche 2: Humiliation To Revenge / Justice" },
    { value: "__custom__", textContent: "Tự nhập tay" },
  ];

  api.applyGeneratedSeedPackage(
    {
      titleHint: "Office Layoff Revenge",
      linePreset: "humiliation_revenge_justice",
      settingSeed: "A realistic office betrayal seed long enough for the form.",
      storyControls: {
        betrayalType: "corporate scapegoating",
        shameType: "public layoff humiliation",
        revengeMode: "audit-backed comeback",
        endingMode: "legal dignity first",
        intensity: 0.84,
      },
      draftControls: {
        dialogueRatio: 0.55,
        hookDensity: "high",
      },
    },
    {
      requestedCustomLinePreset: "Workplace Layoff Revenge / Corporate Betrayal",
    },
  );

  assert.equal(api.elements.linePreset.value, "__custom__");
  assert.equal(api.elements.customLinePreset.value, "Workplace Layoff Revenge / Corporate Betrayal");
});

test("random setting seed resolves to a compact trending-drama prompt", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  const randomSeed = api.resolveSettingSeedValue(api.RANDOM_SETTING_SEED_VALUE, "startup xa xỉ");
  const customSeed = api.resolveSettingSeedValue("custom", "  startup xa xỉ  ");

  assert.equal(randomSeed, api.SETTING_SEED_RANDOM_PROMPT);
  assert.match(randomSeed, /Tự sinh bối cảnh theo xu hướng truyện drama hiện nay/);
  assert.equal(randomSeed.length <= 240, true);
  assert.equal(customSeed, "startup xa xỉ");
});

test("renderer builds a continuation request from the first missing chapter", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  const story = createPartialStoryPayload(6);
  const payload = api.buildContinueChapterPayload(api.getFirstMissingChapterNumber(story) ?? 0, story);

  assert.equal(api.getFirstMissingChapterNumber(story), 7);
  assert.equal(payload.storyTitle, story.title);
  assert.equal(payload.chapterNumber, 7);
  assert.equal(payload.outputLanguage, "english");
  assert.equal(payload.stylePreset, story.request.stylePreset);
  assert.equal(payload.continuityLite, story.continuityLite);
  assert.deepEqual(payload.previousChapterSummaries, [
    "Summary 1",
    "Summary 2",
    "Summary 3",
    "Summary 4",
    "Summary 5",
    "Summary 6",
  ]);
});

test("renderer merges continued chapters by replacing duplicates and sorting by chapter number", async () => {
  const api = await loadRendererTestApi();
  assert.ok(api);

  const story = createPartialStoryPayload(3);
  const merged = api.mergeGeneratedChapter(story, {
    chapterNumber: 2,
    title: "Replacement Chapter 2",
    summary: "Replacement summary",
    text: "Replacement text",
  });
  const appended = api.mergeGeneratedChapter(merged, {
    chapterNumber: 4,
    title: "Chapter 4",
    summary: "Summary 4",
    text: "Text 4",
  });

  assert.notEqual(merged, story);
  assert.equal(appended.chapters.map((chapter) => chapter.chapterNumber).join(","), "1,2,3,4");
  assert.equal(appended.chapters[1].title, "Replacement Chapter 2");
  assert.equal(api.getFirstMissingChapterNumber(appended), 5);
});
