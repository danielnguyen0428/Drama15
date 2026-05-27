/**
 * Unit tests for `FlaggedUsersDashboard` (Task 18.4).
 *
 * Validates: Requirement 16.5.
 *
 * Coverage:
 *   - On mount, GETs `/admin/flagged-users` with cookie credentials
 *     and renders a table with the four required columns
 *     (user, flag count, last_flag_at, actions).
 *   - "Xóa cờ" issues `DELETE /admin/users/:id/flag` and removes the
 *     row from the table on success.
 *   - "Khóa tài khoản" opens a confirmation modal — no network call
 *     fires until the operator confirms — and on confirm issues
 *     `POST /admin/users/:id/lock` and removes the row.
 *   - Cancelling the lock modal closes it without issuing any
 *     network request.
 *   - Failed network calls surface the server-supplied error message
 *     and leave the row in place.
 *
 * The tests stub `globalThis.fetch` so the component's network layer
 * is exercised end-to-end without a real backend.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlaggedUsersDashboard } from '../FlaggedUsersDashboard';

interface FlaggedRow {
  id: string;
  email: string;
  displayName?: string;
  flagCount: number;
  lastFlagAt: string;
}

const ROW_RECENT: FlaggedRow = {
  id: 'user_recent',
  email: 'recent@example.com',
  displayName: 'Recent User',
  flagCount: 73,
  lastFlagAt: '2025-03-10T08:30:00.000Z',
};

const ROW_OLDER: FlaggedRow = {
  id: 'user_older',
  email: 'older@example.com',
  flagCount: 51,
  lastFlagAt: '2024-06-15T12:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('FlaggedUsersDashboard', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------
  // Initial fetch + table rendering
  // -------------------------------------------------------------------
  describe('Requirement 16.5: GET /admin/flagged-users on mount', () => {
    it('renders the table with rows newest-flag-first', async () => {
      // Backend returns rows in arbitrary order; UI re-sorts client-side.
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_OLDER, ROW_RECENT] }),
      );

      render(<FlaggedUsersDashboard />);

      await waitFor(() => {
        expect(
          screen.getByTestId('flagged-users-table'),
        ).toBeInTheDocument();
      });

      // The GET hit /admin/flagged-users with cookie credentials.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/admin/flagged-users');
      const requestInit = init as RequestInit;
      expect(requestInit.method).toBe('GET');
      expect(requestInit.credentials).toBe('include');

      // Required columns present.
      const headers = screen
        .getAllByRole('columnheader')
        .map((th) => th.textContent ?? '');
      expect(headers).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/người dùng/i),
          expect.stringMatching(/số lần/i),
          expect.stringMatching(/lần cuối/i),
          expect.stringMatching(/hành động/i),
        ]),
      );

      // Rows are sorted newest-first.
      const dataRows = screen
        .getAllByRole('row')
        .filter((row) => row.hasAttribute('data-user-id'));
      const ids = dataRows.map((tr) =>
        tr.getAttribute('data-user-id'),
      );
      expect(ids).toEqual([ROW_RECENT.id, ROW_OLDER.id]);

      // The user / count / last_flag_at cells render the row data.
      const recentRow = screen.getByTestId(
        `flagged-users-row-${ROW_RECENT.id}`,
      );
      expect(
        within(recentRow).getByTestId(
          `flagged-users-user-${ROW_RECENT.id}`,
        ),
      ).toHaveTextContent(ROW_RECENT.email);
      expect(
        within(recentRow).getByTestId(
          `flagged-users-count-${ROW_RECENT.id}`,
        ),
      ).toHaveTextContent(String(ROW_RECENT.flagCount));
      expect(
        within(recentRow).getByTestId(
          `flagged-users-last-${ROW_RECENT.id}`,
        ).textContent ?? '',
      ).not.toBe('');

      // Action buttons present.
      expect(
        within(recentRow).getByRole('button', { name: /xóa cờ/i }),
      ).toBeInTheDocument();
      expect(
        within(recentRow).getByRole('button', { name: /khóa tài khoản/i }),
      ).toBeInTheDocument();
    });

    it('renders an empty-state message when there are no flagged users', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ users: [] }));
      render(<FlaggedUsersDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('flagged-users-empty')).toBeInTheDocument();
      });
      expect(
        screen.queryByTestId('flagged-users-table'),
      ).not.toBeInTheDocument();
    });

    it('shows the server-supplied error message when GET fails', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'forbidden' } }),
          {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );
      render(<FlaggedUsersDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('flagged-users-error')).toHaveTextContent(
          /forbidden/i,
        );
      });
    });
  });

  // -------------------------------------------------------------------
  // Clear flag — DELETE /admin/users/:id/flag
  // -------------------------------------------------------------------
  describe('Requirement 16.5: "Xóa cờ" clears the flag', () => {
    it('issues DELETE /admin/users/:id/flag and removes the row on success', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_RECENT, ROW_OLDER] }),
      );
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

      render(<FlaggedUsersDashboard />);

      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`flagged-users-clear-${ROW_RECENT.id}`),
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      const [url, init] = fetchMock.mock.calls[1]!;
      expect(url).toBe(`/admin/users/${ROW_RECENT.id}/flag`);
      const requestInit = init as RequestInit;
      expect(requestInit.method).toBe('DELETE');
      expect(requestInit.credentials).toBe('include');

      // Cleared row is gone.
      await waitFor(() => {
        expect(
          screen.queryByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).not.toBeInTheDocument();
      });
      // The other row remains.
      expect(
        screen.getByTestId(`flagged-users-row-${ROW_OLDER.id}`),
      ).toBeInTheDocument();
    });

    it('keeps the row and surfaces the error when DELETE fails', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_RECENT] }),
      );
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'upstream_error' } }),
          {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      render(<FlaggedUsersDashboard />);
      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`flagged-users-clear-${ROW_RECENT.id}`),
      );

      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-clear-error-${ROW_RECENT.id}`),
        ).toHaveTextContent(/upstream_error/i);
      });
      expect(
        screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
      ).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------
  // Lock account — confirmation modal then POST /lock
  // -------------------------------------------------------------------
  describe('Requirement 16.5: "Khóa tài khoản" requires confirmation', () => {
    it('opens the modal and does not call POST until confirmation', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_RECENT] }),
      );

      render(<FlaggedUsersDashboard />);
      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`flagged-users-lock-${ROW_RECENT.id}`),
      );

      // Modal is rendered, but no second fetch was issued.
      expect(
        screen.getByTestId('flagged-users-lock-modal'),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('confirming the modal POSTs to /admin/users/:id/lock and removes the row', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_RECENT, ROW_OLDER] }),
      );
      fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));

      render(<FlaggedUsersDashboard />);
      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`flagged-users-lock-${ROW_RECENT.id}`),
      );
      fireEvent.click(screen.getByTestId('flagged-users-lock-confirm'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
      const [url, init] = fetchMock.mock.calls[1]!;
      expect(url).toBe(`/admin/users/${ROW_RECENT.id}/lock`);
      const requestInit = init as RequestInit;
      expect(requestInit.method).toBe('POST');
      expect(requestInit.credentials).toBe('include');

      await waitFor(() => {
        expect(
          screen.queryByTestId('flagged-users-lock-modal'),
        ).not.toBeInTheDocument();
      });
      expect(
        screen.queryByTestId(`flagged-users-row-${ROW_RECENT.id}`),
      ).not.toBeInTheDocument();
      // Untouched row still present.
      expect(
        screen.getByTestId(`flagged-users-row-${ROW_OLDER.id}`),
      ).toBeInTheDocument();
    });

    it('cancelling the modal closes it without issuing any request', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_RECENT] }),
      );

      render(<FlaggedUsersDashboard />);
      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`flagged-users-lock-${ROW_RECENT.id}`),
      );
      expect(
        screen.getByTestId('flagged-users-lock-modal'),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('flagged-users-lock-cancel'));

      expect(
        screen.queryByTestId('flagged-users-lock-modal'),
      ).not.toBeInTheDocument();
      // Initial GET is the only network call.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Row is still present.
      expect(
        screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
      ).toBeInTheDocument();
    });

    it('keeps the modal open and shows an error when POST fails', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ users: [ROW_RECENT] }),
      );
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: 'rate_limited' } }),
          {
            status: 429,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      );

      render(<FlaggedUsersDashboard />);
      await waitFor(() => {
        expect(
          screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`flagged-users-lock-${ROW_RECENT.id}`),
      );
      fireEvent.click(screen.getByTestId('flagged-users-lock-confirm'));

      await waitFor(() => {
        expect(
          screen.getByTestId('flagged-users-lock-error'),
        ).toHaveTextContent(/rate_limited/i);
      });
      expect(
        screen.getByTestId('flagged-users-lock-modal'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId(`flagged-users-row-${ROW_RECENT.id}`),
      ).toBeInTheDocument();
    });
  });
});
