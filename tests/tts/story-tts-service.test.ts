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
      chapterCount: 10,
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
    chapterPlan: Array.from({ length: 10 }, (_, index) => ({
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

  assert.equal(result.filePaths.length, 10);
  assert.equal(createdTexts.length, 10);
  assert.equal(createdTexts[0], "Chapter 1 text.");
  assert.equal(await fs.readFile(result.filePaths[0], "utf8"), "RIFF-test");
  assert.match(result.directoryPath, /voice-story-voice/);
  assert.deepEqual(progress.filter((item) => item.endsWith(":completed")).length, 10);
});

test("StoryTtsService rejects stories that do not have all 10 chapter drafts", async () => {
  const service = new StoryTtsService({
    client: {} as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">,
    pollIntervalMs: 1,
  });

  await assert.rejects(
    () => service.generateStoryVoice({
      storyPayload: makeStory(9),
      voiceId: "main-voice",
      speed: 1,
      pitch: 0,
      outputRoot: "D:/unused",
    }),
    /Cần đủ 10 chương đã draft trước khi gen voice/,
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

test("StoryTtsService stops after the current chapter and keeps completed WAV files", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-tts-"));
  const createdTexts: string[] = [];
  const client = {
    createLongTtsJob: async (input) => {
      createdTexts.push(input.text);
      return makeJob(`job-${createdTexts.length}`, "completed");
    },
    getLongTtsJob: async (jobId) => makeJob(jobId, "completed"),
    downloadLongTtsJob: async () => Buffer.from("RIFF-stop"),
  } as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  const service = new StoryTtsService({ client, pollIntervalMs: 1 });

  const result = await service.generateStoryVoice({
    storyPayload: makeStory(),
    voiceId: "main-voice",
    speed: 1,
    pitch: 0,
    outputRoot,
    control: {
      beforeChapter: async ({ chapterNumber }) => chapterNumber > 1 ? "stop" : "continue",
    },
  });

  assert.equal(result.status, "stopped");
  assert.equal(createdTexts.length, 1);
  assert.equal(createdTexts[0], "Chapter 1 text.");
  assert.equal(result.filePaths.length, 1);
  assert.equal(await fs.readFile(result.filePaths[0], "utf8"), "RIFF-stop");
});

test("StoryTtsService stops while an OmniVoice job is still running", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-tts-"));
  let polls = 0;
  let stopRequested = false;
  const client = {
    createLongTtsJob: async () => makeJob("job-running", "running", 5),
    getLongTtsJob: async () => {
      polls += 1;
      if (polls === 1) {
        stopRequested = true;
      }

      return polls < 3 ? makeJob("job-running", "running", 20) : makeJob("job-running", "completed");
    },
    downloadLongTtsJob: async () => Buffer.from("RIFF-should-not-download"),
  } as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  const progress: string[] = [];
  const service = new StoryTtsService({ client, pollIntervalMs: 1 });

  const result = await service.generateStoryVoice({
    storyPayload: makeStory(),
    voiceId: "main-voice",
    speed: 1,
    pitch: 0,
    outputRoot,
    control: {
      shouldStop: async () => stopRequested,
    },
    onProgress: (event) => progress.push(`${event.chapterNumber}:${event.status}`),
  });

  assert.equal(result.status, "stopped");
  assert.equal(result.filePaths.length, 0);
  assert.ok(polls < 3);
  assert.ok(progress.includes("1:stopped"));
});

test("StoryTtsService resumes by skipping existing chapter WAV files", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-tts-"));
  const existingDirectory = path.join(outputRoot, "voice-story-voice");
  await fs.mkdir(existingDirectory, { recursive: true });
  await fs.writeFile(path.join(existingDirectory, "chapter-01.wav"), "RIFF-existing", "utf8");
  const createdTexts: string[] = [];
  const client = {
    createLongTtsJob: async (input) => {
      createdTexts.push(input.text);
      return makeJob(`job-${createdTexts.length}`, "completed");
    },
    getLongTtsJob: async (jobId) => makeJob(jobId, "completed"),
    downloadLongTtsJob: async () => Buffer.from("RIFF-new"),
  } as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  const service = new StoryTtsService({ client, pollIntervalMs: 1 });

  const result = await service.generateStoryVoice({
    storyPayload: makeStory(),
    voiceId: "main-voice",
    speed: 1,
    pitch: 0,
    outputRoot,
    mode: "resume",
  });

  assert.equal(result.status, "completed");
  assert.equal(result.filePaths.length, 10);
  assert.equal(createdTexts.length, 9);
  assert.equal(createdTexts[0], "Chapter 2 text.");
  assert.equal(await fs.readFile(path.join(existingDirectory, "chapter-01.wav"), "utf8"), "RIFF-existing");
});

test("StoryTtsService retries one selected chapter and overwrites its WAV file", async () => {
  const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-tts-"));
  const existingDirectory = path.join(outputRoot, "voice-story-voice");
  await fs.mkdir(existingDirectory, { recursive: true });
  const retryPath = path.join(existingDirectory, "chapter-08.wav");
  await fs.writeFile(retryPath, "RIFF-old", "utf8");
  const createdTexts: string[] = [];
  const client = {
    createLongTtsJob: async (input) => {
      createdTexts.push(input.text);
      return makeJob("job-retry", "completed");
    },
    getLongTtsJob: async (jobId) => makeJob(jobId, "completed"),
    downloadLongTtsJob: async () => Buffer.from("RIFF-retry"),
  } as Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  const service = new StoryTtsService({ client, pollIntervalMs: 1 });

  const result = await service.generateStoryVoice({
    storyPayload: makeStory(),
    voiceId: "main-voice",
    speed: 1,
    pitch: 0,
    outputRoot,
    mode: "retry",
    chapterNumber: 8,
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(createdTexts, ["Chapter 8 text."]);
  assert.deepEqual(result.filePaths, [retryPath]);
  assert.equal(await fs.readFile(retryPath, "utf8"), "RIFF-retry");
});
