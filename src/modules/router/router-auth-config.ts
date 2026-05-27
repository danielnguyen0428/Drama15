import fs from "node:fs/promises";
import path from "node:path";

import { env } from "../../lib/env";
import { AppError } from "../../lib/errors";
import { getConfigRoot } from "../../lib/runtime";

type RouterAuthSource = "env" | "9router";
type RouterAuthStatus = "not_configured" | "connected" | "invalid";

export type RouterRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  source: RouterAuthSource;
  directoryPath?: string;
};

export type RouterAuthPublicSnapshot = {
  status: RouterAuthStatus;
  source: RouterAuthSource;
  directoryPath: string | null;
  defaultDirectoryPath: string | null;
  baseUrl: string;
  hasApiKey: boolean;
  message: string;
};

type RouterAuthConfigFile = {
  nineRouterDirectory?: string;
};

type RouterAuthConfigOptions = {
  configRoot?: string;
  envApiKey?: string;
  envBaseUrl?: string;
  defaultNineRouterDirectory?: string | null;
};

const CONFIG_FILE_NAME = "drama15-router-config.json";

export class RouterAuthConfig {
  private readonly configRoot: string;
  private readonly envApiKey: string;
  private readonly envBaseUrl: string;
  private readonly defaultNineRouterDirectory: string | null;

  constructor(options: RouterAuthConfigOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
    this.envApiKey = options.envApiKey ?? env.routerApiKey;
    this.envBaseUrl = normalizeRouterBaseUrl(options.envBaseUrl ?? env.routerBaseUrl);
    this.defaultNineRouterDirectory =
      options.defaultNineRouterDirectory === undefined ? getDefaultNineRouterDirectory() : options.defaultNineRouterDirectory;
  }

  async getPublicSnapshot(): Promise<RouterAuthPublicSnapshot> {
    const storedConfig = await this.readConfigFile();
    const defaultDirectoryPath = this.defaultNineRouterDirectory;

    if (!storedConfig.nineRouterDirectory) {
      const defaultRuntimeConfig = await this.tryReadDefaultRuntimeConfig();
      if (defaultRuntimeConfig) {
        return {
          status: "connected",
          source: "9router",
          directoryPath: defaultRuntimeConfig.directoryPath ?? defaultDirectoryPath,
          defaultDirectoryPath,
          baseUrl: defaultRuntimeConfig.baseUrl,
          hasApiKey: true,
          message: "Default 9router directory is connected.",
        };
      }

      return {
        status: "not_configured",
        source: "env",
        directoryPath: null,
        defaultDirectoryPath,
        baseUrl: this.envBaseUrl,
        hasApiKey: isUsableApiKey(this.envApiKey),
        message: "9router directory is not configured.",
      };
    }

    try {
      const runtimeConfig = await readNineRouterRuntimeConfig(storedConfig.nineRouterDirectory);
      return {
        status: "connected",
        source: "9router",
        directoryPath: storedConfig.nineRouterDirectory,
        defaultDirectoryPath,
        baseUrl: runtimeConfig.baseUrl,
        hasApiKey: true,
        message: "9router directory is connected.",
      };
    } catch (error) {
      return {
        status: "invalid",
        source: "9router",
        directoryPath: storedConfig.nineRouterDirectory,
        defaultDirectoryPath,
        baseUrl: this.envBaseUrl,
        hasApiKey: false,
        message: error instanceof Error ? error.message : "9router directory is invalid.",
      };
    }
  }

  async saveNineRouterDirectory(directoryPath: string): Promise<RouterAuthPublicSnapshot> {
    const normalizedDirectory = path.resolve(directoryPath.trim());
    await readNineRouterRuntimeConfig(normalizedDirectory);
    await fs.mkdir(this.configRoot, { recursive: true });
    await fs.writeFile(
      this.configPath,
      `${JSON.stringify({ nineRouterDirectory: normalizedDirectory }, null, 2)}\n`,
      "utf8",
    );

    return this.getPublicSnapshot();
  }

  async resolveRuntimeConfig(): Promise<RouterRuntimeConfig> {
    const storedConfig = await this.readConfigFile();
    if (storedConfig.nineRouterDirectory) {
      return readNineRouterRuntimeConfig(storedConfig.nineRouterDirectory);
    }

    const defaultRuntimeConfig = await this.tryReadDefaultRuntimeConfig();
    if (defaultRuntimeConfig) {
      return defaultRuntimeConfig;
    }

    return {
      apiKey: this.envApiKey,
      baseUrl: this.envBaseUrl,
      source: "env",
    };
  }

  getDefaultDirectoryPath() {
    return this.defaultNineRouterDirectory;
  }

  private get configPath() {
    return path.join(this.configRoot, CONFIG_FILE_NAME);
  }

  private async readConfigFile(): Promise<RouterAuthConfigFile> {
    let raw = "";
    try {
      raw = await fs.readFile(this.configPath, "utf8");
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }

      throw error;
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const nineRouterDirectory = typeof parsed.nineRouterDirectory === "string" ? parsed.nineRouterDirectory.trim() : "";
      return nineRouterDirectory ? { nineRouterDirectory } : {};
    } catch {
      return {};
    }
  }

  private async tryReadDefaultRuntimeConfig() {
    if (!this.defaultNineRouterDirectory) {
      return null;
    }

    try {
      return await readNineRouterRuntimeConfig(this.defaultNineRouterDirectory);
    } catch {
      return null;
    }
  }
}

export async function readNineRouterRuntimeConfig(directoryPath: string): Promise<RouterRuntimeConfig> {
  const normalizedDirectory = path.resolve(directoryPath.trim());
  const dbPath = path.join(normalizedDirectory, "db.json");
  let raw = "";

  try {
    const stat = await fs.stat(normalizedDirectory);
    if (!stat.isDirectory()) {
      throw new AppError("VALIDATION_ERROR", "9router path must be a directory.", 400, {
        directoryPath: normalizedDirectory,
      });
    }

    raw = await fs.readFile(dbPath, "utf8");
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("VALIDATION_ERROR", "Cannot read 9router db.json from the selected directory.", 400, {
      directoryPath: normalizedDirectory,
      dbPath,
    });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (error) {
    throw new AppError("VALIDATION_ERROR", "9router db.json is not valid JSON.", 400, {
      directoryPath: normalizedDirectory,
      dbPath,
      cause: error,
    });
  }

  const apiKey = pickNineRouterApiKey(parsed);
  if (!apiKey) {
    throw new AppError("VALIDATION_ERROR", "9router db.json does not contain an active API key.", 400, {
      directoryPath: normalizedDirectory,
      dbPath,
    });
  }

  return {
    apiKey,
    baseUrl: normalizeRouterBaseUrl(readNineRouterBaseUrl(parsed)),
    source: "9router",
    directoryPath: normalizedDirectory,
  };
}

function pickNineRouterApiKey(value: Record<string, unknown>) {
  const apiKeys = Array.isArray(value.apiKeys) ? value.apiKeys : [];
  const keyEntries = apiKeys
    .filter((entry): entry is Record<string, unknown> => Boolean(entry && typeof entry === "object"))
    .filter((entry) => typeof entry.key === "string" && entry.key.trim());

  const activeEntry = keyEntries.find((entry) => entry.isActive === true);
  return String((activeEntry ?? keyEntries[0])?.key ?? "").trim();
}

function readNineRouterBaseUrl(value: Record<string, unknown>) {
  const settings = value.settings && typeof value.settings === "object" ? (value.settings as Record<string, unknown>) : {};
  return typeof settings.mitmRouterBaseUrl === "string" ? settings.mitmRouterBaseUrl : env.routerBaseUrl;
}

function normalizeRouterBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return env.routerBaseUrl;
  }

  if (/\/v1$/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed}/v1`;
}

function getDefaultNineRouterDirectory() {
  const appData = process.env.APPDATA?.trim();
  return appData ? path.join(appData, "9router") : null;
}

function isUsableApiKey(value: string) {
  const trimmed = value.trim();
  return Boolean(trimmed && trimmed !== "dummy");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
