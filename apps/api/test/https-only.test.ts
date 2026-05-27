import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

describe('HTTPS-only guard (Requirement 12.7)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('rejects plain-HTTP requests with 400 https_required when enforced', async () => {
    app = await buildServer({ logger: false, enforceHttps: true });

    // app.inject() always presents request.protocol === 'http' since the
    // virtual transport has no TLS context. With enforceHttps=true the
    // guard must short-circuit the request.
    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-type']).toMatch(/application\/json/);

    const body = res.json() as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('https_required');
    expect(typeof body.error?.message).toBe('string');
    // Body must not leak any host or upstream-protocol details.
    expect(body.error?.message ?? '').not.toMatch(/http:\/\//i);
  });

  it('does not interfere when enforcement is disabled (test default)', async () => {
    app = await buildServer({ logger: false, enforceHttps: false });

    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('still emits a request id on 400 rejections so logs can correlate', async () => {
    app = await buildServer({ logger: false, enforceHttps: true });

    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(400);
    expect(typeof res.headers['x-request-id']).toBe('string');
    expect((res.headers['x-request-id'] as string).length).toBeGreaterThan(0);
  });
});
