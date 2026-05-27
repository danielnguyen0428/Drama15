# `_future-i18n` — paused English-output scaffolding

Files in this folder are **not active**. They are the previous version
of the `outputLanguage` / `OutputLanguagePicker` flow that was being
built when the team decided to lock the product to Vietnamese-only
generation.

The flow was paused (not deleted) because every prompt-engineering
tuning in the API today is Vietnamese-only:

- `apps/api/src/stories/vietnameseAiTells.ts` — only triggers when
  `outputLanguage === 'vietnamese'`.
- `apps/api/src/stories/desktopParity.ts` — sentence variance, dialogue
  ratio, and AI-tell heuristics use Vietnamese-tuned thresholds.
- `apps/api/src/storyEngine.ts` — niche-aware viral title grammar and
  Wharton-class style preset assume Vietnamese sentence shape.
- `stripVietnameseNamesFromSeed` — Vietnamese surname-aware regex.

Letting users select English produced low-quality drafts because none
of the above had English equivalents.

## How the lock works today

1. **Server** — `coerceOutputLanguage(value)` in
   `apps/api/src/lib/storyValidation.ts` collapses every accepted
   flavour (`'vi'`, `'en'`, `'vietnamese'`, `'english'`, `''`,
   `undefined`) to `'vietnamese'`.
2. **Web** — `apps/web/src/story/outputLanguage.ts` always returns
   `'vietnamese'`. The picker is no longer rendered; the
   `AutomationPanel`'s language `<select>` was removed too.
3. **Tests** — the old browser-side tests are kept in this folder with
   a `.disabled` suffix so the test runner ignores them. They still
   compile if you rename them back.

## Files in this drawer

| File                                            | What it is                                    |
| ----------------------------------------------- | ---------------------------------------------- |
| `OutputLanguagePicker.tsx`                      | The full `<select>` UI for choosing `vi`/`en`. |
| `outputLanguage.test.tsx.disabled`              | Unit tests for the legacy `vi`/`en` store.     |
| `outputLanguage.property.test.tsx.disabled`     | Property test for ui-locale ↔ output-language independence. |

## Re-enabling English output (future)

When (and only when) the team is ready to support English output:

1. **API tunings** — add English coverage to:
   - `vietnameseAiTells.ts` → split into per-language detectors.
   - `stripVietnameseNamesFromSeed` → English-name detector.
   - Niche grammar prompts.
2. **Server coercer** — change `coerceOutputLanguage` in
   `apps/api/src/lib/storyValidation.ts` to honour the input rather
   than always returning `'vietnamese'`. Keep the format-normalisation
   step (`'vi' → 'vietnamese'`, `'en' → 'english'`) so a single
   downstream pipeline can branch on `outputLanguage`.
3. **Web store** — restore the original
   `apps/web/src/story/outputLanguage.ts` (see git history before the
   lock commit).
4. **Web UI** — move `OutputLanguagePicker.tsx` back to
   `apps/web/src/story/` and render it in `StorySetupForm` and
   `AutomationPanel` (the spot is marked with a comment block).
5. **Tests** — drop the `.disabled` suffix from the two test files
   here and add new tests for the English pipeline.
6. **Smoke** — extend `ops/sse-smoke.mjs` with an English fixture so a
   regression in either pipeline is caught at deploy time.
