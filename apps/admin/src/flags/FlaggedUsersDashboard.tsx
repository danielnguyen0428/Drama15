/**
 * `FlaggedUsersDashboard` — Admin_Console panel for users flagged by
 * the integrity-failure rule (Task 18.4).
 *
 * Validates: Requirement 16.5.
 *
 *   16.5  THE Admin_Console SHALL hiển thị bảng theo dõi các tài
 *         khoản bị gắn cờ do `client_integrity_failed` và phải cho
 *         phép bỏ cờ hoặc khóa tài khoản.
 *
 * Component contract:
 *   - On mount, `GET /admin/flagged-users` and render a table.
 *     Cookies are forwarded (`credentials: 'include'`) so the admin
 *     session — established by the TOTP login flow — gates access.
 *   - Columns: user (email + id), flag count, last_flag_at, actions.
 *   - Action "Xóa cờ" → `DELETE /admin/users/:id/flag` (clears the
 *     flag immediately, no extra confirmation).
 *   - Action "Khóa tài khoản" → `POST /admin/users/:id/lock`. This
 *     action is destructive (the user can no longer log in until an
 *     admin restores them), so the UI MUST show a confirmation modal
 *     and only fire the request after the operator confirms.
 *
 * The component intentionally avoids any shared HTTP helper — Task
 * 18.4 scope is contained to `apps/admin/src/flags`. Headers that
 * other admin requests later need (X-CSRF, X-Admin-TOTP, …) are
 * applied in their own task.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

/** Row shape returned by `GET /admin/flagged-users`. */
export interface FlaggedUserRow {
  /** Internal user id; used for action URLs. */
  id: string;
  /** Email displayed in the user column. */
  email: string;
  /** Optional human-readable display name shown beside the email. */
  displayName?: string;
  /** Count of `client_integrity_failed` rejections inside the rolling 24h window. */
  flagCount: number;
  /** ISO-8601 UTC timestamp of the most recent `client_integrity_failed` event. */
  lastFlagAt: string;
}

/** Body shape returned by `GET /admin/flagged-users`. */
interface FlaggedUsersResponse {
  users: FlaggedUserRow[];
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; rows: FlaggedUserRow[] }
  | { kind: 'error'; message: string };

interface PendingLock {
  readonly userId: string;
  readonly email: string;
  readonly busy: boolean;
  readonly error?: string;
}

interface RowBusyState {
  /** `true` while a `DELETE /admin/users/:id/flag` request is in flight. */
  readonly clearing: boolean;
  /** Per-row error surfaced after a failed clear-flag attempt. */
  readonly clearError?: string;
}

/**
 * Pretty-print an ISO-8601 instant in the operator's locale. Falls
 * back to the raw string when parsing fails so we never render the
 * literal "Invalid Date".
 */
function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Try to extract a server-supplied error message from a non-2xx
 * response. Falls back to the provided default if the body is missing
 * or not JSON.
 */
async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
    };
    if (body.error && typeof body.error.message === 'string') {
      return body.error.message;
    }
  } catch {
    // non-JSON body
  }
  return fallback;
}

export function FlaggedUsersDashboard(): JSX.Element {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [pendingLock, setPendingLock] = useState<PendingLock | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, RowBusyState>>({});

  // -------------------------------------------------------------------
  // Initial fetch — `GET /admin/flagged-users`
  // -------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const response = await fetch('/admin/flagged-users', {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (!response.ok) {
          const message = await readErrorMessage(
            response,
            'Không thể tải danh sách tài khoản bị gắn cờ. Vui lòng thử lại.',
          );
          setState({ kind: 'error', message });
          return;
        }
        const body = (await response.json()) as FlaggedUsersResponse;
        const rows = Array.isArray(body.users) ? body.users : [];
        setState({ kind: 'ready', rows });
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

  // Sort newest-flag-first so operators triage the freshest abuse first.
  const sortedRows = useMemo<FlaggedUserRow[]>(() => {
    if (state.kind !== 'ready') return [];
    return [...state.rows].sort((a, b) => {
      const ta = Date.parse(a.lastFlagAt);
      const tb = Date.parse(b.lastFlagAt);
      const av = Number.isFinite(ta);
      const bv = Number.isFinite(tb);
      if (av && bv) return tb - ta;
      if (av) return -1;
      if (bv) return 1;
      return 0;
    });
  }, [state]);

  // -------------------------------------------------------------------
  // Clear-flag (Xóa cờ) — DELETE /admin/users/:id/flag
  // -------------------------------------------------------------------
  const handleClearFlag = useCallback(async (userId: string) => {
    setRowBusy((prev) => ({
      ...prev,
      [userId]: { clearing: true },
    }));

    try {
      const response = await fetch(
        `/admin/users/${encodeURIComponent(userId)}/flag`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );

      if (!response.ok && response.status !== 404) {
        const message = await readErrorMessage(
          response,
          'Không thể xóa cờ. Vui lòng thử lại.',
        );
        setRowBusy((prev) => ({
          ...prev,
          [userId]: { clearing: false, clearError: message },
        }));
        return;
      }

      // Success (or 404 — already cleared). Drop the row locally.
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          rows: prev.rows.filter((r) => r.id !== userId),
        };
      });
      setRowBusy((prev) => {
        const { [userId]: _removed, ...rest } = prev;
        return rest;
      });
    } catch {
      setRowBusy((prev) => ({
        ...prev,
        [userId]: {
          clearing: false,
          clearError: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
        },
      }));
    }
  }, []);

  // -------------------------------------------------------------------
  // Lock account (Khóa tài khoản) — confirmation modal then POST /lock
  // -------------------------------------------------------------------
  const handleAskLock = useCallback((row: FlaggedUserRow) => {
    setPendingLock({ userId: row.id, email: row.email, busy: false });
  }, []);

  const handleCancelLock = useCallback(() => {
    setPendingLock(null);
  }, []);

  const handleConfirmLock = useCallback(async () => {
    if (!pendingLock || pendingLock.busy) return;
    const { userId } = pendingLock;
    setPendingLock({ ...pendingLock, busy: true, error: undefined });

    try {
      const response = await fetch(
        `/admin/users/${encodeURIComponent(userId)}/lock`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        },
      );

      if (!response.ok) {
        const message = await readErrorMessage(
          response,
          'Không thể khóa tài khoản. Vui lòng thử lại.',
        );
        setPendingLock({ ...pendingLock, busy: false, error: message });
        return;
      }

      // Success — drop the row locally and close the modal.
      setState((prev) => {
        if (prev.kind !== 'ready') return prev;
        return {
          kind: 'ready',
          rows: prev.rows.filter((r) => r.id !== userId),
        };
      });
      setPendingLock(null);
    } catch {
      setPendingLock({
        ...pendingLock,
        busy: false,
        error: 'Không thể kết nối tới máy chủ. Vui lòng thử lại.',
      });
    }
  }, [pendingLock]);

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------
  return (
    <section
      data-testid="flagged-users-dashboard"
      aria-labelledby="flagged-users-title"
    >
      <h2 id="flagged-users-title">Tài khoản bị gắn cờ</h2>

      {state.kind === 'loading' ? (
        <p data-testid="flagged-users-loading" role="status">
          Đang tải danh sách…
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p data-testid="flagged-users-error" role="alert">
          {state.message}
        </p>
      ) : null}

      {state.kind === 'ready' && sortedRows.length === 0 ? (
        <p data-testid="flagged-users-empty">
          Hiện không có tài khoản nào bị gắn cờ.
        </p>
      ) : null}

      {state.kind === 'ready' && sortedRows.length > 0 ? (
        <table data-testid="flagged-users-table">
          <thead>
            <tr>
              <th scope="col">Người dùng</th>
              <th scope="col">Số lần vi phạm</th>
              <th scope="col">Lần cuối</th>
              <th scope="col">Hành động</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const busy = rowBusy[row.id];
              return (
                <tr
                  key={row.id}
                  data-testid={`flagged-users-row-${row.id}`}
                  data-user-id={row.id}
                >
                  <td data-testid={`flagged-users-user-${row.id}`}>
                    <span>{row.email}</span>
                    {row.displayName ? (
                      <span> · {row.displayName}</span>
                    ) : null}
                    <span> · {row.id}</span>
                  </td>
                  <td data-testid={`flagged-users-count-${row.id}`}>
                    {row.flagCount}
                  </td>
                  <td data-testid={`flagged-users-last-${row.id}`}>
                    {formatTimestamp(row.lastFlagAt)}
                  </td>
                  <td>
                    <button
                      type="button"
                      data-testid={`flagged-users-clear-${row.id}`}
                      onClick={() => {
                        void handleClearFlag(row.id);
                      }}
                      disabled={busy?.clearing === true}
                      aria-busy={busy?.clearing || undefined}
                    >
                      Xóa cờ
                    </button>
                    <button
                      type="button"
                      data-testid={`flagged-users-lock-${row.id}`}
                      onClick={() => handleAskLock(row)}
                      disabled={busy?.clearing === true}
                    >
                      Khóa tài khoản
                    </button>
                    {busy?.clearError ? (
                      <span
                        role="alert"
                        data-testid={`flagged-users-clear-error-${row.id}`}
                      >
                        {busy.clearError}
                      </span>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {pendingLock !== null ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="flagged-users-lock-title"
          data-testid="flagged-users-lock-modal"
        >
          <h3 id="flagged-users-lock-title">Xác nhận khóa tài khoản</h3>
          <p>
            Bạn có chắc muốn khóa tài khoản{' '}
            <strong>{pendingLock.email}</strong>? Tài khoản sẽ không thể
            đăng nhập cho đến khi quản trị viên mở khóa.
          </p>
          {pendingLock.error !== undefined ? (
            <p role="alert" data-testid="flagged-users-lock-error">
              {pendingLock.error}
            </p>
          ) : null}
          <button
            type="button"
            data-testid="flagged-users-lock-confirm"
            onClick={() => {
              void handleConfirmLock();
            }}
            disabled={pendingLock.busy}
            aria-busy={pendingLock.busy || undefined}
          >
            Khóa tài khoản
          </button>
          <button
            type="button"
            data-testid="flagged-users-lock-cancel"
            onClick={handleCancelLock}
            disabled={pendingLock.busy}
          >
            Hủy
          </button>
        </div>
      ) : null}
    </section>
  );
}

export default FlaggedUsersDashboard;
