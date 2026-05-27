/**
 * Shared types for the i18n module.
 *
 * Defining the catalog key union here means both `catalog.vi.ts` and
 * `catalog.en.ts` are checked against the same key set at compile time
 * (Requirement 19.1: identical keys across locales).
 */

export type Locale = 'vi' | 'en';

export const SUPPORTED_LOCALES: readonly Locale[] = ['vi', 'en'] as const;

export const DEFAULT_LOCALE: Locale = 'vi';

/**
 * Canonical i18n key set. Adding a new label requires adding the key
 * here AND providing a translation in every catalog under
 * `apps/web/src/i18n/`.
 */
export type CatalogKey =
  // Navigation
  | 'nav.home'
  | 'nav.create'
  | 'nav.history'
  | 'nav.account'
  | 'nav.logout'
  // Auth
  | 'auth.signInWithGoogle'
  | 'auth.signOut'
  | 'auth.emailUnverified'
  // Story
  | 'story.create'
  | 'story.createFull'
  | 'story.createChapter'
  | 'story.continueMissing'
  | 'story.tabOverview'
  | 'story.tabPlan'
  | 'story.tabChapters'
  // Voice
  | 'voice.generate'
  | 'voice.pause'
  | 'voice.resume'
  | 'voice.stop'
  | 'voice.retry'
  // History
  | 'history.title'
  | 'history.empty'
  | 'history.delete'
  | 'history.confirmDelete'
  // Errors
  | 'errors.unauthenticated'
  | 'errors.licenseInactive'
  | 'errors.rateLimited'
  | 'errors.freeChapterQuotaExhausted'
  | 'errors.upstreamError'
  // Locale switcher
  | 'locale.vi'
  | 'locale.en'
  | 'locale.switchLabel';

export type LocaleCatalog = Record<CatalogKey, string>;

export const LOCALE_STORAGE_KEY = 'ui_locale';

/** Server endpoint that mirrors `users.ui_locale` for cross-device sync. */
export const LOCALE_ENDPOINT = '/account/locale';
