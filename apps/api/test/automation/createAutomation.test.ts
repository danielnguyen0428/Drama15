/**
 * Unit tests for the `POST /automation` route (Task 12.1).
 *
 * Validates: Requirements 2.10, 8.1, 8.2, 8.3, 8.4.
 *
 * The tests are organised into four scenarios, each tied to one of
 * the requirement bullets in the task brief:
 *
 *   1. Free_Plan → 403 `automation_requires_paid` (Requirements 2.10, 8.2).
 *      No quota reservation, no DB insert.
 *
 *   2. `target_count > 2` → 400 `invalid_request` (Requirement 8.3).
 *      No plan lookup beyond what the body validator demands; no quota
 *      reservation, no DB insert.
 *
 *   3. Pre-flight quota check (`paid_story_quota_used + target_count
 *      > 20`) → 429 `paid_story_quota_exhausted` with `Retry-After`
 *      and `resetAt` (Requirement 8.4). All previously-succeeded
 *      reservations within the same call are rolled back.
 *
 *   4. Success path: Paid_Plan + target_count ∈ [1, 2] + sufficient
 *      quota → 201 with `{ automationJobId, storyJobIds: [...] }`,
 *      one automation_jobs insert + N child story_jobs inserts.
 *
 * The Fastify plugin is loaded via `app.inject(...)` (no real network
 * listener), so the tests exercise the same body parsing, error
 * mapping, and header behaviour that production traffic would.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import type { PlanState, StorySetupConfig } from '@drama15/contracts';

import type { LicenseDb, TxClient } from '../../src/license/db.js';
import type { PaidCycleDecision } from '../../src/rateLimit/index.js';
import {
  AutomationCreationService,
  createAutomationRoutePlugin,
  type AutomationDb,
  type InsertAutomationWithChildrenInput,
  type InsertAutomationWithChildrenResult
} from '../../src/automation/index.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const FREE_USER = 'user-free-1';
const PAID_USER = 'user-paid-1';
const PAID_CYCLE_ID = 'cycle-1';
const PAID_EXPIRE_AT = '2026-01-31T00:00:00.000Z';

class FakeLicenseDb implements Pick<LicenseDb, 'getPlanState'> {
  public readonly rows = new Map<string, PlanState>();
  public readonly calls: string[] = [];

  setPlan(state: PlanState): void {
    this.rows.set(state.userId, state);
  }

  async getPlanState(
    userId: string,
    _tx: TxClient | null
  ): Promise<PlanState | null> {
    this.calls.push(userId);
    return this.rows.get(userId) ?? null;
  }
}

class FakeAutomationDb implements AutomationDb {
  public readonly inserts: InsertAutomationWithChildrenInput[] = [];
  public failNextInsert = false;
  private nextAutomationId = 0;
  private nextStoryId = 0;

  async insertAutomationWithChildren(
    input: InsertAutomationWithChildrenInput
  ): Promise<InsertAutomationWithChildrenResult> {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error('insert failed');
    }
    // Deep-copy the input so caller mutations after the call don't
    // perturb our recorded history.
    this.inserts.push({
      userId: input.userId,
      targetCount: input.targetCount,
      children: input.children.map((c) => ({
        language: c.language,
        niche: c.niche,
        config: { ...c.config }
      }))
    });
    this.nextAutomationId += 1;
    const automationJobId = `auto-${this.nextAutomationId}`;
    const storyJobIds: string[] = [];
    for (let i = 0; i < input.targetCount; i++) {
      this.nextStoryId += 1;
      storyJobIds.push(`story-${this.nextStoryId}`);
    }
    return {
      automationJobId,
      storyJobIds,
      createdAt: '2025-03-09T12:00:00.000Z'
    };
  }
}

interface ReserveCall {
  userId: string;
  paidCycleId: string;
  action: string;
}

interface RollbackCall {
  userId: string;
  paidCycleId: string;
  action: string;
}

class FakePaidCycleQuota {
  public readonly reserveCalls: ReserveCall[] = [];
  public readonly rollbackCalls: RollbackCall[] = [];
  /**
   * Sequential decisions returned by `reserve`. If empty, the default
   * "allowed, 19 remaining" decision is returned for every call.
   */
  public reserveDecisions: PaidCycleDecision[] = [];

  async reserve(input: {
    userId: string;
    paidCycleId: string;
    paidExpireAt: Date;
    action: 'full_story' | 'voice';
  }): Promise<PaidCycleDecision> {
    this.reserveCalls.push({
      userId: input.userId,
      paidCycleId: input.paidCycleId,
      action: input.action
    });
    if (this.reserveDecisions.length > 0) {
      return this.reserveDecisions.shift()!;
    }
    return { allowed: true, remaining: 19 };
  }

  async rollback(input: {
    userId: string;
    paidCycleId: string;
    action: 'full_story' | 'voice';
  }): Promise<void> {
    this.rollbackCalls.push({
      userId: input.userId,
      paidCycleId: input.paidCycleId,
      action: input.action
    });
  }
}

interface Harness {
  app: FastifyInstance;
  licenseDb: FakeLicenseDb;
  automationDb: FakeAutomationDb;
  paidCycleQuota: FakePaidCycleQuota;
  /** Set the resolved userId returned by `extractUserId` for the next request. */
  setUser(userId: string | null): void;
}

async function buildHarness(): Promise<Harness> {
  const licenseDb = new FakeLicenseDb();
  const automationDb = new FakeAutomationDb();
  const paidCycleQuota = new FakePaidCycleQuota();

  let currentUser: string | null = null;

  const app = Fastify({ logger: false });
  await app.register(createAutomationRoutePlugin, {
    licenseDb,
    automationDb,
    paidCycleQuota,
    extractUserId: () => currentUser
  });

  return {
    app,
    licenseDb,
    automationDb,
    paidCycleQuota,
    setUser(userId) {
      currentUser = userId;
    }
  };
}

function freePlan(userId: string): PlanState {
  return { userId, plan: 'Free_Plan', status: 'active' };
}

function paidPlan(userId: string): PlanState {
  return {
    userId,
    plan: 'Paid_Plan',
    status: 'active',
    paidStartAt: '2026-01-01T00:00:00.000Z',
    paidExpireAt: PAID_EXPIRE_AT,
    paidCycleId: PAID_CYCLE_ID
  };
}

function defaultConfig(
  outputLanguage = 'vi',
  niche: string | undefined = 'billionaire'
): StorySetupConfig {
  return {
    outputLanguage,
    ...(niche !== undefined ? { niche } : {})
  } as StorySetupConfig;
}

function bodyAutomation(
  targetCount: number,
  configs?: ReadonlyArray<StorySetupConfig>
): { target_count: number; configs: ReadonlyArray<StorySetupConfig> } {
  const cfgs = configs ?? Array.from({ length: targetCount }, () => defaultConfig());
  return { target_count: targetCount, configs: cfgs };
}

// ---------------------------------------------------------------------------
// 1. Free_Plan → 403 automation_requires_paid (Requirements 2.10, 8.2)
// ---------------------------------------------------------------------------

describe('POST /automation — Free_Plan rejection (Requirements 2.10, 8.2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(freePlan(FREE_USER));
    h.setUser(FREE_USER);
  });

  it('returns 403 automation_requires_paid for a Free_Plan caller', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2)
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('automation_requires_paid');
    // Defence in depth: 403 must not be cached by intermediaries.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('does not touch the paid-cycle counter or insert any rows', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2)
    });

    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
    expect(h.automationDb.inserts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. target_count > 2 → 400 invalid_request (Requirement 8.3)
// ---------------------------------------------------------------------------

describe('POST /automation — target_count cap (Requirement 8.3)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setUser(PAID_USER);
  });

  it('returns 400 invalid_request when target_count is 3', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(3, [
        defaultConfig(),
        defaultConfig(),
        defaultConfig()
      ])
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_request');
    // The message must be specific enough that the Web_Client can
    // surface "max 2 stories per Automation_Job" — not just a generic
    // schema error.
    expect(body.error.message).toMatch(/2/);
  });

  it('rejects target_count > 2 BEFORE any quota reservation or DB insert', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(5, Array.from({ length: 5 }, () => defaultConfig()))
    });

    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
    expect(h.automationDb.inserts).toEqual([]);
  });

  it('rejects target_count of 0 with 400 invalid_request', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: { target_count: 0, configs: [] }
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-integer target_count with 400 invalid_request', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: { target_count: 1.5, configs: [defaultConfig()] }
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 3. Pre-flight quota check → 429 with Retry-After (Requirement 8.4)
// ---------------------------------------------------------------------------

describe('POST /automation — pre-flight quota check (Requirement 8.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setUser(PAID_USER);
  });

  it('returns 429 paid_story_quota_exhausted with Retry-After when the FIRST reservation denies', async () => {
    // Simulates `paid_story_quota_used == 20` already; the very first
    // reservation in the batch flips the counter past the cap.
    h.paidCycleQuota.reserveDecisions = [
      {
        allowed: false,
        errorCode: 'paid_story_quota_exhausted',
        retryAfterSeconds: 86400,
        resetAt: PAID_EXPIRE_AT,
        remaining: 0
      }
    ];

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2)
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('86400');
    const body = res.json() as {
      error: {
        code: string;
        retryAfterSeconds?: number;
        resetAt?: string;
      };
    };
    expect(body.error.code).toBe('paid_story_quota_exhausted');
    expect(body.error.retryAfterSeconds).toBe(86400);
    expect(body.error.resetAt).toBe(PAID_EXPIRE_AT);
    expect(h.automationDb.inserts).toEqual([]);
    // No rollback for the first reservation — it never succeeded.
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
  });

  it('rolls back prior reservations when the SECOND reservation denies (used + target_count > 20)', async () => {
    // Simulates `paid_story_quota_used == 19` and target_count == 2:
    // the first reservation slips through (now used == 20), the
    // second crosses the cap and denies.
    h.paidCycleQuota.reserveDecisions = [
      { allowed: true, remaining: 0 },
      {
        allowed: false,
        errorCode: 'paid_story_quota_exhausted',
        retryAfterSeconds: 3600,
        resetAt: PAID_EXPIRE_AT,
        remaining: 0
      }
    ];

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2)
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('3600');
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('paid_story_quota_exhausted');
    expect(h.automationDb.inserts).toEqual([]);
    // Exactly one rollback for the one reservation that succeeded.
    expect(h.paidCycleQuota.rollbackCalls).toHaveLength(1);
    expect(h.paidCycleQuota.rollbackCalls[0]).toMatchObject({
      userId: PAID_USER,
      paidCycleId: PAID_CYCLE_ID,
      action: 'full_story'
    });
  });

  it('falls back to Retry-After: 60 when the limiter omits retryAfterSeconds', async () => {
    h.paidCycleQuota.reserveDecisions = [
      {
        allowed: false,
        errorCode: 'paid_story_quota_exhausted',
        remaining: 0
      }
    ];

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(1)
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('60');
  });
});

// ---------------------------------------------------------------------------
// 4. Success path → 201 with insert + child rows
// ---------------------------------------------------------------------------

describe('POST /automation — success path (Requirements 8.1, 8.3, 8.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setUser(PAID_USER);
  });

  it('returns 201 with { automationJobId, storyJobIds } and inserts both rows for target_count=2', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2, [
        defaultConfig('vi', 'billionaire'),
        defaultConfig('en', 'social_injustice')
      ])
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      automationJobId: string;
      storyJobIds: string[];
    };
    expect(body.automationJobId).toMatch(/^auto-/);
    expect(body.storyJobIds).toHaveLength(2);
    expect(body.storyJobIds[0]).toMatch(/^story-/);
    expect(body.storyJobIds[1]).toMatch(/^story-/);
    // Cache-Control must be no-store on POST /automation — the response
    // depends on per-request quota state.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('inserts the automation_jobs row with target_count=N and N child story_jobs rows', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2, [
        defaultConfig('vi', 'billionaire'),
        defaultConfig('en', 'social_injustice')
      ])
    });

    expect(h.automationDb.inserts).toHaveLength(1);
    const insert = h.automationDb.inserts[0]!;
    expect(insert.userId).toBe(PAID_USER);
    expect(insert.targetCount).toBe(2);
    expect(insert.children).toHaveLength(2);
    // Each child carries the curated niche key and the verbatim
    // outputLanguage (Requirement 6.12).
    expect(insert.children[0]).toMatchObject({
      language: 'vi',
      niche: 'billionaire'
    });
    expect(insert.children[1]).toMatchObject({
      language: 'en',
      niche: 'social_injustice'
    });
  });

  it('reserves exactly target_count units against the paid cycle and never rolls back on success', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2)
    });

    expect(h.paidCycleQuota.reserveCalls).toHaveLength(2);
    for (const call of h.paidCycleQuota.reserveCalls) {
      expect(call).toMatchObject({
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'full_story'
      });
    }
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
  });

  it('accepts target_count=1 with a single config', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(1, [defaultConfig()])
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      automationJobId: string;
      storyJobIds: string[];
    };
    expect(body.storyJobIds).toHaveLength(1);
    expect(h.paidCycleQuota.reserveCalls).toHaveLength(1);
  });

  it('rolls back ALL reservations when the DB insert fails after a successful pre-flight check', async () => {
    h.automationDb.failNextInsert = true;

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(2)
    });

    expect(res.statusCode).toBe(500);
    expect(h.paidCycleQuota.reserveCalls).toHaveLength(2);
    expect(h.paidCycleQuota.rollbackCalls).toHaveLength(2);
    for (const rb of h.paidCycleQuota.rollbackCalls) {
      expect(rb).toMatchObject({
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'full_story'
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Defensive failure modes
// ---------------------------------------------------------------------------

describe('POST /automation — defensive failure modes', () => {
  it('returns 401 unauthenticated when no user id is resolved', async () => {
    const h = await buildHarness();
    // Do NOT call setUser → extractUserId returns null.
    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(1)
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('returns 403 license_not_active when the Paid_Plan is not active', async () => {
    const h = await buildHarness();
    h.licenseDb.setPlan({
      userId: PAID_USER,
      plan: 'Paid_Plan',
      status: 'expired',
      paidStartAt: '2026-01-01T00:00:00.000Z',
      paidExpireAt: PAID_EXPIRE_AT,
      paidCycleId: PAID_CYCLE_ID
    });
    h.setUser(PAID_USER);

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: bodyAutomation(1)
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('license_not_active');
  });

  it('rejects a missing config with 400 invalid_request', async () => {
    const h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setUser(PAID_USER);

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: { target_count: 1, configs: [{}] }
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_request');
  });

  it('rejects when configs.length does not match target_count', async () => {
    const h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setUser(PAID_USER);

    const res = await h.app.inject({
      method: 'POST',
      url: '/automation',
      payload: { target_count: 2, configs: [defaultConfig()] }
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// AutomationCreationService direct tests (no Fastify)
// ---------------------------------------------------------------------------

describe('AutomationCreationService.createAutomation — direct invocation', () => {
  it('throws AutomationCreationError when called without a verified userId', async () => {
    const service = new AutomationCreationService({
      licenseDb: new FakeLicenseDb(),
      automationDb: new FakeAutomationDb(),
      paidCycleQuota: new FakePaidCycleQuota()
    });

    await expect(
      service.createAutomation({
        userId: '',
        targetCount: 1,
        configs: [defaultConfig()]
      })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('throws automation_requires_paid for a Free_Plan caller without touching quota', async () => {
    const licenseDb = new FakeLicenseDb();
    licenseDb.setPlan(freePlan(FREE_USER));
    const automationDb = new FakeAutomationDb();
    const paidCycleQuota = new FakePaidCycleQuota();
    const service = new AutomationCreationService({
      licenseDb,
      automationDb,
      paidCycleQuota
    });

    await expect(
      service.createAutomation({
        userId: FREE_USER,
        targetCount: 2,
        configs: [defaultConfig(), defaultConfig()]
      })
    ).rejects.toMatchObject({ code: 'automation_requires_paid' });
    expect(paidCycleQuota.reserveCalls).toEqual([]);
    expect(automationDb.inserts).toEqual([]);
  });

  it('throws invalid_request for target_count > 2 without consulting plan state', async () => {
    const licenseDb = new FakeLicenseDb();
    const service = new AutomationCreationService({
      licenseDb,
      automationDb: new FakeAutomationDb(),
      paidCycleQuota: new FakePaidCycleQuota()
    });

    await expect(
      service.createAutomation({
        userId: PAID_USER,
        targetCount: 3,
        configs: [defaultConfig(), defaultConfig(), defaultConfig()]
      })
    ).rejects.toMatchObject({ code: 'invalid_request' });
    // Plan state is consulted ONLY after body shape passes; with
    // target_count > 2 we short-circuit BEFORE the License_Service
    // call so an invalid request never produces a side-effect.
    expect(licenseDb.calls).toEqual([]);
  });
});
