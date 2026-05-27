import { describe, it, expect } from 'vitest';
import { CorsMiddleware } from '../../src/gateway/cors.js';

/**
 * Unit tests for the CORS allowlist middleware.
 *
 * Validates: Requirements 12.6.
 *
 * The middleware itself is a pure function — we exercise its
 * `evaluate()` decision shape directly, no HTTP server needed.
 */
describe('CorsMiddleware (Requirement 12.6)', () => {
  const allowedOrigin = 'https://app.example.com';
  const otherAllowed = 'https://admin.example.com';
  const buildMiddleware = (): CorsMiddleware =>
    new CorsMiddleware({ allowedOrigins: [allowedOrigin, otherAllowed] });

  describe('preflight (OPTIONS)', () => {
    it('reflects the origin and emits the full preflight header set when allowed', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({ method: 'OPTIONS', originHeader: allowedOrigin });

      expect(decision.type).toBe('preflight');
      if (decision.type !== 'preflight') return; // narrow for TS
      expect(decision.status).toBe(204);
      expect(decision.headers['Access-Control-Allow-Origin']).toBe(allowedOrigin);
      expect(decision.headers['Access-Control-Allow-Credentials']).toBe('true');
      // Methods list should advertise at least the verbs the Web_Client uses.
      expect(decision.headers['Access-Control-Allow-Methods']).toMatch(/GET/);
      expect(decision.headers['Access-Control-Allow-Methods']).toMatch(/POST/);
      expect(decision.headers['Access-Control-Allow-Methods']).toMatch(/OPTIONS/);
      // Headers list must include the integrity + auth headers the gateway requires.
      expect(decision.headers['Access-Control-Allow-Headers']).toMatch(/authorization/);
      expect(decision.headers['Access-Control-Allow-Headers']).toMatch(/x-client-integrity/);
      // Default max-age is 600s.
      expect(decision.headers['Access-Control-Max-Age']).toBe('600');
      // `Vary: Origin` is required so shared caches key per-origin.
      expect(decision.headers['Vary']).toBe('Origin');
    });

    it('uses caller-supplied allowedMethods / allowedHeaders / maxAge', () => {
      const cors = new CorsMiddleware({
        allowedOrigins: [allowedOrigin],
        allowedMethods: ['GET', 'POST'],
        allowedHeaders: ['authorization'],
        maxAge: 30
      });

      const decision = cors.evaluate({ method: 'OPTIONS', originHeader: allowedOrigin });

      expect(decision.type).toBe('preflight');
      if (decision.type !== 'preflight') return;
      expect(decision.headers['Access-Control-Allow-Methods']).toBe('GET, POST');
      expect(decision.headers['Access-Control-Allow-Headers']).toBe('authorization');
      expect(decision.headers['Access-Control-Max-Age']).toBe('30');
    });

    it('rejects with 403 and no Access-Control-Allow-Origin when origin is not allowed', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({
        method: 'OPTIONS',
        originHeader: 'https://evil.example.com'
      });

      expect(decision.type).toBe('reject');
      if (decision.type !== 'reject') return;
      expect(decision.status).toBe(403);
      expect(decision.headers).toEqual({});
      expect(decision.headers['Access-Control-Allow-Origin']).toBeUndefined();
    });

    it('rejects with 403 when the Origin header is missing on a preflight', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({ method: 'OPTIONS', originHeader: undefined });

      expect(decision.type).toBe('reject');
      if (decision.type !== 'reject') return;
      expect(decision.status).toBe(403);
      expect(decision.headers).toEqual({});
    });
  });

  describe('simple / actual requests', () => {
    it('reflects the origin with credentials + Vary on an allowed POST', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({ method: 'POST', originHeader: allowedOrigin });

      expect(decision.type).toBe('simple');
      if (decision.type !== 'simple') return;
      expect(decision.headers['Access-Control-Allow-Origin']).toBe(allowedOrigin);
      expect(decision.headers['Access-Control-Allow-Credentials']).toBe('true');
      expect(decision.headers['Vary']).toBe('Origin');
      // Preflight-only headers must NOT leak onto a simple request.
      expect(decision.headers['Access-Control-Allow-Methods']).toBeUndefined();
      expect(decision.headers['Access-Control-Allow-Headers']).toBeUndefined();
      expect(decision.headers['Access-Control-Max-Age']).toBeUndefined();
    });

    it('rejects with 403 on a disallowed POST origin', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({
        method: 'POST',
        originHeader: 'https://evil.example.com'
      });

      expect(decision.type).toBe('reject');
      if (decision.type !== 'reject') return;
      expect(decision.status).toBe(403);
      expect(decision.headers).toEqual({});
    });

    it('emits no CORS headers on a same-origin GET (Origin header absent)', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({ method: 'GET', originHeader: undefined });

      expect(decision.type).toBe('simple');
      if (decision.type !== 'simple') return;
      expect(decision.headers).toEqual({});
    });
  });

  describe('exact, case-sensitive matching', () => {
    it('treats the same host with an explicit :443 port as a different origin', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({
        method: 'POST',
        originHeader: 'https://app.example.com:443'
      });

      expect(decision.type).toBe('reject');
      if (decision.type !== 'reject') return;
      expect(decision.status).toBe(403);
    });

    it('is case-sensitive on the host portion of the origin', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({
        method: 'OPTIONS',
        originHeader: 'https://APP.example.com'
      });

      expect(decision.type).toBe('reject');
      if (decision.type !== 'reject') return;
      expect(decision.status).toBe(403);
    });

    it('allows a second registered origin verbatim', () => {
      const cors = buildMiddleware();

      const decision = cors.evaluate({ method: 'POST', originHeader: otherAllowed });

      expect(decision.type).toBe('simple');
      if (decision.type !== 'simple') return;
      expect(decision.headers['Access-Control-Allow-Origin']).toBe(otherAllowed);
    });
  });
});
