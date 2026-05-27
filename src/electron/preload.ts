const electron = require("electron") as typeof import("electron");
const { contextBridge, ipcRenderer } = electron;
const STORY_PROGRESS_CHANNEL = "story:progress";
const TTS_PROGRESS_CHANNEL = "tts:progress";

contextBridge.exposeInMainWorld("dramaStudio", {
  init: () => ipcRenderer.invoke("desktop:init"),
  saveSession: (payload: unknown) => ipcRenderer.invoke("session:save", payload),
  getRouterSettings: () => ipcRenderer.invoke("router:get-settings"),
  setModelPreset: (payload: { modelPreset: string }) => ipcRenderer.invoke("model:set-preset", payload),
  chooseNineRouterDirectory: () => ipcRenderer.invoke("router:choose-nine-router-directory"),
  saveNineRouterDirectory: (payload: { directoryPath: string }) => ipcRenderer.invoke("router:save-nine-router-directory", payload),
  chooseAutomationPdfDirectory: () => ipcRenderer.invoke("automation:choose-pdf-directory"),
  saveAutomationConfig: (payload: { pdfOutputDirectory?: string }) => ipcRenderer.invoke("automation:save-config", payload),
  generateSettingSeed: (payload: unknown) => ipcRenderer.invoke("story:generate-setting-seed", payload),
  generateOutline: (payload: unknown) => ipcRenderer.invoke("story:generate-outline", payload),
  generateFull: (payload: unknown) => ipcRenderer.invoke("story:generate-full", payload),
  generateChapter: (payload: unknown) => ipcRenderer.invoke("story:generate-chapter", payload),
  regenerateChapter: (payload: unknown) => ipcRenderer.invoke("story:regenerate-chapter", payload),
  exportMarkdown: (payload: unknown) => ipcRenderer.invoke("story:export-markdown", payload),
  saveMarkdown: (payload: { title?: string; markdown: string }) => ipcRenderer.invoke("story:save-markdown", payload),
  saveChaptersMarkdown: (payload: unknown) => ipcRenderer.invoke("story:save-chapters-markdown", payload),
  saveStoryPdf: (payload: unknown) => ipcRenderer.invoke("story:save-story-pdf", payload),
  autoSaveStoryPdf: (payload: unknown) => ipcRenderer.invoke("story:auto-save-story-pdf", payload),
  listStoryHistory: () => ipcRenderer.invoke("history:list"),
  loadStoryHistoryEntry: (payload: { id: string }) => ipcRenderer.invoke("history:load", payload),
  deleteStoryHistoryEntry: (payload: { id: string }) => ipcRenderer.invoke("history:delete", payload),
  openStoryHistoryPath: (payload: { path: string }) => ipcRenderer.invoke("history:open-path", payload),
  getTtsConfig: () => ipcRenderer.invoke("tts:get-config"),
  saveTtsConfig: (payload: unknown) => ipcRenderer.invoke("tts:save-config", payload),
  checkTtsHealth: () => ipcRenderer.invoke("tts:health"),
  listTtsVoices: () => ipcRenderer.invoke("tts:list-voices"),
  generateStoryVoice: (payload: unknown) => ipcRenderer.invoke("tts:generate-story", payload),
  getTtsSession: () => ipcRenderer.invoke("tts:get-session"),
  controlStoryVoice: (payload: unknown) => ipcRenderer.invoke("tts:control", payload),
  openTtsOutput: (payload: { path: string }) => ipcRenderer.invoke("tts:open-output", payload),
  onProgress: (listener: (payload: unknown) => void) => {
    const wrappedListener = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on(STORY_PROGRESS_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(STORY_PROGRESS_CHANNEL, wrappedListener);
    };
  },
  onTtsProgress: (listener: (payload: unknown) => void) => {
    const wrappedListener = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on(TTS_PROGRESS_CHANNEL, wrappedListener);
    return () => {
      ipcRenderer.removeListener(TTS_PROGRESS_CHANNEL, wrappedListener);
    };
  },
  launchRenderAll: () => ipcRenderer.invoke("tools:launch-render-all"),
});