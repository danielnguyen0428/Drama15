/**
 * Client-side PKCE (RFC 7636) primitives for the Google OAuth
 * Authorization Code flow used by the Drama15 Web_Client SPA.
 *
 * All randomness comes from the Web Crypto API
 * (`crypto.getRandomValues`); SHA-256 hashing comes from
 * `crypto.subtle.digest`. We deliberately avoid third-party deps:
 * RFC 7636 is small enough that a focused, audited implementation
 * is preferable to an extra supply-chain hop on a security path.
 *
 * Validates: Requirements 1.2 (PKCE), 13.6 / 13.7 / 13.8 (no token
 * persistence — see also `tokenStore.ts`).
 */

/**
 * Length of the random `code_verifier` in bytes before base64url
 * encoding. 32 bytes encodes to exactly 43 base64url characters,
 * which is the minimum permitted by RFC 7636 §4.1 and gives 256 bits
 * of entropy (well above the 32 bytes the spec recommends).
 */
const VERIFIER_BYTES = 32;

/**
 * Length of the random `state` and `nonce` values in bytes. 32 bytes →
 * 43 base64url characters → 256 bits of entropy. Comfortably above
 * the 16-byte (128-bit) entropy floor required by the design doc.
 */
const PUBLIC_TOKEN_BYTES = 32;

/**
 * Encode a byte buffer as base64url (RFC 4648 §5) without padding.
 * Browsers don't ship a native helper, but `btoa` plus the standard
 * three-character substitution gets us there.
 */
function base64UrlEncode(bytes: Uint8Array): string {
  // String.fromCharCode is faster than a loop building an array,
  // and the chunked approach avoids `Maximum call stack exceeded`
  // on large buffers (not strictly needed at 32 bytes, but cheap
  // insurance if a future caller passes something larger).
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Pull `length` cryptographically random bytes from the platform CSPRNG.
 *
 * Throws synchronously if the runtime does not expose Web Crypto;
 * we'd rather fail loudly than silently fall back to `Math.random`,
 * which is unsafe for OAuth secrets.
 */
function randomBytes(length: number): Uint8Array {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') {
    throw new Error('Web Crypto API is not available in this environment');
  }
  const buf = new Uint8Array(length);
  c.getRandomValues(buf);
  return buf;
}

/**
 * Generate a fresh PKCE `code_verifier`.
 *
 * The verifier is 43 characters long, drawn from the RFC 7636
 * unreserved set `[A-Za-z0-9-._~]`. Because base64url emits only
 * `[A-Za-z0-9-_]` (a strict subset), the result always satisfies the
 * spec's character constraint.
 */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(VERIFIER_BYTES));
}

/**
 * Compute the PKCE S256 `code_challenge` for `verifier`.
 *
 * Per RFC 7636 §4.2:
 *   `code_challenge = BASE64URL(SHA256(ASCII(verifier)))`.
 *
 * `TextEncoder` emits UTF-8, which coincides with ASCII for the
 * unreserved character set the verifier is drawn from.
 */
export async function codeChallengeFromVerifier(verifier: string): Promise<string> {
  const c = globalThis.crypto;
  if (!c || !c.subtle || typeof c.subtle.digest !== 'function') {
    throw new Error('Web Crypto subtle API is not available in this environment');
  }
  const data = new TextEncoder().encode(verifier);
  const digest = await c.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a fresh OAuth `state` value (CSRF token).
 *
 * The Web_Client stores this verifier-side and the API_Gateway
 * compares the value echoed back on the callback URL. 256 bits of
 * entropy makes guessing infeasible.
 */
export function generateState(): string {
  return base64UrlEncode(randomBytes(PUBLIC_TOKEN_BYTES));
}

/**
 * Generate a fresh OpenID Connect `nonce`.
 *
 * The Web_Client includes this in the authorize URL; Auth_Service
 * later asserts the ID token's `nonce` claim equals this value
 * (Requirement 1.3). 256 bits of entropy keeps the value
 * unpredictable.
 */
export function generateNonce(): string {
  return base64UrlEncode(randomBytes(PUBLIC_TOKEN_BYTES));
}
