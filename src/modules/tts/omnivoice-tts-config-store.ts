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
