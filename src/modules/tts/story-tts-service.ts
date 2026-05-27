import fs from "node:fs/promises";
import path from "node:path";

import { slugify } from "../../lib/slug";
import type { StoryPayload } from "../../types/story";
import type { CreateLongTtsJobInput, OmniVoiceApiClient, OmniVoiceLongTtsJob } from "./omnivoice-api-client";

export type StoryTtsProgressEvent = {
  chapterNumber: number;
  totalChapters: number;
  status: "queued" | "running" | "completed" | "failed" | "paused" | "stopped" | "skipped";
  progress: number;
  message: string;
  filePath?: string;
};

export type StoryTtsRunMode = "full" | "resume" | "retry";
export type StoryTtsControlDecision = "continue" | "stop";
export type StoryTtsControlContext = {
  chapterNumber: number;
  totalChapters: number;
  filePath: string;
  mode: StoryTtsRunMode;
};

export type StoryTtsControl = {
  beforeChapter?: (context: StoryTtsControlContext) => StoryTtsControlDecision | Promise<StoryTtsControlDecision>;
  shouldStop?: (context: StoryTtsControlContext & { jobId?: string }) => boolean | Promise<boolean>;
};

export type GenerateStoryVoiceInput = {
  storyPayload: StoryPayload;
  voiceId: string;
  speed: number;
  pitch: number;
  outputRoot: string;
  mode?: StoryTtsRunMode;
  chapterNumber?: number;
  control?: StoryTtsControl;
  onProgress?: (event: StoryTtsProgressEvent) => void;
};

export type StoryVoiceGenerationResult = {
  directoryPath: string;
  filePaths: string[];
  voiceId: string;
  generatedAt: string;
  status: "completed" | "stopped";
};

type StoryTtsServiceOptions = {
  client: Pick<OmniVoiceApiClient, "createLongTtsJob" | "getLongTtsJob" | "downloadLongTtsJob">;
  pollIntervalMs?: number;
};

export class StoryTtsService {
  private readonly client: StoryTtsServiceOptions["client"];
  private readonly pollIntervalMs: number;

  constructor(options: StoryTtsServiceOptions) {
    this.client = options.client;
    this.pollIntervalMs = options.pollIntervalMs ?? 1500;
  }

  async generateStoryVoice(input: GenerateStoryVoiceInput): Promise<StoryVoiceGenerationResult> {
    const chapters = getCompleteChapters(input.storyPayload);
    const voiceId = input.voiceId.trim();
    const mode = input.mode ?? "full";
    if (!voiceId) {
      throw new Error("Chon Voice ID truoc khi gen voice.");
    }

    const directoryPath = path.join(input.outputRoot, `${slugify(input.storyPayload.title || "drama15-story")}-voice`);
    await fs.mkdir(directoryPath, { recursive: true });

    const filePaths: string[] = [];
    for (const chapter of selectChaptersForMode(chapters, mode, input.chapterNumber)) {
      const filePath = path.join(directoryPath, `chapter-${String(chapter.chapterNumber).padStart(2, "0")}.wav`);
      if (mode === "resume" && await fileExists(filePath)) {
        filePaths.push(filePath);
        input.onProgress?.({
          chapterNumber: chapter.chapterNumber,
          totalChapters: chapters.length,
          status: "skipped",
          progress: 100,
          message: `Da co voice chuong ${chapter.chapterNumber}/10; bo qua`,
          filePath,
        });
        continue;
      }

      const controlContext = {
        chapterNumber: chapter.chapterNumber,
        totalChapters: chapters.length,
        filePath,
        mode,
      };
      const decision = await input.control?.beforeChapter?.(controlContext);
      if (decision === "stop") {
        input.onProgress?.({
          chapterNumber: chapter.chapterNumber,
          totalChapters: chapters.length,
          status: "stopped",
          progress: 0,
          message: `Da dung gen voice truoc chuong ${chapter.chapterNumber}/10`,
        });
        return createStoppedResult(directoryPath, filePaths, voiceId);
      }

      input.onProgress?.({
        chapterNumber: chapter.chapterNumber,
        totalChapters: chapters.length,
        status: "queued",
        progress: 0,
        message: `Dang tao job voice chuong ${chapter.chapterNumber}/10`,
      });

      const job = await this.client.createLongTtsJob({
        voiceId,
        text: chapter.text.trim(),
        abbreviations: "",
        speed: input.speed,
        pitch: input.pitch,
      } satisfies CreateLongTtsJobInput);
      const completed = await this.waitForJob(job, controlContext, input.control, input.onProgress);
      if (completed === "stopped") {
        return createStoppedResult(directoryPath, filePaths, voiceId);
      }

      const audio = await this.client.downloadLongTtsJob(completed.jobId);
      await fs.writeFile(filePath, audio);
      filePaths.push(filePath);
      input.onProgress?.({
        chapterNumber: chapter.chapterNumber,
        totalChapters: chapters.length,
        status: "completed",
        progress: 100,
        message: `Da luu voice chuong ${chapter.chapterNumber}/10`,
        filePath,
      });
    }

    return {
      directoryPath,
      filePaths,
      voiceId,
      generatedAt: new Date().toISOString(),
      status: "completed",
    };
  }

  private async waitForJob(
    initialJob: OmniVoiceLongTtsJob,
    context: StoryTtsControlContext,
    control?: StoryTtsControl,
    onProgress?: (event: StoryTtsProgressEvent) => void,
  ): Promise<OmniVoiceLongTtsJob | "stopped"> {
    let job = initialJob;
    while (job.state === "queued" || job.state === "running") {
      if (await shouldStopVoiceGeneration(control, context, job.jobId)) {
        onProgress?.({
          chapterNumber: context.chapterNumber,
          totalChapters: context.totalChapters,
          status: "stopped",
          progress: job.progress,
          message: `Da dung gen voice o chuong ${context.chapterNumber}/10`,
          filePath: context.filePath,
        });
        return "stopped";
      }

      onProgress?.({
        chapterNumber: context.chapterNumber,
        totalChapters: context.totalChapters,
        status: job.state,
        progress: job.progress,
        message: job.message || `Dang gen voice chuong ${context.chapterNumber}/10`,
      });
      await delay(this.pollIntervalMs);
      job = await this.client.getLongTtsJob(job.jobId);
    }

    if (await shouldStopVoiceGeneration(control, context, job.jobId)) {
      onProgress?.({
        chapterNumber: context.chapterNumber,
        totalChapters: context.totalChapters,
        status: "stopped",
        progress: job.progress,
        message: `Da dung gen voice o chuong ${context.chapterNumber}/10`,
        filePath: context.filePath,
      });
      return "stopped";
    }

    if (job.state === "failed") {
      throw new Error(`Chapter ${context.chapterNumber} voice generation failed: ${job.error || job.message || "unknown error"}`);
    }

    return job;
  }
}

function createStoppedResult(directoryPath: string, filePaths: string[], voiceId: string): StoryVoiceGenerationResult {
  return {
    directoryPath,
    filePaths,
    voiceId,
    generatedAt: new Date().toISOString(),
    status: "stopped",
  };
}

async function shouldStopVoiceGeneration(
  control: StoryTtsControl | undefined,
  context: StoryTtsControlContext,
  jobId?: string,
) {
  return Boolean(await control?.shouldStop?.({
    ...context,
    jobId,
  }));
}

function selectChaptersForMode(chapters: ReturnType<typeof getCompleteChapters>, mode: StoryTtsRunMode, chapterNumber?: number) {
  if (mode !== "retry") {
    return chapters;
  }

  const targetChapterNumber = Number(chapterNumber);
  const chapter = chapters.find((item) => item.chapterNumber === targetChapterNumber);
  if (!chapter) {
    throw new Error(`Chuong ${chapterNumber || ""} khong ton tai de retry voice.`);
  }

  return [chapter];
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function getCompleteChapters(storyPayload: StoryPayload) {
  const chapters = [...(storyPayload.chapters || [])].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterNumbers = new Set(chapters.map((chapter) => chapter.chapterNumber));
  const hasAllChapters =
    chapters.length >= 10 &&
    Array.from({ length: 10 }, (_, index) => index + 1).every((number) => chapterNumbers.has(number));
  if (!hasAllChapters) {
    throw new Error("Cần đủ 10 chương đã draft trước khi gen voice.");
  }

  return chapters.slice(0, 10);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
