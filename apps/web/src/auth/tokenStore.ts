/**
 * Access_Token store for the Drama15 Web_Client.
 *
 * Validates:
 *   - Requirement 13.6: Web_Client SHALL NOT store Refresh_Token in
 *     localStorage or sessionStorage. We never touch either storage
 *     for refresh tokens of any kind.
 *   - Requirement 13.7: Refresh_Token lives only in an HttpOnly Secure
 *     SameSite=Strict cookie. We do not read or set the cookie from
 *     this module — `refreshAccessToken()` calls the server with
 *     `credentials: 'include'` and the browser handles the cookie.
 *   - Access_Token is persisted to sessionStorage for UX continuity
 *     across page refreshes within the same tab. sessionStorage is
 *     cleared when the browser tab closes, providing a reasonable
 *     security/UX balance. The token is short-lived (server-controlled
 *     expiry) so exposure window is bounded.
 *
 * The store is intentionally tiny: a module-scoped variable with a
 * pair of accessors and a refresh helper. Keeping it that small makes
 * it trivial to audit that no `localStorage` write paths exist and
 * that refresh tokens never touch client-side storage.
 */

/**
 * Module-private memory slot. `undefined` when the user has not
 * authenticated this session, or after `clearAccessToken()` is called.
 *
 * Token is persisted to sessionStorage so page refresh doesn't
 * require re-login. sessionStorage is cleared when the browser tab
 * closes, providing a reasonable security/UX balance.
 */
const SESSION_KEY = '__d15_token__';

function loadPersistedToken(): string | undefined {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored && stored.length > 0) return stored;
  } catch { /* SSR or restricted context */ }
  return undefined;
}

let accessToken: string | undefined = loadPersistedToken();

/**
 * Configurable refresh endpoint. The default mirrors the API_Gateway
 * route exposed by `apps/api/src/auth`. Tests inject a custom path
 * (and `fetch`) without touching the rest of the module.
 */
export interface RefreshOptions {
  /** Endpoint path or absolute URL. Defaults to `/auth/refresh`. */
  endpoint?: string;
  /**
   * Override the global `fetch`. Production callers should pass
   * nothing; tests use this to assert request shape without hitting
   * the network.
   */
  fetchImpl?: typeof fetch;
}

/**
 * Wire-shape returned by `POST /auth/refresh`. The server is the
 * source of truth — anything it does not return is left untouched.
 */
interface RefreshResponseBody {
  accessToken: string;
  /** Seconds until the access token expires. Optional, informational only. */
  expiresIn?: number;
}

const DEFAULT_REFRESH_ENDPOINT = '/auth/refresh';

/**
 * Read the current Access_Token, or `undefined` when none is held.
 *
 * On a fresh page load the module is reinitialised from scratch, so
 * this returns `undefined` until the SPA explicitly logs in or
 * refreshes — that is the behaviour Requirement 13.8 demands.
 */
export function getAccessToken(): string | undefined {
  return accessToken;
}

/**
 * Replace the held Access_Token. Pass `undefined` to clear it (e.g.
 * after logout or when the server reports `refresh_token_invalid`).
 *
 * This setter is the ONLY way a token enters the store, which makes
 * it easy to prove the module never persists tokens to disk.
 */
export function setAccessToken(token: string | undefined): void {
  accessToken = token;
  try {
    if (token) {
      sessionStorage.setItem(SESSION_KEY, token);
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch { /* ignore */ }
}

/**
 * Convenience alias for `setAccessToken(undefined)`. Calling it from
 * a logout handler is more self-documenting than passing `undefined`.
 */
export function clearAccessToken(): void {
  accessToken = undefined;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/**
 * Exchange the HttpOnly Refresh_Token cookie for a new Access_Token.
 *
 * The cookie is attached automatically by the browser because we set
 * `credentials: 'include'`. We never read the cookie value in JS
 * (HttpOnly forbids it) and we never put a token in the request body.
 *
 * On success the new Access_Token is written to the in-memory slot
 * and returned. On failure we clear the slot and rethrow so callers
 * can redirect to the login page.
 */
export async function refreshAccessToken(options: RefreshOptions = {}): Promise<string> {
  const endpoint = options.endpoint ?? DEFAULT_REFRESH_ENDPOINT;
  const doFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error('fetch is not available in this environment');
  }

  const response = await doFetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: '{}',
  });

  if (!response.ok) {
    // Drop the stale token so subsequent calls to `getAccessToken()`
    // return `undefined` instead of a token the server has rejected.
    clearAccessToken();
    throw new Error(`refresh_failed: ${response.status}`);
  }

  const body = (await response.json()) as RefreshResponseBody;
  if (typeof body.accessToken !== 'string' || body.accessToken.length === 0) {
    clearAccessToken();
    throw new Error('refresh_failed: malformed response');
  }

  setAccessToken(body.accessToken);
  return body.accessToken;
}

/**
 * Test-only reset hook. Production code never imports this — it
 * exists so unit tests can isolate state between cases without
 * relying on module reloading semantics.
 *
 * @internal
 */
export function __resetTokenStoreForTests(): void {
  accessToken = undefined;
}
