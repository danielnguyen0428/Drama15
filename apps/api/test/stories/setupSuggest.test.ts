/**
 * Unit tests for `POST /story/setup-suggest` (Task 10.1).
 *
 * Validates: Requirement 6.2.
 *
 * Coverage matrix (from the task brief):
 *   - Success forward: a valid body reaches the upstream proxy
 *     verbatim; the upstream's suggestion JSON is returned to the
 *     client unchanged with `Cache-Control: no-store`.
 *   - Upstream error → canonical envelope: when the proxy returns
 *     its `{ code: 'upstream_error', requestId }` 502 body (the
 *     production behaviour for a 5xx / leaky upstream — see
 *     `gateway/upstreamProxy.ts`), the route surfaces the same
 *     envelope to the client.
 *   - Header sanitisation: the response carries no `server`,
 *     `via`, or `x-powered-by` headers (Requirement 12.4).
 *
 * The route is exercised through Fastify's `inject` API, so the test
 * exercises the same body parsing, error mapping, and header
 * behaviour that production traffic would.
 *
 * The proxy itself is replaced by a deterministic fake — the proxy's
 * own header-strip / body-rewrite contract is covered by
 * `gateway/upstreamProxy.property.test.ts` and we do not duplicate
 * that here. We DO use the real {@link UpstreamProxy} for the
 * "no leaky headers" assertion so the test is end-to-end against
 * the production sanitisation contract rather than mirroring it
 * locally; that is what `realProxyHarness` builds.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  UpstreamProxy,
  type UpstreamFetchInit,
  type UpstreamFetchResponse,
  type UpstreamRequest,
  type UpstreamResponse
} from '../../src/gateway/upstreamProxy.js';
import { InMemoryVault } from '../../src/vault/index.js';
import { createSetupSuggestRoutePlugin } from '../../src/stories/setupSuggest.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const USER_ID = 'user-suggest-1';
const UPSTREAM_URL = 'https://upstream.test/story/setup-suggest';
const SECRET_ID = 'router-llm';
const SECRET_VALUE = 'sk-test-suggest';

interface ProxyCall {
  readonly init: UpstreamRequest;
}

/**
 * Tracking fake for `UpstreamProxy.forward`. Returns a canned
 * response per call and records the request the route forwarded.
 *
 * Used in the "success" and "upstream error envelope" tests where we
 * want to control the upstream response without going through the
 * real fetch path. The "no leaky headers" test uses
 * {@link realProxyHarness} so it exercises the production
 * sanitisation contract.
 */
class FakeUpstreamProxy implements Pick<UpstreamProxy, 'forward'> {
  public calls: ProxyCall[] = [];
  public nextResponse: UpstreamResponse = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Cinderella, Inc.', seed: 'rags-to-riches' })
  };

  public async forward(req: UpstreamRequest): Promise<UpstreamResponse> {
    this.calls.push({ init: req });
    return this.nextResponse;
  }
}

interface FakeHarness {
  app: FastifyInstance;
  proxy: FakeUpstreamProxy;
  setUser(id: string | null): void;
}

let currentUser: string | null = null;

async function buildFakeHarness(): Promise<FakeHarness> {
  const proxy = new FakeUpstreamProxy();

  const app = Fastify({ logger: false });
  await app.register(createSetupSuggestRoutePlugin, {
    upstreamProxy: proxy,
    upstreamUrl: UPSTREAM_URL,
    extractUserId: () => currentUser
  });
  await app.ready();

  return {
    app,
    proxy,
    setUser(id) {
      currentUser = id;
    }
  };
}

interface RealProxyHarness {
  app: FastifyInstance;
  /**
   * Replace the upstream `fetch` response for the next call. The fake
   * `fetch` is used by the real `UpstreamProxy` so the route exercises
   * the production sanitisation pipeline end-to-end.
   */
  setUpstream(response: UpstreamFetchResponse): void;
  /** Capture every fetch invocation so the test can inspect headers. */
  fetchCalls: UpstreamFetchInit[];
  setUser(id: string | null): void;
}

async function buildRealProxyHarness(): Promise<RealProxyHarness> {
  const fetchCalls: UpstreamFetchInit[] = [];
  let nextResponse: UpstreamFetchResponse = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Drama Title', seed: 'a fresh seed' })
  };

  const vault = new InMemoryVault();
  vault.register(SECRET_ID, () => ({ kind: 'apiKey', value: SECRET_VALUE }));

  const proxy = new UpstreamProxy({
    vault,
    secretId: SECRET_ID,
    fetch: async (init) => {
      fetchCalls.push(init);
      return nextResponse;
    }
  });

  const app = Fastify({ logger: false });
  await app.register(createSetupSuggestRoutePlugin, {
    upstreamProxy: proxy,
    upstreamUrl: UPSTREAM_URL,
    extractUserId: () => currentUser
  });
  await app.ready();

  return {
    app,
    setUpstream(response) {
      nextResponse = response;
    },
    fetchCalls,
    setUser(id) {
      currentUser = id;
    }
  };
}

// Default valid body — picks a curated niche. Tests override fields
// as needed.
function suggestBody(
  overrides: Partial<{ niche: string; customNiche: string; outputLanguage: string }> = {}
): Record<string, unknown> {
  return {
    niche: 'billionaire',
    outputLanguage: 'vi',
    ...overrides
  };
}

afterEach(() => {
  currentUser = null;
});

// ---------------------------------------------------------------------------
// Success forward
// ---------------------------------------------------------------------------

describe('POST /story/setup-suggest — success forward (Requirement 6.2)', () => {
  let h: FakeHarness;

  beforeEach(async () => {
    h = await buildFakeHarness();
    h.setUser(USER_ID);
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('returns 200 with the upstream suggestions verbatim', async () => {
    h.proxy.nextResponse = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Tỷ phú và cô bé bán hoa',
        seed: 'một mùa hè ở Sapa',
        config: { intensity: 0.7, dialogueRatio: 0.6, hookDensity: 0.4 }
      })
    };

    const res = await h.app.inject({
      method: 'POST',
      url: '/story/setup-suggest',
      payload: suggestBody({ niche: 'billionaire' })
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');

    // Body forwarded verbatim from the upstream.
    expect(res.body).toBe(h.proxy.nextResponse.body);
    const body = res.json() as {
      title: string;
      seed: string;
      config: Record<string, number>;
    };
    expect(body.title).toBe('Tỷ phú và cô bé bán hoa');
    expect(body.seed).toBe('một mùa hè ở Sapa');
    expect(body.config.intensity).toBe(0.7);
  });

  it('forwards the request to the configured upstream URL with the validated body', async () => {
    const payload = suggestBody({
      niche: 'social_injustice',
      outputLanguage: 'en'
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/story/setup-suggest',
      payload
    });

    expect(res.statusCode).toBe(200);
    expect(h.proxy.calls).toHaveLength(1);
    const fwd = h.proxy.calls[0]!.init;
    expect(fwd.method).toBe('POST');
    expect(fwd.url).toBe(UPSTREAM_URL);
    expect(fwd.headers['content-type']).toBe('application/json');
    // The upstream body is the validated input verbatim — extra fields
    // pass through as well.
    const fwdBody = JSON.parse(fwd.body as string) as Record<string, unknown>;
    expect(fwdBody.niche).toBe('social_injustice');
    expect(fwdBody.outputLanguage).toBe('en');
  });

  it('accepts a customNiche payload (Requirement 6.11) and forwards it verbatim', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/story/setup-suggest',
      payload: {
        customNiche: 'a brand-new genre',
        outputLanguage: 'vi'
      }
    });

    expect(res.statusCode).toBe(200);
    const fwd = h.proxy.calls[0]!.init;
    const fwdBody = JSON.parse(fwd.body as string) as Record<string, unknown>;
    expect(fwdBody.customNiche).toBe('a brand-new genre');
    expect(fwdBody.outputLanguage).toBe('vi');
  });

  it('returns 401 unauthenticated when no caller is resolved (no upstream call)', async () => {
    h.setUser(null);
    const res = await h.app.inject({
      method: 'POST',
      url: '/story/setup-suggest',
      payload: suggestBody()
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
    expect(h.proxy.calls).toHaveLength(0);
  });

  it('rejects an empty body with 400 invalid_request (no upstream call)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/story/setup-suggest',
      payload: {}
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_request');
    expect(h.proxy.calls).toHaveLength(0);
  });

  it('rejects a body without a niche or customNiche with 400 invalid_request', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/story/setup-suggest',
      payload: { outputLanguage: 'vi' }
    });
    expect(res.statusCode).toBe(400);
    expect(h.proxy.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Upstream error → canonical envelope
// ---------------------------------------------------------------------------

describe('POST /story/setup-suggest — upstream error envelope (Requirements 9.10, 12.5)', () => {
  it('forwards the proxy 502 envelope when the upstream errors out', async () => {
    const h = await buildFakeHarness();
    try {
      h.setUser(USER_ID);
      // The production proxy collapses any 5xx / leaky upstream body
      // into this exact envelope (see `gateway/upstreamProxy.ts`).
      // Drive that as the canned response and verify the route
      // surfaces it verbatim with a 502 status.
      h.proxy.nextResponse = {
        status: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: {
            code: 'upstream_error',
            message: 'Upstream service error',
            requestId: 'req-42'
          }
        })
      };

      const res = await h.app.inject({
        method: 'POST',
        url: '/story/setup-suggest',
        payload: suggestBody()
      });

      expect(res.statusCode).toBe(502);
      const body = res.json() as { error: { code: string; requestId?: string } };
      expect(body.error.code).toBe('upstream_error');
      // The proxy's request id rides along so support can correlate.
      expect(typeof body.error.requestId).toBe('string');
    } finally {
      await h.app.close();
    }
  });

  it('returns the canonical envelope when a real proxy is given a 5xx upstream', async () => {
    const h = await buildRealProxyHarness();
    try {
      h.setUser(USER_ID);
      // 5xx triggers the proxy's body-rewrite path. The route should
      // surface the rewritten envelope with status 502 (the proxy
      // collapses every 5xx to 502 — design.md / Requirement 12.5).
      h.setUpstream({
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: 'router crashed at /opt/drama15/router/index.js'
        })
      });

      const res = await h.app.inject({
        method: 'POST',
        url: '/story/setup-suggest',
        payload: suggestBody()
      });

      expect(res.statusCode).toBe(502);
      const body = res.json() as {
        error: { code: string; requestId?: string };
      };
      expect(body.error.code).toBe('upstream_error');
      // The internal path leak from the upstream MUST NOT reach the
      // client (Requirement 12.5).
      expect(res.body).not.toContain('/opt/drama15');
    } finally {
      await h.app.close();
    }
  });

  it('returns 502 upstream_error when the proxy itself throws (misconfiguration)', async () => {
    const h = await buildFakeHarness();
    try {
      h.setUser(USER_ID);
      // Simulate a proxy-level misconfiguration (e.g. unsupported
      // secret kind). The route must surface a 502 envelope rather
      // than leaking the underlying message.
      h.proxy.forward = async () => {
        throw new Error('secret kind not supported');
      };

      const res = await h.app.inject({
        method: 'POST',
        url: '/story/setup-suggest',
        payload: suggestBody()
      });

      expect(res.statusCode).toBe(502);
      const body = res.json() as { error: { code: string; message: string } };
      expect(body.error.code).toBe('upstream_error');
      // The underlying exception message MUST NOT reach the client.
      expect(body.error.message).not.toContain('secret kind');
    } finally {
      await h.app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// No leaky headers (Requirement 12.4)
// ---------------------------------------------------------------------------

describe('POST /story/setup-suggest — no leaky headers (Requirement 12.4)', () => {
  it('strips server / via / x-powered-by headers from the upstream response', async () => {
    const h = await buildRealProxyHarness();
    try {
      h.setUser(USER_ID);
      h.setUpstream({
        status: 200,
        headers: {
          'content-type': 'application/json',
          server: 'nginx/1.25.2',
          via: '1.1 router-internal',
          'x-powered-by': 'Express',
          'x-router-trace': 'router-trace-id-42',
          'x-request-id': 'should-pass-through'
        },
        body: JSON.stringify({ title: 'A clean suggestion', seed: 'seed' })
      });

      const res = await h.app.inject({
        method: 'POST',
        url: '/story/setup-suggest',
        payload: suggestBody()
      });

      expect(res.statusCode).toBe(200);
      // No leaky headers (Requirement 12.4).
      expect(res.headers.server).toBeUndefined();
      expect(res.headers.via).toBeUndefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-router-trace']).toBeUndefined();
      // No-store cache control wins.
      expect(res.headers['cache-control']).toBe('no-store');
    } finally {
      await h.app.close();
    }
  });

  it('strips leaky headers from the upstream regardless of casing', async () => {
    const h = await buildRealProxyHarness();
    try {
      h.setUser(USER_ID);
      h.setUpstream({
        status: 200,
        headers: {
          'content-type': 'application/json',
          // Mixed case — the proxy lower-cases keys before the strip
          // check, but the route MUST not re-introduce them under
          // their original casing either.
          Server: 'nginx',
          Via: '1.1 internal',
          'X-Powered-By': 'Express',
          'X-Router-Version': '1.2.3'
        },
        body: JSON.stringify({ title: 'OK' })
      });

      const res = await h.app.inject({
        method: 'POST',
        url: '/story/setup-suggest',
        payload: suggestBody()
      });

      expect(res.statusCode).toBe(200);
      // Even though the upstream emitted mixed-case names, the
      // sanitised response carries neither the lower- nor the
      // mixed-case form.
      const headerKeysLower = Object.keys(res.headers).map((k) =>
        k.toLowerCase()
      );
      expect(headerKeysLower).not.toContain('server');
      expect(headerKeysLower).not.toContain('via');
      expect(headerKeysLower).not.toContain('x-powered-by');
      expect(
        headerKeysLower.some((k) => k.startsWith('x-router-'))
      ).toBe(false);
    } finally {
      await h.app.close();
    }
  });
});
