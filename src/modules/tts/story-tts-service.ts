import fs from "node:fs/promises";
import path from "node:path";

import { slugify } from "../../lib/slug";
import type { StoryPayload } from "../../types/story";
import type { CreateLongTtsJobInput, OmniVoiceApiClient, OmniVoiceLongTtsJob } from "./omnivoice-api-client";

export type StoryTtsProgressEvent = {
  chapterNumber: number;
  totalChapters: number;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  message: string;
  filePath?: string;
};

export type GenerateStoryVoiceInput = {
  storyPayload: StoryPayload;
  voiceId: string;
  speed: number;
  pitch: number;
  outputRoot: string;
  onProgress?: (event: StoryTtsProgressEvent) => void;
};

export type StoryVoiceGenerationResult = {
  directoryPath: string;
  filePaths: string[];
  voiceId: string;
  generatedAt: string;
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
    if (!voiceId) {
      throw new Error("Chá»n Voice ID trÆ°á»›c khi gen voice.");
    }

    const directoryPath = path.join(input.outputRoot, `${slugify(input.storyPayload.title || "drama15-story")}-voice`);
    await fs.mkdir(directoryPath, { recursive: true });

    const filePaths: string[] = [];
    for (const chapter of chapters) {
      input.onProgress?.({
        chapterNumber: chapter.chapterNumber,
        totalChapters: chapters.length,
        status: "queued",
        progress: 0,
        message: `Äang táº¡o job voice chÆ°Æ¡ng ${chapter.chapterNumber}/15`,
      });

      const job = await this.client.createLongTtsJob({
        voiceId,
        text: chapter.text.trim(),
        abbreviations: "",
        speed: input.speed,
        pitch: input.pitch,
      } satisfies CreateLongTtsJobInput);
      const completed = await this.waitForJob(job, chapter.chapterNumber, chapters.length, input.onProgress);
      const audio = await this.client.downloadLongTtsJob(completed.jobId);
      const filePath = path.join(directoryPath, `chapter-${String(chapter.chapterNumber).padStart(2, "0")}.wav`);
      await fs.writeFile(filePath, audio);
      filePaths.push(filePath);
      input.onProgress?.({
        chapterNumber: chapter.chapterNumber,
        totalChapters: chapters.length,
        status: "completed",
        progress: 100,
        message: `ÄÃ£ lÆ°u voice chÆ°Æ¡ng ${chapter.chapterNumber}/15`,
        filePath,
      });
    }

    return {
      directoryPath,
      filePaths,
      voiceId,
      generatedAt: new Date().toISOString(),
    };
  }

  private async waitForJob(
    initialJob: OmniVoiceLongTtsJob,
    chapterNumber: number,
    totalChapters: number,
    onProgress?: (event: StoryTtsProgressEvent) => void,
  ) {
    let job = initialJob;
    while (job.state === "queued" || job.state === "running") {
      onProgress?.({
        chapterNumber,
        totalChapters,
        status: job.state,
        progress: job.progress,
        message: job.message || `Äang gen voice chÆ°Æ¡ng ${chapterNumber}/15`,
      });
      await delay(this.pollIntervalMs);
      job = await this.client.getLongTtsJob(job.jobId);
    }

    if (job.state === "failed") {
      throw new Error(`Chapter ${chapterNumber} voice generation failed: ${job.error || job.message || "unknown error"}`);
    }

    return job;
  }
}

function getCompleteChapters(storyPayload: StoryPayload) {
  const chapters = [...(storyPayload.chapters || [])].sort((a, b) => a.chapterNumber - b.chapterNumber);
  const chapterNumbers = new Set(chapters.map((chapter) => chapter.chapterNumber));
  const hasAllChapters =
    chapters.length >= 15 &&
    Array.from({ length: 15 }, (_, index) => index + 1).every((number) => chapterNumbers.has(number));
  if (!hasAllChapters) {
    throw new Error("Cáº§n Ä‘á»§ 15 chÆ°Æ¡ng Ä‘Ã£ draft trÆ°á»›c khi gen voice.");
  }

  return chapters.slice(0, 15);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
