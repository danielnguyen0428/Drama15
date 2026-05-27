# TTS Batch Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add app-level pause, stop, resume, and retry controls for OmniVoice 10-chapter voice generation.

**Architecture:** Extend `StoryTtsService` with a small control interface and chapter selection options, then add Electron IPC actions that mutate one active TTS session. Update the renderer Voice panel to expose the controls and render the session status.

**Tech Stack:** TypeScript, Electron IPC, Node test runner, plain renderer JavaScript/CSS.

---

### Task 1: TTS Service Control Behavior

**Files:**
- Modify: `src/modules/tts/story-tts-service.ts`
- Test: `tests/tts/story-tts-service.test.ts`

- [ ] Write failing tests for stop-after-current, resume skipping existing WAV files, and retry overwriting one chapter.
- [ ] Run `npm test -- tests\tts\story-tts-service.test.ts` and confirm the new tests fail.
- [ ] Add `control`, `mode`, and `chapterNumber` options to `generateStoryVoice`.
- [ ] Check control state before creating each next chapter job.
- [ ] Skip existing chapter WAV files when mode is `resume`.
- [ ] Restrict generation to one chapter when mode is `retry`.
- [ ] Run `npm test -- tests\tts\story-tts-service.test.ts` and confirm the service tests pass.

### Task 2: Electron TTS Session IPC

**Files:**
- Modify: `src/electron/main.ts`
- Modify: `src/electron/preload.ts`

- [ ] Add main-process active TTS session state with statuses `idle`, `running`, `pause-requested`, `paused`, `stop-requested`, `stopped`, `completed`, and `failed`.
- [ ] Add IPC handlers `tts:control` and `tts:get-session`.
- [ ] Wire `pause`, `stop`, `resume`, and `retry` to the service options.
- [ ] Keep completed files and record history only when a full generation completes.

### Task 3: Renderer Voice Controls

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/renderer.js`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/desktop/renderer-ui-copy.test.ts`

- [ ] Add compact buttons for Pause, Stop, Resume, and Retry below `Gen Voice 10 Chương`.
- [ ] Add renderer state for TTS session and selected retry chapter.
- [ ] Enable/disable buttons from session status instead of a single `ttsBusy` boolean.
- [ ] Render progress text for pause/stop requested states.
- [ ] Add UI-copy regression checks for the new buttons.

### Task 4: Verification and Packaging

**Files:**
- No source files beyond Tasks 1-3.

- [ ] Run targeted TTS and renderer tests.
- [ ] Run `npm run check`.
- [ ] If `release/gui` is locked, package with `electron-builder --config.directories.output=release/gui-hotfix`.
