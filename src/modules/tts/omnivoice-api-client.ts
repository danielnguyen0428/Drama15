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
    return Array.isArray(payload.voices)
      ? payload.voices.map(normalizeVoice).filter((voice): voice is OmniVoiceClientVoice => Boolean(voice))
      : [];
  }

  async createLongTtsJob(input: CreateLongTtsJobInput): Promise<OmniVoiceLongTtsJob> {
    const payload = await this.fetchJson<{ job?: unknown }>("/api/tts-long-jobs", {
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

  private async fetchJson<T>(
    endpoint: string,
    options: { method?: "GET" | "POST"; body?: unknown; ownerToken?: boolean } = {},
  ): Promise<T> {
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
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const voiceId = String(record.voice_id || "").trim();
  if (!voiceId) {
    return null;
  }

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
  if (!text.trim()) {
    return response.statusText;
  }

  try {
    const parsed = JSON.parse(text) as { detail?: string; message?: string };
    return parsed.detail || parsed.message || text.trim();
  } catch {
    return text.trim();
  }
}
