# Vietnamese Writing UI Design

## Goal

Polish the Drama15 writing workspace so the creative flow feels like a Vietnamese writing studio, not a mixed-language technical dashboard.

## Scope

- Update `apps/web/src/story/StoryWorkspace.tsx`.
- Update `apps/web/src/story/StoryWorkspace.css`.
- Update `apps/web/src/ErrorBoundary.tsx`.
- Keep `Drama15 Lite Studio` as the product name.
- Keep technical or product-format terms where they are clearer as names, including `Markdown`, `CEO`, and `Alpha`.

## User Experience

Use the selected "Studio tập trung" direction:

- Left panel: Vietnamese setup controls for story theme, title hint, seed, style, language, intensity, dialogue ratio, and hook density.
- Right panel: Vietnamese manuscript workspace with tabs for chapters, overview, outline, and story bible.
- Status card: Vietnamese phase names and progress labels.
- Rewrite panel: Vietnamese labels for rewrite mode, instruction, and submit state.
- Empty states and error messages: plain Vietnamese, with a clear next step when possible.

## Visual Direction

- Keep the two-column layout and current dark studio mood.
- Improve polish without changing the workflow: clearer hierarchy, more legible Vietnamese typography, stronger focus states, and calmer progress/status treatment.
- Avoid large layout refactors and new visual systems.

## Behavior

- Do not change API endpoints, request payloads, SSE handling, export behavior, or rewrite behavior.
- Preserve the ability to generate non-Vietnamese output if the existing API supports it, but localize the language option labels in Vietnamese.
- Exported Markdown headings should use Vietnamese labels.

## Verification

- Run `npm run build:web`.
- Search the web client source for user-facing English strings and either translate them or confirm they are accepted names/technical terms.
