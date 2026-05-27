/**
 * Frozen copy of the original output-language store
 * (`apps/web/src/story/outputLanguage.ts` before the Vietnamese-only
 * lock).
 *
 * This file is NOT used by the running app. It exists so that when the
 * team is ready to re-introduce English output, they can restore the
 * original logic in one move:
 *
 *   1. Replace the contents of `apps/web/src/story/outputLanguage.ts`
 *      with the body of this file (or move this file back, renamed).
 *   2. Move `OutputLanguagePicker.tsx` from this folder back to
 *      `apps/web/src/story/` and re-import it from `StorySetupForm`
 *      and `AutomationPanel` (the spots are marked with comment
 *      blocks).
 *   3. Flip `coerceOutputLanguage` in
 *      `apps/api/src/lib/storyValidation.ts` to honour the input.
 *   4. Add English-side AI-tell + style preset coverage in the API
 *      (see `_future-i18n/README.md` for the checklist).
 */

/** Languages supported for generated story output. */
export type OutputLanguage = 'vi' | 'en';

/** Default output language when no preference has been stored yet. */
export const DEFAULT_OUTPUT_LANGUAGE: OutputLanguage = 'vi';

/** `localStorage` key used to persist the output language preference. */
export const OUTPUT_LANGUAGE_STORAGE_KEY = 'output_language';

const SUPPORTED_OUTPUT_LANGUAGES: readonly OutputLanguage[] = [
  'vi',
  'en',
] as const;

/** Type guard for {@link OutputLanguage}. */
export function isOutputLanguage(value: unknown): value is OutputLanguage {
  return (
    typeof value === 'string' &&
    (SUPPORTED_OUTPUT_LANGUAGES as readonly string[]).includes(value)
  );
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getOutputLanguage(): OutputLanguage {
  const storage = getStorage();
  if (!storage) {
    return DEFAULT_OUTPUT_LANGUAGE;
  }
  try {
    const raw = storage.getItem(OUTPUT_LANGUAGE_STORAGE_KEY);
    return isOutputLanguage(raw) ? raw : DEFAULT_OUTPUT_LANGUAGE;
  } catch {
    return DEFAULT_OUTPUT_LANGUAGE;
  }
}

export function setOutputLanguage(lang: OutputLanguage): void {
  if (!isOutputLanguage(lang)) {
    return;
  }
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(OUTPUT_LANGUAGE_STORAGE_KEY, lang);
  } catch {
    /* quota / private mode */
  }
}

export function withOutputLanguage<T extends object>(
  payload: T,
): T & { outputLanguage: OutputLanguage } {
  return {
    ...payload,
    outputLanguage: getOutputLanguage(),
  };
}
