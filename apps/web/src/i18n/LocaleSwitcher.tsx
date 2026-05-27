/**
 * Locale switcher button group.
 *
 * Renders one `<button>` per supported locale. Clicking a button:
 *   1. Updates the provider state (re-renders all consumers).
 *   2. Persists `ui_locale` to localStorage.
 *   3. Fires an async POST to `/account/locale` (best-effort).
 *
 * Acceptance criterion 19.2: "WHEN the user picks a UI language, the
 * Web_Client SHALL save the choice and render every label in that
 * language from the next load on."
 */

import { SUPPORTED_LOCALES, type Locale } from './types';
import { useTranslation } from './useTranslation';

const LOCALE_LABEL_KEY: Record<Locale, 'locale.vi' | 'locale.en'> = {
  vi: 'locale.vi',
  en: 'locale.en',
};

export function LocaleSwitcher(): JSX.Element {
  const { locale, setLocale, t } = useTranslation();

  return (
    <div role="group" aria-label={t('locale.switchLabel')}>
      {SUPPORTED_LOCALES.map((candidate) => {
        const isActive = candidate === locale;
        return (
          <button
            key={candidate}
            type="button"
            aria-pressed={isActive}
            onClick={() => setLocale(candidate)}
            data-testid={`locale-switch-${candidate}`}
          >
            {t(LOCALE_LABEL_KEY[candidate])}
          </button>
        );
      })}
    </div>
  );
}
