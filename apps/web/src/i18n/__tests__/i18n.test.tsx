/**
 * Unit tests for the i18n module (Requirements 19.1, 19.2).
 *
 * Covers:
 *   1. vi/en catalogs share an identical key set.
 *   2. Switching locale updates rendered labels.
 *   3. The locale persists across reloads (via localStorage).
 *   4. `useTranslation` returns the value of the active locale.
 *   5. The locale switcher writes through to localStorage and the
 *      mocked `/account/locale` endpoint.
 */

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enCatalog } from '../catalog.en';
import { viCatalog } from '../catalog.vi';
import { LocaleProvider } from '../LocaleProvider';
import { LocaleSwitcher } from '../LocaleSwitcher';
import {
  loadStoredLocale,
  persistLocale,
  resolveInitialLocale,
} from '../localeStore';
import {
  DEFAULT_LOCALE,
  LOCALE_ENDPOINT,
  LOCALE_STORAGE_KEY,
} from '../types';
import { useTranslation } from '../useTranslation';

function ProbeLabel(): JSX.Element {
  const { t, locale } = useTranslation();
  return (
    <div>
      <span data-testid="probe-locale">{locale}</span>
      <span data-testid="probe-label">{t('story.createFull')}</span>
      <span data-testid="probe-error">{t('errors.unauthenticated')}</span>
    </div>
  );
}

describe('i18n catalogs', () => {
  it('vi and en catalogs expose the same key set', () => {
    const viKeys = Object.keys(viCatalog).sort();
    const enKeys = Object.keys(enCatalog).sort();
    expect(viKeys).toEqual(enKeys);
  });

  it('every catalog value is a non-empty string', () => {
    for (const [key, value] of Object.entries(viCatalog)) {
      expect(value, `vi missing translation for ${key}`).toMatch(/.+/);
    }
    for (const [key, value] of Object.entries(enCatalog)) {
      expect(value, `en missing translation for ${key}`).toMatch(/.+/);
    }
  });
});

describe('localeStore persistence', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns null when nothing is stored', () => {
    expect(loadStoredLocale()).toBeNull();
  });

  it('returns null for unsupported values', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'fr');
    expect(loadStoredLocale()).toBeNull();
  });

  it('round-trips a supported value through persistLocale', () => {
    // Mock fetch so persistLocale's server sync does not warn or throw.
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    persistLocale('en');

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(loadStoredLocale()).toBe('en');
    expect(fetchMock).toHaveBeenCalledWith(
      LOCALE_ENDPOINT,
      expect.objectContaining({ method: 'POST' }),
    );

    vi.unstubAllGlobals();
  });

  it('resolveInitialLocale falls back to the default when nothing is stored', () => {
    expect(resolveInitialLocale()).toBe(DEFAULT_LOCALE);
  });

  it('resolveInitialLocale returns the stored value across "reloads"', () => {
    // Simulate a previous session that picked English.
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

    // A fresh provider instance (new "page load") reads localStorage
    // through resolveInitialLocale.
    expect(resolveInitialLocale()).toBe('en');
  });
});

describe('LocaleProvider + useTranslation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('defaults to Vietnamese when localStorage is empty', () => {
    render(
      <LocaleProvider>
        <ProbeLabel />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('probe-locale').textContent).toBe('vi');
    expect(screen.getByTestId('probe-label').textContent).toBe(
      viCatalog['story.createFull'],
    );
  });

  it('hydrates from localStorage on first render (persists across reloads)', () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, 'en');

    render(
      <LocaleProvider>
        <ProbeLabel />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('probe-locale').textContent).toBe('en');
    expect(screen.getByTestId('probe-label').textContent).toBe(
      enCatalog['story.createFull'],
    );
    expect(screen.getByTestId('probe-error').textContent).toBe(
      enCatalog['errors.unauthenticated'],
    );
  });

  it('switching locale via the switcher updates rendered labels', () => {
    render(
      <LocaleProvider>
        <LocaleSwitcher />
        <ProbeLabel />
      </LocaleProvider>,
    );

    // Start on the default (vi).
    expect(screen.getByTestId('probe-label').textContent).toBe(
      viCatalog['story.createFull'],
    );

    // Click the English switch.
    act(() => {
      screen.getByTestId('locale-switch-en').click();
    });

    expect(screen.getByTestId('probe-locale').textContent).toBe('en');
    expect(screen.getByTestId('probe-label').textContent).toBe(
      enCatalog['story.createFull'],
    );
    // localStorage must reflect the new choice so the next reload
    // boots straight into English.
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en');
  });

  it('persists the new locale to the mocked /account/locale endpoint', () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      <LocaleProvider>
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    act(() => {
      screen.getByTestId('locale-switch-en').click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(LOCALE_ENDPOINT);
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      locale: 'en',
    });
  });

  it('aria-pressed marks the active locale button', () => {
    render(
      <LocaleProvider initialLocale="en">
        <LocaleSwitcher />
      </LocaleProvider>,
    );

    expect(screen.getByTestId('locale-switch-en')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('locale-switch-vi')).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
