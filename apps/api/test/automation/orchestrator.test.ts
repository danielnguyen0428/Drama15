/**
 * Unit tests for `AutomationOrchestrator` (Task 12.2).
 *
 * Validates: Requirements 8.5, 8.7.
 *
 * Coverage map (one block per task acceptance bullet):
 *
 *   1. Success path — `runSubStory` on a `running` row drives the
 *      generator to success, advances the FSM `running → completed`,
 *      and commits exactly one `paid_full_story` quota unit
 *      (Requirement 8.5).
 *
 *   2. Failure path — `runSubStory` on a `running` row whose
 *      generator returns `failure` advances the FSM `running →
 *      failed` and does NOT commit any quota. The original
 *      reservation made by Task 12.1 stays in place (Requirement 8.7).
 *
 *   3. Retry — `retrySubStory` on a `failed` row advances `failed →
 *      running` and re-drives the generator. A retry that succeeds
 *      commits ONE quota unit total across the (failed, retried)
 *      pair; a retry that fails again commits ZERO. Either way no
 *      "extra" quota is consumed for the retry (Requirement 8.7).
 *
 *   4. Idempotency — calling `runSubStory` twice on the same row
 *      commits AT MOST ONE quota unit. The second call observes
 *      `status = 'completed'` and short-circuits; even if it did
 *      not, the DB-level `WHERE quota_charged = false` guard would
 *      keep the counter side-effect at exactly one (Requirement 8.7).
 *
 *   5. Defensive: `not_found` and `illegal_state` errors for invalid
 *      input.
 *
 * Test scaffolding
 * ----------------
 * The orchestrator is framework-agnostic, so the tests bypass Fastify
 * entirely and exercise the class directly with three small fakes:
 *
 *   - {@link FakeStoryJobFsmDb}      — in-memory `story_jobs` snapshot
 *     mirroring the optimistic-lock semantics of the production
 *     Postgres adapter (kept structurally identical to the fake in
 *     `test/stories/fsm.test.ts`).
 *   - {@link FakeStoryQuotaChargedDb} — tracks the `quota_charged`
 *     boolean and reports whether each `markQuotaCharged` call was
 *     the first one to flip it.
 *   - {@link FakeSubStoryContextDb}   — static `userId` /
 *     `automationJobId` / `paidCycleId` lookup, sufficient for the
 *     retry path which has to resolve context from the row alone.
 *   - {@link FakePaidCycleQuota}      — records every `commit` call
 *     and threads the `markQuotaCharged` callback through, so the
 *     test can assert the counter side-effect AND the idempotency
 *     guard both behaved correctly.
 *   - {@link FakeGenerator}           — programmable success / failure
 *     queue so each test can drive the orchestrator deterministically.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import {
  AutomationOrchestrator,
  AutomationOrchestratorError,
  type SubStoryContext,
  type SubStoryContextDb,
  type SubStoryGenerationResult,
  type SubStoryGenerator
} from '../../src/automation/orchestrator.js';
import type { StoryQuotaChargedDb } from '../../src/automation/quotaChargedDb.js';
import {
  type StoryJobFsmDb,
  type StoryJobFsmRow
} from '../../src/stories/fsmDb.js';
import type { StoryJobState } from '../../src/stories/fsm.js';
import type {
  CommitInput,
  PaidCycleQuota
} from '../../src/rateLimit/index.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeStoryJobFsmDb implements StoryJobFsmDb {
  public readonly rows = new Map<string, StoryJobFsmRow>();

  seed(row: StoryJobFsmRow): void {
    this.rows.set(row.id, { ...row });
  }

  snapshot(jobId: string): StoryJobFsmRow | undefined {
    const r = this.rows.get(jobId);
    return r ? { ...r } : undefined;
  }

  async readJob(jobId: string): Promise<StoryJobFsmRow | null> {
    const r = this.rows.get(jobId);
    return r ? { ...r } : null;
  }

  async updateStatusIfVersion(args: {
    jobId: string;
    newStatus: StoryJobState;
    expectedVersion: number;
  }): Promise<boolean> {
    const r = this.rows.get(args.jobId);
    if (!r) return false;
    if (r.version !== args.expectedVersion) return false;
    this.rows.set(args.jobId, {
      id: r.id,
      status: args.newStatus,
      version: r.version + 1
    });
    return true;
  }
}

/**
 * In-memory mirror of the `story_jobs.quota_charged` column. Modelled
 * as a single boolean per id with a "first flip wins" invariant —
 * exactly what `UPDATE ... WHERE quota_charged = false RETURNING id`
 * gives us in production (Requirement 8.7).
 */
class FakeStoryQuotaChargedDb implements StoryQuotaChargedDb {
  public readonly state = new Map<string, boolean>();
  public readonly calls: string[] = [];

  seed(storyJobId: string, charged = false): void {
    this.state.set(storyJobId, charged);
  }

  isCharged(storyJobId: string): boolean {
    return this.state.get(storyJobId) === true;
  }

  async markQuotaCharged(storyJobId: string): Promise<boolean> {
    this.calls.push(storyJobId);
    if (!this.state.has(storyJobId)) {
      // Mirrors the production "no row matches" outcome — the orchestrator
      // never reaches this branch in normal operation but we model it
      // conservatively so the test harness can detect drift.
      return false;
    }
    if (this.state.get(storyJobId) === true) {
      return false;
    }
    this.state.set(storyJobId, true);
    return true;
  }
}

class FakeSubStoryContextDb implements SubStoryContextDb {
  public readonly rows = new Map<string, SubStoryContext>();

  seed(storyJobId: string, ctx: SubStoryContext): void {
    this.rows.set(storyJobId, ctx);
  }

  async getSubStoryContext(
    storyJobId: string
  ): Promise<SubStoryContext | null> {
    return this.rows.get(storyJobId) ?? null;
  }
}

/**
 * Programmable generator. Each `generate()` call shifts the next
 * outcome off the `outcomes` queue; if the queue is empty the
 * generator returns `success` by default. The default keeps tests
 * focused on the path being exercised — every test that cares about
 * a specific failure / success sequence sets the queue up explicitly.
 */
class FakeGenerator implements SubStoryGenerator {
  public outcomes: SubStoryGenerationResult[] = [];
  public readonly calls: Array<{
    storyJobId: string;
    userId: string;
    automationJobId: string;
  }> = [];

  async generate(args: {
    storyJobId: string;
    userId: string;
    automationJobId: string;
  }): Promise<SubStoryGenerationResult> {
    this.calls.push({ ...args });
    if (this.outcomes.length === 0) {
      return { kind: 'success' };
    }
    return this.outcomes.shift()!;
  }
}

/**
 * Test-only `PaidCycleQuota` stand-in that exercises the real
 * `markQuotaCharged` callback path. We do NOT mock around the
 * idempotency contract — every commit() call passes its
 * `markQuotaCharged` down to {@link FakeStoryQuotaChargedDb}, and the
 * counter only increments when the flip succeeded. That mirrors the
 * exact production semantics (`PaidCycleQuota.commit` returns
 * `committed: false` when the DB-level guard reports the row was
 * already at `quota_charged = true`).
 */
class FakePaidCycleQuota implements Pick<PaidCycleQuota, 'commit'> {
  public readonly commits: CommitInput[] = [];
  /**
   * Net `paid_full_story` counter. Mirrors the Redis cycle counter
   * after subtracting the reservation: a successful commit() leaves
   * the value unchanged (counter was incremented at reserve time);
   * we track a separate `decrementCount` here for retry tests so a
   * test can assert "exactly one decrement happened across N drives".
   *
   * In production the counter increments on `reserve()` and is left
   * alone by `commit()` — the row's `quota_charged` flag is the
   * authoritative ledger. We model the same shape: every commit()
   * that returns `{committed: true}` is a logical "decrement" of the
   * available quota; every `{committed: false}` is the no-op retry
   * path that Requirement 8.7 protects.
   */
  public commitCount = 0;

  async commit(input: CommitInput): Promise<{ committed: boolean }> {
    this.commits.push(input);
    const flipped = await input.markQuotaCharged({
      jobId: input.jobId,
      jobKind: 'story'
    });
    if (flipped) {
      this.commitCount += 1;
    }
    return { committed: flipped === true };
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const AUTOMATION_JOB_ID = 'auto-1';
const STORY_JOB_ID = 'story-1';
const USER_ID = 'user-paid-1';
const PAID_CYCLE_ID = 'cycle-1';

interface Harness {
  fsmDb: FakeStoryJobFsmDb;
  quotaChargedDb: FakeStoryQuotaChargedDb;
  contextDb: FakeSubStoryContextDb;
  paidCycleQuota: FakePaidCycleQuota;
  generator: FakeGenerator;
  orchestrator: AutomationOrchestrator;
}

function buildHarness(): Harness {
  const fsmDb = new FakeStoryJobFsmDb();
  const quotaChargedDb = new FakeStoryQuotaChargedDb();
  const contextDb = new FakeSubStoryContextDb();
  const paidCycleQuota = new FakePaidCycleQuota();
  const generator = new FakeGenerator();
  const orchestrator = new AutomationOrchestrator({
    fsmDb,
    quotaChargedDb,
    contextDb,
    paidCycleQuota,
    generator
  });

  // Default seed: one running story_jobs row owned by USER_ID, version 0,
  // quota not yet charged, with context that resolves back to the same
  // automation job and paid cycle (mirrors Task 12.1's insert).
  fsmDb.seed({ id: STORY_JOB_ID, status: 'running', version: 0 });
  quotaChargedDb.seed(STORY_JOB_ID, false);
  contextDb.seed(STORY_JOB_ID, {
    userId: USER_ID,
    automationJobId: AUTOMATION_JOB_ID,
    paidCycleId: PAID_CYCLE_ID
  });

  return {
    fsmDb,
    quotaChargedDb,
    contextDb,
    paidCycleQuota,
    generator,
    orchestrator
  };
}

function defaultRunInput(): {
  automationJobId: string;
  storyJobId: string;
  userId: string;
  paidCycleId: string;
} {
  return {
    automationJobId: AUTOMATION_JOB_ID,
    storyJobId: STORY_JOB_ID,
    userId: USER_ID,
    paidCycleId: PAID_CYCLE_ID
  };
}

// ---------------------------------------------------------------------------
// 1. Success path — exactly one quota commit per sub-story
// ---------------------------------------------------------------------------

describe('AutomationOrchestrator.runSubStory — success path (Requirement 8.5)', () => {
  let h: Harness;

  beforeEach(() => {
    h = buildHarness();
  });

  it('drives the generator and reports outcome=completed, quotaCommitted=true', async () => {
    h.generator.outcomes = [{ kind: 'success' }];

    const result = await h.orchestrator.runSubStory(defaultRunInput());

    expect(result).toEqual({
      storyJobId: STORY_JOB_ID,
      outcome: 'completed',
      quotaCommitted: true
    });
    expect(h.generator.calls).toEqual([
      {
        storyJobId: STORY_JOB_ID,
        userId: USER_ID,
        automationJobId: AUTOMATION_JOB_ID
      }
    ]);
  });

  it('advances the FSM running → completed and bumps version by 1', async () => {
    h.generator.outcomes = [{ kind: 'success' }];

    await h.orchestrator.runSubStory(defaultRunInput());

    expect(h.fsmDb.snapshot(STORY_JOB_ID)).toEqual({
      id: STORY_JOB_ID,
      status: 'completed',
      version: 1
    });
  });

  it('flips quota_charged once and commits exactly one full_story unit', async () => {
    h.generator.outcomes = [{ kind: 'success' }];

    await h.orchestrator.runSubStory(defaultRunInput());

    // The DB-level guard fires exactly once; the counter side-effect
    // (commitCount) is exactly one — Requirement 8.5 ("một đơn vị
    // quota truyện full Paid_Plan cho mỗi truyện hoàn tất").
    expect(h.quotaChargedDb.isCharged(STORY_JOB_ID)).toBe(true);
    expect(h.quotaChargedDb.calls).toEqual([STORY_JOB_ID]);
    expect(h.paidCycleQuota.commits).toHaveLength(1);
    expect(h.paidCycleQuota.commits[0]).toMatchObject({
      userId: USER_ID,
      paidCycleId: PAID_CYCLE_ID,
      action: 'full_story',
      jobId: STORY_JOB_ID
    });
    expect(h.paidCycleQuota.commitCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Failure path — marks failed, no quota commit
// ---------------------------------------------------------------------------

describe('AutomationOrchestrator.runSubStory — failure path (Requirement 8.7)', () => {
  let h: Harness;

  beforeEach(() => {
    h = buildHarness();
  });

  it('advances the FSM running → failed and reports quotaCommitted=false', async () => {
    h.generator.outcomes = [{ kind: 'failure', reason: 'upstream 502' }];

    const result = await h.orchestrator.runSubStory(defaultRunInput());

    expect(result).toEqual({
      storyJobId: STORY_JOB_ID,
      outcome: 'failed',
      quotaCommitted: false
    });
    expect(h.fsmDb.snapshot(STORY_JOB_ID)).toEqual({
      id: STORY_JOB_ID,
      status: 'failed',
      version: 1
    });
  });

  it('never calls paidCycleQuota.commit and leaves quota_charged at false', async () => {
    h.generator.outcomes = [{ kind: 'failure' }];

    await h.orchestrator.runSubStory(defaultRunInput());

    // No commit attempt at all — the failure path bypasses the quota
    // counter entirely so the original Task 12.1 reservation stays
    // intact for the future retry (Requirement 8.7).
    expect(h.paidCycleQuota.commits).toEqual([]);
    expect(h.paidCycleQuota.commitCount).toBe(0);
    expect(h.quotaChargedDb.calls).toEqual([]);
    expect(h.quotaChargedDb.isCharged(STORY_JOB_ID)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Retry path — failed → running, no extra quota
// ---------------------------------------------------------------------------

describe('AutomationOrchestrator.retrySubStory — no extra quota for retry (Requirement 8.7)', () => {
  let h: Harness;

  beforeEach(() => {
    h = buildHarness();
  });

  it('advances failed → running, re-drives generation, and commits exactly one quota unit when retry succeeds', async () => {
    // First drive fails: row lands at status='failed', no quota
    // committed.
    h.generator.outcomes = [{ kind: 'failure' }];
    const firstRun = await h.orchestrator.runSubStory(defaultRunInput());
    expect(firstRun.outcome).toBe('failed');
    expect(h.fsmDb.snapshot(STORY_JOB_ID)?.status).toBe('failed');
    expect(h.paidCycleQuota.commitCount).toBe(0);

    // Retry drives the same row; this time the generator succeeds.
    h.generator.outcomes = [{ kind: 'success' }];
    const retryRun = await h.orchestrator.retrySubStory({
      storyJobId: STORY_JOB_ID
    });

    expect(retryRun).toEqual({
      storyJobId: STORY_JOB_ID,
      outcome: 'completed',
      quotaCommitted: true
    });
    expect(h.fsmDb.snapshot(STORY_JOB_ID)).toEqual({
      id: STORY_JOB_ID,
      status: 'completed',
      // failed→running (+1) then running→completed (+1), starting from 1
      version: 3
    });
    // Cumulative quota: ONE commit across the (failed + retried) pair.
    // The retry never triggered a fresh reservation; the original
    // reservation from Task 12.1 was the one and only paid_story slot.
    expect(h.paidCycleQuota.commitCount).toBe(1);
  });

  it('still commits zero quota units when the retry itself fails', async () => {
    // First drive fails.
    h.generator.outcomes = [{ kind: 'failure' }];
    await h.orchestrator.runSubStory(defaultRunInput());

    // Retry also fails → row lands back at `failed`. Still zero
    // counter side-effects. The user can retry again with no extra
    // cost (Requirement 8.7).
    h.generator.outcomes = [{ kind: 'failure', reason: 'still broken' }];
    const retryRun = await h.orchestrator.retrySubStory({
      storyJobId: STORY_JOB_ID
    });

    expect(retryRun.outcome).toBe('failed');
    expect(h.fsmDb.snapshot(STORY_JOB_ID)?.status).toBe('failed');
    expect(h.paidCycleQuota.commitCount).toBe(0);
    expect(h.paidCycleQuota.commits).toEqual([]);
  });

  it('rejects retrySubStory when the row is not in status=failed', async () => {
    // Row is at running — a retry is not legal here. The user should
    // be using resume / pause endpoints instead.
    await expect(
      h.orchestrator.retrySubStory({ storyJobId: STORY_JOB_ID })
    ).rejects.toBeInstanceOf(AutomationOrchestratorError);

    // FSM and counter must be untouched.
    expect(h.fsmDb.snapshot(STORY_JOB_ID)).toEqual({
      id: STORY_JOB_ID,
      status: 'running',
      version: 0
    });
    expect(h.paidCycleQuota.commitCount).toBe(0);
  });

  it('rejects retrySubStory when the storyJobId does not exist', async () => {
    await expect(
      h.orchestrator.retrySubStory({ storyJobId: 'unknown-id' })
    ).rejects.toMatchObject({
      code: 'story_job_not_found'
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Idempotency — calling runSubStory twice commits at most once
// ---------------------------------------------------------------------------

describe('AutomationOrchestrator.runSubStory — idempotency (Requirement 8.7)', () => {
  let h: Harness;

  beforeEach(() => {
    h = buildHarness();
  });

  it('commits ONE quota unit when runSubStory is called twice on the same row', async () => {
    h.generator.outcomes = [{ kind: 'success' }];
    const first = await h.orchestrator.runSubStory(defaultRunInput());
    expect(first.quotaCommitted).toBe(true);

    // Second drive: the row is already at status='completed'. The
    // orchestrator MUST NOT re-run the generator and MUST NOT
    // commit another quota unit (Requirement 8.7).
    const second = await h.orchestrator.runSubStory(defaultRunInput());
    expect(second).toEqual({
      storyJobId: STORY_JOB_ID,
      outcome: 'completed',
      quotaCommitted: false
    });

    // One generator invocation, one quota_charged flip, one
    // counter-side-effect commit. The cumulative count is the
    // observable invariant Requirement 8.7 protects.
    expect(h.generator.calls).toHaveLength(1);
    expect(h.quotaChargedDb.calls).toEqual([STORY_JOB_ID]);
    expect(h.paidCycleQuota.commitCount).toBe(1);
  });

  it('keeps the cumulative commit count at one even if quota_charged is already true on entry', async () => {
    // Belt-and-braces: pretend the row already has quota_charged=true
    // and is still at status='running' (e.g. a buggy caller that
    // committed quota out-of-band before the FSM advance landed).
    // The DB guard `WHERE quota_charged = false` is the authoritative
    // bound — the counter MUST NOT decrement a second time even
    // though the FSM transition succeeds.
    h.quotaChargedDb.seed(STORY_JOB_ID, true);
    h.generator.outcomes = [{ kind: 'success' }];

    const result = await h.orchestrator.runSubStory(defaultRunInput());

    expect(result).toEqual({
      storyJobId: STORY_JOB_ID,
      outcome: 'completed',
      // The `markQuotaCharged` callback returned false → committed=false.
      // Requirement 8.7's invariant ("retry không trừ thêm") holds.
      quotaCommitted: false
    });
    expect(h.paidCycleQuota.commitCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Defensive failure modes
// ---------------------------------------------------------------------------

describe('AutomationOrchestrator — defensive failure modes', () => {
  it('throws story_job_not_found when the row is missing', async () => {
    const h = buildHarness();
    h.fsmDb.rows.delete(STORY_JOB_ID);

    await expect(
      h.orchestrator.runSubStory(defaultRunInput())
    ).rejects.toMatchObject({
      code: 'story_job_not_found',
      storyJobId: STORY_JOB_ID
    });
  });

  it('throws illegal_state when runSubStory is invoked on a paused row', async () => {
    const h = buildHarness();
    h.fsmDb.seed({ id: STORY_JOB_ID, status: 'paused', version: 0 });

    await expect(
      h.orchestrator.runSubStory(defaultRunInput())
    ).rejects.toMatchObject({
      code: 'illegal_state'
    });
    // No counter or generator side-effects.
    expect(h.paidCycleQuota.commitCount).toBe(0);
  });

  it('rejects empty storyJobId on retrySubStory with a TypeError', async () => {
    const h = buildHarness();
    await expect(
      h.orchestrator.retrySubStory({ storyJobId: '' })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects missing fields on runSubStory with a TypeError', async () => {
    const h = buildHarness();
    await expect(
      h.orchestrator.runSubStory({
        automationJobId: '',
        storyJobId: STORY_JOB_ID,
        userId: USER_ID,
        paidCycleId: PAID_CYCLE_ID
      })
    ).rejects.toBeInstanceOf(TypeError);
  });
});
