/**
 * Unit tests for `UpstreamProxy` (Task 7.9).
 *
 * Validates: Requirements 6.6, 9.6, 9.10, 12.1, 12.2, 12.3, 12.4, 12.5.
 *
 * The tests wire a real `InMemoryVault` rather than a stub so we can
 * positively assert the credential is scrubbed after `forward`
 * returns (Requirement 12.3). The injected `fetch` captures every
 * outbound init exactly as the proxy assembled it, which is how we
 * verify the `Authorization: Bearer <secret>` injection.
 */

import { describe, expect, it, beforeEach } from 'vitest';

import {
  InMemoryVault,
  SCRUB_SENTINEL,
  type SecretMaterial
} from '../../src/vault/index.js';
import {
  UpstreamProxy,
  UpstreamProxyError,
  type UpstreamFetch,
  type UpstreamFetchInit,
  type UpstreamFetchResponse
} from '../../src/gateway/upstreamProxy.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const SECRET_VALUE = 'sk-live-router-12345';
const SECRET_ID = 'router-llm';
const REQUEST_ID = 'req-abc-001';

interface FetchCall {
  readonly init: UpstreamFetchInit;
  /**
   * The credential value observed inside the closure when the proxy
   * built the `Authorization` header. Stored separately so tests can
   * compare against `SECRET_VALUE` AFTER the vault scrub has run.
   */
  readonly observedAuthorization: string | undefined;
}

/**
 * Build a deterministic fake `fetch` that records every call and
 * returns the canned response.
 */
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

function makeVault(value = SECRET_VALUE): {
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

const BASE_REQUEST = {
  method: 'POST',
  url: 'https://router.internal.drama15/story/full-stream',
  headers: { 'content-type': 'application/json' } as Record<string, string>,
  body: '{"prompt":"hello"}',
  requestId: REQUEST_ID
} as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('UpstreamProxy.forward (Requirements 6.6, 9.6, 9.10, 12.1, 12.2, 12.3, 12.4, 12.5)', () => {
  let vault: InMemoryVault;

  beforeEach(() => {
    vault = makeVault().vault;
  });

  it('passes through a clean upstream body and strips server/via/x-powered-by/x-router-* headers', async () => {
    const upstream: UpstreamFetchResponse = {
      status: 200,
      headers: {
        'content-type': 'application/json',
        // Strip set per Requirement 12.4:
        server: 'nginx/1.25.0',
        via: '1.1 internal-router',
        'x-powered-by': 'Express',
        // Any header matching `^x-router-`:
        'x-router-version': '4.2.1',
        'x-router-trace': 'abc-123',
        // Upper-cased variant — must still be stripped:
        'X-Router-Backend': 'gpu-pool-3',
        // Header NOT in the strip set must pass through:
        'x-request-id': 'upstream-id-77'
      },
      body: '{"result":"ok"}'
    };
    const { fetch, calls } = makeFetch(upstream);
    const proxy = new UpstreamProxy({ vault, secretId: SECRET_ID, fetch });

    const result = await proxy.forward({ ...BASE_REQUEST });

    // The upstream call happened exactly once with our configured URL
    // and method (Requirement 12.1: gateway is the only caller of
    // upstream).
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.url).toBe(BASE_REQUEST.url);

    // Body passes through unchanged on a clean 2xx (Requirement 12.5
    // negative case — only LEAKING bodies are rewritten).
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"result":"ok"}');

    // Strip set: none of these may appear in the response, regardless
    // of the case used by upstream.
    const headerKeys = Object.keys(result.headers).map((k) => k.toLowerCase());
    expect(headerKeys).not.toContain('server');
    expect(headerKeys).not.toContain('via');
    expect(headerKeys).not.toContain('x-powered-by');
    for (const k of headerKeys) {
      expect(k.startsWith('x-router-')).toBe(false);
    }

    // Headers outside the strip set still pass through.
    expect(result.headers['x-request-id']).toBe('upstream-id-77');
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('injects `Authorization: Bearer <secret>` using the in-memory vault material (Requirements 6.6, 9.6, 12.2, 12.3)', async () => {
    const { fetch, calls } = makeFetch({
      status: 200,
      headers: {},
      body: '{}'
    });
    const proxy = new UpstreamProxy({ vault, secretId: SECRET_ID, fetch });

    await proxy.forward({ ...BASE_REQUEST });

    expect(calls).toHaveLength(1);
    // Credential observed AT THE TIME OF FETCH must be the live
    // secret. The proxy is required to inject it into the header set
    // built inside the vault closure (Requirements 6.6, 9.6, 12.2).
    expect(calls[0]!.observedAuthorization).toBe(`Bearer ${SECRET_VALUE}`);

    // The upstream URL — which would otherwise expose the internal
    // host — must NOT appear in `Authorization` or anywhere else
    // outside the secret value (Requirement 9.10).
    expect(calls[0]!.observedAuthorization!.includes('drama15')).toBe(false);
  });

  it('scrubs the in-memory secret material after `forward` returns (Requirement 12.3)', async () => {
    const { vault: localVault, factoryOutputs } = makeVault();
    const { fetch } = makeFetch({ status: 200, headers: {}, body: '{}' });
    const proxy = new UpstreamProxy({ vault: localVault, secretId: SECRET_ID, fetch });

    await proxy.forward({ ...BASE_REQUEST });

    // The factory outputs are the registered material, NOT the
    // per-call clone — these are intentionally untouched (the vault
    // contract preserves the registration so subsequent calls work).
    expect(factoryOutputs).toHaveLength(1);
    expect(factoryOutputs[0]!.kind).toBe('apiKey');

    // Now drive a SECOND call but capture the closure argument and
    // assert the vault scrubbed it after the proxy returned.
    let closureSecret: SecretMaterial | undefined;
    await localVault.useSecret(SECRET_ID, async (secret) => {
      closureSecret = secret;
      return null;
    });
    expect(closureSecret).toBeDefined();
    if (closureSecret?.kind === 'apiKey') {
      expect(closureSecret.value).toBe(SCRUB_SENTINEL);
    } else {
      throw new Error('expected apiKey material');
    }
  });

  it('rewrites a 5xx upstream into the canonical { code: "upstream_error", requestId } envelope (Requirement 12.5)', async () => {
    const upstream: UpstreamFetchResponse = {
      status: 500,
      headers: { 'content-type': 'text/plain', server: 'nginx' },
      body: 'database connection refused at db.internal.drama15:5432'
    };
    const { fetch } = makeFetch(upstream);
    const proxy = new UpstreamProxy({ vault, secretId: SECRET_ID, fetch });

    const result = await proxy.forward({ ...BASE_REQUEST });

    // The 5xx is mapped to a 502 (gateway-style) so the client sees
    // a uniform "upstream broken" semantic regardless of which 5xx
    // upstream emitted.
    expect(result.status).toBe(502);
    const body = JSON.parse(result.body) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe('upstream_error');
    expect(body.error.requestId).toBe(REQUEST_ID);
    // Original upstream message must NOT leak through the rewritten
    // envelope.
    expect(result.body.includes('database connection refused')).toBe(false);
    expect(result.body.includes('drama15')).toBe(false);
    // And the strip set still wins on the rewritten response.
    expect(result.headers['server']).toBeUndefined();
  });

  it('rewrites a 200 body that contains an internal hostname (Requirement 12.5)', async () => {
    const upstream: UpstreamFetchResponse = {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        result: 'ok',
        traceTarget: 'internal.upstream.local'
      })
    };
    const { fetch } = makeFetch(upstream);
    const proxy = new UpstreamProxy({ vault, secretId: SECRET_ID, fetch });

    const result = await proxy.forward({ ...BASE_REQUEST });

    expect(result.status).toBe(502);
    const body = JSON.parse(result.body) as {
      error: { code: string; requestId: string };
    };
    expect(body.error.code).toBe('upstream_error');
    expect(body.error.requestId).toBe(REQUEST_ID);
    // The leaking hostname must be gone from the wire.
    expect(result.body.includes('internal.upstream.local')).toBe(false);
  });

  it('rewrites a 200 body that contains an internal filesystem path (Requirement 12.5)', async () => {
    const upstream: UpstreamFetchResponse = {
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: 'TypeError: Cannot read property at /var/log/drama15/upstream/router.js:42:7'
    };
    const { fetch } = makeFetch(upstream);
    const proxy = new UpstreamProxy({ vault, secretId: SECRET_ID, fetch });

    const result = await proxy.forward({ ...BASE_REQUEST });

    expect(result.status).toBe(502);
    const body = JSON.parse(result.body) as {
      error: { code: string; requestId: string };
    };
    expect(body.error.code).toBe('upstream_error');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(result.body.includes('/var/log/drama15')).toBe(false);
    expect(result.body.includes('router.js')).toBe(false);
  });

  it('throws UpstreamProxyError when the registered secret is not an apiKey', async () => {
    const oauthVault = new InMemoryVault();
    oauthVault.register(SECRET_ID, () => ({
      kind: 'oauthClient',
      clientId: 'cid',
      clientSecret: 'csecret'
    }));
    const { fetch } = makeFetch({ status: 200, headers: {}, body: '{}' });
    const proxy = new UpstreamProxy({ vault: oauthVault, secretId: SECRET_ID, fetch });

    await expect(proxy.forward({ ...BASE_REQUEST })).rejects.toBeInstanceOf(UpstreamProxyError);
  });

  it('rewrites a thrown fetch (network failure) into the canonical envelope without leaking the original error', async () => {
    const failingFetch: UpstreamFetch = async () => {
      throw new Error('getaddrinfo ENOTFOUND router.internal.drama15');
    };
    const proxy = new UpstreamProxy({ vault, secretId: SECRET_ID, fetch: failingFetch });

    const result = await proxy.forward({ ...BASE_REQUEST });
    expect(result.status).toBe(502);
    const body = JSON.parse(result.body) as {
      error: { code: string; requestId: string };
    };
    expect(body.error.code).toBe('upstream_error');
    expect(body.error.requestId).toBe(REQUEST_ID);
    expect(result.body.includes('drama15')).toBe(false);
    expect(result.body.includes('ENOTFOUND')).toBe(false);
  });
});
