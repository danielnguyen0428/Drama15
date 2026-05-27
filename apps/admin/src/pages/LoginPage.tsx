import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { setAccessToken } from './tokenStore';

/**
 * Admin login form for the Admin_Console SPA.
 *
 * Requirement 16.1: admin access requires a valid current TOTP code in
 * addition to standard credentials. This form collects email, password,
 * and a 6-digit TOTP code and POSTs them to `/admin/auth/login`.
 *
 * Behaviour:
 *   - On HTTP 200 the access token returned in the response body is stored
 *     in memory (see `tokenStore.ts`; Requirement 13.8 forbids persistent
 *     storage of access tokens) and the user is navigated to the dashboard.
 *   - On `totp_required` or `totp_invalid` the TOTP field is focused and
 *     an inline error is shown, so the admin can immediately re-enter the
 *     code. Other server-side errors surface as a generic inline message.
 *   - We never log credentials or TOTP codes to the console.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const totpInputRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorCode(null);
    setSubmitting(true);
    try {
      const response = await fetch('/admin/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, totp: totpCode }),
      });

      if (response.ok) {
        const payload = (await response.json()) as { accessToken?: string };
        setAccessToken(payload.accessToken ?? null);
        navigate('/dashboard', { replace: true });
        return;
      }

      // Try to extract a typed error code from the gateway's canonical
      // `{ error: { code, message } }` envelope. We fall back to a
      // generic code if the body is not JSON or is shaped differently.
      let code = 'login_failed';
      try {
        const body = (await response.json()) as
          | { error?: { code?: string } }
          | undefined;
        if (body?.error?.code) {
          code = body.error.code;
        }
      } catch {
        // Non-JSON body — keep the generic code.
      }

      setErrorCode(code);
      if (code === 'totp_required' || code === 'totp_invalid') {
        totpInputRef.current?.focus();
      }
    } catch {
      // Network failure — surface a generic error and keep the form
      // open so the admin can retry. We deliberately do not echo the
      // underlying error message to avoid leaking infrastructure detail.
      setErrorCode('network_error');
    } finally {
      setSubmitting(false);
    }
  }

  const totpErrorMessage =
    errorCode === 'totp_required'
      ? 'Enter the 6-digit TOTP code from your authenticator app.'
      : errorCode === 'totp_invalid'
        ? 'That TOTP code is invalid or expired. Try again with a fresh code.'
        : null;

  const genericErrorMessage =
    errorCode && errorCode !== 'totp_required' && errorCode !== 'totp_invalid'
      ? errorCode === 'admin_required'
        ? 'This account is not authorised for the Admin Console.'
        : errorCode === 'totp_not_enrolled'
          ? 'This admin account has not enrolled a TOTP secret yet.'
          : errorCode === 'network_error'
            ? 'Could not reach the server. Check your connection and try again.'
            : 'Sign-in failed. Check your credentials and try again.'
      : null;

  return (
    <main aria-labelledby="admin-login-title">
      <h1 id="admin-login-title">Drama15 Admin Console</h1>
      <p role="note" data-testid="totp-banner">
        Admin access requires a valid TOTP code (Requirement 16.1).
      </p>
      <form onSubmit={handleSubmit} aria-label="Admin login form" noValidate>
        <div>
          <label htmlFor="admin-email">Email</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="admin-totp">TOTP code</label>
          <input
            id="admin-totp"
            name="totp"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            minLength={6}
            required
            ref={totpInputRef}
            aria-invalid={
              errorCode === 'totp_required' || errorCode === 'totp_invalid'
                ? 'true'
                : 'false'
            }
            aria-describedby={totpErrorMessage ? 'admin-totp-error' : undefined}
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
          />
          {totpErrorMessage ? (
            <p
              id="admin-totp-error"
              role="alert"
              data-testid="totp-error"
            >
              {totpErrorMessage}
            </p>
          ) : null}
        </div>
        {genericErrorMessage ? (
          <p role="alert" data-testid="login-error">
            {genericErrorMessage}
          </p>
        ) : null}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
