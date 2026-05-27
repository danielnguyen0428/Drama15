import { useCallback, useState, type FormEvent } from 'react';

/**
 * Admin audit-log viewer (Requirement 16.6).
 *
 * Renders a filter form (user, event type, time range) and a results table
 * after the admin submits the form. The viewer issues a GET to
 * `/admin/audit-events` with `userId`, `type`, `start`, `end` query params
 * and renders the response as a table of timestamp, type, user, ip and
 * (truncated) details.
 *
 * The endpoint is server-authoritative: this component does not enforce
 * filtering itself, it only forwards filter intent. The Admin_Console is
 * already gated by TOTP (Requirement 16.1) at the route level, so this
 * component assumes the caller is an authenticated admin.
 */

/**
 * Closed-set event type taxonomy mirrored from
 * `apps/api/src/audit/types.ts → AuditEventType`. The dropdown is closed
 * here (no free-text override) to keep the admin filter UX predictable;
 * if the backend introduces a new event taxonomy the option list must be
 * extended in lockstep.
 */
export const AUDIT_EVENT_TYPES = [
  'login_success',
  'login_failed',
  'logout',
  'free_plan_granted',
  'paid_plan_upgraded',
  'paid_plan_expired',
  'paid_plan_revoked',
  'access_token_issued',
  'access_token_rejected',
  'license_or_quota_denied',
  'client_integrity_failed',
  'devtools_detected',
  'admin_action',
  'admin_flag_opened',
  'refresh_token_reuse_detected',
] as const;

export type AuditEventTypeOption = (typeof AUDIT_EVENT_TYPES)[number];

/**
 * Server-side row contract. Mirrors `AdminAuditEvent` from
 * `@drama15/contracts` but redeclared here so the admin SPA does not need
 * a workspace dep edge. The only fields used by the table are listed
 * below; additional fields are ignored.
 */
export interface AuditLogRow {
  id: string;
  ts: string;
  eventType: string;
  userId?: string;
  ip?: string;
  details?: Record<string, unknown>;
}

interface AuditLogResponse {
  events: AuditLogRow[];
}

export interface AuditLogViewerProps {
  /** Override for tests; defaults to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Maximum chars rendered in the details column. */
  detailsMaxLen?: number;
}

const DEFAULT_DETAILS_MAX_LEN = 80;

/**
 * Build the audit-events URL using the task-specified query keys
 * (`userId`, `type`, `start`, `end`). Empty / unselected fields are
 * omitted so the server sees a minimal, well-formed query.
 */
export function buildAuditEventsUrl(filters: {
  userId: string;
  type: string;
  start: string;
  end: string;
}): string {
  const params = new URLSearchParams();
  if (filters.userId.trim()) params.set('userId', filters.userId.trim());
  if (filters.type) params.set('type', filters.type);
  if (filters.start) params.set('start', toIsoUtc(filters.start));
  if (filters.end) params.set('end', toIsoUtc(filters.end));
  const qs = params.toString();
  return qs.length > 0 ? `/admin/audit-events?${qs}` : '/admin/audit-events';
}

/**
 * Convert a value coming from a `<input type="datetime-local">` (which is
 * a local naive timestamp without timezone) or an already-ISO string into
 * a normalised UTC ISO-8601 string. If parsing fails, the raw value is
 * returned unchanged so the admin can see the server's validation error.
 */
function toIsoUtc(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toISOString();
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function renderDetails(
  details: Record<string, unknown> | undefined,
  maxLen: number,
): string {
  if (!details) return '';
  let serialised: string;
  try {
    serialised = JSON.stringify(details);
  } catch {
    serialised = String(details);
  }
  return truncate(serialised, maxLen);
}

export function AuditLogViewer(props: AuditLogViewerProps = {}) {
  const fetchImpl = props.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const detailsMaxLen = props.detailsMaxLen ?? DEFAULT_DETAILS_MAX_LEN;

  const [userId, setUserId] = useState('');
  const [type, setType] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<AuditLogRow[] | null>(null);

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setLoading(true);
      setError(null);
      try {
        const url = buildAuditEventsUrl({ userId, type, start, end });
        const res = await fetchImpl(url, {
          method: 'GET',
          credentials: 'include',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) {
          setRows(null);
          setError(`Request failed: ${res.status}`);
          return;
        }
        const body = (await res.json()) as AuditLogResponse;
        setRows(Array.isArray(body.events) ? body.events : []);
      } catch (err) {
        setRows(null);
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        setLoading(false);
      }
    },
    [fetchImpl, userId, type, start, end],
  );

  return (
    <main aria-labelledby="audit-log-title">
      <h1 id="audit-log-title">Audit log</h1>
      <p data-testid="audit-log-help">
        Filter audit events by user, event type, and time range
        (Requirement 16.6).
      </p>

      <form
        onSubmit={onSubmit}
        aria-label="Audit log filters"
        data-testid="audit-log-form"
      >
        <div>
          <label htmlFor="audit-user">User</label>
          <input
            id="audit-user"
            name="userId"
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="user id or email"
          />
        </div>

        <div>
          <label htmlFor="audit-type">Event type</label>
          <select
            id="audit-type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">All</option>
            {AUDIT_EVENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="audit-start">Start (UTC)</label>
          <input
            id="audit-start"
            name="start"
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="audit-end">End (UTC)</label>
          <input
            id="audit-end"
            name="end"
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Search'}
        </button>
      </form>

      {error !== null && (
        <p role="alert" data-testid="audit-log-error">
          {error}
        </p>
      )}

      {rows !== null && (
        <table aria-label="Audit log results" data-testid="audit-log-results">
          <thead>
            <tr>
              <th scope="col">Timestamp</th>
              <th scope="col">Type</th>
              <th scope="col">User</th>
              <th scope="col">IP</th>
              <th scope="col">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr data-testid="audit-log-empty">
                <td colSpan={5}>No events match these filters.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} data-testid="audit-log-row">
                  <td>{row.ts}</td>
                  <td>{row.eventType}</td>
                  <td>{row.userId ?? ''}</td>
                  <td>{row.ip ?? ''}</td>
                  <td title={row.details ? JSON.stringify(row.details) : ''}>
                    {renderDetails(row.details, detailsMaxLen)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </main>
  );
}
