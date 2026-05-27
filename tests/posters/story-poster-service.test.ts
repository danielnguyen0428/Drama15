import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StoryPosterService } from "../../src/modules/posters/story-poster-service";
import type { StoryPayload } from "../../src/types/story";

function makeStory(): StoryPayload {
  return {
    title: "The Glass Heiress",
    request: {
      titleHint: "The Glass Heiress",
      linePreset: "secret_identity_hidden_heiress",
      stylePreset: "secret_identity_hidden_heiress__tiktok_hook_pacing",
      outputLanguage: "english",
      audience: {
        genderFocus: "female",
        ageBand: "18_34",
        market: "global",
      },
      storyControls: {
        betrayalType: "hidden heiress dismissed",
        shameType: "mistaken for maid",
        revengeMode: "real identity reveal",
        endingMode: "power without begging",
        intensity: 0.84,
      },
      chapterCount: 10,
      draftControls: {
        dialogueRatio: 0.55,
        hookDensity: "high",
      },
    },
    concept: {
      title: "The Glass Heiress",
      titleCandidates: ["The Glass Heiress"],
      logline: "A hidden heiress is mistaken for staff in the hotel she secretly owns.",
      promise: "The woman everyone dismissed walks back into the room with quiet power.",
      conflictEngine: "Old-money arrogance ignores every clue until the ownership reveal is public.",
    },
    storyBible: {
      premise: "Mina keeps her identity hidden while testing the family that wants her erased.",
      heroine: {
        name: "Mina Hart",
        wound: "She was trained to make herself useful before she was allowed to be visible.",
        strengths: ["observant", "controlled under pressure", "decisive"],
        blindSpots: ["waits too long to claim space"],
      },
      betrayer: {
        name: "Evan Vale",
        wound: "He fears losing elite approval.",
        cowardiceVector: "He lets powerful people insult Mina when silence benefits him.",
      },
      rival: {
        name: "Celeste Rowan",
        socialPower: "board-family legitimacy",
        demeanor: "polished contempt",
      },
      classHierarchy: ["hotel dynasty", "board families", "staff corridors"],
      betrayalEngine: "Her fiance presents another woman as the public future.",
      classShameEngine: "Mina is treated like service staff by people who depend on her property.",
      revengeEngine: "Ownership documents and live witnesses flip the room.",
      endingMode: "power without begging",
    },
    chapterPlan: Array.from({ length: 10 }, (_, index) => ({
      chapterNumber: index + 1,
      title: index === 0 ? "The Wrong Uniform" : `Chapter ${index + 1}`,
      hook: `Hook ${index + 1}`,
      mainBeat: `Beat ${index + 1}`,
      humiliationProgression: `Shame ${index + 1}`,
      revengeProgression: `Revenge ${index + 1}`,
      endingBeat: `Ending ${index + 1}`,
    })),
    chapters: [],
    continuityLite: {
      heroineName: "Mina Hart",
      betrayerName: "Evan Vale",
      rivalName: "Celeste Rowan",
      coreReveal: "Mina owns the hotel group.",
      endingMode: "power without begging",
      chapterState: [],
    },
    meta: {
      generatedAt: "2026-05-07T16:30:00.000Z",
      modelAliases: {
        planner: "planner-model",
        bible: "bible-model",
        drafter: "drafter-model",
      },
    },
  };
}

test("StoryPosterService generates a GPT-Image 2 landscape poster and saves base64 PNG output", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-poster-"));
  const png = Buffer.from("fake-png-image");
  let requestUrl = "";
  let requestBody: Record<string, unknown> = {};
  let authorization = "";

  const service = new StoryPosterService({
    apiKey: "test-openai-key",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-image-2",
    size: "1536x1024",
    quality: "high",
    outputRoot,
    fetch: async (url, init) => {
      requestUrl = String(url);
      authorization = String((init?.headers as Record<string, string>)?.Authorization || "");
      requestBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            data: [
              {
                b64_json: png.toString("base64"),
              },
            ],
          }),
      } as Response;
    },
  });

  const result = await service.generatePoster(makeStory());
  const saved = await fs.readFile(result.filePath || "");

  assert.equal(result.status, "completed");
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.size, "1536x1024");
  assert.match(result.filePath || "", /the-glass-heiress-poster\.png$/);
  assert.deepEqual(saved, png);
  assert.equal(requestUrl, "https://api.openai.com/v1/images/generations");
  assert.equal(authorization, "Bearer test-openai-key");
  assert.equal(requestBody.model, "gpt-image-2");
  assert.equal(requestBody.size, "1536x1024");
  assert.equal(requestBody.quality, "high");
  assert.equal(requestBody.output_format, "png");
  assert.equal(requestBody.n, 1);
  assert.match(String(requestBody.prompt), /left side/i);
  assert.match(String(requestBody.prompt), /right side/i);
  assert.match(String(requestBody.prompt), /exact title text: "The Glass Heiress"/);
  assert.match(String(requestBody.prompt), /realistic candid photo/i);
  assert.match(String(requestBody.prompt), /Mina Hart/);
  assert.doesNotMatch(String(requestBody.prompt), /The Wrong Uniform/);
});

test("StoryPosterService skips without an image API key instead of failing story generation", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-poster-"));
  let called = false;
  const service = new StoryPosterService({
    apiKey: "dummy",
    outputRoot,
    fetch: async () => {
      called = true;
      throw new Error("should not call image API");
    },
  });

  const result = await service.generatePoster(makeStory());

  assert.equal(result.status, "skipped");
  assert.equal(result.error, "OpenAI image API key is not configured.");
  assert.equal(called, false);
});

test("StoryPosterService does not expose thumbnail generation", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-poster-"));
  const service = new StoryPosterService({
    apiKey: "test-openai-key",
    outputRoot,
  });

  assert.equal("generateThumbnails" in service, false);
});
