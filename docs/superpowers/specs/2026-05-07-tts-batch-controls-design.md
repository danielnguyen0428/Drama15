# TTS Batch Controls Design

## Goal

Add app-level controls for OmniVoice story voice generation: pause, stop, resume, and retry, while preserving already generated WAV files.

## Behavior

- `Pause` requests the current batch to pause after the active chapter finishes. The app does not create the next chapter job until `Resume`.
- `Stop` requests the current batch to stop after the active chapter finishes and keeps completed `chapter-XX.wav` files on disk.
- `Resume` starts the same story voice export again and skips chapters that already have WAV files in the output folder.
- `Retry` regenerates the current failed/selected chapter and overwrites that chapter WAV.
- OmniVoice local API has no cancel/pause endpoint, so controls are enforced by the Drama15 app between chapter jobs.

## Architecture

- Keep `StoryTtsService` focused on per-story chapter sequencing, but add an optional control interface for pause/stop/resume/skip/retry behavior.
- Add an Electron main-process TTS session controller that stores the active batch state and exposes IPC actions.
- Update the renderer Voice panel with compact action buttons and progress copy that makes pause/stop pending states explicit.

## Testing

- Add service tests for stop-after-current, pause/resume skipping completed files, and retry overwriting a single chapter file.
- Add renderer/UI tests for the new controls being present.
- Run `npm run check` before packaging.
