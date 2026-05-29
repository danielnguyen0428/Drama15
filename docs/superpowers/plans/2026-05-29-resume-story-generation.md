# Resume Story Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users resume failed or interrupted partial story generation without consuming a new daily quota.

**Architecture:** Add a resume API endpoint that rebuilds an in-memory stream job from the saved `story_payload`. Add an orchestrator resume path that appends missing chapters to the stored payload and emits the same progress/partial payload events used by normal generation. Add a small web action that calls resume and reconnects to the existing SSE stream.

**Tech Stack:** Fastify, Supabase, React 18, TypeScript, Vite, Node test runner.

---

### Task 1: Resume Chapter Selection Helper

**Files:**
- Create: `src/modules/orchestrator/story-resume.ts`
- Modify: `src/modules/orchestrator/story-orchestrator.ts`
- Test: `apps/api/src/resumeStoryGeneration.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create tests proving that a partial payload with chapters 1-3 resumes at chapter 4, and that a full 10-chapter payload has no remaining chapters.

- [ ] **Step 2: Run test to verify RED**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: FAIL because the helper is not exported yet.

- [ ] **Step 3: Add the helper**

Export a small pure helper from `story-resume.ts`, for example `getRemainingChapterPlanItems(storyPayload)`, that filters `storyPayload.chapterPlan` by chapter numbers not present in `storyPayload.chapters`.

- [ ] **Step 4: Run test to verify GREEN**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: PASS.

### Task 2: Orchestrator Resume Path

**Files:**
- Modify: `src/modules/orchestrator/story-orchestrator.ts`
- Test: `apps/api/src/resumeStoryGeneration.test.ts`

- [ ] **Step 1: Write failing behavior test**

Add a test around exported pure helpers for resume eligibility and chapter ordering so the highest-risk selection logic is covered without invoking real models.

- [ ] **Step 2: Run test to verify RED**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: FAIL until the helper behavior exists.

- [ ] **Step 3: Implement `resumeFull(storyPayload, progressOptions)`**

Reuse the existing chapter loop shape from `generateFull`, but initialize from the supplied payload and iterate only remaining chapter plan items. Emit partial story payload after each resumed chapter and finalize only once all chapters exist.

- [ ] **Step 4: Run targeted tests**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: PASS.

### Task 3: API Resume Endpoint

**Files:**
- Modify: `apps/api/src/startDev.ts`
- Modify: `apps/api/src/storyStore.ts`
- Test: `apps/api/src/resumeStoryGeneration.test.ts`

- [ ] **Step 1: Write failing route/source tests**

Cover the route contract at source level: endpoint path exists, it does not call `consumeStoryQuota`, and it calls the orchestrator resume path.

- [ ] **Step 2: Run test to verify RED**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: FAIL until the route exists.

- [ ] **Step 3: Implement endpoint and job creation**

Add `POST /stories/:id/resume`, load stored story, validate partial payload, create a `StoryJob` for the same id, seed saved events, set status `running`, and return `{ storyId, status: 'running' }` without quota consumption.

- [ ] **Step 4: Run targeted tests**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: PASS.

### Task 4: Web Resume Action

**Files:**
- Modify: `apps/web/src/story/StoryWorkspace.tsx`

- [ ] **Step 1: Add UI predicate and callback**

Add `canResumeStory(story)` for non-completed stories with 1-9 chapters, pass an `onResume` callback into `StoryList`, and render a `Viết tiếp` button beside existing story actions.

- [ ] **Step 2: Implement callback**

Call `POST /stories/:id/resume`, set the active story state, load saved partial content if needed, then reconnect through `connectStream(id)`.

- [ ] **Step 3: Preserve existing actions**

Keep open, rename, delete, rewrite, export, and new-story quota behavior unchanged.

### Task 5: Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run targeted resume tests**

Run: `./apps/api/node_modules/.bin/tsx --test apps/api/src/resumeStoryGeneration.test.ts`

Expected: PASS.

- [ ] **Step 2: Run API typecheck**

Run: `npm --prefix apps/api run typecheck`

Expected: exit 0.

- [ ] **Step 3: Run web build**

Run: `npm --prefix apps/web run build`

Expected: exit 0.

- [ ] **Step 4: Review diff**

Run: `git diff -- docs/superpowers/specs/2026-05-29-resume-story-generation-design.md docs/superpowers/plans/2026-05-29-resume-story-generation.md src/modules/orchestrator/story-orchestrator.ts apps/api/src/startDev.ts apps/api/src/storyStore.ts apps/api/src/resumeStoryGeneration.test.ts apps/web/src/story/StoryWorkspace.tsx`

Expected: only resume generation changes and harness docs are present.
