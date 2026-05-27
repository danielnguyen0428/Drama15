/**
 * Unit tests for `HistoryList` (and the `HistoryDetail` integration
 * the list switches into when the user clicks "Xem").
 *
 * Validates: Requirements 10.1, 10.2, 10.3.
 *
 * Coverage:
 *   - List renders rows sorted by `createdAt DESC` even when the
 *     backend returns them out of order (Requirement 10.1).
 *   - "Xem" button opens the detail view, which fetches
 *     `GET /stories/:id` and renders the three tabs `Tổng Quan`,
 *     `Kế Hoạch`, `Chương` (Requirement 10.2).
 *   - "Xóa" prompts a confirmation modal; the modal does not fire any
 *     network request until the user confirms.
 *   - Confirming sends `DELETE /stories/:id` and removes the row from
 *     the list (Requirement 10.3).
 *   - Cancelling closes the modal and leaves the row in place; no
 *     DELETE request is sent.
 *
 * The tests stub `globalThis.fetch` (which `httpFetch` wraps) so the
 * full integrity-header path is exercised without hitting a real
 * server.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetDeviceFingerprintCacheForTests } from '../../api/httpClient';
import { HistoryList } from '../HistoryList';

interface ListRow {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
}

const ROW_OLDEST: ListRow = {
  id: 'story_old',
  title: 'Truyện cũ nhất',
  status: 'completed',
  createdAt: '2024-01-01T00:00:00.000Z',
};

const ROW_MIDDLE: ListRow = {
  id: 'story_mid',
  title: 'Truyện giữa',
  status: 'completed',
  createdAt: '2024-06-15T12:00:00.000Z',
};

const ROW_NEWEST: ListRow = {
  id: 'story_new',
  title: 'Truyện mới nhất',
  status: 'completed',
  createdAt: '2025-03-10T08:30:00.000Z',
};

/**
 * Build a JSON `Response` with an `application/json` content-type so
 * the component's `await response.json()` calls succeed.
 */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('HistoryList', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    __resetDeviceFingerprintCacheForTests();
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    __resetDeviceFingerprintCacheForTests();
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------
  // Requirement 10.1 — list ordering
  // -------------------------------------------------------------------
  describe('Requirement 10.1: list rendered sorted by createdAt DESC', () => {
    it('renders rows in DESC order even when the backend returns them out of order', async () => {
      // Backend order is intentionally NOT chronological — the UI
      // re-sorts client-side so the display order is deterministic.
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ stories: [ROW_OLDEST, ROW_NEWEST, ROW_MIDDLE] }),
      );

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-rows')).toBeInTheDocument();
      });

      // Verifies the GET hit `/stories`.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe('/stories');
      expect((init as RequestInit).method).toBe('GET');

      // Each <li> exposes a stable `data-story-id`. The order of these
      // elements MUST be newest first.
      const rendered = screen.getAllByRole('listitem');
      const orderedIds = rendered.map((li) =>
        li.getAttribute('data-story-id'),
      );
      expect(orderedIds).toEqual([
        ROW_NEWEST.id,
        ROW_MIDDLE.id,
        ROW_OLDEST.id,
      ]);
    });

    it('renders an empty state when the backend returns no rows', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ stories: [] }));

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-empty')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('history-list-rows')).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // Requirement 10.2 — "Xem" opens detail with three tabs
  // -------------------------------------------------------------------
  describe('Requirement 10.2: "Xem" opens detail with three tabs', () => {
    it('fetches GET /stories/:id and renders Tổng Quan / Kế Hoạch / Chương tabs', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ stories: [ROW_NEWEST, ROW_MIDDLE] }),
      );

      // Detail payload returned for the "Xem" click.
      const detailPayload = {
        id: ROW_NEWEST.id,
        title: ROW_NEWEST.title,
        overview: 'Tóm tắt nội dung truyện.',
        plan: { acts: ['mở đầu', 'cao trào', 'kết'] },
        chapters: [
          {
            storyId: ROW_NEWEST.id,
            index: 1,
            status: 'done' as const,
            content: 'Nội dung chương 1',
            updatedAt: '2025-03-10T09:00:00.000Z',
          },
          {
            storyId: ROW_NEWEST.id,
            index: 2,
            status: 'done' as const,
            content: 'Nội dung chương 2',
            updatedAt: '2025-03-10T09:30:00.000Z',
          },
        ],
        status: 'completed',
        createdAt: ROW_NEWEST.createdAt,
      };
      fetchMock.mockResolvedValueOnce(jsonResponse(detailPayload));

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-rows')).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`history-list-view-${ROW_NEWEST.id}`),
      );

      // The detail panel mounts and fetches the detail.
      await waitFor(() => {
        expect(screen.getByTestId('history-detail')).toBeInTheDocument();
      });
      await waitFor(() => {
        expect(
          screen.getByTestId('history-detail-title'),
        ).toHaveTextContent(ROW_NEWEST.title!);
      });

      // Verifies the second fetch hit `/stories/:id`.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [detailUrl, detailInit] = fetchMock.mock.calls[1]!;
      expect(detailUrl).toBe(`/stories/${ROW_NEWEST.id}`);
      expect((detailInit as RequestInit).method).toBe('GET');

      // All three tabs must be present (Requirement 10.2 / 6.7 parity).
      const tabs = screen.getAllByRole('tab');
      const tabLabels = tabs.map((t) => t.textContent);
      expect(tabLabels).toEqual(['Tổng Quan', 'Kế Hoạch', 'Chương']);

      // Default tab is `Tổng Quan` and shows the overview text.
      expect(
        screen.getByTestId('history-detail-panel-overview'),
      ).toHaveTextContent('Tóm tắt nội dung truyện.');

      // Switching to `Kế Hoạch` reveals the plan content.
      fireEvent.click(screen.getByTestId('history-detail-tab-plan'));
      const planPanel = screen.getByTestId('history-detail-panel-plan');
      expect(planPanel).not.toHaveAttribute('hidden');
      expect(
        within(planPanel).getByTestId('history-detail-plan-content'),
      ).toHaveTextContent('cao trào');

      // Switching to `Chương` reveals the chapter list.
      fireEvent.click(screen.getByTestId('history-detail-tab-chapters'));
      const chaptersPanel = screen.getByTestId(
        'history-detail-panel-chapters',
      );
      expect(chaptersPanel).not.toHaveAttribute('hidden');
      expect(
        within(chaptersPanel).getByTestId('history-detail-chapter-1'),
      ).toHaveTextContent('Chương 1');
      expect(
        within(chaptersPanel).getByTestId('history-detail-chapter-2'),
      ).toHaveTextContent('Chương 2');
    });
  });

  // -------------------------------------------------------------------
  // Requirement 10.3 — "Xóa" confirms then triggers DELETE
  // -------------------------------------------------------------------
  describe('Requirement 10.3: "Xóa" prompts confirmation', () => {
    it('shows a confirmation modal and does not call DELETE before confirmation', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ stories: [ROW_NEWEST, ROW_MIDDLE] }),
      );

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-rows')).toBeInTheDocument();
      });

      // Clicking "Xóa" opens the confirmation modal but issues no fetch.
      fireEvent.click(
        screen.getByTestId(`history-list-delete-${ROW_NEWEST.id}`),
      );

      expect(screen.getByTestId('history-delete-modal')).toBeInTheDocument();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
      // Only the initial GET /stories has been issued so far.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('cancelling the modal does not delete the row and does not call DELETE', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ stories: [ROW_NEWEST, ROW_MIDDLE] }),
      );

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-rows')).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`history-list-delete-${ROW_NEWEST.id}`),
      );
      expect(screen.getByTestId('history-delete-modal')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('history-delete-cancel'));

      await waitFor(() => {
        expect(screen.queryByTestId('history-delete-modal')).toBeNull();
      });

      // The row is still in the list and no DELETE was issued.
      expect(
        screen.getByTestId(`history-list-row-${ROW_NEWEST.id}`),
      ).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('confirming the modal sends DELETE /stories/:id and removes the row', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ stories: [ROW_NEWEST, ROW_MIDDLE] }),
      );
      // DELETE returns 204-style empty body.
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-rows')).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`history-list-delete-${ROW_NEWEST.id}`),
      );
      fireEvent.click(screen.getByTestId('history-delete-confirm'));

      // The modal closes once the DELETE resolves and the row is gone.
      await waitFor(() => {
        expect(screen.queryByTestId('history-delete-modal')).toBeNull();
      });
      expect(
        screen.queryByTestId(`history-list-row-${ROW_NEWEST.id}`),
      ).toBeNull();
      // The other row remains untouched.
      expect(
        screen.getByTestId(`history-list-row-${ROW_MIDDLE.id}`),
      ).toBeInTheDocument();

      // Verifies the DELETE was issued against the correct URL.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const [deleteUrl, deleteInit] = fetchMock.mock.calls[1]!;
      expect(deleteUrl).toBe(`/stories/${ROW_NEWEST.id}`);
      expect((deleteInit as RequestInit).method).toBe('DELETE');
    });

    it('surfaces a server error inside the modal and keeps the row when DELETE fails', async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ stories: [ROW_NEWEST] }),
      );
      fetchMock.mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'forbidden', message: 'Không có quyền' } },
          403,
        ),
      );

      render(<HistoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('history-list-rows')).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId(`history-list-delete-${ROW_NEWEST.id}`),
      );
      fireEvent.click(screen.getByTestId('history-delete-confirm'));

      await waitFor(() => {
        expect(
          screen.getByTestId('history-delete-modal-error'),
        ).toBeInTheDocument();
      });

      expect(screen.getByRole('alert')).toHaveTextContent('Không có quyền');
      // Row is still in the list — the gateway rejected the delete.
      expect(
        screen.getByTestId(`history-list-row-${ROW_NEWEST.id}`),
      ).toBeInTheDocument();
    });
  });
});
