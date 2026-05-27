import fs from "node:fs/promises";
import path from "node:path";

import { slugify } from "../../lib/slug";
import type { StoryPayload } from "../../types/story";

export type StoryPosterStatus = "completed" | "failed" | "skipped";

export type StoryPosterResult = {
  status: StoryPosterStatus;
  title: string;
  model: string;
  size: string;
  generatedAt: string;
  filePath?: string;
  error?: string;
};

type StoryPosterServiceOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  size?: string;
  quality?: string;
  outputRoot: string;
  timeoutMs?: number;
  enabled?: boolean;
  fetch?: typeof fetch;
};

type ImageGenerationResponse = {
  data?: Array<{
    b64_json?: string;
  }>;
};

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-image-2";
const DEFAULT_SIZE = "1536x1024";
const DEFAULT_QUALITY = "high";
const DEFAULT_TIMEOUT_MS = 300_000;

export class StoryPosterService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly size: string;
  private readonly quality: string;
  private readonly outputRoot: string;
  private readonly timeoutMs: number;
  private readonly enabled: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: StoryPosterServiceOptions) {
    this.apiKey = options.apiKey?.trim() ?? "";
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = options.model || DEFAULT_MODEL;
    this.size = options.size || DEFAULT_SIZE;
    this.quality = options.quality || DEFAULT_QUALITY;
    this.outputRoot = options.outputRoot;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.enabled = options.enabled ?? true;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async generatePoster(storyPayload: StoryPayload): Promise<StoryPosterResult> {
    const title = storyPayload.title || storyPayload.request.titleHint || "Drama15 Story";
    const generatedAt = new Date().toISOString();
    const baseResult = {
      title,
      model: this.model,
      size: this.size,
      generatedAt,
    };

    if (!this.enabled) {
      return {
        ...baseResult,
        status: "skipped",
        error: "Poster image generation is disabled.",
      };
    }

    if (!isUsableApiKey(this.apiKey)) {
      return {
        ...baseResult,
        status: "skipped",
        error: "OpenAI image API key is not configured.",
      };
    }

    try {
      const imageBase64 = await this.requestImageBase64(buildStoryPosterPrompt(storyPayload, title));
      const posterDirectory = path.join(this.outputRoot, "posters");
      const filePath = path.join(posterDirectory, `${slugify(title || "drama15-story")}-poster.png`);
      await fs.mkdir(posterDirectory, { recursive: true });
      await fs.writeFile(filePath, Buffer.from(stripDataUrlPrefix(imageBase64), "base64"));

      return {
        ...baseResult,
        status: "completed",
        filePath,
      };
    } catch (error) {
      return {
        ...baseResult,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async requestImageBase64(prompt: string) {
    const response = await this.fetchWithTimeout(`${this.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt,
        size: this.size,
        quality: this.quality,
        output_format: "png",
        n: 1,
      }),
    });
    const rawBody = await response.text();

    if (!response.ok) {
      throw new Error(`OpenAI image API returned HTTP ${response.status}: ${rawBody.slice(0, 300)}`);
    }

    const parsed = JSON.parse(rawBody) as ImageGenerationResponse;
    const imageBase64 = parsed.data?.[0]?.b64_json;
    if (!imageBase64) {
      throw new Error("OpenAI image API did not return b64_json image data.");
    }

    return imageBase64;
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function buildStoryPosterPrompt(storyPayload: StoryPayload, title: string) {
  const heroine = storyPayload.storyBible.heroine;
  const strengths = heroine.strengths.join(", ");

  return [
    "Create a 16:9 commercial novel poster for an adult serialized drama.",
    `Use the exact title text: "${title}".`,
    "Layout: left side has clean readable title typography with strong negative space; right side shows the main character.",
    `Right side character: ${heroine.name}, an adult woman, realistic candid photo style, natural light, emotionally alert, cinematic but not glossy.`,
    `Character context: ${heroine.wound}. Strengths: ${strengths}.`,
    `Story premise: ${storyPayload.storyBible.premise}`,
    `Conflict mood: ${storyPayload.concept.conflictEngine}`,
    "Do not add chapter titles, author names, watermarks, logos, UI, captions, or extra words.",
    "Keep all people visibly adult. Make the image feel like a real candid photo, not anime, painting, or illustration.",
  ].join("\n");
}

function isUsableApiKey(apiKey: string) {
  const normalized = apiKey.trim().toLowerCase();
  return Boolean(normalized) && normalized !== "dummy";
}

function stripDataUrlPrefix(value: string) {
  const marker = "base64,";
  const markerIndex = value.indexOf(marker);
  return markerIndex >= 0 ? value.slice(markerIndex + marker.length) : value;
}
