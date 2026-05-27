/**
 * Property test for the CSP + Subresource Integrity validator.
 *
 * **Property 14: SRI và CSP**
 * **Validates: Requirements 13.2, 13.5**
 *
 * Requirement 13.2 (verbatim):
 *   "THE Web_Client SHALL áp dụng Subresource Integrity cho mọi tài
 *    nguyên JavaScript và CSS bên thứ ba được tải từ CDN."
 *
 * Requirement 13.5 (verbatim):
 *   "THE Web_Client SHALL áp dụng Content Security Policy chỉ cho phép
 *    script và style từ origin của chính Web_Client, origin của
 *    API_Gateway và domain của Google_Identity_Provider."
 *
 * Property under test
 * --------------------
 * For every randomly generated HTML document that contains:
 *
 *   - an optional `<meta http-equiv="Content-Security-Policy">` tag whose
 *     `script-src` directive is composed from a mix of safe and unsafe
 *     tokens (`'unsafe-inline'`, `'unsafe-eval'`, `*`);
 *   - a list of `<script src=...>` elements whose URLs are either
 *     relative or `https://`, with each cross-origin element either
 *     correctly carrying `integrity="sha{256,384,512}-..."` plus
 *     `crossorigin="anonymous"` or deliberately missing one or both;
 *   - a list of `<link rel="stylesheet" href=...>` elements with the
 *     same mix of safe and unsafe shapes;
 *
 * `validateCspAndSri(html)` must return `valid === true` if and only
 * if the synthesised document violates none of the rules above.
 * `valid === false` must come with a non-empty `violations` array, and
 * every reported violation must correspond to a real defect in the
 * synthesised input (no false positives).
 *
 * The generator deliberately mixes safe-by-construction assets with
 * adversarial tweaks (missing integrity, wrong algorithm, missing
 * crossorigin, forbidden CSP tokens) so fast-check shrinks toward
 * minimal counter-examples for any failing rule.
 *
 * Last assertion runs the validator on the real production
 * `apps/web/index.html` to guard against regressions in the shipped
 * page.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { validateCspAndSri } from '../cspValidator';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Lower-case ASCII label for hostnames (`abc`, `cdn-1`, ...). */
const arbHostLabel = fc.stringMatching(/^[a-z][a-z0-9-]{1,8}$/);

/** Realistic `https://host[/path]` URLs the page might pull. */
const arbHttpsUrl: fc.Arbitrary<string> = fc
  .tuple(
    fc.array(arbHostLabel, { minLength: 2, maxLength: 4 }),
    fc.array(fc.stringMatching(/^[a-z0-9_.-]{1,8}$/), { minLength: 0, maxLength: 3 }),
  )
  .map(([labels, segments]) => {
    const host = labels.join('.');
    const path = segments.length === 0 ? '' : `/${segments.join('/')}`;
    return `https://${host}${path}`;
  });

/** Relative URLs like `/src/main.tsx` (always same-origin → SRI not required). */
const arbRelativeUrl: fc.Arbitrary<string> = fc
  .array(fc.stringMatching(/^[a-z0-9_.-]{1,8}$/), { minLength: 1, maxLength: 3 })
  .map((segments) => `/${segments.join('/')}`);

/** Valid SRI hash. Base64 alphabet matches the `SRI_INTEGRITY_REGEX`. */
const arbValidIntegrity: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('sha256', 'sha384', 'sha512'),
    fc.stringMatching(/^[A-Za-z0-9+/]{20,40}={0,2}$/),
  )
  .map(([algo, b64]) => `${algo}-${b64}`);

/** Garbled integrity values that must be rejected. */
const arbBrokenIntegrity: fc.Arbitrary<string> = fc.constantFrom(
  '',
  'sha1-deadbeef',
  'md5-abcd',
  'sha256-',
  'not-a-hash',
);

interface AssetSpec {
  /** "https" → cross-origin (SRI required); "relative" → exempt. */
  readonly kind: 'script' | 'link';
  readonly url: string;
  readonly isCrossOrigin: boolean;
  readonly hasIntegrity: boolean;
  readonly integrity: string; // raw value; only meaningful when `hasIntegrity`
  readonly crossorigin: string | null;
}

/**
 * One asset = one `<script src>` or `<link rel="stylesheet" href>`.
 * The `kind` and `url` are independent of the SRI attributes so we can
 * enumerate combinations of "cross-origin × missing-integrity ×
 * missing-crossorigin" cleanly.
 */
const arbAsset: fc.Arbitrary<AssetSpec> = fc.record({
  kind: fc.constantFrom<'script' | 'link'>('script', 'link'),
  // 50/50 cross-origin vs same-origin.
  urlChoice: fc.boolean(),
  httpsUrl: arbHttpsUrl,
  relativeUrl: arbRelativeUrl,
  hasIntegrity: fc.boolean(),
  integrityChoice: fc.boolean(),
  validIntegrity: arbValidIntegrity,
  brokenIntegrity: arbBrokenIntegrity,
  crossoriginChoice: fc.constantFrom<'anonymous' | 'use-credentials' | 'absent'>(
    'anonymous',
    'use-credentials',
    'absent',
  ),
}).map((r): AssetSpec => {
  const isCrossOrigin = r.urlChoice;
  const url = isCrossOrigin ? r.httpsUrl : r.relativeUrl;
  const integrity = r.integrityChoice ? r.validIntegrity : r.brokenIntegrity;
  const crossorigin =
    r.crossoriginChoice === 'absent' ? null : r.crossoriginChoice;
  return {
    kind: r.kind,
    url,
    isCrossOrigin,
    hasIntegrity: r.hasIntegrity,
    integrity,
    crossorigin,
  };
});

interface CspSpec {
  /** Whether to emit the `<meta http-equiv="Content-Security-Policy">`. */
  readonly emitMeta: boolean;
  /** Tokens for `script-src`, joined with single spaces. */
  readonly scriptSrcTokens: readonly string[];
}

const arbCspSpec: fc.Arbitrary<CspSpec> = fc.record({
  emitMeta: fc.boolean(),
  scriptSrcTokens: fc.array(
    fc.oneof(
      fc.constantFrom("'self'", 'https://accounts.google.com', 'https://api.example.com'),
      // Forbidden tokens — must trigger a violation when present.
      fc.constantFrom("'unsafe-inline'", "'unsafe-eval'", '*'),
    ),
    { minLength: 1, maxLength: 5 },
  ),
});

interface DocumentSpec {
  readonly csp: CspSpec;
  readonly assets: readonly AssetSpec[];
}

const arbDocumentSpec: fc.Arbitrary<DocumentSpec> = fc.record({
  csp: arbCspSpec,
  assets: fc.array(arbAsset, { minLength: 0, maxLength: 6 }),
});

// ---------------------------------------------------------------------------
// HTML rendering and oracle
// ---------------------------------------------------------------------------

/** Escape attribute values so the synthetic HTML stays well-formed. */
function attrValue(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function renderAsset(a: AssetSpec): string {
  const attrs: string[] = [];
  if (a.kind === 'script') {
    attrs.push(`src="${attrValue(a.url)}"`);
  } else {
    attrs.push('rel="stylesheet"');
    attrs.push(`href="${attrValue(a.url)}"`);
  }
  if (a.hasIntegrity) attrs.push(`integrity="${attrValue(a.integrity)}"`);
  if (a.crossorigin !== null)
    attrs.push(`crossorigin="${attrValue(a.crossorigin)}"`);
  return a.kind === 'script'
    ? `<script ${attrs.join(' ')}></script>`
    : `<link ${attrs.join(' ')} />`;
}

function renderDocument(spec: DocumentSpec): string {
  const cspContent = `default-src 'self'; script-src ${spec.csp.scriptSrcTokens.join(' ')}`;
  const meta = spec.csp.emitMeta
    ? `<meta http-equiv="Content-Security-Policy" content="${attrValue(cspContent)}" />`
    : '';
  const head = `<head><meta charset="UTF-8" />${meta}${spec.assets
    .filter((a) => a.kind === 'link')
    .map(renderAsset)
    .join('')}</head>`;
  const body = `<body>${spec.assets
    .filter((a) => a.kind === 'script')
    .map(renderAsset)
    .join('')}</body>`;
  return `<!doctype html><html lang="en">${head}${body}</html>`;
}

const SRI_RE = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/;
const FORBIDDEN_TOKENS = new Set(["'unsafe-inline'", "'unsafe-eval'", '*']);

/** Independent reference oracle that mirrors the rules in cspValidator.ts. */
function expectedValid(spec: DocumentSpec): boolean {
  if (!spec.csp.emitMeta) return false;
  for (const t of spec.csp.scriptSrcTokens) {
    if (FORBIDDEN_TOKENS.has(t)) return false;
  }
  for (const a of spec.assets) {
    if (!a.isCrossOrigin) continue;
    if (!a.hasIntegrity || !SRI_RE.test(a.integrity)) return false;
    if (a.crossorigin !== 'anonymous') return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('validateCspAndSri (Property 14: SRI và CSP)', () => {
  it('agrees with the reference oracle on randomly generated HTML', () => {
    fc.assert(
      fc.property(arbDocumentSpec, (spec) => {
        const html = renderDocument(spec);
        const result = validateCspAndSri(html);
        const expected = expectedValid(spec);
        // Equivalence with the oracle: same `valid` outcome.
        expect(result.valid).toBe(expected);
        // Sanity: a `valid === false` result must list at least one violation;
        // a `valid === true` result must list none.
        if (expected) {
          expect(result.violations).toEqual([]);
        } else {
          expect(result.violations.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('flags every CSP `unsafe-*` / `*` token in script-src', () => {
    fc.assert(
      fc.property(
        fc.constantFrom("'unsafe-inline'", "'unsafe-eval'", '*'),
        (badToken) => {
          const html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' ${badToken}" /></head><body></body></html>`;
          const result = validateCspAndSri(html);
          expect(result.valid).toBe(false);
          expect(result.violations).toContain(`csp:script-src-allows:${badToken}`);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('accepts the real production index.html (Requirements 13.2, 13.5)', () => {
    const indexPath = resolve(__dirname, '..', '..', '..', 'index.html');
    const html = readFileSync(indexPath, 'utf8');
    const result = validateCspAndSri(html);
    expect(result.violations).toEqual([]);
    expect(result.valid).toBe(true);
  });
});
