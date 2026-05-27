/**
 * Unit tests for `PlanActions`.
 *
 * Validates: Requirements 16.3, 16.4.
 *
 *   16.3  Upgrade button POSTs `/admin/users/:id/plan/upgrade`, then the
 *         component re-reads `/admin/users/:id/plan-state` and renders
 *         the Paid_Plan state plus the audit trail returned by the
 *         server (License_Service is the source of truth).
 *
 *   16.4  Revoke button POSTs `/admin/users/:id/plan/revoke`, then the
 *         component re-reads `/admin/users/:id/plan-state` and renders
 *         the post-revoke Free_Plan state plus the audit trail.
 *
 * The tests stub the global `fetch()` and assert the URL, method, and
 * body shape of every request, plus the rendered output after the
 * server response settles.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { PlanActions, type PlanStateResponse } from '../PlanActions';

type FetchMock = ReturnType<typeof vi.fn>;

interface FetchCallInit extends RequestInit {
  body?: BodyInit | null;
}

function fetchCalls(fetchMock: FetchMock): Array<{
  url: string;
  init: FetchCallInit;
}> {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as [RequestInfo | URL, FetchCallInit | undefined];
    return {
      url: typeof url === 'string' ? url : url.toString(),
      init: init ?? {},
    };
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const FREE_STATE: PlanStateResponse = {
  plan: {
    userId: 'user-123',
    plan: 'Free_Plan',
    status: 'active',
  },
  audit: [],
};

const PAID_STATE: PlanStateResponse = {
  plan: {
    userId: 'user-123',
    plan: 'Paid_Plan',
    status: 'active',
    paidStartAt: '2025-01-15T10:00:00.000Z',
    paidExpireAt: '2025-02-14T10:00:00.000Z',
    paidCycleId: 'cycle-1',
  },
  audit: [
    {
      id: 'evt-1',
      ts: '2025-01-15T10:00:00.000Z',
      eventType: 'paid_plan_upgraded',
      actorAdminId: 'admin-7',
      details: { reason: 'admin_upgrade' },
    },
    {
      id: 'evt-2',
      ts: '2025-01-15T10:00:00.000Z',
      eventType: 'admin_action',
      actorAdminId: 'admin-7',
    },
  ],
};

const REVOKED_STATE: PlanStateResponse = {
  plan: {
    userId: 'user-123',
    plan: 'Free_Plan',
    status: 'active',
  },
  audit: [
    {
      id: 'evt-3',
      ts: '2025-01-16T10:00:00.000Z',
      eventType: 'paid_plan_revoked',
      actorAdminId: 'admin-7',
    },
    {
      id: 'evt-4',
      ts: '2025-01-16T10:00:00.000Z',
      eventType: 'admin_action',
      actorAdminId: 'admin-7',
    },
  ],
};

describe('PlanActions', () => {
  let fetchMock: FetchMock;
  let originalFetch: typeof globalThis.fetch | undefined;
  let consoleErrorSpy: MockInstance | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    consoleErrorSpy?.mockRestore();
  });

  it('reads plan-state on mount and renders the current plan + empty audit', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, FREE_STATE));

    render(<PlanActions userId="user-123" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [first] = fetchCalls(fetchMock);
    expect(first?.url).toBe('/admin/users/user-123/plan-state');
    expect(first?.init.method).toBe('GET');
    expect(first?.init.credentials).toBe('include');

    await screen.findByTestId('plan-state');
    expect(screen.getByTestId('plan-state-plan')).toHaveTextContent(
      'Free_Plan',
    );
    expect(screen.getByTestId('plan-state-status')).toHaveTextContent(
      'active',
    );
    expect(screen.getByTestId('plan-audit-empty')).toBeInTheDocument();
  });

  it('upgrades Paid_Plan, re-reads plan-state, and renders the audit trail (Requirement 16.3)', async () => {
    fetchMock
      // Initial mount load.
      .mockResolvedValueOnce(jsonResponse(200, FREE_STATE))
      // POST upgrade.
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      // GET plan-state after upgrade.
      .mockResolvedValueOnce(jsonResponse(200, PAID_STATE));

    render(<PlanActions userId="user-123" />);
    // Wait for the initial load to complete.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('plan-upgrade-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const calls = fetchCalls(fetchMock);
    // POST /admin/users/:id/plan/upgrade
    expect(calls[1]?.url).toBe('/admin/users/user-123/plan/upgrade');
    expect(calls[1]?.init.method).toBe('POST');
    expect(calls[1]?.init.credentials).toBe('include');
    expect(typeof calls[1]?.init.body).toBe('string');
    // No client-supplied plan/role/quota fields (Requirement 3.4).
    expect(JSON.parse(calls[1]?.init.body as string)).toEqual({});

    // Refresh GET /admin/users/:id/plan-state
    expect(calls[2]?.url).toBe('/admin/users/user-123/plan-state');
    expect(calls[2]?.init.method).toBe('GET');

    // Resulting plan state is rendered from the server response.
    await screen.findByText('Paid_Plan');
    expect(screen.getByTestId('plan-state-plan')).toHaveTextContent(
      'Paid_Plan',
    );
    expect(screen.getByTestId('plan-state-paid-start')).toHaveTextContent(
      '2025-01-15T10:00:00.000Z',
    );
    expect(screen.getByTestId('plan-state-paid-expire')).toHaveTextContent(
      '2025-02-14T10:00:00.000Z',
    );

    // Audit trail is rendered.
    const entries = screen.getAllByTestId('plan-audit-entry');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveAttribute(
      'data-event-type',
      'paid_plan_upgraded',
    );
    expect(entries[1]).toHaveAttribute('data-event-type', 'admin_action');

    // Success message is shown.
    expect(screen.getByTestId('plan-action-message')).toHaveTextContent(
      /nâng cấp Paid_Plan/i,
    );
  });

  it('revokes Paid_Plan, re-reads plan-state, and renders the revoke audit (Requirement 16.4)', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, PAID_STATE))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, REVOKED_STATE));

    render(<PlanActions userId="user-123" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('plan-revoke-button'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const calls = fetchCalls(fetchMock);
    expect(calls[1]?.url).toBe('/admin/users/user-123/plan/revoke');
    expect(calls[1]?.init.method).toBe('POST');
    expect(calls[2]?.url).toBe('/admin/users/user-123/plan-state');
    expect(calls[2]?.init.method).toBe('GET');

    await waitFor(() =>
      expect(screen.getByTestId('plan-state-plan')).toHaveTextContent(
        'Free_Plan',
      ),
    );

    const entries = screen.getAllByTestId('plan-audit-entry');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveAttribute('data-event-type', 'paid_plan_revoked');

    expect(screen.getByTestId('plan-action-message')).toHaveTextContent(
      /thu hồi Paid_Plan/i,
    );
  });

  it('encodes the userId in URL paths', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, FREE_STATE))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
      .mockResolvedValueOnce(jsonResponse(200, PAID_STATE));

    render(<PlanActions userId="weird/id with spaces" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('plan-upgrade-button'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const calls = fetchCalls(fetchMock);
    expect(calls[0]?.url).toBe(
      '/admin/users/weird%2Fid%20with%20spaces/plan-state',
    );
    expect(calls[1]?.url).toBe(
      '/admin/users/weird%2Fid%20with%20spaces/plan/upgrade',
    );
    expect(calls[2]?.url).toBe(
      '/admin/users/weird%2Fid%20with%20spaces/plan-state',
    );
  });

  it('surfaces the gateway error envelope when upgrade fails', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, FREE_STATE))
      .mockResolvedValueOnce(
        jsonResponse(403, {
          error: {
            code: 'forbidden',
            message: 'Admin role required.',
          },
        }),
      );

    render(<PlanActions userId="user-123" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('plan-upgrade-button'));

    const errEl = await screen.findByTestId('plan-error');
    expect(errEl).toHaveTextContent('Admin role required.');
    // No follow-up plan-state GET when the action itself failed.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // No success message when the action errored.
    expect(
      screen.queryByTestId('plan-action-message'),
    ).not.toBeInTheDocument();
  });

  it('disables both buttons while a request is in flight', async () => {
    let resolveUpgrade: ((res: Response) => void) | undefined;
    const upgradePromise = new Promise<Response>((resolve) => {
      resolveUpgrade = resolve;
    });

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, FREE_STATE))
      .mockReturnValueOnce(upgradePromise)
      .mockResolvedValueOnce(jsonResponse(200, PAID_STATE));

    render(<PlanActions userId="user-123" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const upgradeBtn = screen.getByTestId(
      'plan-upgrade-button',
    ) as HTMLButtonElement;
    const revokeBtn = screen.getByTestId(
      'plan-revoke-button',
    ) as HTMLButtonElement;

    fireEvent.click(upgradeBtn);

    await waitFor(() => expect(upgradeBtn.disabled).toBe(true));
    expect(revokeBtn.disabled).toBe(true);

    resolveUpgrade?.(jsonResponse(200, { ok: true }));

    await waitFor(() => expect(upgradeBtn.disabled).toBe(false));
    expect(revokeBtn.disabled).toBe(false);
  });
});
