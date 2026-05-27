/**
 * Unit tests for the `POST /stories` route (Task 10.2).
 *
 * Validates: Requirements 6.3, 6.4, 6.5, 6.10, 6.11, 6.12.
 *
 * The tests are organised into four scenarios, each tied to one of
 * the requirement bullets in the task brief:
 *
 *   1. Free single-chapter happy path → 201, story_jobs row inserted
 *      at `mode = 'single_chapter'`, daily counter consumed exactly
 *      once, paid-cycle counter untouched.
 *      (Requirements 6.3, 6.10/6.11 — the niche flows through.)
 *
 *   2. Free over-quota → 429 + `Retry-After` header, no story_jobs
 *      row inserted, no paid-cycle reservation.
 *      (Requirements 6.3, 5.2/5.3.)
 *
 *   3. Paid full mode → 201 + `streaming: true`, `story_jobs` row
 *      with `mode = 'full'`, paid-cycle counter reserved (commit
 *      happens later when the 10-chapter run completes — Requirement
 *      6.5). The reservation MUST roll back when the row insert
 *      fails after a successful reservation.
 *      (Requirements 6.4, 6.5.)
 *
 *   4. Output language pass-through → the value forwarded to
 *      `story_jobs.language` AND to the persisted `config` blob is
 *      EXACTLY `request.config.outputLanguage`, regardless of the
 *      caller's `ui_locale`.
 *      (Requirement 6.12 — UI locale and output language are
 *      independent.)
 *
 * The Fastify plugin is loaded via `app.inject(...)` (no real network
 * listener), so the tests exercise the same body parsing, error
 * mapping, and header behaviour that production traffic would.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import type {
  CreateStoryRequest,
  PlanState
} from '@drama15/contracts';

import type { LicenseDb, TxClient } from '../../src/license/db.js';
import type {
  DailyCounterDecision,
  PaidCycleDecision
} from '../../src/rateLimit/index.js';
import {
  createStoriesRoutePlugin,
  StoryCreationService,
  passThroughOutputLanguage,
  type StoryJobsDb,
  type InsertStoryJobInput,
  type InsertStoryJobResult
} from '../../src/stories/index.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const FREE_USER = 'user-free-1';
const PAID_USER = 'user-paid-1';
const FINGERPRINT = 'fp-test-1';
const PAID_CYCLE_ID = 'cycle-1';

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

class FakeStoryJobsDb implements StoryJobsDb {
  public readonly inserts: InsertStoryJobInput[] = [];
  public failNextInsert = false;
  private nextId = 0;

  async insertStoryJob(
    input: InsertStoryJobInput
  ): Promise<InsertStoryJobResult> {
    if (this.failNextInsert) {
      this.failNextInsert = false;
      throw new Error('insert failed');
    }
    this.inserts.push({ ...input });
    this.nextId += 1;
    return {
      storyId: `story-${this.nextId}`,
      createdAt: '2025-03-09T12:00:00.000Z'
    };
  }
}

class FakeDailyQuota {
  public consumeFreeChapterCalls: { userId: string }[] = [];
  public nextDecision: DailyCounterDecision = {
    allowed: true,
    remaining: 2
  };

  async consumeFreeChapter(input: {
    userId: string;
  }): Promise<DailyCounterDecision> {
    this.consumeFreeChapterCalls.push({ userId: input.userId });
    return this.nextDecision;
  }
}

class FakePaidCycleQuota {
  public reserveCalls: Array<{
    userId: string;
    paidCycleId: string;
    action: string;
  }> = [];
  public rollbackCalls: Array<{
    userId: string;
    paidCycleId: string;
    action: string;
  }> = [];
  public nextDecision: PaidCycleDecision = {
    allowed: true,
    remaining: 19
  };

  async reserve(input: {
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
  storyJobsDb: FakeStoryJobsDb;
  dailyQuota: FakeDailyQuota;
  paidCycleQuota: FakePaidCycleQuota;
  /** Set the resolved userId returned by `extractUserId` for the next request. */
  setUser(userId: string | null): void;
}

async function buildHarness(): Promise<Harness> {
  const licenseDb = new FakeLicenseDb();
  const storyJobsDb = new FakeStoryJobsDb();
  const dailyQuota = new FakeDailyQuota();
  const paidCycleQuota = new FakePaidCycleQuota();

  let currentUser: string | null = null;

  const app = Fastify({ logger: false });
  await app.register(createStoriesRoutePlugin, {
    licenseDb,
    storyJobsDb,
    dailyQuota,
    paidCycleQuota,
    extractUserId: () => currentUser
  });

  return {
    app,
    licenseDb,
    storyJobsDb,
    dailyQuota,
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
    paidExpireAt: '2026-01-31T00:00:00.000Z',
    paidCycleId: PAID_CYCLE_ID
  };
}

function bodySingleChapter(
  outputLanguage = 'vi',
  niche: string | undefined = 'billionaire'
): CreateStoryRequest {
  const body: CreateStoryRequest = {
    mode: 'single_chapter',
    config: {
      outputLanguage,
      ...(niche !== undefined ? { niche } : {})
    },
    fingerprint: FINGERPRINT,
    chapterIndex: 1
  };
  return body;
}

function bodyFull(outputLanguage = 'en'): CreateStoryRequest {
  return {
    mode: 'full',
    config: {
      outputLanguage,
      niche: 'social_injustice',
      seed: 'a tragic seed'
    },
    fingerprint: FINGERPRINT
  };
}

// ---------------------------------------------------------------------------
// Free single-chapter happy path (Requirements 6.3, 6.10/6.11)
// ---------------------------------------------------------------------------

describe('POST /stories — Free single-chapter happy path (Requirements 6.3)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(freePlan(FREE_USER));
    h.setUser(FREE_USER);
  });

  it('returns 201 and inserts a story_jobs row with mode=single_chapter', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodySingleChapter('vi', 'billionaire')
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { storyId: string; streaming: boolean };
    expect(body.storyId).toMatch(/^story-/);
    expect(body.streaming).toBe(false);
    // Cache-Control must be no-store on POST /stories — the response
    // depends on per-request quota state.
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('counts the chapter against the daily Free counter and never the paid cycle', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodySingleChapter('vi', 'billionaire')
    });

    expect(res.statusCode).toBe(201);
    expect(h.dailyQuota.consumeFreeChapterCalls).toEqual([
      { userId: FREE_USER }
    ]);
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
  });

  it('persists the curated niche on the story_jobs row (Requirement 6.10)', async () => {
    await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodySingleChapter('vi', 'social_injustice')
    });

    expect(h.storyJobsDb.inserts).toHaveLength(1);
    expect(h.storyJobsDb.inserts[0]!.niche).toBe('social_injustice');
    expect(h.storyJobsDb.inserts[0]!.mode).toBe('single_chapter');
    expect(h.storyJobsDb.inserts[0]!.userId).toBe(FREE_USER);
  });

  it('accepts a custom-niche request and persists null in the niche column (Requirement 6.11)', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: {
        mode: 'single_chapter',
        config: {
          outputLanguage: 'vi',
          customNiche: 'a brand-new genre'
        },
        fingerprint: FINGERPRINT,
        chapterIndex: 1
      }
    });

    expect(res.statusCode).toBe(201);
    expect(h.storyJobsDb.inserts[0]!.niche).toBeNull();
    // The custom-niche string itself must survive on the config blob
    // so the upstream call can read it.
    const config = h.storyJobsDb.inserts[0]!.config as {
      customNiche?: string;
    };
    expect(config.customNiche).toBe('a brand-new genre');
  });
});

// ---------------------------------------------------------------------------
// Free over-quota → 429 with Retry-After (Requirements 6.3, 5.2/5.3)
// ---------------------------------------------------------------------------

describe('POST /stories — Free over-quota (Requirements 6.3)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(freePlan(FREE_USER));
    h.setUser(FREE_USER);
    h.dailyQuota.nextDecision = {
      allowed: false,
      errorCode: 'free_chapter_quota_exhausted',
      retryAfterSeconds: 12345,
      resetAt: '2025-03-10T00:00:00.000Z',
      remaining: 0
    };
  });

  it('returns 429 with Retry-After and never inserts a story_jobs row', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodySingleChapter('vi', 'billionaire')
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('12345');
    const body = res.json() as {
      error: {
        code: string;
        retryAfterSeconds?: number;
        resetAt?: string;
      };
    };
    expect(body.error.code).toBe('free_chapter_quota_exhausted');
    expect(body.error.retryAfterSeconds).toBe(12345);
    expect(body.error.resetAt).toBe('2025-03-10T00:00:00.000Z');
    expect(h.storyJobsDb.inserts).toHaveLength(0);
    // Critically, the paid-cycle counter must NOT be touched on a
    // Free-plan denial.
    expect(h.paidCycleQuota.reserveCalls).toEqual([]);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
  });

  it('rejects a Free user submitting mode=full with paid_story_quota_exhausted', async () => {
    h.dailyQuota.nextDecision = { allowed: true, remaining: 2 };
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodyFull('vi')
    });

    expect(res.statusCode).toBe(429);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('paid_story_quota_exhausted');
    expect(h.storyJobsDb.inserts).toHaveLength(0);
    expect(h.dailyQuota.consumeFreeChapterCalls).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Paid full mode → reserve quota + insert Story_Job (Requirements 6.4, 6.5)
// ---------------------------------------------------------------------------

describe('POST /stories — Paid full mode (Requirements 6.4, 6.5)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.licenseDb.setPlan(paidPlan(PAID_USER));
    h.setUser(PAID_USER);
  });

  it('reserves one paid_story unit and initialises a Story_Job', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodyFull('en')
    });

    expect(res.statusCode).toBe(201);
    const body = res.json() as { storyId: string; streaming: boolean };
    expect(body.storyId).toMatch(/^story-/);
    expect(body.streaming).toBe(true);

    // Reservation happened against the current paid cycle.
    expect(h.paidCycleQuota.reserveCalls).toEqual([
      {
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'full_story'
      }
    ]);
    // No rollback (insert succeeded).
    expect(h.paidCycleQuota.rollbackCalls).toEqual([]);
    // Story_Job row inserted at `mode='full'`. quota_charged stays
    // false here — it flips on completion (Requirement 6.5).
    expect(h.storyJobsDb.inserts).toHaveLength(1);
    expect(h.storyJobsDb.inserts[0]!.mode).toBe('full');
    expect(h.storyJobsDb.inserts[0]!.userId).toBe(PAID_USER);
    // Daily Free counter must NOT be touched on the Paid path.
    expect(h.dailyQuota.consumeFreeChapterCalls).toEqual([]);
  });

  it('returns 429 with Retry-After when the paid story quota is exhausted', async () => {
    h.paidCycleQuota.nextDecision = {
      allowed: false,
      errorCode: 'paid_story_quota_exhausted',
      retryAfterSeconds: 600,
      resetAt: '2026-01-31T00:00:00.000Z',
      remaining: 0
    };

    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodyFull('en')
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('600');
    const body = res.json() as {
      error: { code: string; retryAfterSeconds?: number; resetAt?: string };
    };
    expect(body.error.code).toBe('paid_story_quota_exhausted');
    expect(body.error.retryAfterSeconds).toBe(600);
    expect(body.error.resetAt).toBe('2026-01-31T00:00:00.000Z');
    expect(h.storyJobsDb.inserts).toHaveLength(0);
  });

  it('rolls back the reservation if the story_jobs insert fails', async () => {
    h.storyJobsDb.failNextInsert = true;

    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodyFull('en')
    });

    expect(res.statusCode).toBe(500);
    expect(h.paidCycleQuota.reserveCalls).toHaveLength(1);
    expect(h.paidCycleQuota.rollbackCalls).toEqual([
      {
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'full_story'
      }
    ]);
  });
});

// ---------------------------------------------------------------------------
// Output language pass-through, independent of UI locale (Requirement 6.12)
// ---------------------------------------------------------------------------

describe('POST /stories — outputLanguage pass-through (Requirement 6.12)', () => {
  it('forwards the body outputLanguage verbatim regardless of the user ui_locale', async () => {
    const cases: ReadonlyArray<{ uiLocale: string; output: string }> = [
      { uiLocale: 'vi', output: 'en' },
      { uiLocale: 'en', output: 'vi' },
      { uiLocale: 'vi', output: 'vi' },
      { uiLocale: 'en', output: 'en' }
    ];

    for (const c of cases) {
      const h = await buildHarness();
      h.licenseDb.setPlan(freePlan(FREE_USER));
      h.setUser(FREE_USER);

      // The handler MUST NOT consult ui_locale in any way, so we
      // never thread the value into the route. The harness simulates
      // an upstream gateway that has resolved a different ui_locale
      // for each call.
      const res = await h.app.inject({
        method: 'POST',
        url: '/stories',
        // The Web_Client is not allowed to send ui_locale on this
        // body — but even if it did, the handler must ignore it
        // and use config.outputLanguage. We pass an unrelated
        // ui_locale field to demonstrate that.
        payload: {
          mode: 'single_chapter',
          config: {
            outputLanguage: c.output,
            niche: 'billionaire'
          },
          fingerprint: FINGERPRINT,
          chapterIndex: 1,
          ui_locale: c.uiLocale
        }
      });

      expect(res.statusCode).toBe(201);
      expect(h.storyJobsDb.inserts).toHaveLength(1);
      // The persisted column matches the body verbatim.
      expect(h.storyJobsDb.inserts[0]!.language).toBe(c.output);
      // The persisted config blob also keeps the body's value.
      const cfg = h.storyJobsDb.inserts[0]!.config as {
        outputLanguage: string;
      };
      expect(cfg.outputLanguage).toBe(c.output);
    }
  });

  it('passThroughOutputLanguage helper ignores ui_locale entirely', () => {
    expect(passThroughOutputLanguage({ outputLanguage: 'vi' }, 'en')).toBe('vi');
    expect(passThroughOutputLanguage({ outputLanguage: 'en' }, 'vi')).toBe('en');
    expect(
      passThroughOutputLanguage({ outputLanguage: 'fr' }, undefined)
    ).toBe('fr');
  });
});

// ---------------------------------------------------------------------------
// Negative paths (defensive)
// ---------------------------------------------------------------------------

describe('POST /stories — defensive failure modes', () => {
  it('returns 401 unauthenticated when no user id is resolved', async () => {
    const h = await buildHarness();
    // Do NOT call setUser → extractUserId returns null.
    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodySingleChapter()
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('returns 403 license_not_active when the plan is not active', async () => {
    const h = await buildHarness();
    h.licenseDb.setPlan({
      userId: FREE_USER,
      plan: 'Free_Plan',
      status: 'pending_deletion'
    });
    h.setUser(FREE_USER);

    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: bodySingleChapter()
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('license_not_active');
  });

  it('rejects a missing config.outputLanguage with 400/forbidden', async () => {
    const h = await buildHarness();
    h.licenseDb.setPlan(freePlan(FREE_USER));
    h.setUser(FREE_USER);

    const res = await h.app.inject({
      method: 'POST',
      url: '/stories',
      payload: {
        mode: 'single_chapter',
        config: { niche: 'billionaire' },
        fingerprint: FINGERPRINT
      }
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// StoryCreationService direct tests (no Fastify)
// ---------------------------------------------------------------------------

describe('StoryCreationService.createStory — direct invocation', () => {
  it('throws StoryCreationError when called without a verified userId', async () => {
    const service = new StoryCreationService({
      licenseDb: new FakeLicenseDb(),
      storyJobsDb: new FakeStoryJobsDb(),
      dailyQuota: new FakeDailyQuota(),
      paidCycleQuota: new FakePaidCycleQuota()
    });

    await expect(
      service.createStory({
        userId: '',
        request: bodySingleChapter()
      })
    ).rejects.toMatchObject({ code: 'unauthenticated' });
  });
});
