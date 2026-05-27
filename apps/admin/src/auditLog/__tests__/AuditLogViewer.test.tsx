import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  AUDIT_EVENT_TYPES,
  AuditLogViewer,
  buildAuditEventsUrl,
  type AuditLogRow,
} from '../AuditLogViewer';

/**
 * Tests for the audit-log viewer (Requirement 16.6).
 *
 * The component is server-authoritative: these tests assert the URL it
 * sends and the table it renders, not any client-side filtering.
 */

function makeFetchMock(rows: AuditLogRow[]) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ events: rows }),
  });
}

function sampleRow(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'evt-1',
    ts: '2025-01-15T10:30:00.000Z',
    eventType: 'login_success',
    userId: 'user-42',
    ip: '203.0.113.7',
    details: { country: 'VN' },
    ...overrides,
  };
}

describe('buildAuditEventsUrl', () => {
  it('omits empty filters', () => {
    expect(
      buildAuditEventsUrl({ userId: '', type: '', start: '', end: '' }),
    ).toBe('/admin/audit-events');
  });

  it('encodes userId, type, start, and end as ISO query params', () => {
    const url = buildAuditEventsUrl({
      userId: 'user-42',
      type: 'login_failed',
      start: '2025-01-15T00:00:00Z',
      end: '2025-01-16T00:00:00Z',
    });
    const u = new URL(url, 'http://example.test');
    expect(u.pathname).toBe('/admin/audit-events');
    expect(u.searchParams.get('userId')).toBe('user-42');
    expect(u.searchParams.get('type')).toBe('login_failed');
    expect(u.searchParams.get('start')).toBe('2025-01-15T00:00:00.000Z');
    expect(u.searchParams.get('end')).toBe('2025-01-16T00:00:00.000Z');
  });

  it('trims whitespace from userId', () => {
    const url = buildAuditEventsUrl({
      userId: '  alice@example.com  ',
      type: '',
      start: '',
      end: '',
    });
    expect(new URL(url, 'http://x').searchParams.get('userId')).toBe(
      'alice@example.com',
    );
  });
});

describe('AuditLogViewer', () => {
  it('renders the filter form with a closed-set event-type dropdown', () => {
    render(<AuditLogViewer fetchImpl={makeFetchMock([])} />);

    expect(
      screen.getByRole('heading', { name: /audit log/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^user$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/start \(utc\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/end \(utc\)/i)).toBeInTheDocument();

    const typeSelect = screen.getByLabelText(/event type/i) as HTMLSelectElement;
    // "All" + every taxonomy entry must appear as <option>.
    const optionValues = Array.from(typeSelect.options).map((o) => o.value);
    expect(optionValues).toContain('');
    for (const t of AUDIT_EVENT_TYPES) {
      expect(optionValues).toContain(t);
    }
    expect(optionValues).toContain('login_failed');
    expect(optionValues).toContain('client_integrity_failed');
    expect(optionValues).toContain('admin_action');
  });

  it('does not call the API before the form is submitted', () => {
    const fetchMock = makeFetchMock([]);
    render(<AuditLogViewer fetchImpl={fetchMock} />);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('GETs /admin/audit-events with the selected filters on submit', async () => {
    const fetchMock = makeFetchMock([sampleRow()]);
    render(<AuditLogViewer fetchImpl={fetchMock} />);

    fireEvent.change(screen.getByLabelText(/^user$/i), {
      target: { value: 'user-42' },
    });
    fireEvent.change(screen.getByLabelText(/event type/i), {
      target: { value: 'login_failed' },
    });
    fireEvent.change(screen.getByLabelText(/start \(utc\)/i), {
      target: { value: '2025-01-15T00:00' },
    });
    fireEvent.change(screen.getByLabelText(/end \(utc\)/i), {
      target: { value: '2025-01-16T00:00' },
    });
    fireEvent.submit(screen.getByTestId('audit-log-form'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(typeof calledUrl).toBe('string');
    const url = new URL(calledUrl as string, 'http://example.test');
    expect(url.pathname).toBe('/admin/audit-events');
    expect(url.searchParams.get('userId')).toBe('user-42');
    expect(url.searchParams.get('type')).toBe('login_failed');
    expect(url.searchParams.get('start')).not.toBeNull();
    expect(url.searchParams.get('end')).not.toBeNull();
    expect(init).toMatchObject({ method: 'GET' });
  });

  it('renders the response as a table of timestamp/type/user/ip/details', async () => {
    const rows: AuditLogRow[] = [
      sampleRow({
        id: 'evt-a',
        ts: '2025-02-01T08:00:00.000Z',
        eventType: 'login_failed',
        userId: 'user-1',
        ip: '10.0.0.1',
        details: { reason: 'wrong_password' },
      }),
      sampleRow({
        id: 'evt-b',
        ts: '2025-02-01T08:05:00.000Z',
        eventType: 'client_integrity_failed',
        userId: 'user-2',
        ip: '10.0.0.2',
        details: { build: 'abc123' },
      }),
    ];
    render(<AuditLogViewer fetchImpl={makeFetchMock(rows)} />);
    fireEvent.submit(screen.getByTestId('audit-log-form'));

    const tableRows = await screen.findAllByTestId('audit-log-row');
    expect(tableRows).toHaveLength(2);

    const firstRow = tableRows[0]!;
    expect(firstRow).toHaveTextContent('2025-02-01T08:00:00.000Z');
    expect(firstRow).toHaveTextContent('login_failed');
    expect(firstRow).toHaveTextContent('user-1');
    expect(firstRow).toHaveTextContent('10.0.0.1');
    expect(firstRow).toHaveTextContent('wrong_password');
  });

  it('truncates long details payloads in the table cell', async () => {
    const longDetails: Record<string, unknown> = {
      note: 'x'.repeat(500),
    };
    render(
      <AuditLogViewer
        fetchImpl={makeFetchMock([
          sampleRow({ id: 'evt-long', details: longDetails }),
        ])}
        detailsMaxLen={40}
      />,
    );
    fireEvent.submit(screen.getByTestId('audit-log-form'));

    const row = await screen.findByTestId('audit-log-row');
    const cells = row.querySelectorAll('td');
    const detailsCell = cells[cells.length - 1]!;
    expect(detailsCell.textContent ?? '').toHaveLength(40);
    expect(detailsCell.textContent ?? '').toMatch(/…$/);
  });

  it('shows an empty-state row when the API returns zero events', async () => {
    render(<AuditLogViewer fetchImpl={makeFetchMock([])} />);
    fireEvent.submit(screen.getByTestId('audit-log-form'));

    expect(await screen.findByTestId('audit-log-empty')).toBeInTheDocument();
    expect(screen.queryAllByTestId('audit-log-row')).toHaveLength(0);
  });

  it('surfaces a non-2xx response as a visible error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    render(<AuditLogViewer fetchImpl={fetchMock} />);
    fireEvent.submit(screen.getByTestId('audit-log-form'));

    const err = await screen.findByTestId('audit-log-error');
    expect(err).toHaveTextContent(/403/);
    expect(screen.queryByTestId('audit-log-results')).not.toBeInTheDocument();
  });
});
