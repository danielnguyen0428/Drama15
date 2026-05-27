/**
 * Unit tests for {@link AccountPage} (Task 17.10).
 *
 * Covers Requirements 4.6, 4.7, 19.2:
 *
 *   4.6  Devices fetched from `GET /account/devices` render with their
 *        `device_id` and ISO `last_seen` timestamp.
 *   4.7  Clicking "Gỡ thiết bị" issues `DELETE /account/devices/:id`
 *        and removes the row from the list on success.
 *   19.2 The shared {@link LocaleSwitcher} is mounted on the page so
 *        the user can change the UI language from the account
 *        settings.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';

import { __resetDeviceFingerprintCacheForTests } from '../../api/httpClient';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { AccountPage } from '../AccountPage';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface FetchCall {
  url: string;
  method: string;
}

function captureCall(args: Parameters<typeof fetch>): FetchCall {
  const [input, init] = args;
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url;
  const method = (init?.method ?? 'GET').toUpperCase();
  return { url, method };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: Mock<typeof fetch>;
let originalFetch: typeof globalThis.fetch | undefined;

const SAMPLE_DEVICES = [
  {
    device_id: 'fp_alpha',
    last_seen: '2025-01-15T10:30:00.000Z',
  },
  {
    device_id: 'fp_beta',
    last_seen: '2025-01-14T08:15:00.000Z',
  },
];

beforeEach(() => {
  __resetDeviceFingerprintCacheForTests();
  originalFetch = globalThis.fetch;
  fetchMock = vi.fn(async (...args: Parameters<typeof fetch>) => {
    const { url, method } = captureCall(args);
    if (url === '/account/devices' && method === 'GET') {
      return jsonResponse({ devices: SAMPLE_DEVICES });
    }
    if (url.startsWith('/account/devices/') && method === 'DELETE') {
      return new Response(null, { status: 204 });
    }
    if (url === '/account/locale' && method === 'POST') {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  }) as unknown as Mock<typeof fetch>;
  globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  window.localStorage.clear();
});

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch;
  }
  __resetDeviceFingerprintCacheForTests();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function renderPage(): void {
  render(
    <LocaleProvider>
      <AccountPage />
    </LocaleProvider>,
  );
}

// ---------------------------------------------------------------------------
// Devices render with last_seen (Requirement 4.6)
// ---------------------------------------------------------------------------

describe('AccountPage — device list (Requirement 4.6)', () => {
  it('GETs /account/devices on mount and renders each device with last_seen', async () => {
    renderPage();

    // Find the GET call once devices have rendered.
    await waitFor(() => {
      expect(screen.getByTestId('account-devices-list')).toBeInTheDocument();
    });

    const getCalls = fetchMock.mock.calls
      .map((args) => captureCall(args))
      .filter((c) => c.url === '/account/devices' && c.method === 'GET');
    expect(getCalls).toHaveLength(1);

    // Both rows render with their id and ISO timestamp.
    for (const device of SAMPLE_DEVICES) {
      const row = screen.getByTestId(`account-device-${device.device_id}`);
      expect(row).toBeInTheDocument();

      const idCell = screen.getByTestId(
        `account-device-id-${device.device_id}`,
      );
      expect(idCell.textContent).toBe(device.device_id);

      const lastSeenCell = screen.getByTestId(
        `account-device-last-seen-${device.device_id}`,
      );
      expect(lastSeenCell.textContent).toBe(device.last_seen);
      expect(lastSeenCell.getAttribute('datetime')).toBe(device.last_seen);
    }
  });

  it('renders an empty-state message when the server returns no devices', async () => {
    fetchMock.mockImplementationOnce(
      async () => jsonResponse({ devices: [] }),
    );

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId('account-devices-empty'),
      ).toBeInTheDocument();
    });
    expect(screen.queryByTestId('account-devices-list')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Remove device (Requirement 4.7)
// ---------------------------------------------------------------------------

describe('AccountPage — remove device (Requirement 4.7)', () => {
  it('DELETEs /account/devices/:id and removes the row on success', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId('account-device-fp_alpha'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('account-device-remove-fp_alpha'));

    // Wait for the row to disappear after the DELETE resolves.
    await waitFor(() => {
      expect(screen.queryByTestId('account-device-fp_alpha')).toBeNull();
    });

    // The DELETE was issued against the per-device URL.
    const deleteCalls = fetchMock.mock.calls
      .map((args) => captureCall(args))
      .filter((c) => c.method === 'DELETE');
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0]!.url).toBe('/account/devices/fp_alpha');

    // The other device row stays put.
    expect(
      screen.getByTestId('account-device-fp_beta'),
    ).toBeInTheDocument();
  });

  it('keeps the row and surfaces an error when the DELETE fails', async () => {
    renderPage();

    await waitFor(() => {
      expect(
        screen.getByTestId('account-device-fp_alpha'),
      ).toBeInTheDocument();
    });

    // Override the next DELETE to return a 500.
    fetchMock.mockImplementationOnce(
      async () => new Response(null, { status: 500 }),
    );

    fireEvent.click(screen.getByTestId('account-device-remove-fp_alpha'));

    await waitFor(() => {
      expect(
        screen.getByTestId('account-device-remove-error'),
      ).toBeInTheDocument();
    });

    // Row is still present because the server refused the removal.
    expect(
      screen.getByTestId('account-device-fp_alpha'),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Locale switcher present (Requirement 19.2)
// ---------------------------------------------------------------------------

describe('AccountPage — locale switcher (Requirement 19.2)', () => {
  it('mounts the shared LocaleSwitcher inside the language section', async () => {
    renderPage();

    // The switcher renders one button per supported locale, using the
    // shared `locale-switch-{vi|en}` test ids.
    expect(screen.getByTestId('locale-switch-vi')).toBeInTheDocument();
    expect(screen.getByTestId('locale-switch-en')).toBeInTheDocument();

    // Both buttons live inside the dedicated language section.
    const languageSection = screen.getByTestId('account-language-section');
    expect(languageSection).toContainElement(
      screen.getByTestId('locale-switch-vi'),
    );
    expect(languageSection).toContainElement(
      screen.getByTestId('locale-switch-en'),
    );

    // Wait for devices to settle so we don't bleed effects into other tests.
    await waitFor(() => {
      expect(screen.getByTestId('account-devices-list')).toBeInTheDocument();
    });
  });
});
