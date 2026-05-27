# Story Thumbnails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic GPT-Image 2 story and chapter thumbnail generation with prompt-pack fallback.

**Architecture:** Extend the current poster service into a thumbnail generator that can produce one story asset and one asset per drafted chapter. The orchestrator runs the generator after full story assembly and stores results in `StoryPayload.meta.thumbnails` while preserving `meta.poster`.

**Tech Stack:** TypeScript, Node test runner, zod schemas, Electron renderer, OpenAI-compatible Images API.

---

### Task 1: Thumbnail service behavior

**Files:**
- Modify: `src/modules/posters/story-poster-service.ts`
- Test: `tests/posters/story-poster-service.test.ts`

- [ ] Add a failing test that `generateThumbnails(story)` calls `/images/generations` for story and chapter assets when a usable key exists.
- [ ] Add a failing test that missing image key writes `thumbnail-prompts.jsonl` and skips network calls.
- [ ] Implement `generateThumbnails`, shared prompt builders, image saving, and JSONL prompt-pack writing.
- [ ] Keep `generatePoster` working for backward compatibility by delegating to story-thumbnail generation.
- [ ] Run `node --test --import tsx .\tests\posters\story-poster-service.test.ts`.

### Task 2: Schema and history metadata

**Files:**
- Modify: `src/schemas/story.ts`
- Modify: `src/modules/session/story-history-store.ts`
- Test: `tests/session/story-history-store.test.ts`

- [ ] Add failing tests for `meta.thumbnails.story`, `meta.thumbnails.chapters`, and prompt pack history export.
- [ ] Extend zod schemas and history export types.
- [ ] Run `node --test --import tsx .\tests\session\story-history-store.test.ts`.

### Task 3: Orchestrator auto-run

**Files:**
- Modify: `src/modules/orchestrator/story-orchestrator.ts`
- Test: `tests/orchestrator/story-orchestrator.chapter-quality.test.ts`

- [ ] Add failing test that full generation starts chapter thumbnails only after all chapters are available.
- [ ] Update generator port and full-story finalization to attach `meta.thumbnails`.
- [ ] Run `node --test --import tsx .\tests\orchestrator\story-orchestrator.chapter-quality.test.ts`.

### Task 4: Desktop presentation

**Files:**
- Modify: `desktop/renderer/index.html`
- Modify: `desktop/renderer/renderer.js`
- Modify: `desktop/renderer/styles.css`
- Test: `tests/desktop/renderer-ui-copy.test.ts`

- [ ] Add failing copy test for thumbnail preview and open action.
- [ ] Render story thumbnail and chapter thumbnail previews with fallback to legacy poster.
- [ ] Add an open-thumbnail action using existing path opener.
- [ ] Run `node --test --import tsx .\tests\desktop\renderer-ui-copy.test.ts`.

### Task 5: Full verification

**Files:**
- All changed files

- [ ] Run `npm run build`.
- [ ] Run targeted tests.
- [ ] Run `npm run test` if targeted tests pass.
