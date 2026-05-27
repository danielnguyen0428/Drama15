/**
 * `HistoryList` — Story_Job history list with detail navigation and
 * delete-with-confirmation (Task 17.8).
 *
 * Validates: Requirements 10.1, 10.2, 10.3.
 *
 *   10.1  THE Web_Client SHALL hiển thị danh sách các Story_Job đã
 *         tạo của tài khoản, sắp xếp theo thời gian tạo giảm dần.
 *   10.2  WHEN người dùng chọn một mục trong lịch sử, THE Web_Client
 *         SHALL gọi API_Gateway để lấy nội dung tổng quan, kế hoạch
 *         và chương tương ứng và phải hiển thị lại trên giao diện.
 *   10.3  WHEN người dùng yêu cầu xóa một mục lịch sử, THE
 *         API_Gateway SHALL xóa nội dung Story_Job và mọi file voice
 *         liên quan trong vòng 24 giờ.
 *
 * Component contract:
 *   - On mount: GET `/stories` and render the rows.
 *   - The list is re-sorted client-side by `createdAt DESC` even when
 *     the backend already does so. The backend is the source of
 *     truth (see `apps/api/src/stories/history.property.test.ts`),
 *     but a defensive re-sort keeps the UI deterministic if a future
 *     proxy or cache reorders the rows.
 *   - Each row exposes "Xem" (open detail) and "Xóa" (delete).
 *   - "Xem" swaps the list view for `HistoryDetail`, which fetches
 *     `GET /stories/:id` and renders three tabs.
 *   - "Xóa" pops a confirmation modal. Confirming sends `DELETE
 *     /stories/:id` and removes the row from local state on success.
 *     Cancelling closes the modal without making any request.
 *
 * The component intentionally never auto-deletes nor optimistically
 * removes the row before the backend confirms. The 24h voice-file
 * cleanup happens server-side; the UI only owns the row removal once
 * the API returns 2xx (or 404, which is treated as already-deleted).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { httpFetch } from '../api/httpClient';
import { HistoryDetail } from './HistoryDetail';

/** Row projection returned by `GET /stories`. */
export interface HistoryListRow {
  id: string;
  title: string | null;
  status: string;
  /** ISO-8601 UTC instant the story was created. */
  createdAt: string;
}

/** Body shape returned by `GET /stories`. */
interface HistoryListResponse {
  stories: HistoryListRow[];
}

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: HistoryListRow[] }
  | { kind: 'error'; message: string };

type View =
  | { kind: 'list' }
  | { kind: 'detail'; storyId: string };

interface PendingDelete {
  readonly storyId: string;
  /** UI state while the DELETE request is in flight. */
  readonly busy: boolean;
  /** Error surfaced inside the modal when the DELETE fails. */
  readonly error?: string;
}

/**
 * Compare ISO-8601 timestamps for descending order. Strings that fail
 * to parse fall to the bottom — they cannot meaningfully be ordered.
 */
function compareDescByCreatedAt(
  a: HistoryListRow,
  b: HistoryListRow,
): number {
  const ta = Date.parse(a.createdAt);
  const tb = Date.parse(b.createdAt);
  const aValid = Number.isFinite(ta);
  const bValid = Number.isFinite(tb);
  if (aValid && bValid) return tb - ta;
  if (aValid) return -1;
  if (bValid) return 1;
  return 0;
}

/**
 * Pretty-print an ISO-8601 instant in the user's locale. Falls back to
 * the raw string when parsing fails so we never render "Invalid Date".
 */
function formatCreatedAt(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return iso;
  }
}

export function HistoryList(): JSX.Element {
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [view, setView] = useState<View>({ kind: 'list' });
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );

  // -------------------------------------------------------------------
  // Initial fetch
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await httpFetch('/stories', { method: 'GET' });
        if (cancelled) return;
        if (!response.ok) {
          let message = 'Không thể tải lịch sử. Vui lòng thử lại.';
          try {
            const body = (await response.json()) as {
              error?: { message?: string };
            };
            if (body.error && typeof body.error.message === 'string') {
              message = body.error.message;
            }
          } catch {
            // non-JSON body: keep default message.
          }
          if (!cancelled) setState({ kind: 'error', message });
          return;
        }
        const body = (await response.json()) as HistoryListResponse;
        const rows = Array.isArray(body.stories) ? body.stories : [];
        if (!cancelled) setState({ kind: 'ready', rows });
      } catch {
        if (!cancelled) {
          setState({
            kind: 'error',
            message: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // -------------------------------------------------------------------
  // Sorted rows (Requirement 10.1: createdAt DESC, asserted client-side)
  // -------------------------------------------------------------------
  const sortedRows = useMemo<HistoryListRow[]>(() => {
    if (state.kind !== 'ready') return [];
    return [...state.rows].sort(compareDescByCreatedAt);
  }, [state]);

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------
  const handleOpenDetail = useCallback((storyId: string) => {
    setView({ kind: 'detail', storyId });
  }, []);

  const handleBackToList = useCallback(() => {
    setView({ kind: 'list' });
  }, []);

  const handleAskDelete = useCallback((storyId: string) => {
    setPendingDelete({ storyId, busy: false });
  }, []);

  const handleCancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete || pendingDelete.busy) return;
    const { storyId } = pendingDelete;
    setPendingDelete({ storyId, busy: true });

    try {
      const response = await httpFetch(
        `/stories/${encodeURIComponent(storyId)}`,
        { method: 'DELETE' },
      );

      // 404 is treated as "already deleted" — same idempotent behaviour
      // documented in `apps/api/src/stories/delete.ts`. We still drop
      // the row locally so the UI matches reality.
      if (!response.ok && response.status !== 404) {
        let message = 'Không thể xóa truyện. Vui lòng thử lại.';
        try {
          const body = (await response.json()) as {
            error?: { message?: string };
          };
          if (body.error && typeof body.error.message === 'string') {
            message = body.error.message;
          }
        } catch {
          // non-JSON body: keep default message.
        }
        setPendingDelete({ storyId, busy: false, error: message });
        return;
      }

      // Success (or 404): remove the row locally and close the modal.
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          rows: prev.rows.filter((r) => r.id !== storyId),
        };
      });
      // If the user was viewing the deleted story, fall back to the list.
      setView((prevView) => {
        if (prevView.kind === 'detail' && prevView.storyId === storyId) {
          return { kind: 'list' };
        }
        return prevView;
      });
      setPendingDelete(null);
    } catch {
      setPendingDelete({
        storyId,
        busy: false,
        error: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
      });
    }
  }, [pendingDelete]);

  // -------------------------------------------------------------------
  // Detail view
  // -------------------------------------------------------------------
  if (view.kind === 'detail') {
    return (
      <HistoryDetail storyId={view.storyId} onBack={handleBackToList} />
    );
  }

  // -------------------------------------------------------------------
  // List view
  // -------------------------------------------------------------------
  return (
    <section data-testid="history-list" aria-label="Lịch sử truyện">
      <h2>Lịch sử</h2>

      {state.kind === 'loading' ? (
        <p data-testid="history-list-loading" role="status">
          Đang tải lịch sử…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p data-testid="history-list-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.kind === 'ready' && sortedRows.length === 0 ? (
        <p data-testid="history-list-empty">Chưa có truyện nào.</p>
      ) : null}

      {state.kind === 'ready' && sortedRows.length > 0 ? (
        <ul data-testid="history-list-rows">
          {sortedRows.map((row) => (
            <li
              key={row.id}
              data-testid={`history-list-row-${row.id}`}
              data-story-id={row.id}
            >
              <span data-testid={`history-list-title-${row.id}`}>
                {row.title ?? 'Truyện chưa có tiêu đề'}
              </span>
              <span data-testid={`history-list-created-${row.id}`}>
                {formatCreatedAt(row.createdAt)}
              </span>
              <button
                type="button"
                data-testid={`history-list-view-${row.id}`}
                onClick={() => handleOpenDetail(row.id)}
              >
                Xem
              </button>
              <button
                type="button"
                data-testid={`history-list-delete-${row.id}`}
                onClick={() => handleAskDelete(row.id)}
              >
                Xóa
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {pendingDelete !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-delete-title"
          data-testid="history-delete-modal"
        >
          <h3 id="history-delete-title">Xác nhận xóa</h3>
          <p>
            Bạn có chắc muốn xóa truyện này? Hành động không thể hoàn tác.
          </p>
          {pendingDelete.error !== undefined ? (
            <p role="alert" data-testid="history-delete-modal-error">
              {pendingDelete.error}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="history-delete-confirm"
            onClick={() => {
              void handleConfirmDelete();
            }}
            disabled={pendingDelete.busy}
            aria-busy={pendingDelete.busy || undefined}
          >
            Xóa
          </button>
          <button
            type="button"
            data-testid="history-delete-cancel"
            onClick={handleCancelDelete}
            disabled={pendingDelete.busy}
          >
            Hủy
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default HistoryList;
