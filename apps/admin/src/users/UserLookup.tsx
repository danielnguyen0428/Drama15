import { useCallback, useMemo, useState, type FormEvent } from 'react';

/**
 * Admin user lookup component (Requirement 16.2).
 *
 * Renders a single text input plus a "Tìm kiếm" button. The query value is
 * inspected client-side and auto-routed to the correct admin lookup variant:
 *
 *   - Looks like an email (contains `@`)         → `?email=<value>`
 *   - Looks like a UUID v1-v5 (8-4-4-4-12 hex)   → `?id=<value>`
 *   - Anything else                              → `?fingerprint=<value>`
 *
 * The matching account(s) are rendered as a list showing id, email, plan,
 * and account status. The component is intentionally agnostic of how the
 * server shapes the response: it accepts either `{ users: [...] }` for a
 * multi-match endpoint or a flat single record (`{ user, plan }`) and
 * normalises both into a list.
 *
 * The login/TOTP flow is the responsibility of `LoginPage` (task 18.1);
 * this component assumes the caller is already authenticated as an admin
 * (Requirement 16.1) and does not attempt to handle auth itself.
 */

/** Auto-detected key used for the `/admin/users/lookup?<key>=...` query. */
export type LookupKey = 'email' | 'id' | 'fingerprint';

/** Plan label as surfaced to admins. Mirrors `PlanType` from contracts. */
export type LookupPlan = 'Free_Plan' | 'Paid_Plan' | string;

/** User row rendered in the result list. */
export interface LookupUser {
  id: string;
  email: string;
  plan: LookupPlan;
  status: string;
}

/**
 * Props for `UserLookup`.
 *
 * `fetcher` is injectable so unit tests can drive deterministic responses
 * without poking at the global `fetch`. Production code uses the default,
 * which calls `window.fetch` against the same origin.
 */
export interface UserLookupProps {
  /** Optional override for the default `fetch` implementation. */
  fetcher?: (url: string) => Promise<Response>;
  /** Optional base URL prefix; useful for tests / staging. Defaults to ''. */
  baseUrl?: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Inspect a raw query string and decide which admin lookup variant to call.
 *
 * Exported so unit tests can pin the routing rules independently of the
 * UI.  The order of checks matters: an email-shaped UUID can never exist
 * (UUIDs do not contain `@`), but we still check email first because that
 * is the most common admin lookup vector.
 */
export function detectLookupKey(raw: string): LookupKey {
  const value = raw.trim();
  if (value.includes('@')) return 'email';
  if (UUID_RE.test(value)) return 'id';
  return 'fingerprint';
}

/**
 * Normalise the server response into a flat list of `LookupUser` rows.
 * Tolerates two server shapes:
 *
 *   1. `{ users: LookupUser[] }`           — explicit list response.
 *   2. `{ user: { id, email, status, ... }, plan: { plan: PlanType, ... } }`
 *                                          — single-record shape used by
 *                                            the contracts module today
 *                                            (`AdminLookupResponse`).
 *
 * Anything else collapses to an empty list — surfaced to the user as a
 * "Không tìm thấy người dùng" message rather than a crash.
 */
function normaliseResponse(payload: unknown): LookupUser[] {
  if (payload === null || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;

  // Shape 1: explicit list.
  const usersRaw = obj['users'];
  if (Array.isArray(usersRaw)) {
    return usersRaw.flatMap((entry) => {
      const row = coerceUser(entry);
      return row === null ? [] : [row];
    });
  }

  // Shape 2: single record `{ user, plan }`.
  const userRaw = obj['user'];
  const planRaw = obj['plan'];
  if (
    userRaw !== undefined &&
    userRaw !== null &&
    typeof userRaw === 'object'
  ) {
    const userObj = userRaw as Record<string, unknown>;
    const planObj =
      planRaw !== null && typeof planRaw === 'object'
        ? (planRaw as Record<string, unknown>)
        : {};
    const merged = { ...userObj, plan: planObj['plan'] };
    const row = coerceUser(merged);
    return row === null ? [] : [row];
  }

  return [];
}

function coerceUser(entry: unknown): LookupUser | null {
  if (entry === null || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  const id = typeof e['id'] === 'string' ? (e['id'] as string) : null;
  const email = typeof e['email'] === 'string' ? (e['email'] as string) : null;
  if (id === null || email === null) return null;
  const plan =
    typeof e['plan'] === 'string' && e['plan'] !== ''
      ? (e['plan'] as string)
      : 'unknown';
  const status =
    typeof e['status'] === 'string' && e['status'] !== ''
      ? (e['status'] as string)
      : 'unknown';
  return { id, email, plan, status };
}

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'success'; users: LookupUser[]; key: LookupKey; query: string };

export function UserLookup(props: UserLookupProps = {}) {
  const { fetcher, baseUrl = '' } = props;
  const doFetch = useMemo<(url: string) => Promise<Response>>(
    () => fetcher ?? ((url: string) => fetch(url)),
    [fetcher],
  );

  const [query, setQuery] = useState('');
  const [view, setView] = useState<ViewState>({ kind: 'idle' });

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmed = query.trim();
      if (trimmed === '') {
        setView({ kind: 'error', message: 'Vui lòng nhập từ khóa tra cứu.' });
        return;
      }

      const key = detectLookupKey(trimmed);
      const url = `${baseUrl}/admin/users/lookup?${key}=${encodeURIComponent(
        trimmed,
      )}`;

      setView({ kind: 'loading' });
      try {
        const response = await doFetch(url);
        if (!response.ok) {
          setView({
            kind: 'error',
            message: `Lookup failed (HTTP ${response.status})`,
          });
          return;
        }
        const payload: unknown = await response.json();
        const users = normaliseResponse(payload);
        setView({ kind: 'success', users, key, query: trimmed });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Network request failed';
        setView({ kind: 'error', message });
      }
    },
    [baseUrl, doFetch, query],
  );

  return (
    <section aria-labelledby="admin-user-lookup-title">
      <h2 id="admin-user-lookup-title">Tra cứu người dùng</h2>
      <form onSubmit={onSubmit} aria-label="Admin user lookup form">
        <label htmlFor="admin-user-lookup-input">
          Email, ID hoặc Device fingerprint
        </label>
        <input
          id="admin-user-lookup-input"
          name="query"
          type="text"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={view.kind === 'loading'}>
          Tìm kiếm
        </button>
      </form>

      {view.kind === 'loading' && (
        <p role="status" data-testid="lookup-loading">
          Đang tra cứu...
        </p>
      )}

      {view.kind === 'error' && (
        <p role="alert" data-testid="lookup-error">
          {view.message}
        </p>
      )}

      {view.kind === 'success' && (
        <div data-testid="lookup-result">
          <p data-testid="lookup-detected-key">
            Tra cứu theo: <strong>{view.key}</strong>
          </p>
          {view.users.length === 0 ? (
            <p data-testid="lookup-empty">Không tìm thấy người dùng.</p>
          ) : (
            <ul aria-label="Lookup results">
              {view.users.map((u) => (
                <li key={u.id} data-testid="lookup-user-row">
                  <span data-testid="lookup-user-id">{u.id}</span>
                  <span data-testid="lookup-user-email">{u.email}</span>
                  <span data-testid="lookup-user-plan">{u.plan}</span>
                  <span data-testid="lookup-user-status">{u.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
