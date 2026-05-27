/**
 * Integration test: full auth → story → voice → export flow.
 *
 * Validates: Requirements 1.5, 6.4, 9.4, 11.2.
 *
 * Boots the composed gateway (`composeRoutes`) with in-memory fakes for
 * all adapters and exercises:
 *   1. Happy path: authenticate → create story → create voice → export PDF.
 *   2. Revoked-license rejection: after revoking the plan, any protected
 *      route returns 403 `license_not_active`.
 *
 * Uses `app.inject(...)` for all requests (no real network listener).
 */

import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import type { AccessTokenClaims, PlanState } from '@drama15/contracts';

import {
  composeRoutes,
  type ComposeRoutesOptions,
  type GatewayDependencies,
  type RouteClassification,
  type RouteClassifier,
  type RoutePluginRegistration
} from '../../src/gateway/composeRoutes.js';
import { TokenService } from '../../src/auth/tokens/tokenService.js';
import { JwksKeyset } from '../../src/auth/tokens/keyset.js';
import type { TokenSigningKey } from '../../src/auth/tokens/types.js';
import {
  JwtAuthMiddleware,
  InMemoryEpochCache
} from '../../src/gateway/jwtAuth.js';
import {
  AuthzError,
  ServerAuthorityAuthzMiddleware
} from '../../src/gateway/authz.js';
import { createStoriesRoutePlugin } from '../../src/stories/route.js';
import { createVoiceRoutePlugin } from '../../src/voice/createVoice.js';
import { createExportRoutePlugin } from '../../src/export/route.js';

// ---------------------------------------------------------------------------
// Shared RSA key pair (generated once per test file for speed)
// ---------------------------------------------------------------------------

const TEST_KEY: TokenSigningKey = (() => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  return {
    kid: 'integration-key-1',
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }) as string
  };
})();

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-integration-001';
const TEST_EMAIL = 'integration@example.com';
const TEST_FINGERPRINT = 'fp-integration-hash';
const TEST_SESSION_ID = 'session-integration-001';

/** Mutable plan state — tests can revoke it mid-flow. */
let currentPlanState: PlanState = {
  userId: TEST_USER_ID,
  plan: 'Paid_Plan',
  status: 'active',
  paidStartAt: new Date().toISOString(),
  paidExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  paidCycleId: 'cycle-001'
};

/** In-memory story store. */
const storyStore = new Map<string, {
  id: string;
  userId: string;
  mode: string;
  chapters: Array<{ index: number; status: string; content: string }>;
}>();

/** In-memory voice jobs store. */
const voiceJobStore = new Map<string, {
  voiceJobId: string;
  storyId: string;
  userId: string;
}>();

/** In-memory object storage. */
const objectStore = new Map<string, Uint8Array>();

// ---------------------------------------------------------------------------
// Fake implementations
// ---------------------------------------------------------------------------

function fakeLicenseDb() {
  return {
    getPlanState: async (userId: string, _tx: unknown): Promise<PlanState | null> => {
      if (userId === TEST_USER_ID) return currentPlanState;
      return null;
    }
  };
}

function fakeStoryJobsDb() {
  return {
    insertStoryJob: async (input: {
      userId: string;
      mode: string;
      language: string;
      config: unknown;
      niche?: string | null;
      automationJobId?: string | null;
    }) => {
      const storyId = randomUUID();
      const chapters = Array.from({ length: 10 }, (_, i) => ({
        index: i + 1,
        status: 'done',
        content: `Chapter ${i + 1} content for story ${storyId}`
      }));
      storyStore.set(storyId, {
        id: storyId,
        userId: input.userId,
        mode: input.mode,
        chapters
      });
      return { storyId, createdAt: new Date().toISOString() };
    }
  };
}

function fakeDailyQuota() {
  return {
    consumeFreeChapter: async () => ({
      allowed: true,
      remaining: 2
    })
  };
}

function fakePaidCycleQuota() {
  return {
    reserve: async () => ({
      allowed: true,
      remaining: 19
    }),
    rollback: async () => {}
  };
}

function fakeVoiceJobsDb() {
  return {
    insertVoiceJob: async (input: {
      userId: string;
      storyId: string;
      voiceId: string;
      speed?: number;
      pitch?: number;
    }) => {
      const voiceJobId = randomUUID();
      voiceJobStore.set(voiceJobId, {
        voiceJobId,
        storyId: input.storyId,
        userId: input.userId
      });
      return { voiceJobId, createdAt: new Date().toISOString() };
    }
  };
}

function fakeStoryOwnerLookup() {
  return {
    getStory: async (storyId: string) => {
      const story = storyStore.get(storyId);
      if (!story) return null;
      return {
        userId: story.userId,
        chapters: story.chapters.map((c) => ({ status: c.status }))
      };
    }
  };
}

function fakeHistoryDb() {
  return {
    listStoriesByUser: async (userId: string) => {
      const items: Array<{
        id: string;
        title: string | null;
        createdAt: string;
        status: string;
      }> = [];
      for (const [, story] of storyStore) {
        if (story.userId === userId) {
          items.push({
            id: story.id,
            title: null,
            createdAt: new Date().toISOString(),
            status: 'completed'
          });
        }
      }
      return items;
    },
    getStoryDetail: async (storyId: string) => {
      const story = storyStore.get(storyId);
      if (!story) return null;
      return {
        id: story.id,
        userId: story.userId,
        title: 'Test Story',
        overview: 'Test overview',
        plan: null,
        chapters: story.chapters.map((c) => ({
          storyId: story.id,
          index: c.index,
          status: c.status as 'done',
          content: c.content,
          updatedAt: new Date().toISOString()
        })),
        status: 'completed' as const,
        createdAt: new Date().toISOString()
      };
    }
  };
}

function fakeObjectStorage() {
  return {
    putExport: async (input: {
      userId: string;
      storyId: string;
      kind: string;
      body: Uint8Array;
    }) => {
      const ext = input.kind === 'pdf' ? 'pdf' : 'zip';
      const key = `users/${input.userId}/exports/${input.storyId}.${ext}`;
      objectStore.set(key, input.body);
      return { key };
    },
    signGet: async (input: {
      key: string;
      ttlSeconds: number;
      requesterUserId: string;
    }) => {
      const expectedPrefix = `users/${input.requesterUserId}/`;
      if (!input.key.startsWith(expectedPrefix)) {
        throw new Error('ownership mismatch');
      }
      if (input.ttlSeconds > 3600) {
        throw new Error('TTL exceeds max');
      }
      const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000);
      return {
        url: `https://storage.example.com/signed/${input.key}?expires=${expiresAt.toISOString()}`,
        expiresAt
      };
    }
  };
}

function fakeAuditLogger() {
  return {
    async recordEvent(_eventType: string, _details?: unknown) {
      // no-op
    }
  };
}

// ---------------------------------------------------------------------------
// Token issuance helper
// ---------------------------------------------------------------------------

const keyset = new JwksKeyset({ keys: [TEST_KEY] });

const tokenService = new TokenService({
  keyset,
  db: {
    insertRefreshToken: async (input) => ({ id: input.id })
  } as any,
  clock: () => new Date(),
  issuer: 'https://api.drama15.example'
});

async function issueTestToken(): Promise<string> {
  const result = await tokenService.issue({
    userId: TEST_USER_ID,
    email: TEST_EMAIL,
    sessionId: TEST_SESSION_ID,
    fingerprint: TEST_FINGERPRINT,
    epoch: 1
  });
  return result.accessToken;
}

// ---------------------------------------------------------------------------
// Route classifier
// ---------------------------------------------------------------------------

function buildClassifier(): RouteClassifier {
  return (_method: string, url: string): RouteClassification => {
    const path = url.split('?')[0] ?? url;
    if (path === '/healthz' || path.startsWith('/auth/')) return 'public';
    if (path.startsWith('/admin/')) return 'admin';
    return 'protected';
  };
}

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

async function buildIntegrationApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  const licenseDb = fakeLicenseDb();
  const authz = new ServerAuthorityAuthzMiddleware({ licenseDb });

  const jwtAuth = new JwtAuthMiddleware({
    tokenService: tokenService,
    epochCache: new InMemoryEpochCache(),
    epochSource: { getCurrentEpoch: async (_userId: string) => 1 }
  });

  const deps: GatewayDependencies = {
    cors: {
      evaluate(input) {
        // Allow all origins for integration tests
        if (input.method === 'OPTIONS') {
          return {
            type: 'preflight' as const,
            status: 204,
            headers: {
              'Access-Control-Allow-Origin': input.originHeader ?? '*',
              'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
              'Access-Control-Allow-Headers': 'authorization, content-type',
              'Access-Control-Max-Age': '600'
            }
          };
        }
        return { type: 'simple' as const, headers: {} };
      }
    },
    jwtAuth,
    clientIntegrity: undefined, // Skip for integration tests
    authz,
    rpm: undefined, // Skip rate limiting for integration tests
    auditLogger: fakeAuditLogger(),
    classifier: buildClassifier(),
    computeFingerprint: () => TEST_FINGERPRINT
  };

  const routes: RoutePluginRegistration[] = [
    {
      name: 'stories.create',
      classification: 'protected',
      register: async (instance) => {
        await instance.register(createStoriesRoutePlugin, {
          licenseDb,
          storyJobsDb: fakeStoryJobsDb(),
          dailyQuota: fakeDailyQuota(),
          paidCycleQuota: fakePaidCycleQuota(),
          extractUserId: (req) => req.auth?.sub ?? null
        });
      }
    },
    {
      name: 'voice.create',
      classification: 'protected',
      register: async (instance) => {
        await instance.register(createVoiceRoutePlugin, {
          licenseDb,
          authz,
          storyOwnerLookup: fakeStoryOwnerLookup(),
          paidCycleQuota: fakePaidCycleQuota(),
          voiceJobsDb: fakeVoiceJobsDb(),
          getCallerIdentity: (req) => {
            if (req.auth?.sub) return { id: req.auth.sub, role: req.auth.role };
            return null;
          }
        });
      }
    },
    {
      name: 'export',
      classification: 'protected',
      register: async (instance) => {
        await instance.register(createExportRoutePlugin, {
          historyDb: fakeHistoryDb(),
          authz,
          objectStorage: fakeObjectStorage() as any,
          getCallerIdentity: (req) => {
            if (req.auth?.sub && req.auth?.email) {
              return { id: req.auth.sub, email: req.auth.email, role: req.auth.role };
            }
            return null;
          }
        });
      }
    }
  ];

  await composeRoutes(app, { dependencies: deps, routes });
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Integration: auth → story → voice → export (Requirements 1.5, 6.4, 9.4, 11.2)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    // Reset state
    storyStore.clear();
    voiceJobStore.clear();
    objectStore.clear();
    currentPlanState = {
      userId: TEST_USER_ID,
      plan: 'Paid_Plan',
      status: 'active',
      paidStartAt: new Date().toISOString(),
      paidExpireAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      paidCycleId: 'cycle-001'
    };
  });

  describe('Happy path', () => {
    it('full flow: authenticate → create story → create voice → export PDF', async () => {
      app = await buildIntegrationApp();

      // Step 1: Issue a valid JWT (Requirement 1.5)
      const token = await issueTestToken();
      expect(token).toBeTruthy();

      // Step 2: Create a story with mode 'full' → 201 with storyId (Requirement 6.4)
      const storyRes = await app.inject({
        method: 'POST',
        url: '/stories',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: {
          mode: 'full',
          config: {
            outputLanguage: 'vi',
            niche: 'tình yêu tỷ phú'
          },
          fingerprint: TEST_FINGERPRINT
        }
      });

      expect(storyRes.statusCode).toBe(201);
      const storyBody = storyRes.json();
      expect(storyBody.storyId).toBeDefined();
      expect(typeof storyBody.storyId).toBe('string');
      const storyId = storyBody.storyId;

      // Step 3: Create voice → 201 with voiceJobId (Requirement 9.4)
      // The fake story has 10 done chapters, so the precondition is met
      const voiceRes = await app.inject({
        method: 'POST',
        url: `/stories/${storyId}/voice`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: {
          voiceId: 'voice-en-male-01',
          speed: 1.0,
          pitch: 0
        }
      });

      expect(voiceRes.statusCode).toBe(201);
      const voiceBody = voiceRes.json();
      expect(voiceBody.voiceJobId).toBeDefined();
      expect(typeof voiceBody.voiceJobId).toBe('string');

      // Step 4: Export PDF → 200 with { url, expiresAt } (Requirement 11.2)
      const exportRes = await app.inject({
        method: 'POST',
        url: `/stories/${storyId}/export/pdf`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(exportRes.statusCode).toBe(200);
      const exportBody = exportRes.json();
      expect(exportBody.url).toBeDefined();
      expect(typeof exportBody.url).toBe('string');
      expect(exportBody.expiresAt).toBeDefined();
      // Verify the signed URL expires within 60 minutes (Requirement 11.2)
      const expiresAt = new Date(exportBody.expiresAt);
      const now = new Date();
      const diffMs = expiresAt.getTime() - now.getTime();
      expect(diffMs).toBeGreaterThan(0);
      expect(diffMs).toBeLessThanOrEqual(3600 * 1000 + 5000); // 60 min + small tolerance
    });
  });

  describe('Revoked-license rejection', () => {
    it('returns 403 license_not_active on any protected route after plan revocation', async () => {
      app = await buildIntegrationApp();

      // First, verify the token works while plan is active
      const token = await issueTestToken();

      const storyRes = await app.inject({
        method: 'POST',
        url: '/stories',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: {
          mode: 'full',
          config: { outputLanguage: 'vi', niche: 'custom' },
          fingerprint: TEST_FINGERPRINT
        }
      });
      expect(storyRes.statusCode).toBe(201);

      // Now revoke the plan in the fake LicenseDb
      currentPlanState = {
        userId: TEST_USER_ID,
        plan: 'Free_Plan',
        status: 'revoked',
        paidStartAt: undefined,
        paidExpireAt: undefined,
        paidCycleId: undefined
      };

      // Any protected route should now return 403 license_not_active
      const rejectedStoryRes = await app.inject({
        method: 'POST',
        url: '/stories',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: {
          mode: 'full',
          config: { outputLanguage: 'vi', niche: 'custom' },
          fingerprint: TEST_FINGERPRINT
        }
      });

      expect(rejectedStoryRes.statusCode).toBe(403);
      const rejectedBody = rejectedStoryRes.json();
      expect(rejectedBody.error).toBeDefined();
      expect(rejectedBody.error.code).toBe('license_not_active');
    });

    it('voice endpoint returns 403 license_not_active after revocation', async () => {
      app = await buildIntegrationApp();
      const token = await issueTestToken();

      // Create a story first while plan is active
      const storyRes = await app.inject({
        method: 'POST',
        url: '/stories',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: {
          mode: 'full',
          config: { outputLanguage: 'en', niche: 'custom' },
          fingerprint: TEST_FINGERPRINT
        }
      });
      expect(storyRes.statusCode).toBe(201);
      const storyId = storyRes.json().storyId;

      // Revoke the plan
      currentPlanState = {
        userId: TEST_USER_ID,
        plan: 'Free_Plan',
        status: 'revoked',
        paidStartAt: undefined,
        paidExpireAt: undefined,
        paidCycleId: undefined
      };

      // Voice endpoint should reject
      const voiceRes = await app.inject({
        method: 'POST',
        url: `/stories/${storyId}/voice`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: { voiceId: 'voice-en-male-01' }
      });

      expect(voiceRes.statusCode).toBe(403);
      const voiceBody = voiceRes.json();
      expect(voiceBody.error).toBeDefined();
      expect(voiceBody.error.code).toBe('license_not_active');
    });

    it('export endpoint returns 403 license_not_active after revocation', async () => {
      app = await buildIntegrationApp();
      const token = await issueTestToken();

      // Create a story first while plan is active
      const storyRes = await app.inject({
        method: 'POST',
        url: '/stories',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json'
        },
        payload: {
          mode: 'full',
          config: { outputLanguage: 'en', niche: 'custom' },
          fingerprint: TEST_FINGERPRINT
        }
      });
      expect(storyRes.statusCode).toBe(201);
      const storyId = storyRes.json().storyId;

      // Revoke the plan
      currentPlanState = {
        userId: TEST_USER_ID,
        plan: 'Free_Plan',
        status: 'revoked',
        paidStartAt: undefined,
        paidExpireAt: undefined,
        paidCycleId: undefined
      };

      // Export endpoint should reject
      const exportRes = await app.inject({
        method: 'POST',
        url: `/stories/${storyId}/export/pdf`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(exportRes.statusCode).toBe(403);
      const exportBody = exportRes.json();
      expect(exportBody.error).toBeDefined();
      expect(exportBody.error.code).toBe('license_not_active');
    });
  });
});
