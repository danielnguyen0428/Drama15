/**
 * Locale persistence layer.
 *
 * Persists the user's UI locale preference both:
 *   1. To `localStorage` so the SPA can hydrate the catalog on the next
 *      load before any network call resolves (Requirement 19.2).
 *   2. To the backend at `/account/locale` so the choice follows the
 *      account across devices (mirrors `users.ui_locale` per
 *      design.md "Database schema" → users table).
 *
 * Network errors are intentionally swallowed: a failure to reach the
 * backend must NOT prevent the SPA from updating the local UI. The
 * server endpoint is mocked at this stage; once the real handler is
 * wired up, the contract stays the same (POST JSON `{ locale }`).
 */

import {
  DEFAULT_LOCALE,
  LOCALE_ENDPOINT,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  type Locale,
} from './types';

/** Type guard: only the supported locales survive `loadStoredLocale`. */
export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Read the persisted locale from `localStorage`.
 *
 * Returns `null` when:
 *   - the key is absent (first visit), or
 *   - the stored value is not one of the supported locales.
 *
 * Callers should fall back to {@link DEFAULT_LOCALE} when this returns
 * `null`.
 */
export function loadStoredLocale(): Locale | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : null;
  } catch {
    // Access to localStorage can throw under strict privacy modes
    // (e.g. Safari "Block all cookies"). Treat as "no preference".
    return null;
  }
}

/**
 * Write the locale to `localStorage`. Safe to call from non-browser
 * environments (SSR, tests without jsdom): becomes a no-op.
 */
export function writeStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Quota exceeded / private mode: ignore.
  }
}

/**
 * POST the locale to the backend so it survives across devices.
 *
 * Returns a promise that resolves whether or not the request succeeded.
 * The caller should NOT await this for UI updates; treat it as
 * fire-and-forget.
 */
export async function syncLocaleToServer(locale: Locale): Promise<void> {
  if (typeof fetch !== 'function') {
    return;
  }
  try {
    await fetch(LOCALE_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale }),
    });
  } catch {
    // Network failure must not break the UI. The next successful
    // request will sync the value (or the local copy remains
    // authoritative until then).
  }
}

/**
 * Persist the locale to BOTH localStorage (immediate, synchronous) and
 * the server (asynchronous, fire-and-forget).
 */
export function persistLocale(locale: Locale): void {
  writeStoredLocale(locale);
  // Intentionally not awaited: see `syncLocaleToServer` docs.
  void syncLocaleToServer(locale);
}

/** Resolve the locale to use on app boot. */
export function resolveInitialLocale(): Locale {
  return loadStoredLocale() ?? DEFAULT_LOCALE;
}
