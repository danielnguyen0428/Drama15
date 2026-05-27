import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import {
  composeRoutes,
  type ComposeRoutesOptions,
  type GatewayDependencies,
  type RouteClassification,
  type RouteClassifier,
  type RoutePluginRegistration
} from '../../src/gateway/composeRoutes.js';

import type { AccessTokenClaims } from '@drama15/contracts';
import type { PlanState } from '@drama15/contracts';

// ---------------------------------------------------------------------------
// Helpers — minimal fakes for the middleware dependencies
// ---------------------------------------------------------------------------

const ALLOWED_ORIGIN = 'https://app.drama15.test';
const DISALLOWED_ORIGIN = 'https://evil.example.com';

/** Fake user claims for a regular (non-admin) authenticated user. */
const USER_CLAIMS: AccessTokenClaims = {
  sub: 'user-001',
  email: 'user@example.com',
  fp: 'fp-hash-abc',
  sid: 'session-001',
  epoch: 1,
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
  kid: 'key-1'
};

/** Fake user claims for an admin user. */
const ADMIN_CLAIMS: AccessTokenClaims & { role: string } = {
  ...USER_CLAIMS,
  sub: 'admin-001',
  email: 'admin@example.com',
  role: 'admin'
};

/** Active plan state returned by the authz mock. */
const ACTIVE_PLAN: PlanState = {
  userId: 'user-001',
  plan: 'Free_Plan',
  status: 'active'
};

/**
 * Build a minimal `GatewayDependencies` bundle with controllable
 * behaviour. The `jwtVerifyResult` option controls what the JWT
 * middleware returns — `null` means it throws (simulating an invalid
 * token), otherwise it resolves with the supplied claims.
 */
function buildDeps(overrides?: {
  jwtVerifyResult?: AccessTokenClaims | null;
}): GatewayDependencies {
  const jwtResult = overrides?.jwtVerifyResult ?? null;

  return {
    cors: {
      evaluate(input) {
        const isPreflight = input.method === 'OPTIONS';
        const origin = input.originHeader;

        if (isPreflight) {
          if (origin === ALLOWED_ORIGIN) {
            return {
              type: 'preflight',
              status: 204,
              headers: {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
                'Access-Control-Allow-Headers': 'authorization, content-type, x-client-integrity',
                'Access-Control-Max-Age': '600',
                Vary: 'Origin'
              }
            };
          }
          return { type: 'reject', headers: {}, status: 403 };
        }

        if (origin === undefined) {
          return { type: 'simple', headers: {} };
        }

        if (origin === ALLOWED_ORIGIN) {
          return {
            type: 'simple',
            headers: {
              'Access-Control-Allow-Origin': origin,
              'Access-Control-Allow-Credentials': 'true',
              Vary: 'Origin'
            }
          };
        }

        return { type: 'reject', headers: {}, status: 403 };
      }
    },

    jwtAuth: {
      async verify(_args) {
        if (jwtResult === null) {
          // Simulate the UnauthenticatedError the real middleware throws.
          const err = new Error('unauthenticated');
          (err as unknown as { code: string }).code = 'unauthenticated';
          (err as unknown as { reason: string }).reason = 'missing_token';
          err.name = 'UnauthenticatedError';
          throw err;
        }
        return jwtResult;
      }
    },

    // Skip client integrity for these integration tests — it's not the
    // focus and would add noise. Production wiring supplies one.
    clientIntegrity: undefined,

    authz: {
      async loadPlanState(_userId) {
        return ACTIVE_PLAN;
      },
      assertActiveLicense(state) {
        if (state.status !== 'active') {
          const err = new Error(`plan status is ${state.status}`);
          (err as unknown as { code: string }).code = 'license_not_active';
          err.name = 'AuthzError';
          throw err;
        }
      }
    },

    // Skip rate limiter for these tests.
    rpm: undefined,

    auditLogger: {
      async recordEvent(_eventType, _details) {
        // no-op for tests
      }
    },

    classifier: buildClassifier(),

    computeFingerprint(_req) {
      return 'fp-hash-abc';
    }
  };
}

/**
 * Simple classifier that marks `/healthz` and `/auth/*` as public,
 * `/admin/*` as admin, and everything else as protected.
 */
function buildClassifier(): RouteClassifier {
  return (method: string, url: string): RouteClassification => {
    // Strip query string for classification
    const path = url.split('?')[0] ?? url;
    if (path === '/healthz' || path.startsWith('/auth/')) return 'public';
    if (path.startsWith('/admin/')) return 'admin';
    return 'protected';
  };
}

/**
 * Build a Fastify app with the gateway composition wired up, including
 * a public route, a protected route, and an admin route for testing.
 */
async function buildTestApp(depsOverrides?: Parameters<typeof buildDeps>[0]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const deps = buildDeps(depsOverrides);

  // Register test routes as route plugins
  const routes: RoutePluginRegistration[] = [
    {
      name: 'test.public',
      classification: 'public',
      register: async (instance) => {
        instance.get('/healthz', async () => ({ status: 'ok' }));
        instance.get('/auth/start', async () => ({ url: 'https://accounts.google.com' }));
      }
    },
    {
      name: 'test.protected',
      classification: 'protected',
      register: async (instance) => {
        instance.post('/stories', async (request) => ({
          created: true,
          userId: request.auth?.sub
        }));
      }
    },
    {
      name: 'test.admin',
      classification: 'admin',
      register: async (instance) => {
        instance.get('/admin/users', async (request) => ({
          users: [],
          callerRole: request.auth?.role
        }));
      }
    }
  ];

  const options: ComposeRoutesOptions = {
    dependencies: deps,
    routes
  };

  await composeRoutes(app, options);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('composeRoutes — end-to-end gateway wiring (Requirements 12.1, 17.4)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('public route is reachable without authentication', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'GET',
      url: '/healthz'
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('protected route returns 401 without a JWT', async () => {
    // jwtVerifyResult = null means the JWT middleware throws
    app = await buildTestApp({ jwtVerifyResult: null });

    const res = await app.inject({
      method: 'POST',
      url: '/stories',
      headers: {
        origin: ALLOWED_ORIGIN,
        'content-type': 'application/json'
      },
      payload: { title: 'Test Story' }
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('unauthenticated');
  });

  it('admin route returns 403 when caller has a valid JWT but no admin role', async () => {
    // Regular user claims — no `role` field
    app = await buildTestApp({ jwtVerifyResult: USER_CLAIMS });

    const res = await app.inject({
      method: 'GET',
      url: '/admin/users',
      headers: {
        origin: ALLOWED_ORIGIN,
        authorization: 'Bearer fake-token'
      }
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('forbidden');
    expect(body.error.message).toMatch(/admin/i);
  });

  it('CORS preflight from a non-allowlisted origin returns 403', async () => {
    app = await buildTestApp();

    const res = await app.inject({
      method: 'OPTIONS',
      url: '/stories',
      headers: {
        origin: DISALLOWED_ORIGIN,
        'access-control-request-method': 'POST'
      }
    });

    expect(res.statusCode).toBe(403);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('forbidden');
    // Must NOT leak CORS headers to a disallowed origin
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
