# OmniVoice Story TTS Design

## Goal

Release Drama15 Lite Studio `2.0.3` with a post-drafting text-to-speech workflow. After a full 10-chapter story has been drafted, the user can choose one saved OmniVoice `voice_id` and generate voice audio for all 10 chapters.

## Confirmed Decisions

- `ZZZ` will integrate with the OmniVoice local API server, not the OmniVoice CLI.
- The default API base is `http://127.0.0.1:8001`.
- One selected `voice_id` is used for every chapter in the current story.
- Voice generation is available only after the current story has all 15 drafted chapters.
- Audio output is saved as one WAV file per chapter, not one merged full-story file.
- Voice exports are recorded in story history alongside Markdown and PDF exports.

## Design Specification

Purpose statement: The feature is for a desktop short-drama production workflow where writing and voice export happen in the same app. The user should not copy chapter text into the separate OmniVoice UI after drafting a story.

Aesthetic direction: Industrial/utilitarian, matching the existing dark, dense desktop studio UI.

Color palette: Reuse existing app tokens: `#090909` background, `#121214` elevated surface, `#f5f1e8` text, `#c63b2e` accent, `#ff7a64` bright accent.

Typography: Reuse existing app typography: Georgia/Times New Roman display type and Segoe UI/Helvetica Neue interface type. This intentionally follows the app's established design system instead of introducing a separate UI style for the TTS panel.

Layout strategy: Add a compact right-rail Voice panel near the existing export/history workflow. The panel uses the same vertical rail structure as rewrite, export, and history controls so voice generation feels like a production step after drafting.

## User Flow

1. User starts OmniVoice local API server separately.
2. User drafts a story until all 10 chapters exist.
3. User opens the Voice panel in `ZZZ`.
4. App checks OmniVoice health and loads saved voices from `/api/voices`.
5. User selects a single `voice_id`.
6. User clicks `Gen Voice 10 Chương`.
7. Electron main creates an output directory under `outputs/<story-slug>-voice/`.
8. App creates one long TTS job per chapter through `/api/tts-long-jobs`.
9. App polls each job until completion, downloads the WAV, and writes `chapter-01.wav` through `chapter-15.wav`.
10. App records the voice export paths in story history and exposes them through the existing `Mở Export` action.

## Architecture

### Renderer

The renderer owns display and user intent only. It stores no API secrets and does not write audio files directly.

New UI state:

- TTS config snapshot
- available voices
- selected `voice_id`
- current TTS run progress
- last voice export path for the selected history item

New UI controls:

- API base input
- health/refresh voices button
- voice selector
- speed and pitch inputs with conservative defaults
- `Gen Voice 10 Chương` button

### Electron Main

Electron main owns local filesystem writes, IPC, OmniVoice API requests, job polling, and history mutation.

New IPC:

- `tts:get-config`
- `tts:save-config`
- `tts:health`
- `tts:list-voices`
- `tts:generate-story`
- `tts:open-output`
- `tts:progress` event channel

### TTS Config Store

Store file: `drama15-tts-config.json` under `getConfigRoot()`.

Stored fields:

- `apiBase`
- `selectedVoiceId`
- `speed`
- `pitch`
- `outputRoot`

No owner token, admin upload token, API key, or secret is stored.

### OmniVoice API Client

The client wraps the local API endpoints:

- `GET /api/health`
- `GET /api/voices`
- `POST /api/tts-long-jobs`
- `GET /api/tts-long-jobs/{job_id}`
- `GET /api/tts-long-jobs/{job_id}/download`

Requests that use long jobs include an `X-Voice-Owner-Token` header. The token is generated per app runtime for job ownership; it is not persisted.

### Story History

Extend history exports with:

- `voiceDirectories`
- `voiceFiles`
- `voiceId`
- `generatedAt`

Existing history entries without voice export data remain valid.

## Error Handling

- If API health fails, show a clear local-server connection error.
- If no voices exist, disable generation and prompt the user to create a Voice ID in OmniVoice.
- If the story has fewer than 15 drafted chapters, disable generation and show the next missing chapter path through the existing continue flow.
- If a chapter job fails, stop the run, keep already downloaded files, and report the failed chapter number and OmniVoice error.
- If a downloaded audio response is invalid or empty, mark that chapter as failed.

## Testing

Use test-first implementation for new production code.

Targeted coverage:

- TTS config defaults and save/load normalization
- OmniVoice API client request paths, owner token header, job polling, WAV download
- story history voice export persistence and backward compatibility
- Electron preload/main IPC exposure checks
- renderer copy/UI checks for the Voice panel and disabled-state gating

Verification commands:

- `npm test`
- `npm run build`
- `npm run check`

Packaging verification:

- `npm run desktop:pack`
- confirm the portable artifact uses package version `2.0.3`

