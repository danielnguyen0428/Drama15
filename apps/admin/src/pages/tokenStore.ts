/**
 * In-memory access-token store for the Admin_Console SPA.
 *
 * Requirement 13.8 (and the design's Web_Client section) mandates that the
 * Access_Token must live in JavaScript memory only — never in localStorage,
 * sessionStorage, or a non-HttpOnly cookie — so XSS cannot exfiltrate it.
 * The Refresh_Token is delivered out-of-band by the gateway as an HttpOnly
 * Secure SameSite=Strict cookie and is therefore not held here.
 *
 * The store is a tiny module-level variable rather than a React context
 * because the token is read by network code that may live outside the
 * React tree (e.g. fetch wrappers). Tests reset the store with
 * `clearAccessToken()` between cases.
 */

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}
