import { useCallback, useEffect, useState } from 'react';

/**
 * `PlanActions` — Admin_Console panel for upgrading or revoking a user's
 * Paid_Plan and reviewing the resulting plan state plus the most recent
 * admin/license audit trail.
 *
 * Requirements covered:
 *
 *   16.3  WHEN an admin upgrades a tài khoản from Free_Plan lên Paid_Plan,
 *         THE License_Service SHALL áp dụng phát hành Paid_Plan như mô
 *         tả ở Requirement 2 (so this component delegates to the
 *         server-side endpoint and never derives plan state locally).
 *
 *   16.4  WHEN an admin revokes Paid_Plan, THE License_Service SHALL
 *         áp dụng thu hồi như mô tả ở Requirement 2 — same delegation
 *         contract as 16.3.
 *
 * Wire-level contract:
 *
 *   POST `/admin/users/:id/plan/upgrade`
 *   POST `/admin/users/:id/plan/revoke`
 *   GET  `/admin/users/:id/plan-state`
 *
 * The GET response is expected to carry both the current plan state
 * AND a short audit trail of the most recent admin / license events on
 * the user (`paid_plan_upgraded`, `paid_plan_revoked`, `paid_plan_expired`,
 * `admin_action`, …). See `packages/contracts/src/admin.ts`
 * (`AdminAuditEvent`) and `packages/contracts/src/plan.ts` (`PlanState`)
 * for the canonical shapes.
 *
 * Server-authoritative posture (Requirement 3.4 / 16.7):
 *   * The component never trusts client state for "the user is Paid".
 *     Every render re-reads plan state from the server.
 *   * No admin role / quota fields are sent in the body — `userId` in
 *     the URL is the only piece of caller-controlled state.
 *   * Credentials (the admin session cookie) are forwarded so the
 *     gateway can authorize the action against the admin role + TOTP
 *     session established in tasks 5.11 / 18.1.
 */

/** Mirror of `PlanState` from `@drama15/contracts` (kept inline so the
 * Admin_Console SPA can compile without a build-time dep on the
 * package; the wire shape is identical). */
export interface PlanState {
  userId: string;
  plan: 'Free_Plan' | 'Paid_Plan';
  status: 'active' | 'expired' | 'revoked' | 'pending_deletion';
  paidStartAt?: string;
  paidExpireAt?: string;
  paidCycleId?: string;
}

/** Mirror of `AdminAuditEvent` — only the fields this panel renders. */
export interface PlanAuditEntry {
  id: string;
  ts: string;
  eventType: string;
  actorAdminId?: string;
  details?: Record<string, unknown>;
}

export interface PlanStateResponse {
  plan: PlanState;
  audit: PlanAuditEntry[];
}

export interface PlanActionsProps {
  /** UUID of the target user. Echoed into the URL paths. */
  readonly userId: string;
}

type PendingAction = 'idle' | 'upgrade' | 'revoke' | 'refresh';

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

async function readErrorMessage(res: Response): Promise<string> {
  // The gateway always returns `{ error: { code, message, ... } }` on
  // failure (design.md → "Standardize error response shape"). Fall
  // back to the HTTP status text if the body is not JSON.
  try {
    const body = (await res.json()) as ErrorEnvelope;
    if (body?.error?.message) return body.error.message;
    if (body?.error?.code) return body.error.code;
  } catch {
    // not JSON
  }
  return `${res.status} ${res.statusText || 'Request failed'}`.trim();
}

function planStateUrl(userId: string): string {
  return `/admin/users/${encodeURIComponent(userId)}/plan-state`;
}

function planActionUrl(
  userId: string,
  action: 'upgrade' | 'revoke',
): string {
  return `/admin/users/${encodeURIComponent(userId)}/plan/${action}`;
}

export function PlanActions({ userId }: PlanActionsProps) {
  const [pending, setPending] = useState<PendingAction>('idle');
  const [planResponse, setPlanResponse] = useState<PlanStateResponse | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(
    null,
  );

  const refreshPlanState = useCallback(async (): Promise<void> => {
    setPending('refresh');
    setError(null);
    try {
      const res = await fetch(planStateUrl(userId), {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        setError(await readErrorMessage(res));
        return;
      }
      const body = (await res.json()) as PlanStateResponse;
      setPlanResponse({
        plan: body.plan,
        audit: Array.isArray(body.audit) ? body.audit : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setPending('idle');
    }
  }, [userId]);

  // Load plan state on mount and whenever the target user changes so
  // operators always see current data before deciding to act.
  useEffect(() => {
    void refreshPlanState();
  }, [refreshPlanState]);

  const runAction = useCallback(
    async (action: 'upgrade' | 'revoke'): Promise<void> => {
      setPending(action);
      setError(null);
      setLastActionMessage(null);
      try {
        const res = await fetch(planActionUrl(userId, action), {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          // No body fields — `userId` is in the URL, and the server
          // is authoritative for plan/role/quota (Requirement 3.4).
          body: JSON.stringify({}),
        });
        if (!res.ok) {
          setError(await readErrorMessage(res));
          return;
        }
        setLastActionMessage(
          action === 'upgrade'
            ? 'Đã nâng cấp Paid_Plan.'
            : 'Đã thu hồi Paid_Plan.',
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
        return;
      } finally {
        setPending('idle');
      }
      // Always re-read plan state from the server so the UI reflects
      // the License_Service decision, never the optimistic client one.
      await refreshPlanState();
    },
    [userId, refreshPlanState],
  );

  const isBusy = pending !== 'idle';

  return (
    <section
      aria-labelledby="plan-actions-title"
      data-testid="plan-actions"
      data-user-id={userId}
    >
      <h2 id="plan-actions-title">Quản lý Paid_Plan</h2>

      <div role="group" aria-label="Plan actions">
        <button
          type="button"
          data-testid="plan-upgrade-button"
          onClick={() => void runAction('upgrade')}
          disabled={isBusy}
        >
          {pending === 'upgrade' ? 'Đang nâng cấp…' : 'Nâng cấp Paid_Plan'}
        </button>
        <button
          type="button"
          data-testid="plan-revoke-button"
          onClick={() => void runAction('revoke')}
          disabled={isBusy}
        >
          {pending === 'revoke' ? 'Đang thu hồi…' : 'Thu hồi Paid_Plan'}
        </button>
      </div>

      {lastActionMessage && (
        <p role="status" data-testid="plan-action-message">
          {lastActionMessage}
        </p>
      )}

      {error && (
        <p role="alert" data-testid="plan-error">
          {error}
        </p>
      )}

      <PlanStateView state={planResponse?.plan ?? null} />
      <AuditTrailView entries={planResponse?.audit ?? []} />
    </section>
  );
}

function PlanStateView({ state }: { state: PlanState | null }) {
  if (!state) {
    return (
      <p data-testid="plan-state-empty">
        Đang tải trạng thái plan…
      </p>
    );
  }
  return (
    <dl data-testid="plan-state">
      <dt>Plan</dt>
      <dd data-testid="plan-state-plan">{state.plan}</dd>
      <dt>Trạng thái</dt>
      <dd data-testid="plan-state-status">{state.status}</dd>
      {state.paidStartAt && (
        <>
          <dt>Bắt đầu Paid</dt>
          <dd data-testid="plan-state-paid-start">{state.paidStartAt}</dd>
        </>
      )}
      {state.paidExpireAt && (
        <>
          <dt>Hết hạn Paid</dt>
          <dd data-testid="plan-state-paid-expire">{state.paidExpireAt}</dd>
        </>
      )}
    </dl>
  );
}

function AuditTrailView({ entries }: { entries: PlanAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <p data-testid="plan-audit-empty">Chưa có sự kiện audit.</p>
    );
  }
  return (
    <ol data-testid="plan-audit-list">
      {entries.map((entry) => (
        <li
          key={entry.id}
          data-testid="plan-audit-entry"
          data-event-type={entry.eventType}
        >
          <time dateTime={entry.ts}>{entry.ts}</time>
          {' — '}
          <span data-testid="plan-audit-event-type">{entry.eventType}</span>
          {entry.actorAdminId && (
            <>
              {' '}
              (bởi{' '}
              <span data-testid="plan-audit-actor">{entry.actorAdminId}</span>
              )
            </>
          )}
        </li>
      ))}
    </ol>
  );
}
