/**
 * CSP + Subresource Integrity validator for served HTML documents.
 *
 * Validates: Requirements 13.2, 13.5
 *
 *  - Req 13.2: Every cross-origin `<script>` and `<link rel="stylesheet">`
 *    that ships in the page MUST carry both an `integrity` attribute
 *    using `sha256` / `sha384` / `sha512` AND `crossorigin="anonymous"`
 *    so the browser performs the SRI check.
 *  - Req 13.5: The Content-Security-Policy MUST allow scripts and styles
 *    only from the Web_Client origin, the API_Gateway origin, and the
 *    Google_Identity_Provider domain. As a minimum machine-checkable
 *    invariant, `script-src` MUST NOT contain `'unsafe-inline'`,
 *    `'unsafe-eval'`, or the wildcard `*` token.
 *
 * The helper is deliberately small and dependency-free (it relies on
 * the host environment's `DOMParser`, which jsdom and every modern
 * browser provide) so that it can run inside both unit tests and
 * deploy-time smoke checks.
 */

/**
 * Allowed Subresource Integrity algorithms per SRI spec
 * (https://www.w3.org/TR/SRI/). The regex enforces a non-empty base64
 * payload using the standard alphabet plus `+`, `/`, and `=` padding.
 */
export const SRI_INTEGRITY_REGEX = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/;

/** Tokens that are forbidden in a `script-src` directive (Req 13.5). */
export const FORBIDDEN_SCRIPT_SRC_TOKENS = new Set<string>([
  "'unsafe-inline'",
  "'unsafe-eval'",
  '*',
]);

export interface CspValidationResult {
  /** True iff every rule below holds for the supplied HTML document. */
  readonly valid: boolean;
  /**
   * Stable, machine-readable list of every rule that was violated. The
   * list is empty when `valid === true`. Each entry is prefixed with a
   * namespace (`csp:` or `sri:`) so callers can group results.
   */
  readonly violations: string[];
}

/**
 * Parse a single Content-Security-Policy `content` string into a map
 * of `directive-name` → `tokens[]`. Directive names are normalised to
 * lower-case to match the CSP spec, which is case-insensitive.
 */
function parseCspContent(content: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const part of content.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const name = tokens.shift();
    if (!name) continue;
    out.set(name.toLowerCase(), tokens);
  }
  return out;
}

/**
 * Parse `html` with the host `DOMParser`. We re-throw with a clearer
 * message when the host is missing it (e.g. a Node script without
 * `jsdom`) so the failure mode is obvious.
 */
function parseHtmlDocument(html: string): Document {
  const Parser =
    typeof DOMParser !== 'undefined'
      ? DOMParser
      : (globalThis as unknown as { DOMParser?: typeof DOMParser }).DOMParser;
  if (!Parser) {
    throw new Error(
      'validateCspAndSri requires a DOMParser implementation (browser or jsdom)',
    );
  }
  return new Parser().parseFromString(html, 'text/html');
}

/**
 * Validate a served HTML document against the CSP and SRI rules of
 * Requirements 13.2 and 13.5. The function never throws on
 * spec-violating input — every problem is reported in `violations`.
 *
 * Rules enforced (any single failure ⇒ `valid === false`):
 *
 *   1. The document MUST contain a
 *      `<meta http-equiv="Content-Security-Policy" content="...">`.
 *   2. The CSP `script-src` directive MUST NOT contain `'unsafe-inline'`,
 *      `'unsafe-eval'`, or `*`. When `script-src` is absent we fall
 *      back to `default-src`, mirroring browser behaviour.
 *   3. Every `<script src="https://...">` MUST carry an `integrity`
 *      matching `sha256|sha384|sha512` AND `crossorigin="anonymous"`.
 *   4. Every `<link rel="stylesheet" href="https://...">` MUST carry
 *      the same pair of attributes.
 *
 * URLs that are relative (`/foo`, `./foo`), data URIs, or use a scheme
 * other than `https://` are not considered cross-origin for the
 * purposes of this check and are skipped.
 */
export function validateCspAndSri(html: string): CspValidationResult {
  const violations: string[] = [];
  const doc = parseHtmlDocument(html);

  // ---- Rule 1 + 2: CSP meta tag and script-src token allowlist -----------
  const cspMeta = doc.querySelector(
    'meta[http-equiv="Content-Security-Policy" i]',
  );
  if (!cspMeta) {
    violations.push('csp:missing-meta-tag');
  } else {
    const content = cspMeta.getAttribute('content') ?? '';
    const directives = parseCspContent(content);
    const scriptSrc = directives.get('script-src') ?? directives.get('default-src') ?? [];
    for (const token of scriptSrc) {
      if (FORBIDDEN_SCRIPT_SRC_TOKENS.has(token)) {
        violations.push(`csp:script-src-allows:${token}`);
      }
    }
  }

  // ---- Rule 3: <script src="https://..."> must have SRI + crossorigin ----
  for (const el of Array.from(doc.querySelectorAll('script[src]'))) {
    const url = el.getAttribute('src') ?? '';
    if (!url.startsWith('https://')) continue;
    const integrity = el.getAttribute('integrity');
    const crossorigin = el.getAttribute('crossorigin');
    if (integrity === null || !SRI_INTEGRITY_REGEX.test(integrity)) {
      violations.push(`sri:script-missing-integrity:${url}`);
    }
    if (crossorigin !== 'anonymous') {
      violations.push(`sri:script-missing-crossorigin:${url}`);
    }
  }

  // ---- Rule 4: <link rel="stylesheet" href="https://..."> must have SRI -
  for (const el of Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))) {
    const url = el.getAttribute('href') ?? '';
    if (!url.startsWith('https://')) continue;
    const integrity = el.getAttribute('integrity');
    const crossorigin = el.getAttribute('crossorigin');
    if (integrity === null || !SRI_INTEGRITY_REGEX.test(integrity)) {
      violations.push(`sri:link-missing-integrity:${url}`);
    }
    if (crossorigin !== 'anonymous') {
      violations.push(`sri:link-missing-crossorigin:${url}`);
    }
  }

  return { valid: violations.length === 0, violations };
}
