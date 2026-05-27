# Story Thumbnails Design

## Goal

Generate story and chapter thumbnails for completed serialized stories with GPT-Image 2 when an image API key is available, and export a prompt pack when it is not.

## Decisions

- Story-level thumbnail generation runs automatically during full-story generation.
- Chapter thumbnail generation runs automatically after the full story is complete.
- The image path is hybrid:
  - With a usable image API key, call the OpenAI-compatible Images API and save PNG files.
  - Without a usable image API key, write a JSONL prompt pack so the user can generate the same assets with Codex image generation.
- Thumbnail failures never fail story generation.
- Generated images avoid embedded chapter text. Downstream render/video tools should overlay titles and episode text.

## Output

- Story thumbnail: `outputs/thumbnails/<story-slug>/story.png`
- Chapter thumbnails: `outputs/thumbnails/<story-slug>/chapters/01-<chapter-slug>.png`
- Prompt pack fallback: `outputs/thumbnails/<story-slug>/thumbnail-prompts.jsonl`

## Metadata

`StoryPayload.meta.thumbnails` records the story thumbnail, chapter thumbnails, prompt pack path, model, size, status, and errors. Existing `meta.poster` remains supported for old history entries and UI fallback.

## UI

The overview shows story thumbnail status or preview. Chapter cards show chapter thumbnails when available. Export/history actions can open the thumbnail directory or prompt pack path through the existing file opener.

## Verification

Tests cover API generation, prompt-pack fallback, orchestrator auto-run after full story, schema persistence, and history export tracking.
