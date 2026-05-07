import fs from "node:fs/promises";
import path from "node:path";

import { getConfigRoot } from "../../lib/runtime";
import { slugify } from "../../lib/slug";
import type { StoryPayload } from "../../types/story";

type StoryHistoryStoreOptions = {
  configRoot?: string;
  maxEntries?: number;
};

export type StoryHistoryExportPath = {
  directoryPath?: string;
  filePath?: string;
  filePaths?: string[];
  exportedAt: string;
};

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

const STORY_HISTORY_FILE_NAME = "drama15-story-history.json";
const DEFAULT_MAX_ENTRIES = 100;

export class StoryHistoryStore {
  private readonly configRoot: string;
  private readonly maxEntries: number;

  constructor(options: StoryHistoryStoreOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  async list(): Promise<StoryHistoryEntry[]> {
    return this.loadEntries();
  }

  async get(id: string): Promise<StoryHistoryEntry | null> {
    const entries = await this.loadEntries();
    return entries.find((entry) => entry.id === id) ?? null;
  }

  async upsertStory(storyPayload: StoryPayload): Promise<StoryHistoryEntry> {
    const entries = await this.loadEntries();
    const id = createStoryHistoryId(storyPayload);
    const existing = entries.find((entry) => entry.id === id);
    const now = new Date().toISOString();
    const nextEntry: StoryHistoryEntry = {
      id,
      title: storyPayload.title,
      linePreset: storyPayload.request.linePreset,
      outputLanguage: storyPayload.request.outputLanguage,
      chapterCount: storyPayload.chapters.length,
      createdAt: existing?.createdAt ?? storyPayload.meta.generatedAt ?? now,
      updatedAt: now,
      storyPayload,
      exports: normalizeStoryHistoryExports(existing?.exports),
    };

    await this.saveEntries([nextEntry, ...entries.filter((entry) => entry.id !== id)].slice(0, this.maxEntries));
    return nextEntry;
  }

  async recordChapterMarkdownExport(storyPayload: StoryPayload, directoryPath: string, filePaths: string[]) {
    const entry = await this.upsertStory(storyPayload);
    entry.exports.chapterMarkdownDirectories = [
      {
        directoryPath,
        filePaths,
        exportedAt: new Date().toISOString(),
      },
      ...entry.exports.chapterMarkdownDirectories.filter((item) => item.directoryPath !== directoryPath),
    ];
    entry.updatedAt = new Date().toISOString();
    await this.replaceEntry(entry);
    return entry;
  }

  async recordPdfExport(storyPayload: StoryPayload, filePath: string) {
    const entry = await this.upsertStory(storyPayload);
    entry.exports.pdfFiles = [
      {
        filePath,
        exportedAt: new Date().toISOString(),
      },
      ...entry.exports.pdfFiles.filter((item) => item.filePath !== filePath),
    ];
    entry.updatedAt = new Date().toISOString();
    await this.replaceEntry(entry);
    return entry;
  }

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

  async delete(id: string): Promise<boolean> {
    const entries = await this.loadEntries();
    const next = entries.filter((entry) => entry.id !== id);
    await this.saveEntries(next);
    return next.length !== entries.length;
  }

  private async replaceEntry(entry: StoryHistoryEntry) {
    const entries = await this.loadEntries();
    await this.saveEntries([entry, ...entries.filter((item) => item.id !== entry.id)].slice(0, this.maxEntries));
  }

  private async loadEntries(): Promise<StoryHistoryEntry[]> {
    try {
      const raw = await fs.readFile(this.historyPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(isStoryHistoryEntry)
        .map((entry) => ({
          ...entry,
          exports: normalizeStoryHistoryExports(entry.exports),
        }))
        .slice(0, this.maxEntries);
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

  private async saveEntries(entries: StoryHistoryEntry[]) {
    await fs.mkdir(this.configRoot, { recursive: true });
    await fs.writeFile(this.historyPath, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  }

  private get historyPath() {
    return path.join(this.configRoot, STORY_HISTORY_FILE_NAME);
  }
}

export function createStoryHistoryId(storyPayload: StoryPayload) {
  const generatedAt = storyPayload.meta?.generatedAt || "";
  const timestamp = Number.isFinite(Date.parse(generatedAt))
    ? new Date(generatedAt).toISOString().replace(/[^0-9]/g, "").slice(0, 14)
    : "unsaved";
  return `${slugify(storyPayload.title || "drama15-story")}-${timestamp}`;
}

function isStoryHistoryEntry(value: unknown): value is StoryHistoryEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.title === "string" && Boolean(entry.storyPayload);
}

function normalizeStoryHistoryExports(value: unknown): StoryHistoryEntry["exports"] {
  const exports = value && typeof value === "object" ? value as Partial<StoryHistoryEntry["exports"]> : {};
  return {
    chapterMarkdownDirectories: Array.isArray(exports.chapterMarkdownDirectories) ? exports.chapterMarkdownDirectories : [],
    pdfFiles: Array.isArray(exports.pdfFiles) ? exports.pdfFiles : [],
    voiceDirectories: Array.isArray(exports.voiceDirectories) ? exports.voiceDirectories : [],
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
