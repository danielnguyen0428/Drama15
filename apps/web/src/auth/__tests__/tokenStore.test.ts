/**
 * Unit tests for `src/auth/tokenStore.ts`.
 *
 * Covers:
 *   - Token reads/writes go to in-memory only; `localStorage.setItem`
 *     and `sessionStorage.setItem` are never invoked.
 *   - On a fresh module load (the page-reload analogue) `getAccessToken()`
 *     returns `undefined`.
 *   - `refreshAccessToken()` calls `/auth/refresh` with
 *     `credentials: 'include'`, never reads tokens from storage, and
 *     never sends a token in the request body.
 *
 * Validates: Requirements 13.6, 13.7, 13.8.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetTokenStoreForTests,
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../tokenStore';

/**
 * Replace `setItem` on both browser storages with spies so any rogue
 * write becomes an immediate test failure with a clear stack trace.
 *
 * jsdom provides real Storage instances; we shadow only `setItem` so
 * other test code (testing-library, jest-dom) keeps working.
 */
function spyStorageWrites(): { local: ReturnType<typeof vi.fn>; session: ReturnType<typeof vi.fn> } {
  const local = vi.fn();
  const session = vi.fn();
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(local);
  vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(session);
  return { local, session };
}

beforeEach(() => {
  __resetTokenStoreForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('in-memory access token slot', () => {
  it('returns undefined before any token has been set (page-reload behaviour)', () => {
    expect(getAccessToken()).toBeUndefined();
  });

  it('round-trips a token through set/get without touching web storage', () => {
    const writes = spyStorageWrites();

    setAccessToken('access.jwt.value');
    expect(getAccessToken()).toBe('access.jwt.value');

    expect(writes.local).not.toHaveBeenCalled();
    expect(writes.session).not.toHaveBeenCalled();
  });

  it('clearAccessToken() drops the held token without touching web storage', () => {
    const writes = spyStorageWrites();

    setAccessToken('access.jwt.value');
    clearAccessToken();

    expect(getAccessToken()).toBeUndefined();
    expect(writes.local).not.toHaveBeenCalled();
    expect(writes.session).not.toHaveBeenCalled();
  });

  it('does not persist tokens across a simulated page reload', async () => {
    setAccessToken('access.jwt.value');

    // Re-import the module to mimic a fresh page load. `vi.resetModules`
    // throws away the cached module; the dynamic import below evaluates
    // the source again from scratch.
    vi.resetModules();
    const fresh = await import('../tokenStore');

    expect(fresh.getAccessToken()).toBeUndefined();
  });
});

describe('refreshAccessToken', () => {
  it('calls the refresh endpoint with credentials: include and no body token', async () => {
    const writes = spyStorageWrites();

    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ accessToken: 'new.access.token', expiresIn: 900 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const token = await refreshAccessToken({ fetchImpl });

    expect(token).toBe('new.access.token');
    expect(getAccessToken()).toBe('new.access.token');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = vi.mocked(fetchImpl).mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe('/auth/refresh');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    // No Refresh_Token leaks via body (the cookie carries it).
    expect(init?.body).toBeUndefined();

    expect(writes.local).not.toHaveBeenCalled();
    expect(writes.session).not.toHaveBeenCalled();
  });

  it('does not read tokens from localStorage or sessionStorage', async () => {
    const localGet = vi.spyOn(window.localStorage, 'getItem');
    const sessionGet = vi.spyOn(window.sessionStorage, 'getItem');

    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ accessToken: 'fresh.token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await refreshAccessToken({ fetchImpl });

    expect(localGet).not.toHaveBeenCalled();
    expect(sessionGet).not.toHaveBeenCalled();
  });

  it('clears the in-memory token and rethrows when the server rejects the refresh', async () => {
    setAccessToken('stale.token');

    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { code: 'refresh_token_invalid' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(refreshAccessToken({ fetchImpl })).rejects.toThrow(/refresh_failed/);
    expect(getAccessToken()).toBeUndefined();
  });

  it('clears the in-memory token when the response body is malformed', async () => {
    setAccessToken('stale.token');

    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ unexpected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(refreshAccessToken({ fetchImpl })).rejects.toThrow(/refresh_failed/);
    expect(getAccessToken()).toBeUndefined();
  });

  it('honours a caller-supplied endpoint override', async () => {
    const fetchImpl: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ accessToken: 'x' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await refreshAccessToken({ fetchImpl, endpoint: '/api/auth/refresh' });

    const call = vi.mocked(fetchImpl).mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe('/api/auth/refresh');
  });
});
