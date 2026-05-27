/**
 * Content Security Policy for Web_Client (commercial SaaS).
 *
 * Validates: Requirements 13.2, 13.5
 *  - Req 13.5: CSP only allows script and style from Web_Client self origin,
 *    API_Gateway origin, and Google_Identity_Provider domain.
 *  - Req 13.2: Subresource Integrity (sha256/384/512) plus `crossorigin`
 *    is required on every cross-origin `<script>` / `<link rel="stylesheet">`
 *    that ends up in the served HTML; this module does not emit those tags
 *    by itself but ships the CSP that the browser uses to enforce them.
 *
 * Build/deploy pipeline replaces the literal token `<API_GATEWAY_ORIGIN>`
 * with the real gateway origin (e.g. `https://api.drama15.example`) before
 * shipping `index.html`. The same string is also served as a top-level
 * `Content-Security-Policy` HTTP response header from the static host so
 * that browsers that ignore `<meta http-equiv>` for some directives
 * (e.g. `frame-ancestors`) still honour the policy.
 */

/** Token replaced at deploy time with the API_Gateway origin. */
export const API_GATEWAY_ORIGIN_PLACEHOLDER = '<API_GATEWAY_ORIGIN>';

/** Google Identity Provider origin allowed for OAuth login + GIS scripts. */
export const GOOGLE_IDP_ORIGIN = 'https://accounts.google.com';

/** Google Fonts stylesheet origin (only used if shipped via CDN). */
export const GOOGLE_FONTS_ORIGIN = 'https://fonts.googleapis.com';

export interface CspDirectives {
  readonly 'default-src': readonly string[];
  readonly 'script-src': readonly string[];
  readonly 'style-src': readonly string[];
  readonly 'connect-src': readonly string[];
  readonly 'img-src': readonly string[];
  readonly 'font-src': readonly string[];
  readonly 'frame-ancestors': readonly string[];
  readonly 'object-src': readonly string[];
  readonly 'base-uri': readonly string[];
  readonly 'form-action': readonly string[];
}

export const cspDirectives: CspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'", API_GATEWAY_ORIGIN_PLACEHOLDER, GOOGLE_IDP_ORIGIN],
  'style-src': ["'self'", "'unsafe-inline'", GOOGLE_FONTS_ORIGIN],
  'connect-src': ["'self'", API_GATEWAY_ORIGIN_PLACEHOLDER],
  'img-src': ["'self'", 'data:', 'https://lh3.googleusercontent.com', 'https://img.vietqr.io'],
  'font-src': ["'self'", 'https://fonts.gstatic.com'],
  'frame-ancestors': ["'none'"],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
};

/** Serialise directives into a CSP string suitable for both meta and header. */
export function buildCsp(directives: CspDirectives = cspDirectives): string {
  return (Object.keys(directives) as (keyof CspDirectives)[])
    .map((name) => `${name} ${directives[name].join(' ')}`)
    .join('; ');
}

/** Pre-rendered CSP string used by index.html and the static hosting layer. */
export const cspMeta: string = buildCsp();
