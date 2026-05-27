/**
 * `clientIntegrityHeader` — Web_Client side helper that exposes the
 * build-artifact hash and attaches it as the `X-Client-Integrity`
 * header on every API call.
 *
 * Validates: Requirements 13.3
 *
 *   13.3  THE Web_Client SHALL gửi một header `X-Client-Integrity`
 *         chứa giá trị băm của bản build hiện tại và API_Gateway
 *         phải xác minh giá trị băm này nằm trong danh sách bản
 *         build hợp lệ.
 *
 * Build-time wiring:
 *   - The CI build computes `sha256(buildArtifact)` of the emitted
 *     SPA bundle and writes it to the env var `VITE_BUILD_HASH`.
 *   - Vite inlines `import.meta.env.VITE_BUILD_HASH` into the bundle
 *     at build time so the running client cannot tamper with it
 *     post-load (the obfuscator pass in `vite.config.ts` then
 *     scrambles the surrounding code).
 *   - The same hash is added to the API_Gateway's build-hash
 *     allowlist so that 13.4 rejection only fires for stale or
 *     unknown clients.
 *
 * Test/dev fallback:
 *   - When `VITE_BUILD_HASH` is unset (e.g. running `vitest`,
 *     `vite dev`, or pre-deploy smoke tests), we fall back to the
 *     literal string `'dev-build-hash'`. Backend allowlists for
 *     non-production environments include this value so the
 *     fallback never accidentally bypasses production gates.
 *   - Tests import {@link CLIENT_INTEGRITY} freely; nothing in this
 *     module reads from the network or `crypto`.
 */

export const CLIENT_INTEGRITY_HEADER = 'X-Client-Integrity';

/** Fallback used when `VITE_BUILD_HASH` is not injected (tests, dev). */
export const CLIENT_INTEGRITY_FALLBACK = 'dev-build-hash';

/**
 * Read `VITE_BUILD_HASH` from `import.meta.env` if available,
 * otherwise return the documented test/dev fallback. The lookup is
 * wrapped so that environments without `import.meta.env` (e.g. some
 * Node-only tooling paths) do not crash at module load.
 */
function resolveBuildHash(): string {
  // `import.meta.env` is provided by Vite. In the vitest environment
  // it is also defined (vitest reuses Vite's transform pipeline).
  // We still guard defensively because non-Vite consumers might
  // import the helper.
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> })
      .env;
    const fromEnv = env?.['VITE_BUILD_HASH'];
    if (typeof fromEnv === 'string' && fromEnv.length > 0) {
      return fromEnv;
    }
  } catch {
    /* fall through to fallback */
  }
  return CLIENT_INTEGRITY_FALLBACK;
}

/**
 * The build-artifact hash injected at build time, or the documented
 * fallback when running outside a Vite build. Reading is done once
 * at module load so every request observes the same value (the build
 * hash cannot change at runtime).
 */
export const CLIENT_INTEGRITY: string = resolveBuildHash();

/**
 * Headers shape accepted by {@link withClientIntegrity}. Mirrors
 * the union accepted by `fetch()` so callers can pass either the
 * native `Headers` instance or a plain object literal.
 */
export type HeadersInputObject = Record<string, string>;
export type HeadersInput = Headers | HeadersInputObject | undefined;

/**
 * Attach `X-Client-Integrity: <CLIENT_INTEGRITY>` to a headers value.
 *
 * - When `headers` is a `Headers` instance, returns the same instance
 *   with the header set (mutating in place is the idiomatic
 *   contract for `Headers`; the fetch wrapper relies on this).
 * - When `headers` is a plain object or `undefined`, returns a new
 *   plain-object copy with the header added.
 *
 * If a caller supplied their own `X-Client-Integrity` value, we
 * overwrite it: the build hash is server-validated and a tampered
 * value would just produce a `client_integrity_failed` rejection
 * anyway (Requirement 13.4).
 */
export function withClientIntegrity(headers: Headers): Headers;
export function withClientIntegrity(
  headers?: HeadersInputObject,
): HeadersInputObject;
export function withClientIntegrity(
  headers?: HeadersInput,
): Headers | HeadersInputObject {
  if (headers instanceof Headers) {
    headers.set(CLIENT_INTEGRITY_HEADER, CLIENT_INTEGRITY);
    return headers;
  }
  const out: HeadersInputObject = { ...(headers ?? {}) };
  out[CLIENT_INTEGRITY_HEADER] = CLIENT_INTEGRITY;
  return out;
}
