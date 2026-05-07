import fs from "node:fs/promises";
import path from "node:path";
import { createAutomationPdfFilePath } from "./automation-pdf-export";
import { renderHtmlToPdfBuffer } from "./pdf-renderer";
import { configureDesktopRuntimeRoots } from "./runtime-roots";
import type { StoryProgressEvent } from "../modules/orchestrator/story-orchestrator";
import type { StoryTtsProgressEvent } from "../modules/tts/story-tts-service";
import type { StoryPayload } from "../types/story";

const isDefaultElectronApp = Boolean((process as NodeJS.Process & { defaultApp?: boolean }).defaultApp);

configureDesktopRuntimeRoots({
  dirname: __dirname,
  env: process.env,
  execPath: process.execPath,
  isDefaultApp: isDefaultElectronApp,
  isElectronRuntime: Boolean(process.versions.electron),
});

const electron = require("electron") as typeof import("electron");
const { app, BrowserWindow, dialog, ipcMain, shell } = electron;

if (!process.env.DRAMA15_ASSET_ROOT) {
  if (isDefaultElectronApp) {
    process.env.DRAMA15_ASSET_ROOT = path.resolve(__dirname, "..", "..");
  } else {
    process.env.DRAMA15_ASSET_ROOT = app.getAppPath();
  }
}

const { createAppServices } = require("../modules/runtime/create-app-services") as typeof import("../modules/runtime/create-app-services");
const { normalizeFullGenerateRequest, normalizeOutlineRequest } = require("../modules/validators/story-validator") as typeof import("../modules/validators/story-validator");
const { GenerateChapterRequestSchema, ExportMarkdownRequestSchema, RegenerateChapterRequestSchema } = require("../schemas/story") as typeof import("../schemas/story");
const { getAssetRoot, getConfigRoot } = require("../lib/runtime") as typeof import("../lib/runtime");

let mainWindow: import("electron").BrowserWindow | null = null;
const services = createAppServices();
const STORY_PROGRESS_CHANNEL = "story:progress";
const TTS_PROGRESS_CHANNEL = "tts:progress";
const PRESET_ORDERS: Record<"lines" | "styles", string[]> = {
  lines: [
    "billionaire_rich_poor_romance",
    "humiliation_revenge_justice",
    "secret_identity_hidden_heiress",
    "toxic_family_betrayal",
    "cheating_ex_wedding_drama",
    "single_mom_poor_woman_comeback",
    "social_injustice_discrimination_drama",
  ],
  styles: [
    "wharton_class_shame_elegance",
    "austen_social_knife",
    "bronte_gothic_romance_wound",
    "du_maurier_psychological_shadow",
    "fitzgerald_glittering_decay",
    "highsmith_cold_paranoia",
  ],
};

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.js");
  const rendererPath = path.join(getAssetRoot(), "desktop", "renderer", "index.html");

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 980,
    minWidth: 1440,
    minHeight: 840,
    backgroundColor: "#0a0a0b",
    title: "SÁNG TÁC DRAMA",
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  void mainWindow.loadFile(rendererPath);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("desktop:init", async () => {
  const [linePresets, stylePresets, sampleOutlineRequest, routerSettings, savedSession, storyHistory, automationConfig] = await Promise.all([
    listPresetIds("lines"),
    listPresetIds("styles"),
    readJsonFile(path.join(getAssetRoot(), "examples", "outline-request.json")),
    services.routerAuthConfig.getPublicSnapshot(),
    services.sessionStore.load(),
    services.storyHistoryStore.list(),
    services.automationConfigStore.load(),
  ]);

  return {
    linePresets,
    stylePresets,
    sampleOutlineRequest,
    configRoot: getConfigRoot(),
    routerSettings,
    savedSession,
    storyHistory,
    automationConfig,
  };
});

ipcMain.handle("session:save", async (_event, payload) => {
  const data = await services.sessionStore.save(payload);
  return {
    ok: true,
    data,
  };
});

ipcMain.handle("router:get-settings", async () => {
  return {
    ok: true,
    data: await services.routerAuthConfig.getPublicSnapshot(),
  };
});

ipcMain.handle("router:choose-nine-router-directory", async () => {
  const snapshot = await services.routerAuthConfig.getPublicSnapshot();
  const result = await dialog.showOpenDialog({
    title: "Chọn thư mục 9router",
    defaultPath: snapshot.directoryPath ?? snapshot.defaultDirectoryPath ?? getConfigRoot(),
    properties: ["openDirectory"],
  });

  if (result.canceled || !result.filePaths[0]) {
    return {
      ok: false,
      canceled: true,
    };
  }

  const data = await services.routerAuthConfig.saveNineRouterDirectory(result.filePaths[0]);
  services.routerClient.clearAvailableModelsCache();
  return {
    ok: true,
    canceled: false,
    data,
  };
});

ipcMain.handle("router:save-nine-router-directory", async (_event, payload: { directoryPath?: string }) => {
  const directoryPath = payload.directoryPath?.trim();
  if (!directoryPath) {
    return {
      ok: false,
      canceled: false,
      error: "9router directory path is required.",
    };
  }

  const data = await services.routerAuthConfig.saveNineRouterDirectory(directoryPath);
  services.routerClient.clearAvailableModelsCache();
  return {
    ok: true,
    canceled: false,
    data,
  };
});

ipcMain.handle("automation:choose-pdf-directory", async () => {
  const config = await services.automationConfigStore.load();
  const result = await dialog.showOpenDialog({
    title: "Chọn thư mục lưu PDF Automation",
    defaultPath: config.pdfOutputDirectory,
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths[0]) {
    return {
      ok: false,
      canceled: true,
    };
  }

  const data = await services.automationConfigStore.save({
    pdfOutputDirectory: result.filePaths[0],
  });
  return {
    ok: true,
    canceled: false,
    data,
  };
});

ipcMain.handle("automation:save-config", async (_event, payload: { pdfOutputDirectory?: string }) => {
  const data = await services.automationConfigStore.save({
    pdfOutputDirectory: payload?.pdfOutputDirectory,
  });
  return {
    ok: true,
    canceled: false,
    data,
  };
});

ipcMain.handle("story:generate-outline", async (_event, payload) => {
  const request = normalizeOutlineRequest(payload);
  const data = await services.storyOrchestrator.generateOutline(request, {
    onProgress: createProgressForwarder(_event.sender),
  });
  return {
    ok: true,
    data,
    meta: {
      linePreset: data.request.linePreset,
      stylePreset: data.request.stylePreset,
      modelAlias: data.meta.modelAliases.planner,
    },
  };
});

ipcMain.handle("story:generate-setting-seed", async (_event, payload) => {
  const request = normalizeOutlineRequest(payload);
  const data = await services.storyOrchestrator.generateSettingSeed(request);

  return {
    ok: true,
    data: data.seedPackage,
    meta: data.meta,
  };
});

ipcMain.handle("story:generate-full", async (_event, payload) => {
  const request = normalizeFullGenerateRequest(payload);
  const data = await services.storyOrchestrator.generateFull(request, {
    onProgress: createProgressForwarder(_event.sender),
  });
  const historyEntry = await services.storyHistoryStore.upsertStory(data);
  return {
    ok: true,
    data,
    storyHistory: await services.storyHistoryStore.list(),
    historyEntry,
    meta: {
      generatedAt: data.meta.generatedAt,
      modelAliases: data.meta.modelAliases,
    },
  };
});

ipcMain.handle("story:generate-chapter", async (_event, payload) => {
  const request = GenerateChapterRequestSchema.parse(payload);
  const chapter = await services.storyOrchestrator.generateChapter(
    request,
    request.stylePreset,
    undefined,
    request.continuityLite,
    {
      onProgress: createProgressForwarder(_event.sender),
    },
  );

  return {
    ok: true,
    data: {
      chapter,
    },
  };
});

ipcMain.handle("story:regenerate-chapter", async (_event, payload) => {
  const request = RegenerateChapterRequestSchema.parse(payload);
  const data = await services.storyOrchestrator.regenerateChapter(request, {
    onProgress: createProgressForwarder(_event.sender),
  });
  return {
    ok: true,
    data,
  };
});

ipcMain.handle("story:export-markdown", async (_event, payload) => {
  const request = ExportMarkdownRequestSchema.parse(payload);
  const data = await services.storyOrchestrator.exportMarkdown(request.storyPayload, {
    filename: request.filename,
    writeToFile: request.writeToFile,
  });
  return {
    ok: true,
    data,
  };
});

ipcMain.handle("story:save-markdown", async (_event, payload: { title?: string; markdown: string }) => {
  const defaultFileName = sanitizeFileName(payload.title?.trim() || "drama15-story") + ".md";
  const result = await dialog.showSaveDialog({
    title: "Lưu file Markdown",
    defaultPath: path.join(getConfigRoot(), "outputs", defaultFileName),
    filters: [
      {
        name: "Tệp Markdown",
        extensions: ["md"],
      },
    ],
  });

  if (result.canceled || !result.filePath) {
    return {
      ok: false,
      canceled: true,
    };
  }

  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, payload.markdown, "utf8");

  return {
    ok: true,
    canceled: false,
    filePath: result.filePath,
  };
});

ipcMain.handle("story:save-chapters-markdown", async (_event, payload: { storyPayload: { title?: string } }) => {
  const defaultDirectoryName = `${sanitizeFileName(payload.storyPayload?.title?.trim() || "drama15-story")}-chapters`;
  const result = await dialog.showOpenDialog({
    title: "Chọn thư mục lưu từng chương Markdown",
    defaultPath: path.join(getConfigRoot(), "outputs", defaultDirectoryName),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths[0]) {
    return {
      ok: false,
      canceled: true,
    };
  }

  const data = await services.storyOrchestrator.exportChapterMarkdownFiles(payload.storyPayload, result.filePaths[0]);
  const historyEntry = await services.storyHistoryStore.recordChapterMarkdownExport(
    payload.storyPayload as StoryPayload,
    result.filePaths[0],
    data.filePaths,
  );
  return {
    ok: true,
    canceled: false,
    directoryPath: result.filePaths[0],
    storyHistory: await services.storyHistoryStore.list(),
    historyEntry,
    ...data,
  };
});

ipcMain.handle("story:save-story-pdf", async (_event, payload: { storyPayload: { title?: string } }) => {
  const defaultFileName = sanitizeFileName(payload.storyPayload?.title?.trim() || "drama15-story") + ".pdf";
  const result = await dialog.showSaveDialog({
    title: "Xuất PDF cả truyện",
    defaultPath: path.join(getConfigRoot(), "outputs", defaultFileName),
    filters: [
      {
        name: "Tệp PDF",
        extensions: ["pdf"],
      },
    ],
  });

  if (result.canceled || !result.filePath) {
    return {
      ok: false,
      canceled: true,
    };
  }

  const html = services.storyOrchestrator.exportStoryPdfHtml(payload.storyPayload);
  const pdf = await renderHtmlToPdf(html);
  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, pdf);
  const historyEntry = await services.storyHistoryStore.recordPdfExport(payload.storyPayload as StoryPayload, result.filePath);

  return {
    ok: true,
    canceled: false,
    filePath: result.filePath,
    storyHistory: await services.storyHistoryStore.list(),
    historyEntry,
  };
});

ipcMain.handle("story:auto-save-story-pdf", async (_event, payload: { storyPayload: unknown; outputDirectory?: string }) => {
  const outputDirectory = String(payload?.outputDirectory || "").trim() || (await services.automationConfigStore.load()).pdfOutputDirectory;
  const html = services.storyOrchestrator.exportStoryPdfHtml(payload.storyPayload);
  const pdf = await renderHtmlToPdf(html);
  const filePath = createAutomationPdfFilePath(payload.storyPayload as StoryPayload, outputDirectory);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, pdf);
  const historyEntry = await services.storyHistoryStore.recordPdfExport(payload.storyPayload as StoryPayload, filePath);

  return {
    ok: true,
    canceled: false,
    filePath,
    storyHistory: await services.storyHistoryStore.list(),
    historyEntry,
  };
});

ipcMain.handle("history:list", async () => {
  return {
    ok: true,
    data: await services.storyHistoryStore.list(),
  };
});

ipcMain.handle("history:load", async (_event, payload: { id?: string }) => {
  const id = String(payload?.id || "").trim();
  if (!id) {
    return {
      ok: false,
      error: "History id is required.",
    };
  }

  const data = await services.storyHistoryStore.get(id);
  return {
    ok: Boolean(data),
    data,
    error: data ? undefined : "History entry was not found.",
  };
});

ipcMain.handle("history:delete", async (_event, payload: { id?: string }) => {
  const id = String(payload?.id || "").trim();
  if (!id) {
    return {
      ok: false,
      error: "History id is required.",
    };
  }

  const deleted = await services.storyHistoryStore.delete(id);
  return {
    ok: deleted,
    deleted,
    storyHistory: await services.storyHistoryStore.list(),
  };
});

ipcMain.handle("history:open-path", async (_event, payload: { path?: string }) => {
  const targetPath = String(payload?.path || "").trim();
  if (!targetPath) {
    return {
      ok: false,
      error: "Path is required.",
    };
  }

  const error = await shell.openPath(targetPath);
  return {
    ok: !error,
    error: error || undefined,
  };
});

ipcMain.handle("tts:get-config", async () => ({
  ok: true,
  data: await services.ttsConfigStore.load(),
}));

ipcMain.handle("tts:save-config", async (_event, payload) => {
  const currentConfig = await services.ttsConfigStore.load();
  return {
    ok: true,
    data: await services.ttsConfigStore.save({
      ...currentConfig,
      ...toRecord(payload),
    }),
  };
});

ipcMain.handle("tts:health", async () => {
  const config = await services.ttsConfigStore.load();
  const client = services.omniVoiceApiClientFactory(config.apiBase);
  const data = await client.checkHealth();
  return {
    ok: true,
    data,
  };
});

ipcMain.handle("tts:list-voices", async () => {
  const config = await services.ttsConfigStore.load();
  const client = services.omniVoiceApiClientFactory(config.apiBase);
  return {
    ok: true,
    data: await client.listVoices(),
  };
});

ipcMain.handle(
  "tts:generate-story",
  async (_event, payload: { storyPayload?: StoryPayload; voiceId?: string; speed?: number; pitch?: number }) => {
    if (!payload?.storyPayload) {
      return {
        ok: false,
        error: "Story payload is required.",
      };
    }

    const currentConfig = await services.ttsConfigStore.load();
    const config = await services.ttsConfigStore.save({
      ...currentConfig,
      selectedVoiceId: payload.voiceId || currentConfig.selectedVoiceId,
      speed: payload.speed ?? currentConfig.speed,
      pitch: payload.pitch ?? currentConfig.pitch,
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
  },
);

ipcMain.handle("tts:open-output", async (_event, payload: { path?: string }) => {
  const targetPath = String(payload?.path || "").trim();
  if (!targetPath) {
    return {
      ok: false,
      error: "TTS output path is required.",
    };
  }

  const error = await shell.openPath(targetPath);
  return {
    ok: !error,
    error: error || undefined,
  };
});

async function listPresetIds(kind: "lines" | "styles") {
  const directory = path.join(getAssetRoot(), "presets", kind);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const ids = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.replace(/\.json$/i, ""))
    .sort();
  const order = PRESET_ORDERS[kind];

  return [
    ...order.filter((id) => ids.includes(id)),
    ...ids.filter((id) => !order.includes(id)),
  ];
}

async function readJsonFile(filePath: string) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text) as unknown;
}

function sanitizeFileName(value: string) {
  return value.replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-").replace(/\s+/g, "-");
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

async function renderHtmlToPdf(html: string) {
  return renderHtmlToPdfBuffer(html, {
    tempDirectory: path.join(getConfigRoot(), "tmp"),
    createWindow: () =>
      new BrowserWindow({
        show: false,
        width: 794,
        height: 1123,
        paintWhenInitiallyHidden: true,
        webPreferences: {
          sandbox: false,
        },
      }),
  });
}

function createProgressForwarder(target: import("electron").WebContents) {
  return (progress: StoryProgressEvent) => {
    target.send(STORY_PROGRESS_CHANNEL, progress);
  };
}

function createTtsProgressForwarder(target: import("electron").WebContents) {
  return (progress: StoryTtsProgressEvent) => {
    target.send(TTS_PROGRESS_CHANNEL, progress);
  };
}
