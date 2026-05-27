import fs from "node:fs/promises";
import path from "node:path";

import { getConfigRoot } from "../../lib/runtime";
import type { SeedHistoryEntry } from "../prompts/seed-blueprint";

type SeedHistoryStoreOptions = {
  configRoot?: string;
  maxEntries?: number;
};

const SEED_HISTORY_FILE_NAME = "drama15-seed-history.json";
const DEFAULT_MAX_ENTRIES = 200;

export class SeedHistoryStore {
  private readonly configRoot: string;
  private readonly maxEntries: number;

  constructor(options: SeedHistoryStoreOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async load(): Promise<SeedHistoryEntry[]> {
    try {
      const raw = await fs.readFile(this.historyPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(isSeedHistoryEntry).slice(0, this.maxEntries);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return [];
      }

      if (error instanceof SyntaxError) {
        return [];
      }

      throw error;
    }
  }

  async append(entry: SeedHistoryEntry) {
    const current = await this.load();
    const next = [entry, ...current.filter((item) => item.fingerprint !== entry.fingerprint)].slice(0, this.maxEntries);

    await fs.mkdir(this.configRoot, { recursive: true });
    await fs.writeFile(this.historyPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    return next;
  }

  private get historyPath() {
    return path.join(this.configRoot, SEED_HISTORY_FILE_NAME);
  }
}

function isSeedHistoryEntry(value: unknown): value is SeedHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return typeof entry.fingerprint === "string" && typeof entry.linePreset === "string" && typeof entry.createdAt === "string";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
