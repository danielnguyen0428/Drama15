import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { OmniVoiceApiClient, OmniVoiceLongTtsJob } from "../../src/modules/tts/omnivoice-api-client";
import { StoryTtsService } from "../../src/modules/tts/story-tts-service";
import type { StoryPayload } from "../../src/types/story";

function makeStory(chapterCount = 15): StoryPayload {
  return {
    title: "Voice Story",
    request: {
      linePreset: "billionaire_rich_poor_romance",
      stylePreset: "billionaire_rich_poor_romance__tiktok_hook_pacing",
      outputLanguage: "vietnamese",
      audience: { genderFocus: "female", ageBand: "18_34", market: "global" },
      storyControls: {
        betrayalType: "contract",
        shameType: "dinner",
        revengeMode: "quiet reveal",
        endingMode: "respect",
        intensity: 0.84,
      },
      chapterCount: 15,
      draftControls: { dialogueRatio: 0.55, hookDensity: "high" },
    },
    concept: {
      title: "Voice Story",
      titleCandidates: ["Voice Story"],
      logline: "A story.",
      promise: "A promise.",
      conflictEngine: "A conflict.",
    },
    storyBible: {
      premise: "Premise",
      heroine: { name: "Mai", wound: "Wound", strengths: ["calm"], blindSpots: ["waits"] },
      betrayer: { name: "An", wound: "Fear", cowardiceVector: "silence" },
      rival: { name: "Linh", socialPower: "money", demeanor: "cold" },
      classHierarchy: ["elite"],
      betrayalEngine: "betrayal",
      classShameEngine: "shame",
      revengeEngine: "revenge",
      endingMode: "respect",
    },
    chapterPlan: Array.from({ length: 15 }, (_, index) => ({
      chapterNumber: index + 1,
      title: `Plan ${index + 1}`,
      hook: "Hook",
      mainBeat: "Beat",
      humiliationProgression: "Shame",
      revengeProgression: "Revenge",
      endingBeat: "Ending",
    })),
    chapters: Array.from({ length: chapterCount }, (_, index) => ({
      chapterNumber: index + 1,
      title: `Chapter ${index + 1}`,
      summary: `Summary ${index + 1}`,
      text: `Chapter ${index + 1} text.`,
    })),
    continuityLite: {
      heroineName: "Mai",
      betrayerName: "An",
      rivalName: "Linh",
      coreReveal: "Reveal",
      endingMode: "respect",
      chapterState: [],
    },
    meta: {
      generatedAt: "2026-05-06T00:00:00.000Z",
      modelAliases: { planner: "cx/gpt-5.5", bible: "cx/gpt-5.5", drafter: "cx/gpt-5.5" },
    },
  };
}

function makeJob(jobId: string, state: OmniVoiceLongTtsJob["state"], progress = 100): OmniVoiceLongTtsJob {
  return {
    jobId,
    voiceId: "main-voice",
    state,
    totalChunks: 1,
    completedChunks: state === "completed" ? 1 : 0,
    progress,
    message: state,
    error: state === "failed" ? "boom" : "",
    downloadReady: state === "completed",
  };
}

test("StoryTtsService generates one WAV file for each drafted chapter", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-tts-"));
  const createdTexts: string[] = [];
  const client = {
    createLongTtsJob: async (input) => {
      createdTexts.push(input.text);
      return makeJob(`job-${createdTexts.length}`, "completed");
    },
    getLongTtsJob: async (jobId) => makeJob(jobId, "completed"),
    downloadLongTtsJob: async () => Buffer.from("RIFF-test"),
  } as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  const progress: string[] = [];
  const service = new StoryTtsService({
    client,
    pollIntervalMs: 1,
  });

  const result = await service.generateStoryVoice({
    storyPayload: makeStory(),
    voiceId: "main-voice",
    speed: 1,
    pitch: 0,
    outputRoot,
    onProgress: (event) => progress.push(`${event.chapterNumber}:${event.status}`),
  });

  assert.equal(result.filePaths.length, 15);
  assert.equal(createdTexts.length, 15);
  assert.equal(createdTexts[0], "Chapter 1 text.");
  assert.equal(await fs.readFile(result.filePaths[0], "utf8"), "RIFF-test");
  assert.match(result.directoryPath, /voice-story-voice/);
  assert.deepEqual(progress.filter((item) => item.endsWith(":completed")).length, 15);
});

test("StoryTtsService rejects stories that do not have all 15 chapter drafts", async () => {
  const service = new StoryTtsService({
    client: {} as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">,
    pollIntervalMs: 1,
  });

  await assert.rejects(
    () => service.generateStoryVoice({
      storyPayload: makeStory(14),
      voiceId: "main-voice",
      speed: 1,
      pitch: 0,
      outputRoot: "D:/unused",
    }),
    /Cáº§n Ä‘á»§ 15 chÆ°Æ¡ng Ä‘Ã£ draft trÆ°á»›c khi gen voice/,
  );
});

test("StoryTtsService reports the failed chapter when OmniVoice job fails", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-tts-"));
  const client = {
    createLongTtsJob: async () => makeJob("job-fail", "running", 0),
    getLongTtsJob: async () => makeJob("job-fail", "failed", 0),
    downloadLongTtsJob: async () => Buffer.from("RIFF-test"),
  } as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  const service = new StoryTtsService({ client, pollIntervalMs: 1 });

  await assert.rejects(
    () => service.generateStoryVoice({
      storyPayload: makeStory(),
      voiceId: "main-voice",
      speed: 1,
      pitch: 0,
      outputRoot,
    }),
    /Chapter 1 voice generation failed: boom/,
  );
});
