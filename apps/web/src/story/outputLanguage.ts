/**
 * Output language store for story-generation requests.
 *
 * ----------------------------------------------------------------------
 * VIETNAMESE-ONLY LOCK (active)
 * ----------------------------------------------------------------------
 *
 * The product is intentionally Vietnamese-only right now. Every text
 * tuning in the generation pipeline (Vietnamese AI-tell repair,
 * Vietnamese name strip, niche-aware viral title grammar, Wharton-class
 * style preset, dialogue rhythm rules, idiolect detector) is written
 * for Vietnamese output. Letting the user choose English produces low
 * quality drafts because none of those tunings exist for English yet.
 *
 * To freeze the behaviour without ripping out the in-flight i18n
 * scaffolding, this module now:
 *
 *   1. `getOutputLanguage()` ALWAYS returns `'vietnamese'`, the format
 *      the server pipeline (`buildConceptUserPrompt`, etc.) expects.
 *   2. `setOutputLanguage(...)` is a no-op — any persisted preference
 *      from a previous app version is ignored.
 *   3. `withOutputLanguage(payload)` always stamps
 *      `outputLanguage: 'vietnamese'` onto the request body.
 *
 * The original two-locale flow (`'vi' | 'en'`, localStorage-backed,
 * decoupled from ui_locale per Requirement 19.3) is preserved as
 * `apps/web/src/_future-i18n/OutputLanguagePicker.tsx` and the matching
 * tests, so re-enabling English output is a code-only change.
 *
 * To unlock English in the future:
 *   - Restore the original logic of this file (see git history or
 *     `_future-i18n/outputLanguage.legacy.ts`).
 *   - Move `_future-i18n/OutputLanguagePicker.tsx` back to `story/`.
 *   - Wire English-side AI-tell + style preset + name-strip coverage
 *     in `apps/api/src/storyEngine.ts` and friends.
 *   - Flip `coerceOutputLanguage` in
 *     `apps/api/src/lib/storyValidation.ts` to honour the input.
 * ----------------------------------------------------------------------
 */

/**
 * Server-side language identifier the prompt pipeline embeds verbatim
 * into LLM requests (`Output language: ${outputLanguage}`). Keep it as
 * a string-literal type so callers can't accidentally pass `'en'`.
 */
export type OutputLanguage = 'vietnamese';

/** Default and only supported value while the lock is active. */
export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = 'vietnamese';

/**
 * Storage key kept exported for backwards compatibility with any
 * lingering test that still references it. The lock means nothing is
 * actually written here anymore.
 */
export const OUTPUT_LANGUAGE_STORAGE_KEY = 'output_language';

/** Type guard kept exported so existing callers compile unchanged. */
export function isOutputLanguage(value: unknown): value is OutputLanguage {
  return value === 'vietnamese';
}

/**
 * Always returns `'vietnamese'` while the Vietnamese-only lock is
 * active. The server pipeline expects this exact string.
 */
export function getOutputLanguage(): OutputLanguage {
  return DEFAULT_OUTPUT_LANGUAGE;
}

/**
 * No-op while the Vietnamese-only lock is active. Kept exported so
 * call sites compile without touching every consumer; flipping the
 * lock is a single-file change.
 */
export function setOutputLanguage(_lang: OutputLanguage | string): void {
  // intentionally empty
}

/**
 * Stamp `outputLanguage: 'vietnamese'` onto a request payload. Any
 * existing `outputLanguage` field is overwritten so a misbehaving
 * caller cannot smuggle `'en'` into the prompt.
 */
export function withOutputLanguage<T extends object>(
  payload: T,
): T & { outputLanguage: OutputLanguage } {
  return {
    ...payload,
    outputLanguage: DEFAULT_OUTPUT_LANGUAGE,
  };
}
