import { describe, it, expect, beforeEach } from 'vitest';
import {
  StoryJobIllegalTransitionError,
  canTransition,
  legalTransitions,
  transition,
  type StoryJobEvent,
  type StoryJobState
} from '../../src/stories/fsm.js';
import {
  StoryJobFsmRepo,
  StoryJobNotFoundError,
  StoryJobVersionConflictError,
  applyTransition,
  type StoryJobFsmDb,
  type StoryJobFsmRow
} from '../../src/stories/fsmDb.js';

/**
 * Story_Job FSM unit tests — task 10.4.
 *
 * Two suites:
 *   1. Transition matrix — every (state, event) pair is exercised
 *      against a small enumeration table. Legal cells return the
 *      expected `nextState`; illegal cells throw
 *      `StoryJobIllegalTransitionError`.
 *   2. Optimistic locking — two simulated concurrent
 *      `applyTransition()` calls against the same row, both reading
 *      the same `expectedVersion`, end with exactly one winner; the
 *      other raises `StoryJobVersionConflictError` and the row's
 *      version advanced by 1.
 */

const ALL_STATES: readonly StoryJobState[] = [
  'running',
  'paused',
  'completed',
  'failed',
  'partial'
] as const;

const ALL_EVENTS: readonly StoryJobEvent[] = [
  'start',
  'pause',
  'resume',
  'stop',
  'fail',
  'complete',
  'retry'
] as const;

/**
 * Hand-written reference of every legal `(state, event, nextState)`
 * triple. Tests assert:
 *   1. Each legal triple is implemented (transition returns nextState).
 *   2. Every other (state, event) pair throws the illegal-transition error.
 *
 * Keep this in sync with the `TRANSITIONS` table in
 * `apps/api/src/stories/fsm.ts`.
 */
const LEGAL: readonly (readonly [StoryJobState, StoryJobEvent, StoryJobState])[] = [
  ['running', 'start', 'running'],
  ['running', 'pause', 'paused'],
  ['running', 'stop', 'partial'],
  ['running', 'fail', 'failed'],
  ['running', 'complete', 'completed'],
  ['paused', 'resume', 'running'],
  ['paused', 'stop', 'partial'],
  ['paused', 'fail', 'failed'],
  ['failed', 'retry', 'running'],
  ['partial', 'resume', 'running'],
  ['partial', 'retry', 'running']
] as const;

describe('Story_Job FSM transition()', () => {
  it.each(LEGAL)(
    'legal transition %s --%s--> %s returns nextState=%s',
    (from, event, expected) => {
      const result = transition(from, event);
      expect(result.nextState).toBe(expected);
    }
  );

  it('canTransition agrees with transition for every legal pair', () => {
    for (const [from, event] of LEGAL) {
      expect(canTransition(from, event)).toBe(true);
    }
  });

  it('throws StoryJobIllegalTransitionError for every (state, event) pair not in LEGAL', () => {
    const legalSet = new Set(LEGAL.map(([s, e]) => `${s}:${e}`));
    for (const state of ALL_STATES) {
      for (const event of ALL_EVENTS) {
        const key = `${state}:${event}`;
        if (legalSet.has(key)) continue;
        expect(canTransition(state, event)).toBe(false);
        expect(() => transition(state, event)).toThrow(StoryJobIllegalTransitionError);
        // Inner fields preserved for the gateway error mapper.
        try {
          transition(state, event);
        } catch (err) {
          expect(err).toBeInstanceOf(StoryJobIllegalTransitionError);
          const e = err as StoryJobIllegalTransitionError;
          expect(e.code).toBe('story_job_illegal_transition');
          expect(e.state).toBe(state);
          expect(e.event).toBe(event);
        }
      }
    }
  });

  it('completed is fully terminal', () => {
    for (const event of ALL_EVENTS) {
      expect(canTransition('completed', event)).toBe(false);
    }
  });

  it('legalTransitions() enumerates exactly the LEGAL table', () => {
    const enumerated = legalTransitions().map(
      (t) => `${t.from}:${t.event}:${t.to}`
    );
    const expected = LEGAL.map(([s, e, n]) => `${s}:${e}:${n}`);
    expect([...enumerated].sort()).toEqual([...expected].sort());
  });
});

/* -------------------------------------------------------------------------- */
/*                       In-memory fake StoryJobFsmDb                          */
/* -------------------------------------------------------------------------- */

/**
 * Minimal in-memory `StoryJobFsmDb` that mimics the optimistic-lock
 * semantics of the production Postgres adapter:
 *
 *   - `readJob` returns a snapshot (status, version).
 *   - `updateStatusIfVersion` succeeds iff the stored version still
 *     equals `expectedVersion`, in which case it bumps the version.
 *
 * The fake also exposes a `gate` hook used by the concurrency test to
 * synchronise two writers so they both land their UPDATE after both
 * have completed their READ.
 */
class FakeStoryJobFsmDb implements StoryJobFsmDb {
  public readonly rows = new Map<string, StoryJobFsmRow>();
  public reads = 0;
  public writes = 0;
  /**
   * Optional barrier hook. When set, every `updateStatusIfVersion`
   * call awaits it before applying the change. Tests use this to
   * align two writers so both stage UPDATE attempts after the read
   * phase has completed for both.
   */
  public beforeUpdate: (() => Promise<void>) | null = null;

  public seed(row: StoryJobFsmRow): void {
    this.rows.set(row.id, { ...row });
  }

  public snapshot(jobId: string): StoryJobFsmRow | undefined {
    const r = this.rows.get(jobId);
    return r ? { ...r } : undefined;
  }

  public async readJob(jobId: string): Promise<StoryJobFsmRow | null> {
    this.reads += 1;
    const r = this.rows.get(jobId);
    return r ? { ...r } : null;
  }

  public async updateStatusIfVersion(args: {
    jobId: string;
    newStatus: StoryJobState;
    expectedVersion: number;
  }): Promise<boolean> {
    if (this.beforeUpdate) {
      await this.beforeUpdate();
    }
    this.writes += 1;
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

describe('StoryJobFsmRepo.applyTransition (persistence)', () => {
  let db: FakeStoryJobFsmDb;
  let repo: StoryJobFsmRepo;

  beforeEach(() => {
    db = new FakeStoryJobFsmDb();
    repo = new StoryJobFsmRepo({ db });
  });

  it('applies a legal transition and bumps version by 1', async () => {
    db.seed({ id: 'job-1', status: 'running', version: 7 });

    const result = await repo.applyTransition('job-1', 7, 'pause');

    expect(result).toEqual({
      jobId: 'job-1',
      fromState: 'running',
      toState: 'paused',
      version: 8
    });
    expect(db.snapshot('job-1')).toEqual({
      id: 'job-1',
      status: 'paused',
      version: 8
    });
  });

  it('functional applyTransition() helper produces the same result', async () => {
    db.seed({ id: 'job-2', status: 'running', version: 0 });
    const result = await applyTransition(db, 'job-2', 0, 'complete');
    expect(result).toEqual({
      jobId: 'job-2',
      fromState: 'running',
      toState: 'completed',
      version: 1
    });
  });

  it('throws StoryJobNotFoundError when the row does not exist', async () => {
    await expect(repo.applyTransition('nope', 0, 'start')).rejects.toBeInstanceOf(
      StoryJobNotFoundError
    );
  });

  it('throws StoryJobIllegalTransitionError for an illegal event', async () => {
    db.seed({ id: 'job-3', status: 'completed', version: 4 });
    await expect(repo.applyTransition('job-3', 4, 'retry')).rejects.toBeInstanceOf(
      StoryJobIllegalTransitionError
    );
    // The row must NOT have been mutated by a failed transition.
    expect(db.snapshot('job-3')).toEqual({
      id: 'job-3',
      status: 'completed',
      version: 4
    });
  });

  it('throws StoryJobVersionConflictError when expectedVersion is stale', async () => {
    db.seed({ id: 'job-4', status: 'running', version: 5 });
    // Caller observed v=4 but the row already advanced to v=5.
    await expect(repo.applyTransition('job-4', 4, 'pause')).rejects.toBeInstanceOf(
      StoryJobVersionConflictError
    );
    // No write performed.
    expect(db.snapshot('job-4')).toEqual({
      id: 'job-4',
      status: 'running',
      version: 5
    });
  });

  it('serialises two concurrent transitions: exactly one wins, version advances by 1', async () => {
    db.seed({ id: 'job-5', status: 'running', version: 10 });

    // Coordinate two writers so both complete `readJob` before either
    // attempts `updateStatusIfVersion`. We open the gate once both
    // workers have arrived; from that point on the in-memory adapter's
    // version check is the deciding factor — exactly the same shape
    // as the SQL `WHERE id = $1 AND version = $2` predicate.
    let arrivals = 0;
    let release: (() => void) | null = null;
    const opened = new Promise<void>((res) => {
      release = res;
    });
    db.beforeUpdate = async () => {
      arrivals += 1;
      if (arrivals === 2 && release) {
        release();
      }
      await opened;
    };

    const a = repo.applyTransition('job-5', 10, 'pause');
    const b = repo.applyTransition('job-5', 10, 'fail');

    const results = await Promise.allSettled([a, b]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<{
      toState: StoryJobState;
      version: number;
    }>).value;
    expect(winner.version).toBe(11);
    // The winning toState must be one of the two attempted targets.
    expect(['paused', 'failed']).toContain(winner.toState);

    const loser = (rejected[0] as PromiseRejectedResult).reason;
    expect(loser).toBeInstanceOf(StoryJobVersionConflictError);
    expect((loser as StoryJobVersionConflictError).code).toBe(
      'story_job_version_conflict'
    );
    expect((loser as StoryJobVersionConflictError).expectedVersion).toBe(10);

    const final = db.snapshot('job-5');
    expect(final?.version).toBe(11);
    expect(final?.status).toBe(winner.toState);

    // Both transitions issued an UPDATE attempt; only one mutated the row.
    expect(db.writes).toBe(2);
  });
});
