/**
 * Unit tests for `GET /voices` (Task 13.1).
 *
 * Validates: Requirement 9.3 (voice-list proxy) plus the cross-cutting
 * sanitisation guarantees from Requirements 12.2, 12.3, 12.4, 12.5
 * that the route inherits from {@link UpstreamProxy.forward}.
 *
 * Coverage:
 *   - Success path: a 200 from upstream is reshaped into
 *     `{ voices: [...] }` and returned at HTTP 200 with
 *     `Cache-Control: no-store`.
 *   - Upstream error path: a non-2xx upstream response is forwarded
 *     verbatim as the canonical `upstream_error` envelope.
 *   - Header sanitisation: server / via / x-powered-by / x-router-*
 *     never leak into the client-facing response, even when upstream
 *     emits them.
 *   - Credential isolation: the OmniVoice bearer token is never
 *     present in the response headers or body, and the in-memory
 *     vault material is scrubbed after the call returns.
 *
 * The plugin is loaded via `app.inject(...)` so the tests exercise
 * the same response framing that production traffic would.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  InMemoryVault,
  SCRUB_SENTINEL,
  type SecretMaterial
} from '../../src/vault/index.js';
import {
  UpstreamProxy,
  type UpstreamFetch,
  type UpstreamFetchInit,
  type UpstreamFetchResponse
} from '../../src/gateway/upstreamProxy.js';
import { createVoicesListRoutePlugin } from '../../src/voice/voicesList.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const SECRET_ID = 'omnivoice-tts';
const SECRET_VALUE = 'sk-omnivoice-test-2025';
const UPSTREAM_URL = 'https://omnivoice.upstream.test/tts/voices';

interface FetchCall {
  readonly init: UpstreamFetchInit;
  readonly observedAuthorization: string | undefined;
}

function makeFetch(response: UpstreamFetchResponse): {
  fetch: UpstreamFetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fetchImpl: UpstreamFetch = async (init) => {
    calls.push({
      init,
      observedAuthorization: init.headers['Authorization']
    });
    return response;
  };
  return { fetch: fetchImpl, calls };
}

function makeVault(value: string = SECRET_VALUE): {
  vault: InMemoryVault;
  factoryOutputs: SecretMaterial[];
} {
  const vault = new InMemoryVault();
  const factoryOutputs: SecretMaterial[] = [];
  vault.register(SECRET_ID, () => {
    const material: SecretMaterial = { kind: 'apiKey', value };
    factoryOutputs.push(material);
    return material;
  });
  return { vault, factoryOutputs };
}

interface Harness {
  app: FastifyInstance;
  fetchCalls: FetchCall[];
  vault: InMemoryVault;
  factoryOutputs: SecretMaterial[];
}

async function buildHarness(
  upstream: UpstreamFetchResponse
): Promise<Harness> {
  const { vault, factoryOutputs } = makeVault();
  const { fetch, calls } = makeFetch(upstream);
  const proxy = new UpstreamProxy({
    vault,
    secretId: SECRET_ID,
    fetch
  });

  const app = Fastify({ logger: false });
  await app.register(createVoicesListRoutePlugin, {
    upstreamProxy: proxy,
    upstreamUrl: UPSTREAM_URL
  });
  await app.ready();

  return { app, fetchCalls: calls, vault, factoryOutputs };
}

afterEach(() => {
  // Each test owns its own Fastify instance and closes it inline.
});

// ---------------------------------------------------------------------------
// 9.3 — success path
// ---------------------------------------------------------------------------

describe('GET /voices — success path (Requirement 9.3)', () => {
  it('returns the upstream voices list under { voices } with Cache-Control: no-store', async () => {
    const upstreamVoices = [
      { id: 'voice-001', name: 'Anna', language: 'vi-VN' },
      { id: 'voice-002', name: 'Brian', language: 'en-US' }
    ];
    const h = await buildHarness({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voices: upstreamVoices })
    });

    try {
      const res = await h.app.inject({ method: 'GET', url: '/voices' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');

      const body = JSON.parse(res.body) as { voices: unknown[] };
      expect(body.voices).toEqual(upstreamVoices);

      // The upstream call hit the configured URL exactly once.
      expect(h.fetchCalls).toHaveLength(1);
      expect(h.fetchCalls[0]!.init.method).toBe('GET');
      expect(h.fetchCalls[0]!.init.url).toBe(UPSTREAM_URL);
    } finally {
      await h.app.close();
    }
  });

  it('accepts a bare JSON array from upstream and projects it under { voices }', async () => {
    const upstreamVoices = [{ id: 'v-1' }, { id: 'v-2' }];
    const h = await buildHarness({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(upstreamVoices)
    });

    try {
      const res = await h.app.inject({ method: 'GET', url: '/voices' });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body) as { voices: unknown[] };
      expect(body.voices).toEqual(upstreamVoices);
    } finally {
      await h.app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Upstream error → canonical envelope (Requirements 9.10, 12.5)
// ---------------------------------------------------------------------------

describe('GET /voices — upstream error path', () => {
  it('forwards the proxy-canonicalised upstream_error envelope on a 5xx', async () => {
    const h = await buildHarness({
      status: 500,
      headers: { 'content-type': 'text/plain' },
      // The upstream body intentionally references an internal host;
      // the proxy MUST rewrite this away long before the route sees it.
      body: 'database connection refused at db.internal.drama15:5432'
    });

    try {
      const res = await h.app.inject({ method: 'GET', url: '/voices' });

      // The proxy collapses 5xx → 502 with the canonical envelope.
      expect(res.statusCode).toBe(502);
      expect(res.headers['cache-control']).toBe('no-store');

      const body = JSON.parse(res.body) as {
        error: { code: string; message: string; requestId: string };
      };
      expect(body.error.code).toBe('upstream_error');
      expect(typeof body.error.requestId).toBe('string');
      expect(body.error.requestId.length).toBeGreaterThan(0);

      // Internal upstream details must not leak into the response.
      expect(res.body.includes('database connection refused')).toBe(false);
      expect(res.body.includes('drama15')).toBe(false);
    } finally {
      await h.app.close();
    }
  });

  it('forwards the proxy-canonicalised upstream_error envelope when fetch throws', async () => {
    const { vault } = makeVault();
    const failingFetch: UpstreamFetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND omnivoice.internal.drama15');
    };
    const proxy = new UpstreamProxy({
      vault,
      secretId: SECRET_ID,
      fetch: failingFetch
    });
    const app = Fastify({ logger: false });
    await app.register(createVoicesListRoutePlugin, {
      upstreamProxy: proxy,
      upstreamUrl: UPSTREAM_URL
    });
    await app.ready();

    try {
      const res = await app.inject({ method: 'GET', url: '/voices' });

      expect(res.statusCode).toBe(502);
      const body = JSON.parse(res.body) as {
        error: { code: string };
      };
      expect(body.error.code).toBe('upstream_error');
      expect(res.body.includes('ENOTFOUND')).toBe(false);
      expect(res.body.includes('drama15')).toBe(false);
    } finally {
      await app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Header sanitisation (Requirement 12.4)
// ---------------------------------------------------------------------------

describe('GET /voices — header sanitisation (Requirement 12.4)', () => {
  it('does not leak server, via, x-powered-by, or x-router-* headers from upstream', async () => {
    const h = await buildHarness({
      status: 200,
      headers: {
        'content-type': 'application/json',
        server: 'nginx/1.27.0 (omnivoice.internal)',
        via: '1.1 omnivoice-edge',
        'x-powered-by': 'OmniVoice/2.4',
        'x-router-version': '7.1.2',
        'x-router-trace': 'omnivoice-trace-abc'
      },
      body: JSON.stringify({ voices: [{ id: 'v-1' }] })
    });

    try {
      const res = await h.app.inject({ method: 'GET', url: '/voices' });

      expect(res.statusCode).toBe(200);

      const headerKeys = Object.keys(res.headers).map((k) => k.toLowerCase());
      expect(headerKeys).not.toContain('server');
      expect(headerKeys).not.toContain('via');
      expect(headerKeys).not.toContain('x-powered-by');
      for (const key of headerKeys) {
        expect(key.startsWith('x-router-')).toBe(false);
      }
    } finally {
      await h.app.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Credential isolation (Requirements 12.2, 12.3)
// ---------------------------------------------------------------------------

describe('GET /voices — credential isolation (Requirements 12.2, 12.3)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ voices: [{ id: 'v-1' }] })
    });
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('injects Authorization with the vault secret on the OUTBOUND leg only', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/voices' });

    expect(res.statusCode).toBe(200);

    // The proxy must have built `Authorization: Bearer <secret>`
    // INSIDE the vault closure for the outbound fetch.
    expect(h.fetchCalls).toHaveLength(1);
    expect(h.fetchCalls[0]!.observedAuthorization).toBe(`Bearer ${SECRET_VALUE}`);
  });

  it('never echoes the OmniVoice bearer token into the client-facing response', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/voices' });

    expect(res.statusCode).toBe(200);

    // No header carries the credential value.
    for (const value of Object.values(res.headers)) {
      const stringified = Array.isArray(value)
        ? value.join(',')
        : String(value ?? '');
      expect(stringified.includes(SECRET_VALUE)).toBe(false);
    }

    // Neither does the body.
    expect(res.body.includes(SECRET_VALUE)).toBe(false);
    // And no `authorization` header is forwarded at all.
    const headerKeys = Object.keys(res.headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('authorization');
  });

  it('scrubs the in-memory vault material after the request completes', async () => {
    await h.app.inject({ method: 'GET', url: '/voices' });

    // Drive a follow-up `useSecret` call and capture the closure
    // argument; after the closure resolves the vault scrubs every
    // string field on the per-call copy with SCRUB_SENTINEL. This is
    // the structural enforcement of Requirement 12.3 (decrypted
    // material lives only for the lifetime of the call).
    let captured: SecretMaterial | undefined;
    await h.vault.useSecret(SECRET_ID, async (secret) => {
      captured = secret;
      return null;
    });

    expect(captured).toBeDefined();
    if (captured?.kind === 'apiKey') {
      expect(captured.value).toBe(SCRUB_SENTINEL);
    } else {
      throw new Error('expected apiKey material');
    }
  });
});
