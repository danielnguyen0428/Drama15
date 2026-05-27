import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { clearAccessToken, getAccessToken } from './tokenStore';

/**
 * Tests for the Admin_Console login form (Requirement 16.1).
 *
 * Coverage:
 *   - Form shell renders email + password + 6-digit TOTP fields.
 *   - Submit POSTs `{ email, password, totp }` to `/admin/auth/login`.
 *   - Successful 200 response stores the access token in memory and
 *     navigates to the dashboard.
 *   - `totp_invalid` and `totp_required` errors focus the TOTP field
 *     and surface an inline error message.
 */

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={<div data-testid="dashboard">dashboard</div>}
        />
      </Routes>
    </MemoryRouter>,
  );
}

function fillCredentials({
  email = 'admin@drama15.test',
  password = 's3cret-pass',
  totp = '123456',
}: { email?: string; password?: string; totp?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/password/i), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText(/totp code/i), {
    target: { value: totp },
  });
}

function submit() {
  fireEvent.submit(screen.getByRole('form', { name: /admin login form/i }));
}

describe('LoginPage', () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    clearAccessToken();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    clearAccessToken();
  });

  it('renders the admin console title and TOTP banner', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: /drama15 admin console/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('totp-banner')).toHaveTextContent(
      /requirement 16\.1/i,
    );
  });

  it('renders email, password, and 6-digit TOTP code fields', () => {
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();

    const totp = screen.getByLabelText(/totp code/i) as HTMLInputElement;
    expect(totp).toBeInTheDocument();
    expect(totp).toBeRequired();
    expect(totp).toHaveAttribute('inputmode', 'numeric');
    expect(totp).toHaveAttribute('autocomplete', 'one-time-code');
    expect(totp).toHaveAttribute('maxlength', '6');
    expect(totp).toHaveAttribute('minlength', '6');
    expect(totp).toHaveAttribute('pattern', '[0-9]{6}');
  });

  it('renders a submit button for the login form', () => {
    renderPage();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('POSTs { email, password, totp } to /admin/auth/login on submit', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'header.payload.signature' }),
    );

    renderPage();
    fillCredentials({
      email: 'admin@drama15.test',
      password: 's3cret-pass',
      totp: '123456',
    });
    submit();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      {
        method: string;
        headers: Record<string, string>;
        body: string;
        credentials?: string;
      },
    ];
    expect(url).toBe('/admin/auth/login');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      email: 'admin@drama15.test',
      password: 's3cret-pass',
      totp: '123456',
    });
  });

  it('stores the access token in memory and navigates to the dashboard on 200', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ accessToken: 'header.payload.signature' }),
    );

    renderPage();
    fillCredentials();
    submit();

    await waitFor(() =>
      expect(screen.getByTestId('dashboard')).toBeInTheDocument(),
    );
    expect(getAccessToken()).toBe('header.payload.signature');
  });

  it('focuses the TOTP field and shows an inline error on totp_invalid', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'totp_invalid', message: 'TOTP invalid.' } },
        { status: 401 },
      ),
    );

    renderPage();
    fillCredentials({ totp: '000000' });
    submit();

    const totp = screen.getByLabelText(/totp code/i) as HTMLInputElement;
    await waitFor(() => expect(totp).toHaveFocus());
    expect(totp).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('totp-error')).toHaveTextContent(
      /totp code is invalid/i,
    );
    expect(getAccessToken()).toBeNull();
  });

  it('focuses the TOTP field and shows an inline error on totp_required', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        { error: { code: 'totp_required', message: 'TOTP required.' } },
        { status: 401 },
      ),
    );

    renderPage();
    fillCredentials();
    submit();

    const totp = screen.getByLabelText(/totp code/i) as HTMLInputElement;
    await waitFor(() => expect(totp).toHaveFocus());
    expect(screen.getByTestId('totp-error')).toHaveTextContent(
      /enter the 6-digit totp code/i,
    );
  });
});
