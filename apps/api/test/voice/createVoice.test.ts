/**
 * Unit tests for `POST /stories/:id/voice` (Task 13.2).
 *
 * Validates: Requirements 9.1, 9.2, 9.4 (with 2.10 / 10.4 / 5.7 in
 * scope for the Free-plan, ownership, and quota gates).
 *
 * Coverage:
 *   - Free plan caller → 403 `voice_requires_paid` and zero side
 *     effects (no story lookup, no quota reservation, no row insert).
 *     This is the structural enforcement of Requirement 9.2 / 2.10.
 *   - Non-owner Paid caller → 403 `forbidden`, no quota, no row.
 *     A non-owner cannot deplete the owner's voice cycle quota.
 *   - Story missing → 404 `not_found`, no quota, no row.
 *   - < 10 done chapters → 412 `voice_chapters_incomplete` with
 *     `doneCount` and `requiredCount: 10` in the body, no quota,
 *     no row. This is Requirement 9.4 (precondition).
 *   - Success path → 201 with `{ voiceJobId }`, exactly one
 *     `paidCycleQuota.reserve({ action: 'voice', ... })` call, and
 *     exactly one `voiceJobsDb.insertVoiceJob` call.
 *   - Defensive: invalid `voiceId` → 400 `invalid_request`, no
 *     quota, no row.
 *
 * The Fastify plugin is loaded via `app.inject(...)` so the tests
 * exercise the same body parsing, error mapping, and header
 * behaviour that production traffic would.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Chapter, PlanState } from '@drama15/contracts';

import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import type { LicenseDb, TxClient } from '../../src/license/db.js';
import type { PaidCycleDecision } from '../../src/rateLimit/index.js';
import {
  createVoiceRoutePlugin,
  VOICE_REQUIRED_DONE_CHAPTERS,
  type CallerIdentity,
  type GetCallerIdentity,
  type StoryOwnerLookup,
  type VoiceStoryProjection
} from '../../src/voice/createVoice.js';
import type {
  InsertVoiceJobInput,
  InsertVoiceJobResult,
  VoiceJobsDb
} from '../../src/voice/voiceJobsDb.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const FREE_USER = '11111111-1111-4111-8111-111111111111';
const PAID_USER = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '33333333-3333-4333-8333-333333333333';
const STORY_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const PAID_CYCLE_ID = 'cycle-1';
const VOICE_ID = 'voice-default';

class FakeLicenseDb implements Pick<LicenseDb, 'getPlanState'> {
  public readonly rows = new Map<string, PlanState>();
  public readonly calls: string[] = [];

  public setPlan(state: PlanState): void {
    this.rows.set(state.userId, state);
  }

  public async getPlanState(
    userId: string,
    _tx: TxClient | null
  ): Promise<PlanState | null> {
    this.calls.push(userId);
    return this.rows.get(userId) ?? null;
  }
}

class FakeStoryOwnerLookup implements StoryOwnerLookup {
  public readonly stories = new Map<string, VoiceStoryProjection>();
  public readonly calls: string[] = [];

  public seed(storyId: string, projection: VoiceStoryProjection): void {
    this.stories.set(storyId, projection);
  }

  public async getStory(
    storyId: string
  ): Promise<VoiceStoryProjection | null> {
    this.calls.push(storyId);
    return this.stories.get(storyId) ?? null;
  }
}

class FakePaidCycleQuota {
  public readonly reserveCalls: Array<{
    userId: string;
    paidCycleId: string;
    action: string;
  }> = [];
  public readonly rollbackCalls: Array<{
    userId: string;
    paidCycleId: string;
    action: string;
  }> = [];
  public nextDecision: PaidCycleDecision = {
    allowed: true,
    remaining: 19,
    resetAt: '2026-01-31T00:00:00.000Z',
    retryAfterSeconds: 60
  };

  public async reserve(input: {
    userId: string;
    paidCycleId: string;
    action: 'full_story' | 'voice';
  }): Promise<PaidCycleDecision> {
    this.reserveCalls.push({
      userId: input.userId,
      paidCycleId: input.paidCycleId,
      action: input.action
    });
    return this.nextDecision;
  }

  public async rollback(input: {
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

class FakeVoiceJobsDb implements VoiceJobsDb {
  public readonly inserts: InsertVoiceJobInput[] = [];
  public failNextInsert = false;
  private nextId = 0;

  public async insertVoiceJob(
    input: InsertVoiceJobInput
  ): Promise<InsertVoiceJobResult> {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error('insert failed');
    }
    this.inserts.push({ ...input });
    this.nextId += 1;
    return {
      voiceJobId: `voice-${this.nextId}`,
      createdAt: '2025-03-09T12:00:00.000Z'
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freePlan(userId: string): PlanState {
  return { userId, plan: 'Free_Plan', status: 'active' };
}

function paidPlan(userId: string): PlanState {
  return {
    userId,
    plan: 'Paid_Plan',
    status: 'active',
    paidStartAt: '2026-01-01T00:00:00.000Z',
    paidExpireAt: '2026-01-31T00:00:00.000Z',
    paidCycleId: PAID_CYCLE_ID
  };
}

/** Build a chapter projection list with `doneCount` chapters at status `done`. */
function chaptersWithDone(
  doneCount: number
): ReadonlyArray<Pick<Chapter, 'status'>> {
  const list: Array<Pick<Chapter, 'status'>> = [];
  for (let i = 0; i < 10; i += 1) {
    list.push({ status: i < doneCount ? 'done' : 'pending' });
  }
  return list;
}

function fullStory(userId: string): VoiceStoryProjection {
  return {
    userId,
    chapters: chaptersWithDone(10)
  };
}

interface Harness {
  app: FastifyInstance;
  licenseDb: FakeLicenseDb;
  storyLookup: FakeStoryOwnerLookup;
  paidCycleQuota: FakePaidCycleQuota;
  voiceJobsDb: FakeVoiceJobsDb;
  setCaller(caller: CallerIdentity | null): void;
}

let currentCaller: CallerIdentity | null = null;
const callerResolver: GetCallerIdentity = () => currentCaller;

async function buildHarness(): Promise<Harness> {
  const licenseDb = new FakeLicenseDb();
  const storyLookup = new FakeStoryOwnerLookup();
  const paidCycleQuota = new FakePaidCycleQuota();
  const voiceJobsDb = new FakeVoiceJobsDb();
  const authz = new ServerAuthorityAuthzMiddleware({ licenseDb });

  const app = Fastify({ logger: false });
  await app.register(createVoiceRoutePlugin, {
    licenseDb,
    authz,
    storyOwnerLookup: storyLookup,
    paidCycleQuota,
    voiceJobsDb,
    getCallerIdentity: callerResolver
  });
  await app.ready();

  return {
    app,
    licenseDb,
    storyLookup,
    paidCycleQuota,
    voiceJobsDb,
    setCaller(caller) {
      currentCaller = caller;
    }
  };
}

afterEach(() => {
  currentCaller = null;
});

// ---------------------------------------------------------------------------
// Free plan → 403 voice_requires_paid (Requirements 9.2, 2.10)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/voice — Free plan gate (Requirements 9.2, 2.10)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(freePlan(FREE_USER));
    h.setCaller({ id: FREE_USER });
    // Seed a story so the test can confirm that the lookup is NEVER
    // consulted on the Free path — the gate runs BEFORE story lookup
    // by design (so a Free user cannot probe story existence).
    h.storyLookup.seed(STORY_ID, fullStory(FREE_USER));
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('returns 403 voice_requires_paid and never consults the story / quota / row', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('voice_requires_paid');

    // Free gate runs BEFORE per-story state is consulted (so a Free
    // user cannot use this endpoint as a story-existence oracle).
    expect(h.storyLookup.calls).toEqual([]);
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
    expect(h.voiceJobsDb.inserts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Non-owner → 403 forbidden (Requirement 10.4)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/voice — ownership gate (Requirement 10.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(OTHER_USER));
    h.setCaller({ id: OTHER_USER });
    // Story owned by PAID_USER (the legitimate owner). The caller
    // OTHER_USER is also Paid but does not own this story.
    h.storyLookup.seed(STORY_ID, fullStory(PAID_USER));
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('rejects a non-owner Paid caller with 403 forbidden and zero quota / row side effects', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');

    // Critically: ownership runs BEFORE the quota slot is reserved.
    // A non-owner cannot deplete the rightful owner's voice quota.
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
    expect(h.voiceJobsDb.inserts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Story missing → 404 not_found
// ---------------------------------------------------------------------------

describe('POST /stories/:id/voice — story missing', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setCaller({ id: PAID_USER });
    // Intentionally do NOT seed a story for STORY_ID.
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('returns 404 not_found and never reserves quota / inserts a row', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');

    expect(h.storyLookup.calls).toEqual([STORY_ID]);
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
    expect(h.voiceJobsDb.inserts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// < 10 done chapters → 412 voice_chapters_incomplete (Requirement 9.4)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/voice — chapter precondition (Requirement 9.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setCaller({ id: PAID_USER });
  });

  afterEach(async () => {
    await h.app.close();
  });

  it.each([
    [0],
    [1],
    [5],
    [9]
  ])(
    'rejects %i done chapters with 412 voice_chapters_incomplete and the doneCount/requiredCount body',
    async (doneCount) => {
      h.storyLookup.seed(STORY_ID, {
        userId: PAID_USER,
        chapters: chaptersWithDone(doneCount)
      });

      const res = await h.app.inject({
        method: 'POST',
        url: `/stories/${STORY_ID}/voice`,
        payload: { voiceId: VOICE_ID }
      });

      expect(res.statusCode).toBe(412);
      const body = res.json() as {
        error: {
          code: string;
          doneCount: number;
          requiredCount: number;
        };
      };
      expect(body.error.code).toBe('voice_chapters_incomplete');
      expect(body.error.doneCount).toBe(doneCount);
      expect(body.error.requiredCount).toBe(VOICE_REQUIRED_DONE_CHAPTERS);

      // No quota reserved on the precondition-fail path.
      expect(h.paidCycleQuota.reserveCalls).toEqual([]);
      expect(h.voiceJobsDb.inserts).toEqual([]);
    }
  );

  it('does not count chapters at status other than "done"', async () => {
    // 10 chapters total but only 5 are `done`; the rest are mixed
    // streaming / failed / pending. The done count must be 5.
    const chapters: Array<Pick<Chapter, 'status'>> = [
      { status: 'done' },
      { status: 'done' },
      { status: 'done' },
      { status: 'done' },
      { status: 'done' },
      { status: 'streaming' },
      { status: 'pending' },
      { status: 'failed' },
      { status: 'streaming' },
      { status: 'pending' }
    ];
    h.storyLookup.seed(STORY_ID, { userId: PAID_USER, chapters });

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(412);
    const body = res.json() as {
      error: { code: string; doneCount: number; requiredCount: number };
    };
    expect(body.error.code).toBe('voice_chapters_incomplete');
    expect(body.error.doneCount).toBe(5);
    expect(body.error.requiredCount).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Success path (Requirement 9.4 / 5.6 / 5.7)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/voice — success path (Requirements 9.4, 5.6)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setCaller({ id: PAID_USER });
    h.storyLookup.seed(STORY_ID, fullStory(PAID_USER));
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('reserves exactly one voice quota unit and inserts a Voice_Job row', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID, speed: 1.25, pitch: 2 }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { voiceJobId: string };
    expect(body.voiceJobId).toMatch(/^voice-/);
    expect(res.headers['cache-control']).toBe('no-store');

    // Exactly one reserve, with action='voice' against the active
    // paid cycle.
    expect(h.paidCycleQuota.reserveCalls).toEqual([
      {
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'voice'
      }
    ]);
    // No rollback (insert succeeded).
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);

    // Exactly one voice_jobs row inserted, carrying the validated
    // voiceId + speed + pitch.
    expect(h.voiceJobsDb.inserts).toHaveLength(1);
    const insert = h.voiceJobsDb.inserts[0]!;
    expect(insert.userId).toBe(PAID_USER);
    expect(insert.storyId).toBe(STORY_ID);
    expect(insert.voiceId).toBe(VOICE_ID);
    expect(insert.speed).toBe(1.25);
    expect(insert.pitch).toBe(2);
  });

  it('omits speed / pitch on the row when the body did not provide them', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(201);
    expect(h.voiceJobsDb.inserts).toHaveLength(1);
    const insert = h.voiceJobsDb.inserts[0]!;
    expect(insert.voiceId).toBe(VOICE_ID);
    expect(insert.speed).toBeUndefined();
    expect(insert.pitch).toBeUndefined();
  });

  it('returns 429 paid_voice_quota_exhausted with Retry-After when the cycle cap is hit', async () => {
    h.paidCycleQuota.nextDecision = {
      allowed: false,
      errorCode: 'paid_voice_quota_exhausted',
      retryAfterSeconds: 3600,
      resetAt: '2026-01-31T00:00:00.000Z',
      remaining: 0
    };

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('3600');
    const body = res.json() as {
      error: { code: string; retryAfterSeconds?: number; resetAt?: string };
    };
    expect(body.error.code).toBe('paid_voice_quota_exhausted');
    expect(body.error.retryAfterSeconds).toBe(3600);
    expect(body.error.resetAt).toBe('2026-01-31T00:00:00.000Z');

    // No row inserted on the cap-hit path.
    expect(h.voiceJobsDb.inserts).toEqual([]);
    // The reserve was attempted; no rollback because reserve denied
    // already returned `allowed: false` (no slot was actually held).
    expect(h.paidCycleQuota.reserveCalls).toHaveLength(1);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
  });

  it('rolls the reservation back if the voice_jobs insert fails', async () => {
    h.voiceJobsDb.failNextInsert = true;

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });

    expect(res.statusCode).toBe(500);
    expect(h.paidCycleQuota.reserveCalls).toHaveLength(1);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([
      {
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'voice'
      }
    ]);
  });
});

// ---------------------------------------------------------------------------
// Defensive paths
// ---------------------------------------------------------------------------

describe('POST /stories/:id/voice — defensive paths', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.app.close();
  });

  it('returns 401 unauthenticated when no caller is resolved', async () => {
    h.setCaller(null);
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
    expect(h.licenseDb.calls).toEqual([]);
    expect(h.storyLookup.calls).toEqual([]);
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
  });

  it.each([
    { payload: { voiceId: '' } },
    { payload: { voiceId: 42 } },
    { payload: { voiceId: null } },
    { payload: {} }
  ])(
    'rejects invalid body %j with 400 invalid_request and zero side effects',
    async ({ payload }) => {
      h.licenseDb.setPlan(paidPlan(PAID_USER));
      h.setCaller({ id: PAID_USER });
      h.storyLookup.seed(STORY_ID, fullStory(PAID_USER));

      const res = await h.app.inject({
        method: 'POST',
        url: `/stories/${STORY_ID}/voice`,
        payload
      });

      expect(res.statusCode).toBe(400);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('invalid_request');

      // Body validation runs BEFORE plan / story / quota lookups.
      expect(h.licenseDb.calls).toEqual([]);
      expect(h.storyLookup.calls).toEqual([]);
      expect(h.paidCycleQuota.reserveCalls).toEqual([]);
      expect(h.voiceJobsDb.inserts).toEqual([]);
    }
  );

  it('returns 403 license_not_active when the plan is not active', async () => {
    h.licenseDb.setPlan({
      userId: PAID_USER,
      plan: 'Paid_Plan',
      status: 'expired',
      paidStartAt: '2026-01-01T00:00:00.000Z',
      paidExpireAt: '2026-01-31T00:00:00.000Z',
      paidCycleId: PAID_CYCLE_ID
    });
    h.setCaller({ id: PAID_USER });
    h.storyLookup.seed(STORY_ID, fullStory(PAID_USER));

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/voice`,
      payload: { voiceId: VOICE_ID }
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('license_not_active');
    expect(h.storyLookup.calls).toEqual([]);
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
  });
});
