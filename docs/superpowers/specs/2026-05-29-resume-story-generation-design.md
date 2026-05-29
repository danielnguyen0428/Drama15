# Resume Story Generation Design

## Goal

Allow a user to continue a partially written Drama15 story after a browser close, stream failure, API interruption, or stored `failed` status, without consuming another daily story quota.

## Scope

- Add a resume flow for stories that already have a saved partial `story_payload` and fewer than 10 chapters.
- Keep quota consumption limited to creating a new story through `POST /stories`.
- Reuse the existing SSE stream UI so resumed writing behaves like a normal generation run.
- Keep existing completed-story opening, chapter rewrite, export, rename, and delete behavior unchanged.

## API Behavior

- Add `POST /stories/:id/resume`.
- The endpoint requires the current authenticated user and only resumes that user's story.
- It rejects completed stories and stories without a saved partial `story_payload`.
- It creates or replaces the in-memory job for the same story id, marks the story `running`, seeds the stream with the saved overview, bible, plan, relationship graph, and existing chapters, then writes only missing chapters.
- It does not call `consumeStoryQuota`.

## Orchestrator Behavior

- Add an internal resume method that accepts a saved `StoryPayload`.
- The method keeps the original title, request, concept, story bible, chapter plan, continuity lite, existing relationship graph, metadata, and completed chapters.
- It starts at the next missing chapter and appends new chapters through the same chapter generation and partial-save progress path as normal full generation.
- It finalizes as `completed` only after all 10 chapters exist.

## Web Behavior

- The story list shows a `Viết tiếp` action for signed-in stories with `chapterCount` from 1 to 9 and status other than `completed`.
- Clicking `Viết tiếp` calls the resume endpoint and reconnects to `/stories/:id/stream`.
- Opening a partial story shows the saved chapters instead of treating it as an empty draft.
- If the stream drops again, the user can retry `Viết tiếp` from the story list.

## Verification

- Add regression tests around resume chapter selection and API/store behavior where the existing test harness can cover it without real Supabase or model calls.
- Run targeted API tests for resume behavior.
- Run API typecheck.
- Run web build.
