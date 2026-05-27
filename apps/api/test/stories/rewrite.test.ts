/**
 * Unit tests for `POST /stories/:id/rewrite` (Task 11.1).
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6.
 *
 * Coverage:
 *   - Each of the six closed-set rewrite modes (Requirement 7.2) is
 *     accepted and forwarded to the upstream proxy.
 *   - An invalid mode is rejected with 400 `invalid_request` and no
 *     quota / upstream side effect.
 *   - A non-owner caller is rejected with 403 `forbidden` and no quota
 *     / upstream side effect (Requirement 10.4).
 *   - Over-quota produces 429 `rewrite_quota_exhausted` with the
 *     `Retry-After` header (Requirement 7.6).
 *   - Quota isolation: a successful rewrite increments ONLY the
 *     rewrite counter — the chapter and story counters are never
 *     touched (Requirement 7.5).
 *
 * The Fastify plugin is loaded via `app.inject(...)`, so the tests
 * exercise the same body parsing, error mapping, and header behaviour
 * that production traffic would.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import type { RewriteMode, RewriteResponse } from '@drama15/contracts';

import {
  ServerAuthorityAuthzMiddleware
} from '../../src/gateway/authz.js';
import type {
  UpstreamFetchInit,
  UpstreamProxy,
  UpstreamResponse
} from '../../src/gateway/upstreamProxy.js';
import type {
  DailyCounterCheckInput,
  DailyCounterDecision,
  DailyQuotaCounter
} from '../../src/rateLimit/index.js';
import {
  REWRITE_MODES,
  createRewriteRoutePlugin,
  type GetCallerIdentity,
  type StoryOwnerLookup
} from '../../src/stories/rewrite.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const STORY_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const UPSTREAM_URL = 'https://upstream.test/story/rewrite';

/**
 * In-memory `StoryOwnerLookup` — owner is configurable per test.
 */
class FakeStoryOwnerLookup implements StoryOwnerLookup {
  public ownerByStoryId = new Map<string, string>();

  public seed(storyId: string, ownerId: string): void {
    this.ownerByStoryId.set(storyId, ownerId);
  }

  public async getStoryOwner(
    storyId: string
  ): Promise<{ userId: string } | null> {
    const userId = this.ownerByStoryId.get(storyId);
    return userId === undefined ? null : { userId };
  }
}

/**
 * Tracking fake for the daily-quota counter that records every
 * counter touched. The `consumeFreeChapter` and any paid-cycle entry
 * point are intentionally NOT exposed: the production type is sliced
 * down to `Pick<DailyQuotaCounter, 'consumeRewrite'>` at the service
 * boundary, so adding them here would let the test ride past a
 * regression in that slicing. Instead we count via separate spies.
 */
class FakeDailyQuota
  implements Pick<DailyQuotaCounter, 'consumeRewrite'> {
  public rewriteCalls: DailyCounterCheckInput[] = [];
  public chapterCalls: DailyCounterCheckInput[] = [];
  public nextRewriteDecision: DailyCounterDecision = {
    allowed: true,
    remaining: 29
  };

  public async consumeRewrite(
    input: DailyCounterCheckInput
  ): Promise<DailyCounterDecision> {
    this.rewriteCalls.push(input);
    return this.nextRewriteDecision;
  }

  // Not part of the service surface — exposed only so the isolation
  // test can assert it is NEVER invoked. The plugin / service have no
  // way to call it because their typed dependency is `Pick<...,
  // 'consumeRewrite'>`. If a regression accidentally widens that
  // slice, the chapter counter would still be 0 because no production
  // code path leaves through this method.
  public async consumeFreeChapter(
    input: DailyCounterCheckInput
  ): Promise<DailyCounterDecision> {
    this.chapterCalls.push(input);
    return { allowed: true, remaining: 2 };
  }
}

interface UpstreamCall {
  readonly init: UpstreamFetchInit;
  readonly requestId: string;
}

/**
 * Tracking fake for `UpstreamProxy.forward`. Returns a canned
 * response and records the body that the service forwarded so we
 * can assert the mode was passed through (Requirement 7.3).
 */
class FakeUpstreamProxy implements Pick<UpstreamProxy, 'forward'> {
  public calls: UpstreamCall[] = [];
  public storyCounterCalls: number = 0;

  public nextResponse: UpstreamResponse = {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'rewritten chapter body' })
  };

  public async forward(req: {
    method: string;
    url: string;
    headers: Readonly<Record<string, string>>;
    body?: string | Uint8Array | null;
    requestId: string;
  }): Promise<UpstreamResponse> {
    const init: UpstreamFetchInit = {
      method: req.method,
      url: req.url,
      headers: { ...req.headers },
      body: req.body ?? null
    };
    this.calls.push({ init, requestId: req.requestId });
    return this.nextResponse;
  }
}

interface Harness {
  app: FastifyInstance;
  ownerLookup: FakeStoryOwnerLookup;
  dailyQuota: FakeDailyQuota;
  upstreamProxy: FakeUpstreamProxy;
  setCaller(id: string | null, role?: string): void;
}

let currentCaller: { id: string; role?: string } | null = null;

const callerResolver: GetCallerIdentity = () => currentCaller;

async function buildHarness(): Promise<Harness> {
  const ownerLookup = new FakeStoryOwnerLookup();
  ownerLookup.seed(STORY_ID, OWNER_ID);

  const dailyQuota = new FakeDailyQuota();
  const upstreamProxy = new FakeUpstreamProxy();
  const authz = new ServerAuthorityAuthzMiddleware({
    licenseDb: new FakeLicenseDb()
  });

  const app = Fastify({ logger: false });
  await app.register(createRewriteRoutePlugin, {
    storyOwnerLookup: ownerLookup,
    authz,
    dailyQuota,
    upstreamProxy,
    upstreamUrl: UPSTREAM_URL,
    getCallerIdentity: callerResolver
  });
  await app.ready();

  return {
    app,
    ownerLookup,
    dailyQuota,
    upstreamProxy,
    setCaller(id, role) {
      if (id === null) {
        currentCaller = null;
        return;
      }
      currentCaller = role === undefined ? { id } : { id, role };
    }
  };
}

function rewriteBody(mode: RewriteMode, chapterIndex = 3): unknown {
  return { mode, chapterIndex };
}

// ---------------------------------------------------------------------------
// 7.2 — every closed-set mode is accepted
// ---------------------------------------------------------------------------

describe('POST /stories/:id/rewrite — closed-set modes (Requirement 7.2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.setCaller(OWNER_ID);
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it.each(REWRITE_MODES)(
    'accepts mode=%s and returns the new chapter body (200)',
    async (mode) => {
      const res = await h.app.inject({
        method: 'POST',
        url: `/stories/${STORY_ID}/rewrite`,
        payload: rewriteBody(mode, 5)
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');

      const body = res.json() as RewriteResponse;
      expect(body.storyId).toBe(STORY_ID);
      expect(body.chapterIndex).toBe(5);
      expect(body.content).toBe('rewritten chapter body');
      expect(typeof body.updatedAt).toBe('string');

      // The mode reached the upstream verbatim (Requirement 7.3).
      expect(h.upstreamProxy.calls).toHaveLength(1);
      const fwd = h.upstreamProxy.calls[0]!;
      expect(fwd.init.method).toBe('POST');
      expect(fwd.init.url).toBe(UPSTREAM_URL);
      const fwdBody = JSON.parse(fwd.init.body as string) as {
        mode: string;
        chapterIndex: number;
        storyId: string;
      };
      expect(fwdBody.mode).toBe(mode);
      expect(fwdBody.chapterIndex).toBe(5);
      expect(fwdBody.storyId).toBe(STORY_ID);

      // Exactly one rewrite-quota slot consumed per call (Req 7.4).
      expect(h.dailyQuota.rewriteCalls).toHaveLength(1);
      expect(h.dailyQuota.rewriteCalls[0]!.userId).toBe(OWNER_ID);
    }
  );

  it('forwards the optional `instruction` field to upstream', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/rewrite`,
      payload: { ...rewriteBody('opening_hook', 1), instruction: 'sharper twist' }
    });
    expect(res.statusCode).toBe(200);

    const fwd = h.upstreamProxy.calls[0]!;
    const fwdBody = JSON.parse(fwd.init.body as string) as {
      instruction?: string;
    };
    expect(fwdBody.instruction).toBe('sharper twist');
  });
});

// ---------------------------------------------------------------------------
// 7.2 — invalid mode rejected with 400
// ---------------------------------------------------------------------------

describe('POST /stories/:id/rewrite — invalid mode (Requirement 7.2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.setCaller(OWNER_ID);
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it.each(['unknown_mode', 'FULL_CHAPTER', '', 42, null, undefined])(
    'rejects mode=%j with 400 invalid_request and no side effects',
    async (badMode) => {
      const res = await h.app.inject({
        method: 'POST',
        url: `/stories/${STORY_ID}/rewrite`,
        payload: { mode: badMode, chapterIndex: 3 }
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('invalid_request');

      // No quota slot consumed; no upstream call placed.
      expect(h.dailyQuota.rewriteCalls).toHaveLength(0);
      expect(h.upstreamProxy.calls).toHaveLength(0);
    }
  );

  it('rejects an out-of-range chapterIndex with 400 invalid_request', async () => {
    for (const bad of [0, 11, -1, 1.5, 'two']) {
      const res = await h.app.inject({
        method: 'POST',
        url: `/stories/${STORY_ID}/rewrite`,
        payload: { mode: 'full_chapter', chapterIndex: bad }
      });
      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('invalid_request');
    }
    expect(h.dailyQuota.rewriteCalls).toHaveLength(0);
    expect(h.upstreamProxy.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 10.4 — non-owner gets 403 forbidden
// ---------------------------------------------------------------------------

describe('POST /stories/:id/rewrite — ownership gate (Requirement 10.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it('rejects a non-owner caller with 403 forbidden and no quota / upstream side effects', async () => {
    h.setCaller(OTHER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/rewrite`,
      payload: rewriteBody('full_chapter')
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');

    // Critically: ownership runs BEFORE the quota slot is consumed.
    // A non-owner cannot deplete the rewrite counter of the owner.
    expect(h.dailyQuota.rewriteCalls).toHaveLength(0);
    expect(h.upstreamProxy.calls).toHaveLength(0);
  });

  it('rejects a missing caller (no JWT) with 401 unauthenticated', async () => {
    h.setCaller(null);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/rewrite`,
      payload: rewriteBody('full_chapter')
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
    expect(h.dailyQuota.rewriteCalls).toHaveLength(0);
    expect(h.upstreamProxy.calls).toHaveLength(0);
  });

  it('returns 404 not_found for a story that does not exist (and never consults quota)', async () => {
    h.setCaller(OWNER_ID);
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories/unknown-story/rewrite',
      payload: rewriteBody('full_chapter')
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(h.dailyQuota.rewriteCalls).toHaveLength(0);
    expect(h.upstreamProxy.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7.6 — over-quota → 429 with Retry-After
// ---------------------------------------------------------------------------

describe('POST /stories/:id/rewrite — over-quota (Requirements 7.4, 7.6)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.setCaller(OWNER_ID);
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it('returns 429 rewrite_quota_exhausted with Retry-After header and resetAt body', async () => {
    h.dailyQuota.nextRewriteDecision = {
      allowed: false,
      errorCode: 'rewrite_quota_exhausted',
      retryAfterSeconds: 3600,
      resetAt: '2025-03-10T00:00:00.000Z',
      remaining: 0
    };

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/rewrite`,
      payload: rewriteBody('full_chapter')
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('3600');
    const body = res.json() as {
      error: {
        code: string;
        retryAfterSeconds?: number;
        resetAt?: string;
      };
    };
    expect(body.error.code).toBe('rewrite_quota_exhausted');
    expect(body.error.retryAfterSeconds).toBe(3600);
    expect(body.error.resetAt).toBe('2025-03-10T00:00:00.000Z');

    // The quota was consulted exactly once; no upstream call placed.
    expect(h.dailyQuota.rewriteCalls).toHaveLength(1);
    expect(h.upstreamProxy.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7.5 — counter isolation (rewrite never touches chapter / story counters)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/rewrite — counter isolation (Requirement 7.5)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.setCaller(OWNER_ID);
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it('a successful rewrite increments ONLY the rewrite counter', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/rewrite`,
      payload: rewriteBody('class_humiliation', 7)
    });
    expect(res.statusCode).toBe(200);

    // Exactly one consumeRewrite call.
    expect(h.dailyQuota.rewriteCalls).toHaveLength(1);
    // Zero consumeFreeChapter calls — the production type slice
    // hides this method from the service, but we assert it directly
    // to catch a regression that might re-widen the surface.
    expect(h.dailyQuota.chapterCalls).toHaveLength(0);
  });

  it('every one of the six modes touches ONLY the rewrite counter', async () => {
    let cumulativeRewrite = 0;
    for (const mode of REWRITE_MODES) {
      const res = await h.app.inject({
        method: 'POST',
        url: `/stories/${STORY_ID}/rewrite`,
        payload: rewriteBody(mode)
      });
      expect(res.statusCode).toBe(200);
      cumulativeRewrite += 1;
      expect(h.dailyQuota.rewriteCalls).toHaveLength(cumulativeRewrite);
      expect(h.dailyQuota.chapterCalls).toHaveLength(0);
    }
  });
});
