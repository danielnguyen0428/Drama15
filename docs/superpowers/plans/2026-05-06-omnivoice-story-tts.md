# OmniVoice Story TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Drama15 Lite Studio `2.0.3` support for generating WAV voice audio for all 15 drafted chapters through the OmniVoice local API server using one selected `voice_id`.

**Architecture:** Electron main owns OmniVoice HTTP calls, polling, file writes, and story history updates. The renderer only displays TTS settings, voice selection, progress, and user intent. New TTS modules stay under `src/modules/tts/` so `main.ts` remains mostly IPC wiring.

**Tech Stack:** TypeScript, Electron IPC/preload, Node `fetch`, Node test runner, existing JSON store pattern, OmniVoice local API endpoints.

---

## File Structure

- Create `src/modules/tts/omnivoice-tts-config-store.ts`: load/save local TTS settings in `drama15-tts-config.json`.
- Create `tests/tts/omnivoice-tts-config-store.test.ts`: config defaults, path normalization, API base trimming, speed/pitch bounds.
- Create `src/modules/tts/omnivoice-api-client.ts`: typed wrapper for OmniVoice `/api/health`, `/api/voices`, `/api/tts-long-jobs`, polling, and WAV download.
- Create `tests/tts/omnivoice-api-client.test.ts`: fake `fetch` coverage for paths, payloads, owner token header, and error handling.
- Create `src/modules/tts/story-tts-service.ts`: 10-chapter validation, output path creation, sequential chapter job generation, polling, WAV writes, and progress callbacks.
- Create `tests/tts/story-tts-service.test.ts`: service-level tests with a fake client and temporary output directory.
- Modify `src/modules/session/story-history-store.ts`: add voice export metadata.
- Modify `tests/session/story-history-store.test.ts`: assert voice exports persist and legacy entries still load.
- Modify `src/modules/runtime/create-app-services.ts`: instantiate TTS config store, API client, and story TTS service.
- Modify `src/electron/main.ts`: add TTS IPC handlers and progress forwarding.
- Modify `src/electron/preload.ts`: expose TTS methods and `onTtsProgress`.
- Modify `desktop/renderer/index.html`: add compact Voice panel.
- Modify `desktop/renderer/renderer.js`: wire TTS state, config, voice loading, generation, progress rendering, disabled states, and history refresh.
- Modify `desktop/renderer/styles.css`: add compact Voice panel, progress, and status styles using existing tokens.
- Modify `tests/desktop/renderer-ui-copy.test.ts`: replace old "without voice controls" assertions with expected Voice panel/IPC checks.
- Modify `package.json` and `package-lock.json`: bump version from `2.0.2` to `2.0.3`.
- Modify `README.md`: add brief TTS workflow and OmniVoice server prerequisite.

---

### Task 1: TTS Config Store

**Files:**
- Create: `src/modules/tts/omnivoice-tts-config-store.ts`
- Test: `tests/tts/omnivoice-tts-config-store.test.ts`

- [ ] **Step 1: Write the failing config store tests**

Create `tests/tts/omnivoice-tts-config-store.test.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OmniVoiceTtsConfigStore } from "../../src/modules/tts/omnivoice-tts-config-store";

test("OmniVoiceTtsConfigStore defaults to local OmniVoice API and story voice output directory", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-tts-config-"));
  const store = new OmniVoiceTtsConfigStore({ configRoot });

  const config = await store.load();

  assert.equal(config.apiBase, "http://127.0.0.1:8001");
  assert.equal(config.selectedVoiceId, "");
  assert.equal(config.speed, 1);
  assert.equal(config.pitch, 0);
  assert.equal(config.outputRoot, path.join(configRoot, "outputs", "voice"));
});

test("OmniVoiceTtsConfigStore saves normalized settings without secret fields", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-tts-config-"));
  const store = new OmniVoiceTtsConfigStore({ configRoot });
  const outputRoot = path.join(configRoot, "custom voice");

  const saved = await store.save({
    apiBase: " http://127.0.0.1:8001/ ",
    selectedVoiceId: " voice-main ",
    speed: 1.25,
    pitch: -5,
    outputRoot,
    ownerToken: "must-not-persist",
  } as Record<string, unknown>);
  const reloaded = await store.load();
  const raw = await fs.readFile(path.join(configRoot, "drama15-tts-config.json"), "utf8");

  assert.equal(saved.apiBase, "http://127.0.0.1:8001");
  assert.equal(saved.selectedVoiceId, "voice-main");
  assert.equal(saved.speed, 1.25);
  assert.equal(saved.pitch, -5);
  assert.equal(saved.outputRoot, path.resolve(outputRoot));
  assert.deepEqual(reloaded, saved);
  assert.doesNotMatch(raw, /ownerToken|admin|token|secret/i);
});

test("OmniVoiceTtsConfigStore clamps invalid speed and pitch to safe defaults", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-tts-config-"));
  const store = new OmniVoiceTtsConfigStore({ configRoot });

  const config = await store.save({
    apiBase: "",
    speed: 9,
    pitch: -99,
  });

  assert.equal(config.apiBase, "http://127.0.0.1:8001");
  assert.equal(config.speed, 1);
  assert.equal(config.pitch, 0);
});
```

- [ ] **Step 2: Run the config store test and confirm RED**

Run:

```powershell
npm test -- tests\tts\omnivoice-tts-config-store.test.ts
```

Expected: FAIL because `src/modules/tts/omnivoice-tts-config-store.ts` does not exist.

- [ ] **Step 3: Implement the config store**

Create `src/modules/tts/omnivoice-tts-config-store.ts`:

```ts
import fs from "node:fs/promises";
import path from "node:path";

import { getConfigRoot } from "../../lib/runtime";

export type OmniVoiceTtsConfig = {
  apiBase: string;
  selectedVoiceId: string;
  speed: number;
  pitch: number;
  outputRoot: string;
};

type OmniVoiceTtsConfigStoreOptions = {
  configRoot?: string;
};

const TTS_CONFIG_FILE_NAME = "drama15-tts-config.json";
const DEFAULT_API_BASE = "http://127.0.0.1:8001";

export class OmniVoiceTtsConfigStore {
  private readonly configRoot: string;

  constructor(options: OmniVoiceTtsConfigStoreOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
  }

  async load(): Promise<OmniVoiceTtsConfig> {
    try {
      const raw = await fs.readFile(this.configPath, "utf8");
      return normalizeOmniVoiceTtsConfig(JSON.parse(raw), this.configRoot);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return getDefaultOmniVoiceTtsConfig(this.configRoot);
      }
      if (error instanceof SyntaxError) {
        return getDefaultOmniVoiceTtsConfig(this.configRoot);
      }
      throw error;
    }
  }

  async save(input: Partial<OmniVoiceTtsConfig>): Promise<OmniVoiceTtsConfig> {
    const config = normalizeOmniVoiceTtsConfig(input, this.configRoot);
    await fs.mkdir(this.configRoot, { recursive: true });
    await fs.writeFile(this.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return config;
  }

  private get configPath() {
    return path.join(this.configRoot, TTS_CONFIG_FILE_NAME);
  }
}

export function getDefaultOmniVoiceTtsConfig(configRoot = getConfigRoot()): OmniVoiceTtsConfig {
  return {
    apiBase: DEFAULT_API_BASE,
    selectedVoiceId: "",
    speed: 1,
    pitch: 0,
    outputRoot: path.join(configRoot, "outputs", "voice"),
  };
}

function normalizeOmniVoiceTtsConfig(input: unknown, configRoot: string): OmniVoiceTtsConfig {
  const value = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const defaults = getDefaultOmniVoiceTtsConfig(configRoot);
  return {
    apiBase: normalizeApiBase(value.apiBase, defaults.apiBase),
    selectedVoiceId: String(value.selectedVoiceId || "").trim(),
    speed: normalizeNumber(value.speed, 0.5, 1.5, defaults.speed),
    pitch: normalizeNumber(value.pitch, -20, 20, defaults.pitch),
    outputRoot: normalizeOutputRoot(value.outputRoot, defaults.outputRoot),
  };
}

function normalizeApiBase(value: unknown, fallback: string) {
  const apiBase = String(value || "").trim().replace(/\/+$/, "");
  return apiBase || fallback;
}

function normalizeOutputRoot(value: unknown, fallback: string) {
  const outputRoot = String(value || "").trim();
  return outputRoot ? path.resolve(outputRoot) : fallback;
}

function normalizeNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
```

- [ ] **Step 4: Run the config store test and confirm GREEN**

Run:

```powershell
npm test -- tests\tts\omnivoice-tts-config-store.test.ts
```

Expected: PASS for all 3 tests.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add -- src/modules/tts/omnivoice-tts-config-store.ts tests/tts/omnivoice-tts-config-store.test.ts
git commit -m "feat: add OmniVoice TTS config store"
```

Stage only these files. The repository has many unrelated untracked files.

---

### Task 2: OmniVoice API Client

**Files:**
- Create: `src/modules/tts/omnivoice-api-client.ts`
- Test: `tests/tts/omnivoice-api-client.test.ts`

- [ ] **Step 1: Write the failing API client tests**

Create `tests/tts/omnivoice-api-client.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { OmniVoiceApiClient } from "../../src/modules/tts/omnivoice-api-client";

test("OmniVoiceApiClient lists voices from the configured API base", async () => {
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input));
    return Response.json({
      voices: [
        {
          voice_id: "main-voice",
          name: "Main Voice",
          ref_text: "Reference",
          created_at: "2026-05-06T00:00:00Z",
          updated_at: "2026-05-06T00:00:00Z",
        },
      ],
    });
  }) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({ apiBase: "http://127.0.0.1:8001/" });
    const voices = await client.listVoices();

    assert.equal(urls[0], "http://127.0.0.1:8001/api/voices");
    assert.equal(voices[0]?.voiceId, "main-voice");
    assert.equal(voices[0]?.name, "Main Voice");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OmniVoiceApiClient creates and reads long jobs with owner token header", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/api/tts-long-jobs")) {
      return Response.json({
        job_id: "job-1",
        job: {
          job_id: "job-1",
          voice_id: "main-voice",
          state: "queued",
          total_chunks: 2,
          completed_chunks: 0,
          progress: 0,
          message: "queued",
          error: "",
          download_ready: false,
        },
      });
    }
    return Response.json({
      job: {
        job_id: "job-1",
        voice_id: "main-voice",
        state: "completed",
        total_chunks: 2,
        completed_chunks: 2,
        progress: 100,
        message: "done",
        error: "",
        download_ready: true,
      },
    });
  }) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({
      apiBase: "http://127.0.0.1:8001",
      ownerToken: "owner-test",
    });

    const created = await client.createLongTtsJob({
      voiceId: "main-voice",
      text: "Chapter text",
      speed: 1.1,
      pitch: 2,
    });
    const loaded = await client.getLongTtsJob("job-1");
    const createBody = JSON.parse(String(calls[0]?.init?.body));

    assert.equal(created.jobId, "job-1");
    assert.equal(loaded.state, "completed");
    assert.equal(calls[0]?.init?.headers && (calls[0].init.headers as Record<string, string>)["X-Voice-Owner-Token"], "owner-test");
    assert.deepEqual(createBody, {
      voice_id: "main-voice",
      text: "Chapter text",
      abbreviations: "",
      speed: 1.1,
      pitch: 2,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OmniVoiceApiClient downloads WAV audio as a Buffer", async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response(new Uint8Array([82, 73, 70, 70]), {
      headers: {
        "Content-Type": "audio/wav",
      },
    });
  }) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({
      apiBase: "http://127.0.0.1:8001",
      ownerToken: "owner-test",
    });
    const audio = await client.downloadLongTtsJob("job-1");

    assert.equal(Buffer.isBuffer(audio), true);
    assert.equal(audio.toString("ascii"), "RIFF");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OmniVoiceApiClient turns non-OK responses into readable errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => Response.json({ detail: "Chọn Voice ID trước khi tạo audio dài." }, { status: 400 })) as typeof fetch;

  try {
    const client = new OmniVoiceApiClient({ apiBase: "http://127.0.0.1:8001" });
    await assert.rejects(
      () => client.listVoices(),
      /OmniVoice returned HTTP 400\. Chọn Voice ID trước khi tạo audio dài\./,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

- [ ] **Step 2: Run the API client test and confirm RED**

Run:

```powershell
npm test -- tests\tts\omnivoice-api-client.test.ts
```

Expected: FAIL because `src/modules/tts/omnivoice-api-client.ts` does not exist.

- [ ] **Step 3: Implement the API client**

Create `src/modules/tts/omnivoice-api-client.ts`:

```ts
import { randomUUID } from "node:crypto";

export type OmniVoiceClientVoice = {
  voiceId: string;
  name: string;
  refText: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
};

export type OmniVoiceLongTtsJob = {
  jobId: string;
  voiceId: string;
  state: "queued" | "running" | "completed" | "failed";
  totalChunks: number;
  completedChunks: number;
  progress: number;
  message: string;
  error: string;
  downloadReady: boolean;
};

export type CreateLongTtsJobInput = {
  voiceId: string;
  text: string;
  abbreviations?: string;
  speed: number;
  pitch: number;
};

type OmniVoiceApiClientOptions = {
  apiBase: string;
  ownerToken?: string;
};

export class OmniVoiceApiClient {
  private readonly apiBase: string;
  private readonly ownerToken: string;

  constructor(options: OmniVoiceApiClientOptions) {
    this.apiBase = normalizeApiBase(options.apiBase);
    this.ownerToken = options.ownerToken?.trim() || randomUUID();
  }

  async checkHealth() {
    return this.fetchJson<Record<string, unknown>>("/api/health");
  }

  async listVoices(): Promise<OmniVoiceClientVoice[]> {
    const payload = await this.fetchJson<{ voices?: unknown }>("/api/voices");
    return Array.isArray(payload.voices) ? payload.voices.map(normalizeVoice).filter(Boolean) as OmniVoiceClientVoice[] : [];
  }

  async createLongTtsJob(input: CreateLongTtsJobInput): Promise<OmniVoiceLongTtsJob> {
    const payload = await this.fetchJson<{ job?: unknown; job_id?: string }>("/api/tts-long-jobs", {
      method: "POST",
      body: {
        voice_id: input.voiceId,
        text: input.text,
        abbreviations: input.abbreviations || "",
        speed: input.speed,
        pitch: input.pitch,
      },
      ownerToken: true,
    });
    return normalizeJob(payload.job);
  }

  async getLongTtsJob(jobId: string): Promise<OmniVoiceLongTtsJob> {
    const payload = await this.fetchJson<{ job?: unknown }>(`/api/tts-long-jobs/${encodeURIComponent(jobId)}`, {
      ownerToken: true,
    });
    return normalizeJob(payload.job);
  }

  async downloadLongTtsJob(jobId: string): Promise<Buffer> {
    const response = await this.fetchRaw(`/api/tts-long-jobs/${encodeURIComponent(jobId)}/download`, {
      ownerToken: true,
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("OmniVoice returned an empty audio file.");
    }
    return bytes;
  }

  private async fetchJson<T>(endpoint: string, options: { method?: "GET" | "POST"; body?: unknown; ownerToken?: boolean } = {}): Promise<T> {
    const response = await this.fetchRaw(endpoint, options);
    const text = await response.text();
    return text ? JSON.parse(text) as T : {} as T;
  }

  private async fetchRaw(endpoint: string, options: { method?: "GET" | "POST"; body?: unknown; ownerToken?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    if (options.ownerToken) {
      headers["X-Voice-Owner-Token"] = this.ownerToken;
    }

    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`OmniVoice returned HTTP ${response.status}. ${await readErrorMessage(response)}`);
    }
    return response;
  }
}

function normalizeApiBase(value: string) {
  return String(value || "http://127.0.0.1:8001").trim().replace(/\/+$/, "");
}

function normalizeVoice(value: unknown): OmniVoiceClientVoice | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const voiceId = String(record.voice_id || "").trim();
  if (!voiceId) return null;
  return {
    voiceId,
    name: String(record.name || voiceId),
    refText: String(record.ref_text || ""),
    createdAt: String(record.created_at || ""),
    updatedAt: String(record.updated_at || ""),
    canDelete: Boolean(record.can_delete),
  };
}

function normalizeJob(value: unknown): OmniVoiceLongTtsJob {
  if (!value || typeof value !== "object") {
    throw new Error("OmniVoice response did not include a job.");
  }
  const record = value as Record<string, unknown>;
  return {
    jobId: String(record.job_id || ""),
    voiceId: String(record.voice_id || ""),
    state: normalizeJobState(record.state),
    totalChunks: Number(record.total_chunks || 0),
    completedChunks: Number(record.completed_chunks || 0),
    progress: Number(record.progress || 0),
    message: String(record.message || ""),
    error: String(record.error || ""),
    downloadReady: Boolean(record.download_ready),
  };
}

function normalizeJobState(value: unknown): OmniVoiceLongTtsJob["state"] {
  if (value === "queued" || value === "running" || value === "completed" || value === "failed") {
    return value;
  }
  return "queued";
}

async function readErrorMessage(response: Response) {
  const text = await response.text();
  if (!text.trim()) return response.statusText;
  try {
    const parsed = JSON.parse(text) as { detail?: string; message?: string };
    return parsed.detail || parsed.message || text.trim();
  } catch {
    return text.trim();
  }
}
```

- [ ] **Step 4: Run the API client test and confirm GREEN**

Run:

```powershell
npm test -- tests\tts\omnivoice-api-client.test.ts
```

Expected: PASS for all 4 tests.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git add -- src/modules/tts/omnivoice-api-client.ts tests/tts/omnivoice-api-client.test.ts
git commit -m "feat: add OmniVoice API client"
```

---

### Task 3: Story TTS Service

**Files:**
- Create: `src/modules/tts/story-tts-service.ts`
- Test: `tests/tts/story-tts-service.test.ts`

- [ ] **Step 1: Write the failing service tests**

Create `tests/tts/story-tts-service.test.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { StoryTtsService } from "../../src/modules/tts/story-tts-service";
import type { OmniVoiceApiClient, OmniVoiceLongTtsJob } from "../../src/modules/tts/omnivoice-api-client";
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

  assert.equal(result.filePaths.length, 15);
  assert.equal(createdTexts.length, 15);
  assert.equal(createdTexts[0], "Chapter 1 text.");
  assert.equal(await fs.readFile(result.filePaths[0], "utf8"), "RIFF-test");
  assert.match(result.directoryPath, /voice-story-voice/);
  assert.deepEqual(progress.filter((item) => item.endsWith(":completed")).length, 15);
});

test("StoryTtsService rejects stories that do not have all 10 chapter drafts", async () => {
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
```

- [ ] **Step 2: Run the service test and confirm RED**

Run:

```powershell
npm test -- tests\tts\story-tts-service.test.ts
```

Expected: FAIL because `src/modules/tts/story-tts-service.ts` does not exist.

- [ ] **Step 3: Implement StoryTtsService**

Create `src/modules/tts/story-tts-service.ts`:

```ts
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
      throw new Error("Chọn Voice ID trước khi gen voice.");
    }

    const directoryPath = path.join(
      input.outputRoot,
      `${slugify(input.storyPayload.title || "drama15-story")}-voice`,
    );
    await fs.mkdir(directoryPath, { recursive: true });

    const filePaths: string[] = [];
    for (const chapter of chapters) {
      input.onProgress?.({
        chapterNumber: chapter.chapterNumber,
        totalChapters: chapters.length,
        status: "queued",
        progress: 0,
        message: `Đang tạo job voice chương ${chapter.chapterNumber}/10`,
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
        message: `Đã lưu voice chương ${chapter.chapterNumber}/10`,
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
        message: job.message || `Đang gen voice chương ${chapterNumber}/10`,
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
  const hasAllChapters = chapters.length >= 10 && Array.from({ length: 10 }, (_, index) => index + 1).every((number) => chapterNumbers.has(number));
  if (!hasAllChapters) {
    throw new Error("Cần đủ 10 chương đã draft trước khi gen voice.");
  }
  return chapters.slice(0, 15);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run the service test and confirm GREEN**

Run:

```powershell
npm test -- tests\tts\story-tts-service.test.ts
```

Expected: PASS for all 3 tests.

- [ ] **Step 5: Commit Task 3**

Run:

```powershell
git add -- src/modules/tts/story-tts-service.ts tests/tts/story-tts-service.test.ts
git commit -m "feat: generate story voice files"
```

---

### Task 4: Story History Voice Export Metadata

**Files:**
- Modify: `src/modules/session/story-history-store.ts`
- Test: `tests/session/story-history-store.test.ts`

- [ ] **Step 1: Add failing history tests**

Append this test to `tests/session/story-history-store.test.ts`:

```ts
test("StoryHistoryStore records voice export directories and keeps legacy exports valid", async () => {
  const configRoot = await fs.mkdtemp(path.join(os.tmpdir(), "drama15-story-history-"));
  const store = new StoryHistoryStore({ configRoot, maxEntries: 5 });
  const story = makeStory();

  const entry = await store.recordVoiceExport(story, {
    directoryPath: "D:/exports/story-voice",
    filePaths: ["D:/exports/story-voice/chapter-01.wav"],
    voiceId: "main-voice",
    generatedAt: "2026-05-06T00:00:00.000Z",
  });
  const loaded = await store.get(entry.id);

  assert.equal(loaded?.exports.voiceDirectories[0]?.directoryPath, "D:/exports/story-voice");
  assert.equal(loaded?.exports.voiceDirectories[0]?.voiceId, "main-voice");
  assert.deepEqual(loaded?.exports.voiceDirectories[0]?.filePaths, ["D:/exports/story-voice/chapter-01.wav"]);
});
```

- [ ] **Step 2: Run history tests and confirm RED**

Run:

```powershell
npm test -- tests\session\story-history-store.test.ts
```

Expected: FAIL because `recordVoiceExport` and `exports.voiceDirectories` do not exist.

- [ ] **Step 3: Extend history store types and methods**

Modify `src/modules/session/story-history-store.ts`:

```ts
export type StoryHistoryVoiceExportPath = StoryHistoryExportPath & {
  voiceId: string;
  generatedAt: string;
};

export type StoryHistoryEntry = {
  id: string;
  title: string;
  linePreset: string;
  outputLanguage: string;
  chapterCount: number;
  createdAt: string;
  updatedAt: string;
  storyPayload: StoryPayload;
  exports: {
    chapterMarkdownDirectories: StoryHistoryExportPath[];
    pdfFiles: StoryHistoryExportPath[];
    voiceDirectories: StoryHistoryVoiceExportPath[];
  };
};
```

Update the default `exports` object in `upsertStory`:

```ts
exports: normalizeStoryHistoryExports(existing?.exports),
```

Add the method:

```ts
async recordVoiceExport(
  storyPayload: StoryPayload,
  exportPath: {
    directoryPath: string;
    filePaths: string[];
    voiceId: string;
    generatedAt: string;
  },
) {
  const entry = await this.upsertStory(storyPayload);
  entry.exports = normalizeStoryHistoryExports(entry.exports);
  entry.exports.voiceDirectories = [
    {
      directoryPath: exportPath.directoryPath,
      filePaths: exportPath.filePaths,
      voiceId: exportPath.voiceId,
      generatedAt: exportPath.generatedAt,
      exportedAt: new Date().toISOString(),
    },
    ...entry.exports.voiceDirectories.filter((item) => item.directoryPath !== exportPath.directoryPath),
  ];
  entry.updatedAt = new Date().toISOString();
  await this.replaceEntry(entry);
  return entry;
}
```

Add helper:

```ts
function normalizeStoryHistoryExports(value: unknown): StoryHistoryEntry["exports"] {
  const exports = value && typeof value === "object" ? value as Partial<StoryHistoryEntry["exports"]> : {};
  return {
    chapterMarkdownDirectories: Array.isArray(exports.chapterMarkdownDirectories) ? exports.chapterMarkdownDirectories : [],
    pdfFiles: Array.isArray(exports.pdfFiles) ? exports.pdfFiles : [],
    voiceDirectories: Array.isArray(exports.voiceDirectories) ? exports.voiceDirectories : [],
  };
}
```

Use `normalizeStoryHistoryExports` in `isStoryHistoryEntry` filtering by mapping loaded entries:

```ts
return parsed
  .filter(isStoryHistoryEntry)
  .map((entry) => ({
    ...entry,
    exports: normalizeStoryHistoryExports(entry.exports),
  }))
  .slice(0, this.maxEntries);
```

- [ ] **Step 4: Run history tests and confirm GREEN**

Run:

```powershell
npm test -- tests\session\story-history-store.test.ts
```

Expected: PASS for all history store tests.

- [ ] **Step 5: Commit Task 4**

Run:

```powershell
git add -- src/modules/session/story-history-store.ts tests/session/story-history-store.test.ts
git commit -m "feat: record voice exports in story history"
```

---

### Task 5: Runtime Services and Electron IPC

**Files:**
- Modify: `src/modules/runtime/create-app-services.ts`
- Modify: `src/electron/main.ts`
- Modify: `src/electron/preload.ts`
- Test: `tests/desktop/renderer-ui-copy.test.ts`

- [ ] **Step 1: Add failing static IPC assertions**

In `tests/desktop/renderer-ui-copy.test.ts`, replace the old test named `desktop exposes story history without voice generation controls` with this IPC-only test:

```ts
test("desktop exposes story history and OmniVoice TTS IPC", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const preloadTs = readProjectFile("src", "electron", "preload.ts");
  const mainTs = readProjectFile("src", "electron", "main.ts");
  const servicesTs = readProjectFile("src", "modules", "runtime", "create-app-services.ts");

  assert.match(indexHtml, /id="history-list"/);

  assert.match(preloadTs, /getTtsConfig/);
  assert.match(preloadTs, /saveTtsConfig/);
  assert.match(preloadTs, /listTtsVoices/);
  assert.match(preloadTs, /generateStoryVoice/);
  assert.match(preloadTs, /TTS_PROGRESS_CHANNEL/);

  assert.match(mainTs, /tts:get-config/);
  assert.match(mainTs, /tts:save-config/);
  assert.match(mainTs, /tts:list-voices/);
  assert.match(mainTs, /tts:generate-story/);
  assert.match(mainTs, /createTtsProgressForwarder/);

  assert.match(servicesTs, /ttsConfigStore/);
  assert.match(servicesTs, /omniVoiceApiClientFactory/);
  assert.match(servicesTs, /storyTtsService/);
});
```

- [ ] **Step 2: Run the static UI test and confirm RED**

Run:

```powershell
npm test -- tests\desktop\renderer-ui-copy.test.ts
```

Expected: FAIL because the TTS IPC and runtime service names do not exist.

- [ ] **Step 3: Wire runtime services**

Modify `src/modules/runtime/create-app-services.ts`:

```ts
import { OmniVoiceApiClient } from "../tts/omnivoice-api-client";
import { OmniVoiceTtsConfigStore } from "../tts/omnivoice-tts-config-store";
import { StoryTtsService } from "../tts/story-tts-service";
```

Inside `createAppServices()`:

```ts
const ttsConfigStore = new OmniVoiceTtsConfigStore();
const omniVoiceApiClientFactory = (apiBase: string) => new OmniVoiceApiClient({ apiBase });
const storyTtsServiceFactory = (apiBase: string) => {
  const client = omniVoiceApiClientFactory(apiBase);
  return new StoryTtsService({ client });
};
```

Return:

```ts
ttsConfigStore,
omniVoiceApiClientFactory,
storyTtsServiceFactory,
```

- [ ] **Step 4: Add preload TTS bridge**

Modify `src/electron/preload.ts`:

```ts
const TTS_PROGRESS_CHANNEL = "tts:progress";
```

Expose:

```ts
getTtsConfig: () => ipcRenderer.invoke("tts:get-config"),
saveTtsConfig: (payload: unknown) => ipcRenderer.invoke("tts:save-config", payload),
checkTtsHealth: () => ipcRenderer.invoke("tts:health"),
listTtsVoices: () => ipcRenderer.invoke("tts:list-voices"),
generateStoryVoice: (payload: unknown) => ipcRenderer.invoke("tts:generate-story", payload),
openTtsOutput: (payload: { path: string }) => ipcRenderer.invoke("tts:open-output", payload),
onTtsProgress: (listener: (payload: unknown) => void) => {
  const wrappedListener = (_event: unknown, payload: unknown) => listener(payload);
  ipcRenderer.on(TTS_PROGRESS_CHANNEL, wrappedListener);
  return () => {
    ipcRenderer.removeListener(TTS_PROGRESS_CHANNEL, wrappedListener);
  };
},
```

- [ ] **Step 5: Add main-process TTS IPC**

Modify `src/electron/main.ts`:

```ts
const TTS_PROGRESS_CHANNEL = "tts:progress";
```

Add handlers:

```ts
ipcMain.handle("tts:get-config", async () => ({
  ok: true,
  data: await services.ttsConfigStore.load(),
}));

ipcMain.handle("tts:save-config", async (_event, payload) => ({
  ok: true,
  data: await services.ttsConfigStore.save(payload),
}));

ipcMain.handle("tts:health", async () => {
  const config = await services.ttsConfigStore.load();
  const client = services.omniVoiceApiClientFactory(config.apiBase);
  const data = await client.checkHealth();
  return { ok: true, data };
});

ipcMain.handle("tts:list-voices", async () => {
  const config = await services.ttsConfigStore.load();
  const client = services.omniVoiceApiClientFactory(config.apiBase);
  return {
    ok: true,
    data: await client.listVoices(),
  };
});

ipcMain.handle("tts:generate-story", async (_event, payload: { storyPayload: StoryPayload; voiceId?: string; speed?: number; pitch?: number }) => {
  const config = await services.ttsConfigStore.save({
    selectedVoiceId: payload.voiceId,
    speed: payload.speed,
    pitch: payload.pitch,
  });
  const service = services.storyTtsServiceFactory(config.apiBase);
  const result = await service.generateStoryVoice({
    storyPayload: payload.storyPayload,
    voiceId: config.selectedVoiceId,
    speed: config.speed,
    pitch: config.pitch,
    outputRoot: config.outputRoot,
    onProgress: createTtsProgressForwarder(_event.sender),
  });
  const historyEntry = await services.storyHistoryStore.recordVoiceExport(payload.storyPayload, result);
  return {
    ok: true,
    data: result,
    storyHistory: await services.storyHistoryStore.list(),
    historyEntry,
  };
});

ipcMain.handle("tts:open-output", async (_event, payload: { path?: string }) => {
  const targetPath = String(payload?.path || "").trim();
  if (!targetPath) {
    return { ok: false, error: "TTS output path is required." };
  }
  const error = await shell.openPath(targetPath);
  return {
    ok: !error,
    error: error || undefined,
  };
});
```

Add forwarder:

```ts
function createTtsProgressForwarder(target: import("electron").WebContents) {
  return (progress: StoryTtsProgressEvent) => {
    target.send(TTS_PROGRESS_CHANNEL, progress);
  };
}
```

Import `StoryTtsProgressEvent` and `StoryPayload` at the top of `main.ts`.

- [ ] **Step 6: Run static IPC test and TypeScript build**

Run:

```powershell
npm test -- tests\desktop\renderer-ui-copy.test.ts
npm run build
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit Task 5**

Run:

```powershell
git add -- src/modules/runtime/create-app-services.ts src/electron/main.ts src/electron/preload.ts tests/desktop/renderer-ui-copy.test.ts
git commit -m "feat: expose OmniVoice TTS IPC"
```

---

### Task 6: Renderer Voice Panel

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/renderer.js`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/desktop/renderer-ui-copy.test.ts`

- [ ] **Step 1: Add failing Voice panel assertions**

Append this test to `tests/desktop/renderer-ui-copy.test.ts`:

```ts
test("desktop renders OmniVoice story TTS voice panel", () => {
  const indexHtml = readProjectFile("desktop", "renderer", "index.html");
  const rendererJs = readProjectFile("desktop", "renderer", "renderer.js");
  const stylesCss = readProjectFile("desktop", "renderer", "styles.css");

  assert.match(indexHtml, /id="tts-api-base"/);
  assert.match(indexHtml, /id="voice-id-select"/);
  assert.match(indexHtml, /id="generate-story-voice-button"/);
  assert.match(indexHtml, /Gen Voice 10/);

  assert.match(rendererJs, /ttsConfig/);
  assert.match(rendererJs, /loadOmniVoiceVoices/);
  assert.match(rendererJs, /generateStoryVoice/);
  assert.match(rendererJs, /handleTtsProgressEvent/);

  assert.match(stylesCss, /\.voice-progress/);
  assert.match(stylesCss, /\.mini-status/);
});
```

- [ ] **Step 2: Run the renderer test and confirm RED**

Run:

```powershell
npm test -- tests\desktop\renderer-ui-copy.test.ts
```

Expected: FAIL because the Voice panel, renderer wiring, and styles do not exist.

- [ ] **Step 3: Add the Voice panel markup**

In `desktop/renderer/index.html`, insert this panel after `Xuất File` and before `Lịch Sử`:

```html
<section class="panel voice-panel">
  <div class="panel-head">
    <h2>Voice</h2>
    <span class="mini-status" id="tts-status">Chưa kết nối</span>
  </div>
  <label class="field">
    <span>OmniVoice API</span>
    <input id="tts-api-base" type="text" placeholder="http://127.0.0.1:8001" />
  </label>
  <div class="settings-actions compact-actions">
    <button class="ghost-button" id="save-tts-config-button" type="button">Lưu</button>
    <button class="ghost-button" id="refresh-tts-voices-button" type="button">Voice ID</button>
  </div>
  <label class="field">
    <span>Voice ID</span>
    <select id="voice-id-select"></select>
  </label>
  <div class="field-grid compact-field-grid">
    <label class="field">
      <span>Tốc độ</span>
      <input id="tts-speed" type="number" min="0.5" max="1.5" step="0.05" value="1" />
    </label>
    <label class="field">
      <span>Pitch</span>
      <input id="tts-pitch" type="number" min="-20" max="20" step="1" value="0" />
    </label>
  </div>
  <button class="primary-button wide" id="generate-story-voice-button" type="button">Gen Voice 10 Chương</button>
  <div class="voice-progress" id="voice-progress"></div>
</section>
```

- [ ] **Step 4: Wire renderer state and elements**

In `desktop/renderer/renderer.js`, add to `MODE_LABELS`:

```js
tts: "Gen voice",
```

Add to `state`:

```js
ttsConfig: null,
ttsVoices: [],
ttsBusy: false,
ttsProgress: null,
```

Add to `elements`:

```js
ttsStatus: byId("tts-status"),
ttsApiBase: byId("tts-api-base"),
saveTtsConfigButton: byId("save-tts-config-button"),
refreshTtsVoicesButton: byId("refresh-tts-voices-button"),
voiceIdSelect: byId("voice-id-select"),
ttsSpeed: byId("tts-speed"),
ttsPitch: byId("tts-pitch"),
generateStoryVoiceButton: byId("generate-story-voice-button"),
voiceProgress: byId("voice-progress"),
```

After existing progress subscription:

```js
window.dramaStudio.onTtsProgress(handleTtsProgressEvent);
```

- [ ] **Step 5: Load and render TTS config on boot**

In `boot()`, after automation config:

```js
const ttsConfigResponse = await window.dramaStudio.getTtsConfig();
applyTtsConfig(ttsConfigResponse?.data || null);
await loadOmniVoiceVoices(false);
```

Add:

```js
function applyTtsConfig(config) {
  state.ttsConfig = config || {};
  elements.ttsApiBase.value = state.ttsConfig.apiBase || "http://127.0.0.1:8001";
  elements.ttsSpeed.value = String(state.ttsConfig.speed ?? 1);
  elements.ttsPitch.value = String(state.ttsConfig.pitch ?? 0);
}

async function saveTtsConfig() {
  const response = await window.dramaStudio.saveTtsConfig({
    apiBase: elements.ttsApiBase.value,
    selectedVoiceId: elements.voiceIdSelect.value,
    speed: Number(elements.ttsSpeed.value || 1),
    pitch: Number(elements.ttsPitch.value || 0),
  });
  if (!response?.ok) {
    throw new Error(response?.error || "Không lưu được cấu hình voice.");
  }
  applyTtsConfig(response.data);
  writeStatus("Đã lưu cấu hình voice.");
}
```

- [ ] **Step 6: Load voices and generate story voice**

Add:

```js
async function loadOmniVoiceVoices(showStatus = true) {
  try {
    const response = await window.dramaStudio.listTtsVoices();
    if (!response?.ok) {
      throw new Error(response?.error || "Không tải được Voice ID từ OmniVoice.");
    }
    state.ttsVoices = response.data || [];
    elements.ttsStatus.textContent = `${state.ttsVoices.length} voice`;
    renderTtsVoices();
    if (showStatus) {
      writeStatus(`Đã tải ${state.ttsVoices.length} Voice ID từ OmniVoice.`);
    }
  } catch (error) {
    state.ttsVoices = [];
    elements.ttsStatus.textContent = "Lỗi kết nối";
    renderTtsVoices();
    if (showStatus) {
      writeStatus(`OmniVoice lỗi: ${translateErrorMessage(error?.message || error)}`, true);
    }
  }
}

function renderTtsVoices() {
  if (!state.ttsVoices.length) {
    elements.voiceIdSelect.innerHTML = '<option value="">Chưa có Voice ID</option>';
    return;
  }
  const selected = state.ttsConfig?.selectedVoiceId || elements.voiceIdSelect.value || state.ttsVoices[0]?.voiceId || "";
  elements.voiceIdSelect.innerHTML = state.ttsVoices
    .map((voice) => `<option value="${escapeHtml(voice.voiceId)}">${escapeHtml(voice.name)} | ${escapeHtml(voice.voiceId)}</option>`)
    .join("");
  elements.voiceIdSelect.value = state.ttsVoices.some((voice) => voice.voiceId === selected) ? selected : state.ttsVoices[0].voiceId;
}

async function generateStoryVoice() {
  if (!hasDraftedChapters() || !state.currentStory?.chapters || state.currentStory.chapters.length < 15) {
    writeStatus("Cần đủ 10 chương đã draft trước khi gen voice.", true);
    return;
  }
  if (!elements.voiceIdSelect.value) {
    writeStatus("Chọn Voice ID trước khi gen voice.", true);
    return;
  }
  await runBusyTask("tts", async () => {
    state.ttsBusy = true;
    state.ttsProgress = null;
    syncButtons();
    try {
      const result = await window.dramaStudio.generateStoryVoice({
        storyPayload: state.currentStory,
        voiceId: elements.voiceIdSelect.value,
        speed: Number(elements.ttsSpeed.value || 1),
        pitch: Number(elements.ttsPitch.value || 0),
      });
      if (!result?.ok) {
        throw new Error(result?.error || "Gen voice lỗi.");
      }
      applyStoryHistoryPayload(result);
      writeStatus(`Đã gen ${result.data.filePaths.length} file voice tại ${result.data.directoryPath}.`);
    } finally {
      state.ttsBusy = false;
    }
    renderAll();
  });
}

function handleTtsProgressEvent(event) {
  state.ttsProgress = event;
  renderTtsProgress();
}

function renderTtsProgress() {
  if (!state.ttsProgress) {
    elements.voiceProgress.textContent = "Chưa chạy voice.";
    return;
  }
  const event = state.ttsProgress;
  elements.voiceProgress.textContent = `Chương ${event.chapterNumber}/10 · ${event.progress}% · ${normalizeDisplayText(event.message)}`;
}
```

- [ ] **Step 7: Add renderer events and disabled state**

In `attachEvents()`:

```js
elements.saveTtsConfigButton.addEventListener("click", async () => {
  await saveTtsConfig();
});

elements.refreshTtsVoicesButton.addEventListener("click", async () => {
  await saveTtsConfig();
  await loadOmniVoiceVoices(true);
});

elements.voiceIdSelect.addEventListener("change", scheduleSessionSave);
elements.ttsSpeed.addEventListener("change", scheduleSessionSave);
elements.ttsPitch.addEventListener("change", scheduleSessionSave);

elements.generateStoryVoiceButton.addEventListener("click", async () => {
  await generateStoryVoice();
});
```

In `syncButtons()`:

```js
const ttsDisabled = storyDisabled || state.ttsBusy || !hasDraftedChapters() || !state.currentStory?.chapters || state.currentStory.chapters.length < 15 || !elements.voiceIdSelect.value;
elements.generateStoryVoiceButton.disabled = ttsDisabled;
elements.ttsApiBase.disabled = storyDisabled || state.ttsBusy;
elements.voiceIdSelect.disabled = storyDisabled || state.ttsBusy || !state.ttsVoices.length;
elements.ttsSpeed.disabled = storyDisabled || state.ttsBusy;
elements.ttsPitch.disabled = storyDisabled || state.ttsBusy;
elements.saveTtsConfigButton.disabled = storyDisabled || state.ttsBusy;
elements.refreshTtsVoicesButton.disabled = storyDisabled || state.ttsBusy;
```

Call `renderTtsProgress()` from `renderAll()`.

- [ ] **Step 8: Add CSS for the panel**

Add to `desktop/renderer/styles.css`:

```css
.mini-status {
  color: var(--accent-bright);
  font-size: 0.76rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.compact-field-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.voice-progress {
  min-height: 38px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  color: var(--text-dim);
  font-size: 0.84rem;
  line-height: 1.35;
  background: rgba(255, 255, 255, 0.03);
}
```

- [ ] **Step 9: Run renderer static tests**

Run:

```powershell
npm test -- tests\desktop\renderer-ui-copy.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit Task 6**

Run:

```powershell
git add -- desktop/renderer/index.html desktop/renderer/renderer.js desktop/renderer/styles.css tests/desktop/renderer-ui-copy.test.ts
git commit -m "feat: add story voice generation panel"
```

---

### Task 7: Version, README, and Full Verification

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `README.md`

- [ ] **Step 1: Bump package version**

Change `package.json`:

```json
"version": "2.0.3"
```

Change the root package entry in `package-lock.json` from `2.0.2` to `2.0.3`.

- [ ] **Step 2: Update README TTS workflow**

Add this short section under `Tính năng chính`:

```md
- Gen voice sau khi hoàn thành đủ 10 chương bằng OmniVoice local API server.
- Chọn một Voice ID đã lưu trong OmniVoice và xuất WAV riêng cho từng chương.
```

Add this section near operation notes:

````md
## OmniVoice TTS

Trước khi bấm `Gen Voice 10 Chương`, hãy chạy OmniVoice local API server, ví dụ:

```powershell
omnivoice-demo --ip 127.0.0.1 --port 8001
```

Trong Drama15 Lite Studio, giữ API mặc định `http://127.0.0.1:8001`, tải danh sách Voice ID, chọn một voice, rồi gen voice sau khi truyện đã đủ 10 chương.
````

- [ ] **Step 3: Run targeted tests**

Run:

```powershell
npm test -- tests\tts\omnivoice-tts-config-store.test.ts tests\tts\omnivoice-api-client.test.ts tests\tts\story-tts-service.test.ts tests\session\story-history-store.test.ts tests\desktop\renderer-ui-copy.test.ts
```

Expected: all listed tests PASS.

- [ ] **Step 4: Run full check**

Run:

```powershell
npm run check
```

Expected: `npm run build` exits 0 and the full Node test suite exits 0.

- [ ] **Step 5: Pack portable build**

Run:

```powershell
npm run desktop:pack
```

Expected: a new portable Windows artifact is written under `release/gui/` and the artifact name includes `2.0.3`.

- [ ] **Step 6: Commit Task 7**

Run:

```powershell
git add -- package.json package-lock.json README.md
git commit -m "chore: release version 2.0.3"
```

---

## Final Verification Checklist

- [ ] `npm test -- tests\tts\omnivoice-tts-config-store.test.ts`
- [ ] `npm test -- tests\tts\omnivoice-api-client.test.ts`
- [ ] `npm test -- tests\tts\story-tts-service.test.ts`
- [ ] `npm test -- tests\session\story-history-store.test.ts`
- [ ] `npm test -- tests\desktop\renderer-ui-copy.test.ts`
- [ ] `npm run check`
- [ ] `npm run desktop:pack`
- [ ] Confirm package version is `2.0.3` in `package.json`, `package-lock.json`, and portable artifact name.
