import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../src/server.js';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_INCOMING_ID = '11111111-1111-4111-8111-111111111111';

describe('request id propagation', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('generates a UUID v4 request id when none is provided and reflects it on the response', async () => {
    app = await buildServer({ logger: false });

    const res = await app.inject({ method: 'GET', url: '/healthz' });

    expect(res.statusCode).toBe(200);
    const id = res.headers['x-request-id'];
    expect(typeof id).toBe('string');
    expect(id as string).toMatch(UUID_V4_RE);
  });

  it('echoes a well-formed inbound x-request-id back on the response', async () => {
    app = await buildServer({ logger: false });

    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': VALID_INCOMING_ID }
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBe(VALID_INCOMING_ID);
  });

  it('replaces a malformed inbound x-request-id with a fresh UUID v4', async () => {
    app = await buildServer({ logger: false });

    const res = await app.inject({
      method: 'GET',
      url: '/healthz',
      headers: { 'x-request-id': 'not-a-uuid-just-bogus' }
    });

    expect(res.statusCode).toBe(200);
    const id = res.headers['x-request-id'];
    expect(typeof id).toBe('string');
    expect(id as string).not.toBe('not-a-uuid-just-bogus');
    expect(id as string).toMatch(UUID_V4_RE);
  });

  it('exposes a JSON health probe on /healthz', async () => {
    app = await buildServer({ logger: false });

    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });
});
