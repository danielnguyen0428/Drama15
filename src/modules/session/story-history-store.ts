import fs from "node:fs/promises";
import path from "node:path";

import { getConfigRoot } from "../../lib/runtime";
import { slugify } from "../../lib/slug";
import type { StoryPayload } from "../../types/story";

type StoryHistoryStoreOptions = {
  configRoot?: string;
  legacyHistoryRoots?: string[];
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

export type StoryHistoryPosterExportPath = StoryHistoryExportPath & {
  title: string;
  model: string;
  size: string;
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
    posterImages: StoryHistoryPosterExportPath[];
  };
};

const STORY_HISTORY_FILE_NAME = "drama15-story-history.json";
const DEFAULT_MAX_ENTRIES = 100;

export class StoryHistoryStore {
  private readonly configRoot: string;
  private readonly legacyHistoryRoots: string[];
  private readonly maxEntries: number;

  constructor(options: StoryHistoryStoreOptions = {}) {
    this.configRoot = options.configRoot ?? getConfigRoot();
    this.legacyHistoryRoots = [...new Set(options.legacyHistoryRoots ?? [])]
      .map((root) => path.resolve(root))
      .filter((root) => root !== path.resolve(this.configRoot));
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
    const cleanedStoryPayload = stripLegacyThumbnailMetadata(storyPayload);
    const entries = await this.loadEntries();
    const id = createStoryHistoryId(cleanedStoryPayload);
    const existing = entries.find((entry) => entry.id === id);
    const now = new Date().toISOString();
    const exports = normalizeStoryHistoryExports(existing?.exports);
    const posterExport = createPosterExport(cleanedStoryPayload);
    if (posterExport) {
      exports.posterImages = [
        posterExport,
        ...exports.posterImages.filter((item) => item.filePath !== posterExport.filePath),
      ];
    }

    const nextEntry: StoryHistoryEntry = {
      id,
      title: cleanedStoryPayload.title,
      linePreset: cleanedStoryPayload.request.linePreset,
      outputLanguage: cleanedStoryPayload.request.outputLanguage,
      chapterCount: cleanedStoryPayload.chapters.length,
      createdAt: existing?.createdAt ?? cleanedStoryPayload.meta.generatedAt ?? now,
      updatedAt: now,
      storyPayload: cleanedStoryPayload,
      exports,
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
    const primaryEntries = await this.readEntriesFromPath(this.historyPath);
    const legacyEntries = (
      await Promise.all(this.legacyHistoryRoots.map((root) => this.readEntriesFromPath(path.join(root, STORY_HISTORY_FILE_NAME))))
    ).flat();
    const entries = mergeStoryHistoryEntries([primaryEntries, legacyEntries]).slice(0, this.maxEntries);

    if (legacyEntries.length > 0 && hasDifferentEntryIds(primaryEntries, entries)) {
      await this.saveEntries(entries);
    }

    return entries;
  }

  private async readEntriesFromPath(filePath: string): Promise<StoryHistoryEntry[]> {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(isStoryHistoryEntry)
        .map((entry) => ({
          ...entry,
          storyPayload: stripLegacyThumbnailMetadata(entry.storyPayload),
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
    posterImages: Array.isArray(exports.posterImages) ? exports.posterImages : [],
  };
}

function mergeStoryHistoryEntries(entryGroups: StoryHistoryEntry[][]) {
  const entriesById = new Map<string, StoryHistoryEntry>();

  for (const entry of entryGroups.flat()) {
    const current = entriesById.get(entry.id);
    if (!current || getHistoryEntryTime(entry) > getHistoryEntryTime(current)) {
      entriesById.set(entry.id, entry);
    }
  }

  return [...entriesById.values()].sort((left, right) => getHistoryEntryTime(right) - getHistoryEntryTime(left));
}

function hasDifferentEntryIds(left: StoryHistoryEntry[], right: StoryHistoryEntry[]) {
  if (left.length !== right.length) {
    return true;
  }

  const leftIds = new Set(left.map((entry) => entry.id));
  return right.some((entry) => !leftIds.has(entry.id));
}

function getHistoryEntryTime(entry: StoryHistoryEntry) {
  const value = Date.parse(entry.updatedAt || entry.createdAt || "");
  return Number.isFinite(value) ? value : 0;
}

function stripLegacyThumbnailMetadata(storyPayload: StoryPayload): StoryPayload {
  const meta = { ...(storyPayload.meta as StoryPayload["meta"] & { thumbnails?: unknown }) };
  delete meta.thumbnails;
  return {
    ...storyPayload,
    meta,
  };
}

function createPosterExport(storyPayload: StoryPayload): StoryHistoryPosterExportPath | null {
  const poster = storyPayload.meta.poster;
  if (poster?.status !== "completed" || !poster.filePath) {
    return null;
  }

  return {
    filePath: poster.filePath,
    title: poster.title,
    model: poster.model,
    size: poster.size,
    generatedAt: poster.generatedAt,
    exportedAt: new Date().toISOString(),
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
