# OmniVoice History TTS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local story/export history and OmniVoice CLI text-to-speech generation for drafted chapters.

**Architecture:** Keep history and TTS settings as local JSON stores under the existing config root. Electron IPC owns filesystem dialogs, history mutation, and OmniVoice process execution; the renderer only builds user-facing payloads and refreshes local state.

**Tech Stack:** Electron main/preload, TypeScript stores/services, current renderer HTML/CSS/JS, Node test runner.

---

### Task 1: History Store

**Files:**
- Create: `src/modules/session/story-history-store.ts`
- Test: `tests/session/story-history-store.test.ts`

- [ ] Write failing tests for appending a story, updating export paths, loading by id, deleting by id, and capping entries.
- [ ] Implement a JSON store named `drama15-story-history.json` under `getConfigRoot()`.
- [ ] Store full `StoryPayload` plus metadata: id, title, line preset, output language, chapter count, createdAt, updatedAt, export paths, and TTS jobs.

### Task 2: OmniVoice TTS Service

**Files:**
- Create: `src/modules/tts/omnivoice-tts-service.ts`
- Create: `src/modules/tts/omnivoice-tts-config-store.ts`
- Test: `tests/tts/omnivoice-tts-service.test.ts`
- Test: `tests/tts/omnivoice-tts-config-store.test.ts`

- [ ] Write failing tests for default settings, saved settings redaction, batch manifest creation, CLI args, and generated WAV result mapping.
- [ ] Implement config JSON `drama15-tts-config.json`, storing CLI path/model/output root/speaker prompt/instruct without API keys.
- [ ] Implement OmniVoice batch runner using `omnivoice-infer-batch` with text files split per chapter.

### Task 3: Electron IPC

**Files:**
- Modify: `src/modules/runtime/create-app-services.ts`
- Modify: `src/electron/main.ts`
- Modify: `src/electron/preload.ts`

- [ ] Expose init history/settings snapshots.
- [ ] Add IPC for history list/load/delete/open path.
- [ ] Add IPC for TTS settings get/save/browse CLI/browse speaker/generate.
- [ ] Append/update history after full generation, chapter Markdown export, PDF export, and TTS export.

### Task 4: Renderer UI

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/renderer.js`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/desktop/renderer-ui-copy.test.ts`

- [ ] Add compact `Lịch Sử` panel with list/select, open story, delete, open export folder.
- [ ] Add `OmniVoice TTS` panel with CLI path, model, speaker audio, instruct, and generate button.
- [ ] Refresh history after story generation/export/TTS.
- [ ] Keep buttons disabled during busy operations.

### Task 5: Verification

**Files:**
- Full repo

- [ ] Run targeted tests for new modules/UI.
- [ ] Run `npm run check`.
- [ ] Close running Drama15 processes if needed.
- [ ] Run `npm run desktop:pack`.
- [ ] Report portable path and SHA256.
