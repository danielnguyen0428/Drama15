/**
 * `useTranslation` hook: returns a `t(key)` function bound to the
 * currently active locale, plus the current locale and a setter so
 * components can render a switcher without importing the context
 * directly.
 */

import { useLocaleContext } from './LocaleProvider';
import type { CatalogKey, Locale } from './types';

export interface UseTranslationResult {
  t: (key: CatalogKey) => string;
  locale: Locale;
  setLocale: (next: Locale) => void;
}

export function useTranslation(): UseTranslationResult {
  const { t, locale, setLocale } = useLocaleContext();
  return { t, locale, setLocale };
}
