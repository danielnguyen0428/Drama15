/**
 * English catalog for the Web_Client SPA.
 *
 * Key set MUST be identical to {@link ./catalog.vi.ts} so the
 * compile-time `LocaleCatalog` type stays consistent across locales
 * (Requirement 19.1).
 */

import type { LocaleCatalog } from './types';

export const enCatalog: LocaleCatalog = {
  // Navigation
  'nav.home': 'Home',
  'nav.create': 'Create story',
  'nav.history': 'History',
  'nav.account': 'Account',
  'nav.logout': 'Sign out',

  // Auth
  'auth.signInWithGoogle': 'Sign in with Google',
  'auth.signOut': 'Sign out',
  'auth.emailUnverified': 'Google email is not verified',

  // Story
  'story.create': 'Create story',
  'story.createFull': 'Generate full story',
  'story.createChapter': 'Generate chapter',
  'story.continueMissing': 'Continue from missing chapter',
  'story.tabOverview': 'Overview',
  'story.tabPlan': 'Plan',
  'story.tabChapters': 'Chapters',

  // Voice
  'voice.generate': 'Generate voice for 10 chapters',
  'voice.pause': 'Pause',
  'voice.resume': 'Resume',
  'voice.stop': 'Stop',
  'voice.retry': 'Retry',

  // History
  'history.title': 'Story history',
  'history.empty': 'No stories yet',
  'history.delete': 'Delete',
  'history.confirmDelete': 'Are you sure you want to delete this story?',

  // Errors
  'errors.unauthenticated': 'Please sign in again',
  'errors.licenseInactive': 'License is no longer active',
  'errors.rateLimited': 'Too many requests, please try again shortly',
  'errors.freeChapterQuotaExhausted': 'You have used all free chapter quota for today',
  'errors.upstreamError': 'Service is temporarily busy, please try again',

  // Locale switcher
  'locale.vi': 'Tiếng Việt',
  'locale.en': 'English',
  'locale.switchLabel': 'Language',
};
