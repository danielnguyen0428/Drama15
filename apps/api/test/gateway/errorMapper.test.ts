/**
 * Unit tests for `errorMapper`.
 *
 * Validates: Requirements 5.9, 7.6.
 *
 * Coverage:
 *   1. Every code in the `ErrorCode` union maps to the right HTTP
 *      status (sanity check against `ERROR_TO_HTTP`).
 *   2. Status 429 always carries `Retry-After` — explicit value
 *      passes through verbatim, omitted value falls back to 60.
 *   3. Status 401 / 403 carries `Cache-Control: no-store` so auth /
 *      license denials cannot be cached.
 *   4. `upstream_timeout` resolves to 504 (separate from `upstream_error`).
 *   5. `addSseHeaders` injects `X-Accel-Buffering: no` and a SSE-safe
 *      `Cache-Control` value.
 *   6. The body always matches the `ApiError` envelope shape.
 */

import { describe, it, expect } from 'vitest';
import type { ApiError, ErrorCode } from '@drama15/contracts';

import {
  ERROR_TO_HTTP,
  DEFAULT_RETRY_AFTER_SECONDS,
  addNoStoreCacheHeaders,
  addSseHeaders,
  mapErrorToResponse
} from '../../src/gateway/errorMapper.js';

/**
 * Authoritative table of `ErrorCode` → HTTP status. Tests assert
 * against this table rather than re-importing `ERROR_TO_HTTP`
 * verbatim so a refactor that accidentally drops or remaps a code
 * fails loudly here.
 */
const EXPECTED_STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  refresh_token_invalid: 401,
  google_email_unverified: 403,
  reauth_required: 401,
  forbidden: 403,
  license_not_active: 403,
  device_limit_reached: 403,
  free_plan_device_already_used: 403,
  automation_requires_paid: 403,
  voice_requires_paid: 403,
  client_integrity_failed: 403,
  free_chapter_quota_exhausted: 429,
  paid_story_quota_exhausted: 429,
  paid_voice_quota_exhausted: 429,
  rewrite_quota_exhausted: 429,
  rate_limited: 429,
  upstream_timeout: 504,
  upstream_error: 502,
  unsupported_browser: 400,
  internal_error: 500
};

const ALL_CODES = Object.keys(EXPECTED_STATUS) as ErrorCode[];

/**
 * Type guard / shape check for `ApiError`. Used to assert the body
 * always conforms to the contract envelope, regardless of which
 * optional fields are populated for a given code.
 */
function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { error?: unknown };
  if (typeof v.error !== 'object' || v.error === null) return false;
  const e = v.error as {
    code?: unknown;
    message?: unknown;
    retryAfterSeconds?: unknown;
    resetAt?: unknown;
    requestId?: unknown;
  };
  if (typeof e.code !== 'string') return false;
  if (typeof e.message !== 'string') return false;
  if (e.retryAfterSeconds !== undefined && typeof e.retryAfterSeconds !== 'number') {
    return false;
  }
  if (e.resetAt !== undefined && typeof e.resetAt !== 'string') return false;
  if (e.requestId !== undefined && typeof e.requestId !== 'string') return false;
  return true;
}

describe('errorMapper (Requirements 5.9, 7.6)', () => {
  describe('ERROR_TO_HTTP table', () => {
    it.each(ALL_CODES)(
      'maps %s to the documented HTTP status',
      (code) => {
        expect(ERROR_TO_HTTP[code]).toBe(EXPECTED_STATUS[code]);
      }
    );

    it('covers every member of the ErrorCode union exactly once', () => {
      expect(Object.keys(ERROR_TO_HTTP).sort()).toEqual([...ALL_CODES].sort());
    });
  });

  describe('mapErrorToResponse → status', () => {
    it.each(ALL_CODES)(
      'returns status %s for code %s',
      (code) => {
        const out = mapErrorToResponse({ code });
        expect(out.status).toBe(EXPECTED_STATUS[code]);
      }
    );

    it('upstream_timeout is 504 (gateway timeout, distinct from 502)', () => {
      const out = mapErrorToResponse({ code: 'upstream_timeout' });
      expect(out.status).toBe(504);
      expect(mapErrorToResponse({ code: 'upstream_error' }).status).toBe(502);
    });
  });

  describe('mapErrorToResponse → body shape', () => {
    it.each(ALL_CODES)(
      'produces a body matching the ApiError envelope for code %s',
      (code) => {
        const out = mapErrorToResponse({ code });
        expect(isApiError(out.body)).toBe(true);
        expect(out.body.error.code).toBe(code);
        expect(typeof out.body.error.message).toBe('string');
        expect(out.body.error.message.length).toBeGreaterThan(0);
      }
    );

    it('passes through caller-supplied message, requestId, resetAt verbatim', () => {
      const out = mapErrorToResponse({
        code: 'paid_story_quota_exhausted',
        message: 'Custom: ran out',
        resetAt: '2025-04-01T00:00:00Z',
        requestId: 'req-123'
      });
      expect(out.body.error.message).toBe('Custom: ran out');
      expect(out.body.error.resetAt).toBe('2025-04-01T00:00:00Z');
      expect(out.body.error.requestId).toBe('req-123');
    });

    it('omits optional body fields when the caller does not supply them', () => {
      const out = mapErrorToResponse({ code: 'forbidden' });
      expect(out.body.error.resetAt).toBeUndefined();
      expect(out.body.error.requestId).toBeUndefined();
      // `forbidden` is 403, so retryAfterSeconds must NOT be set.
      expect(out.body.error.retryAfterSeconds).toBeUndefined();
    });
  });

  describe('mapErrorToResponse → 429 + Retry-After (Requirements 5.9, 7.6)', () => {
    const RATE_LIMITED_CODES: ErrorCode[] = [
      'rate_limited',
      'free_chapter_quota_exhausted',
      'paid_story_quota_exhausted',
      'paid_voice_quota_exhausted',
      'rewrite_quota_exhausted'
    ];

    it('rate_limited with retryAfterSeconds=17 sets Retry-After: "17"', () => {
      const out = mapErrorToResponse({
        code: 'rate_limited',
        retryAfterSeconds: 17
      });
      expect(out.status).toBe(429);
      expect(out.headers['Retry-After']).toBe('17');
      expect(out.body.error.retryAfterSeconds).toBe(17);
    });

    it('rate_limited without retryAfterSeconds defaults Retry-After to "60"', () => {
      const out = mapErrorToResponse({ code: 'rate_limited' });
      expect(out.status).toBe(429);
      expect(out.headers['Retry-After']).toBe(String(DEFAULT_RETRY_AFTER_SECONDS));
      expect(DEFAULT_RETRY_AFTER_SECONDS).toBe(60);
      expect(out.body.error.retryAfterSeconds).toBe(60);
    });

    it.each(RATE_LIMITED_CODES)(
      'every 429-mapped code (%s) carries a Retry-After header',
      (code) => {
        const out = mapErrorToResponse({ code });
        expect(out.status).toBe(429);
        expect(out.headers['Retry-After']).toBeDefined();
        const value = Number(out.headers['Retry-After']);
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(1);
      }
    );

    it('non-429 responses do not carry Retry-After', () => {
      for (const code of ALL_CODES) {
        if (EXPECTED_STATUS[code] === 429) continue;
        const out = mapErrorToResponse({ code });
        expect(out.headers['Retry-After']).toBeUndefined();
      }
    });
  });

  describe('mapErrorToResponse → Cache-Control: no-store on 401/403', () => {
    const CODES_401_403 = ALL_CODES.filter(
      (c) => EXPECTED_STATUS[c] === 401 || EXPECTED_STATUS[c] === 403
    );

    it.each(CODES_401_403)(
      'sets Cache-Control: no-store on %s',
      (code) => {
        const out = mapErrorToResponse({ code });
        expect(out.headers['Cache-Control']).toBe('no-store');
      }
    );

    it('does NOT set Cache-Control on non-auth/license responses', () => {
      const others = ALL_CODES.filter(
        (c) => EXPECTED_STATUS[c] !== 401 && EXPECTED_STATUS[c] !== 403
      );
      for (const code of others) {
        const out = mapErrorToResponse({ code });
        expect(out.headers['Cache-Control']).toBeUndefined();
      }
    });
  });

  describe('mapErrorToResponse → purity', () => {
    it('returns a fresh headers / body object on every call (no shared state)', () => {
      const a = mapErrorToResponse({ code: 'rate_limited', retryAfterSeconds: 5 });
      const b = mapErrorToResponse({ code: 'rate_limited', retryAfterSeconds: 5 });
      expect(a.headers).not.toBe(b.headers);
      expect(a.body).not.toBe(b.body);
      expect(a.body.error).not.toBe(b.body.error);

      // Mutating one result must not affect the other.
      a.headers['X-Test'] = '1';
      expect(b.headers['X-Test']).toBeUndefined();
    });
  });

  describe('addSseHeaders', () => {
    it('adds X-Accel-Buffering: no and an SSE-safe Cache-Control', () => {
      const out = addSseHeaders();
      expect(out['X-Accel-Buffering']).toBe('no');
      expect(out['Cache-Control']).toBe('no-cache, no-transform');
    });

    it('preserves caller-supplied headers and does not mutate the input', () => {
      const input: Record<string, string> = { 'Content-Type': 'text/event-stream' };
      const out = addSseHeaders(input);
      expect(out['Content-Type']).toBe('text/event-stream');
      expect(out['X-Accel-Buffering']).toBe('no');
      // Input must remain untouched.
      expect(input['X-Accel-Buffering']).toBeUndefined();
      expect(input['Cache-Control']).toBeUndefined();
      // And the returned bag must be a new object.
      expect(out).not.toBe(input);
    });

    it('overrides any pre-existing Cache-Control with the SSE value', () => {
      const out = addSseHeaders({ 'Cache-Control': 'public, max-age=60' });
      expect(out['Cache-Control']).toBe('no-cache, no-transform');
    });
  });

  describe('addNoStoreCacheHeaders', () => {
    it('adds Cache-Control: no-store and preserves other headers', () => {
      const input: Record<string, string> = { 'X-Trace': 'abc' };
      const out = addNoStoreCacheHeaders(input);
      expect(out['Cache-Control']).toBe('no-store');
      expect(out['X-Trace']).toBe('abc');
      // No mutation of the input.
      expect(input['Cache-Control']).toBeUndefined();
      expect(out).not.toBe(input);
    });

    it('works without an input argument', () => {
      const out = addNoStoreCacheHeaders();
      expect(out['Cache-Control']).toBe('no-store');
    });
  });
});
