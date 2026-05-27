import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { UserLookup, detectLookupKey } from '../UserLookup';

/**
 * Unit tests for the admin user-lookup form (Requirement 16.2).
 *
 * The component must auto-detect whether a given query is an email, a UUID,
 * or a fingerprint, and fan out to the matching `/admin/users/lookup`
 * variant. These tests exercise both the routing logic (via the exported
 * `detectLookupKey` helper) and the end-to-end UI behaviour by injecting
 * a stubbed `fetcher`.
 */

function jsonResponse(
  body: unknown,
  init: { ok?: boolean; status?: number } = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText(
    /email, id hoặc device fingerprint/i,
  ) as HTMLInputElement;
}

function submit(value: string) {
  const input = getInput();
  fireEvent.change(input, { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: /tìm kiếm/i }));
}

describe('detectLookupKey', () => {
  it('returns "email" for values containing @', () => {
    expect(detectLookupKey('admin@example.com')).toBe('email');
    expect(detectLookupKey('  user@host.tld ')).toBe('email');
  });

  it('returns "id" for canonical UUIDs (case-insensitive)', () => {
    expect(detectLookupKey('11111111-1111-4111-8111-111111111111')).toBe('id');
    expect(detectLookupKey('FFEEDDCC-BBAA-4998-8877-665544332211')).toBe('id');
  });

  it('returns "fingerprint" for free-form or malformed values', () => {
    expect(detectLookupKey('abcdef0123456789')).toBe('fingerprint');
    expect(detectLookupKey('device-xyz')).toBe('fingerprint');
    // UUID with wrong version digit must not be treated as id.
    expect(detectLookupKey('11111111-1111-9111-8111-111111111111')).toBe(
      'fingerprint',
    );
  });
});

describe('UserLookup', () => {
  it('renders the search input and Tìm kiếm button', () => {
    render(<UserLookup />);
    expect(getInput()).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /tìm kiếm/i }),
    ).toBeInTheDocument();
  });

  it('routes to ?email= when the query looks like an email', async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(
        jsonResponse({
          users: [
            {
              id: 'u-1',
              email: 'admin@example.com',
              plan: 'Paid_Plan',
              status: 'active',
            },
          ],
        }),
      );

    render(<UserLookup fetcher={fetcher} />);
    submit('admin@example.com');

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith(
      '/admin/users/lookup?email=admin%40example.com',
    );

    expect(screen.getByTestId('lookup-detected-key')).toHaveTextContent(
      'email',
    );
    expect(screen.getByTestId('lookup-user-id')).toHaveTextContent('u-1');
    expect(screen.getByTestId('lookup-user-email')).toHaveTextContent(
      'admin@example.com',
    );
    expect(screen.getByTestId('lookup-user-plan')).toHaveTextContent(
      'Paid_Plan',
    );
    expect(screen.getByTestId('lookup-user-status')).toHaveTextContent(
      'active',
    );
  });

  it('routes to ?id= when the query is a UUID and accepts the {user, plan} response shape', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(
        jsonResponse({
          // Single-record contract shape: { user, plan }.
          user: {
            id: uuid,
            email: 'someone@example.com',
            status: 'active',
          },
          plan: { plan: 'Free_Plan' },
        }),
      );

    render(<UserLookup fetcher={fetcher} />);
    submit(uuid);

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith(`/admin/users/lookup?id=${uuid}`);

    expect(screen.getByTestId('lookup-detected-key')).toHaveTextContent('id');
    expect(screen.getByTestId('lookup-user-plan')).toHaveTextContent(
      'Free_Plan',
    );
  });

  it('routes to ?fingerprint= for free-form values and url-encodes them', async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(
        jsonResponse({
          users: [
            {
              id: 'u-9',
              email: 'fp-owner@example.com',
              plan: 'Free_Plan',
              status: 'active',
            },
          ],
        }),
      );

    render(<UserLookup fetcher={fetcher} />);
    submit('device abc/xyz');

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith(
      '/admin/users/lookup?fingerprint=device%20abc%2Fxyz',
    );
    expect(screen.getByTestId('lookup-detected-key')).toHaveTextContent(
      'fingerprint',
    );
  });

  it('shows an empty-state message when the server returns no users', async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(jsonResponse({ users: [] }));

    render(<UserLookup fetcher={fetcher} />);
    submit('no-such-user');

    await waitFor(() =>
      expect(screen.getByTestId('lookup-empty')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('lookup-user-row')).toBeNull();
  });

  it('shows an error when the fetcher rejects', async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockRejectedValue(new Error('boom'));

    render(<UserLookup fetcher={fetcher} />);
    submit('admin@example.com');

    await waitFor(() =>
      expect(screen.getByTestId('lookup-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('lookup-error')).toHaveTextContent('boom');
  });

  it('shows an error when the server responds with a non-2xx status', async () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(jsonResponse({}, { ok: false, status: 403 }));

    render(<UserLookup fetcher={fetcher} />);
    submit('admin@example.com');

    await waitFor(() =>
      expect(screen.getByTestId('lookup-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('lookup-error')).toHaveTextContent('403');
  });

  it('refuses to submit an empty query', () => {
    const fetcher = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(jsonResponse({ users: [] }));

    render(<UserLookup fetcher={fetcher} />);
    fireEvent.click(screen.getByRole('button', { name: /tìm kiếm/i }));

    expect(fetcher).not.toHaveBeenCalled();
    expect(screen.getByTestId('lookup-error')).toHaveTextContent(
      /vui lòng nhập/i,
    );
  });
});
