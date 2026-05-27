import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  API_GATEWAY_ORIGIN_PLACEHOLDER,
  GOOGLE_FONTS_ORIGIN,
  GOOGLE_IDP_ORIGIN,
  buildCsp,
  cspDirectives,
  cspMeta,
} from '../cspMeta';

/**
 * Validates: Requirements 13.2, 13.5
 *
 * - Req 13.5: CSP only allows script and style from `'self'`,
 *   API_Gateway origin, and Google_Identity_Provider domain.
 * - Req 13.2: Every cross-origin `<script>` and `<link rel="stylesheet">`
 *   that ships in `index.html` must carry an `integrity` (sha256/384/512)
 *   attribute plus `crossorigin="anonymous"`.
 */

const indexHtmlPath = resolve(__dirname, '..', '..', '..', 'index.html');
const indexHtml = readFileSync(indexHtmlPath, 'utf8');

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

interface CspMetaTag {
  readonly raw: string;
  readonly directives: ReadonlyMap<string, readonly string[]>;
}

function extractCspMeta(html: string): CspMetaTag | null {
  const doc = parseHtml(html);
  const meta = doc.querySelector('meta[http-equiv="Content-Security-Policy"]');
  if (!meta) return null;
  const content = meta.getAttribute('content');
  if (content === null) return null;

  const directives = new Map<string, string[]>();
  for (const part of content.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const tokens = trimmed.split(/\s+/);
    const name = tokens.shift();
    if (!name) continue;
    directives.set(name.toLowerCase(), tokens);
  }
  return { raw: content, directives };
}

interface AssetTag {
  readonly element: Element;
  readonly url: string;
}

function extractScriptsWithSrc(html: string): AssetTag[] {
  const doc = parseHtml(html);
  const out: AssetTag[] = [];
  for (const el of Array.from(doc.querySelectorAll('script[src]'))) {
    const url = el.getAttribute('src');
    if (url) out.push({ element: el, url });
  }
  return out;
}

function extractStylesheetLinks(html: string): AssetTag[] {
  const doc = parseHtml(html);
  const out: AssetTag[] = [];
  for (const el of Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))) {
    const url = el.getAttribute('href');
    if (url) out.push({ element: el, url });
  }
  return out;
}

describe('CSP meta tag in index.html (Requirement 13.5)', () => {
  const csp = extractCspMeta(indexHtml);

  it('declares a Content-Security-Policy meta tag', () => {
    expect(csp).not.toBeNull();
  });

  it('sets default-src to self', () => {
    expect(csp?.directives.get('default-src')).toEqual(["'self'"]);
  });

  it('restricts script-src to self, API_Gateway origin, and Google IDP', () => {
    const scriptSrc = csp?.directives.get('script-src') ?? [];
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain(API_GATEWAY_ORIGIN_PLACEHOLDER);
    expect(scriptSrc).toContain(GOOGLE_IDP_ORIGIN);
    // Allow-list only (Req 13.5).
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain('*');
  });

  it('restricts style-src to self and the Google Fonts stylesheet origin', () => {
    const styleSrc = csp?.directives.get('style-src') ?? [];
    expect(styleSrc).toContain("'self'");
    expect(styleSrc).toContain(GOOGLE_FONTS_ORIGIN);
    expect(styleSrc).not.toContain('*');
  });

  it('restricts connect-src to self and API_Gateway origin', () => {
    const connectSrc = csp?.directives.get('connect-src') ?? [];
    expect(connectSrc).toContain("'self'");
    expect(connectSrc).toContain(API_GATEWAY_ORIGIN_PLACEHOLDER);
    expect(connectSrc).not.toContain('*');
  });

  it("declares frame-ancestors 'none' to forbid framing", () => {
    expect(csp?.directives.get('frame-ancestors')).toEqual(["'none'"]);
  });

  it("declares object-src 'none' to disable plugin content", () => {
    expect(csp?.directives.get('object-src')).toEqual(["'none'"]);
  });

  it('matches the CSP string built from cspMeta module', () => {
    // The build pipeline reads `cspMeta` for the HTTP header. The meta
    // tag content must stay in sync with that module so both layers agree.
    expect(csp?.raw).toBe(cspMeta);
    expect(cspMeta).toBe(buildCsp(cspDirectives));
  });
});

describe('Subresource Integrity on cross-origin assets (Requirement 13.2)', () => {
  const integrityRe = /^sha(256|384|512)-[A-Za-z0-9+/=]+$/;

  it('every <script src="https://..."> declares integrity and crossorigin', () => {
    const scripts = extractScriptsWithSrc(indexHtml).filter((s) =>
      s.url.startsWith('https://'),
    );
    for (const s of scripts) {
      const integrity = s.element.getAttribute('integrity');
      const crossorigin = s.element.getAttribute('crossorigin');
      expect(
        integrity,
        `cross-origin <script src="${s.url}"> is missing integrity`,
      ).not.toBeNull();
      expect(
        integrity !== null && integrityRe.test(integrity),
        `integrity "${integrity ?? ''}" must be sha256/384/512`,
      ).toBe(true);
      expect(crossorigin).toBe('anonymous');
    }
  });

  it('every <link rel="stylesheet" href="https://..."> declares integrity and crossorigin', () => {
    const links = extractStylesheetLinks(indexHtml).filter((l) =>
      l.url.startsWith('https://'),
    );
    for (const l of links) {
      const integrity = l.element.getAttribute('integrity');
      const crossorigin = l.element.getAttribute('crossorigin');
      expect(
        integrity,
        `cross-origin <link href="${l.url}"> is missing integrity`,
      ).not.toBeNull();
      expect(
        integrity !== null && integrityRe.test(integrity),
        `integrity "${integrity ?? ''}" must be sha256/384/512`,
      ).toBe(true);
      expect(crossorigin).toBe('anonymous');
    }
  });
});
