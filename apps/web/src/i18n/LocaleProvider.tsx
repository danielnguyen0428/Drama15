/**
 * React context provider for the active UI locale and its catalog.
 *
 * Boot behaviour (Requirement 19.2):
 *   1. Read `ui_locale` from localStorage.
 *   2. If absent, default to {@link DEFAULT_LOCALE} ('vi').
 *   3. Render the catalog for that locale.
 *
 * Updates from `setLocale` are persisted to BOTH localStorage and the
 * backend so the choice survives reload AND follows the account.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { enCatalog } from './catalog.en';
import { viCatalog } from './catalog.vi';
import { persistLocale, resolveInitialLocale } from './localeStore';
import type { CatalogKey, Locale, LocaleCatalog } from './types';

interface LocaleContextValue {
  locale: Locale;
  catalog: LocaleCatalog;
  setLocale: (next: Locale) => void;
  t: (key: CatalogKey) => string;
}

const CATALOGS: Record<Locale, LocaleCatalog> = {
  vi: viCatalog,
  en: enCatalog,
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

interface LocaleProviderProps {
  children: ReactNode;
  /**
   * Optional initial locale override. When omitted, the provider reads
   * from localStorage on mount. Useful for tests and SSR.
   */
  initialLocale?: Locale;
}

export function LocaleProvider({
  children,
  initialLocale,
}: LocaleProviderProps): JSX.Element {
  // Lazy initializer: runs once on mount, reading localStorage exactly
  // once. After that, React state is the source of truth.
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? resolveInitialLocale(),
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    persistLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(() => {
    const catalog = CATALOGS[locale];
    return {
      locale,
      catalog,
      setLocale,
      t: (key: CatalogKey) => catalog[key],
    };
  }, [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/**
 * Internal hook returning the full context value. Exported for
 * `useTranslation` and the locale switcher.
 */
export function useLocaleContext(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocaleContext must be used inside <LocaleProvider>');
  }
  return ctx;
}
