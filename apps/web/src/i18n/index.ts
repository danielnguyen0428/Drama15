/**
 * Public surface of the i18n module.
 *
 * Consumers should import from `@/i18n` (or the relative path) rather
 * than reaching into individual files, so internal restructuring stays
 * a non-breaking change.
 */

export { LocaleProvider, useLocaleContext } from './LocaleProvider';
export { LocaleSwitcher } from './LocaleSwitcher';
export { useTranslation } from './useTranslation';
export type { UseTranslationResult } from './useTranslation';
export { viCatalog } from './catalog.vi';
export { enCatalog } from './catalog.en';
export {
  loadStoredLocale,
  persistLocale,
  resolveInitialLocale,
  syncLocaleToServer,
  writeStoredLocale,
  isLocale,
} from './localeStore';
export {
  DEFAULT_LOCALE,
  LOCALE_ENDPOINT,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from './types';
export type { CatalogKey, Locale, LocaleCatalog } from './types';
