import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  StoryConcurrencyLimiter,
  FREE_PLAN_STORY_CONCURRENCY,
  PAID_PLAN_STORY_CONCURRENCY
} from '../../src/rateLimit/concurrency.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';
import type { PlanType } from '../../src/license/types.js';

/**
 * Property 6 — Concurrency cap cho Story_Job.
 *
 * Validates: Requirements 5.8, 5.9
 *
 * State-machine property: across every interleaving of
 * `(acquire | release | finish)` actions, for every user:
 *
 *   1. `current(userId) ≤ cap` at every step (cap = 1 for Free_Plan,
 *      10 for Paid_Plan, Requirement 5.8).
 *   2. A denied acquire surfaces `errorCode: 'rate_limited'` with
 *      `retryAfterSeconds ≥ 1` (Requirement 5.9 — Retry-After header).
 *   3. Releasing a `jobId` that is NOT currently held is a safe no-op:
 *      the cardinality of the user's slot set does not change.
 *
 * The test uses an in-memory `RedisLike` so 500 state-machine runs stay
 * deterministic and fast.
 */

/**
 * Minimal in-memory `RedisLike` covering the SET surface
 * `StoryConcurrencyLimiter` exercises (`sadd`, `srem`, `scard`,
 * `expire`). Other members are stubs that throw or return defaults so
 * that an accidental call from the limiter would surface as a test
 * failure rather than silently passing.
 */
class FakeRedis implements RedisLike {
  private sets = new Map<string, Set<string>>();

  async sadd(key: string, ...members: string[]): Promise<number> {
    let bag = this.sets.get(key);
    if (!bag) {
      bag = new Set();
      this.sets.set(key, bag);
    }
    let added = 0;
    for (const m of members) {
      if (!bag.has(m)) {
        bag.add(m);
        added += 1;
      }
    }
    return added;
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const bag = this.sets.get(key);
    if (!bag) return 0;
    let removed = 0;
    for (const m of members) {
      if (bag.delete(m)) removed += 1;
    }
    if (bag.size === 0) this.sets.delete(key);
    return removed;
  }

  async scard(key: string): Promise<number> {
    return this.sets.get(key)?.size ?? 0;
  }

  async expire(_key: string, _seconds: number): Promise<number> {
    return 1;
  }

  // --- Unused methods kept to satisfy RedisLike. ---
  async get(): Promise<string | null> {
    return null;
  }
  async set(): Promise<unknown> {
    return 'OK';
  }
  async incr(): Promise<number> {
    return 0;
  }
  async incrby(): Promise<number> {
    return 0;
  }
  async pexpire(): Promise<number> {
    return 1;
  }
  async pttl(): Promise<number> {
    return -1;
  }
  async del(): Promise<number> {
    return 0;
  }
  async exists(): Promise<number> {
    return 0;
  }
  async eval(): Promise<unknown> {
    throw new Error('eval_not_supported');
  }
  async zadd(): Promise<number> {
    return 0;
  }
  async zremrangebyscore(): Promise<number> {
    return 0;
  }
  async zcard(): Promise<number> {
    return 0;
  }
  async zrange(): Promise<string[]> {
    return [];
  }
  multi(): RedisMultiLike {
    throw new Error('multi_not_supported');
  }
  async quit(): Promise<unknown> {
    return 'OK';
  }
  disconnect(): void {
    // no-op
  }
}

type Action =
  | { kind: 'acquire'; userIdx: number; jobIdx: number }
  | { kind: 'release'; userIdx: number; jobIdx: number }
  | { kind: 'finish'; userIdx: number; jobIdx: number };

/**
 * Bounded pool of users (each with a fixed plan) and jobIds. We cap the
 * job pool just above `PAID_PLAN_STORY_CONCURRENCY` (10) so generated
 * sequences regularly exercise overflow on Paid_Plan, while still being
 * small enough for shrinking to find minimal counterexamples.
 */
const MAX_USERS = 4;
const MAX_JOBS = 14;
const MAX_ACTIONS = 80;

const arbPlan = (): fc.Arbitrary<PlanType> =>
  fc.constantFrom<PlanType>('Free_Plan', 'Paid_Plan');

/**
 * Generates a `[plans, actions]` scenario where:
 *   - `plans[i]` is the plan for user `i`,
 *   - actions reference user/job indices within `plans` and the job pool.
 */
const arbScenario = (): fc.Arbitrary<readonly [PlanType[], Action[]]> =>
  fc
    .array(arbPlan(), { minLength: 1, maxLength: MAX_USERS })
    .chain((plans) => {
      const userArb = fc.integer({ min: 0, max: plans.length - 1 });
      const jobArb = fc.integer({ min: 0, max: MAX_JOBS - 1 });
      const actionArb: fc.Arbitrary<Action> = fc.oneof(
        fc.record({
          kind: fc.constant('acquire' as const),
          userIdx: userArb,
          jobIdx: jobArb
        }),
        fc.record({
          kind: fc.constant('release' as const),
          userIdx: userArb,
          jobIdx: jobArb
        }),
        fc.record({
          kind: fc.constant('finish' as const),
          userIdx: userArb,
          jobIdx: jobArb
        })
      );
      return fc.tuple(
        fc.constant(plans),
        fc.array(actionArb, { minLength: 1, maxLength: MAX_ACTIONS })
      );
    });

const capFor = (plan: PlanType): number =>
  plan === 'Free_Plan'
    ? FREE_PLAN_STORY_CONCURRENCY
    : PAID_PLAN_STORY_CONCURRENCY;

describe('StoryConcurrencyLimiter — Property 6 (concurrency cap state machine)', () => {
  it('Validates: Requirements 5.8, 5.9 — cap holds, denials are rate_limited, release-not-held is a no-op', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario(), async ([plans, actions]) => {
        const redis = new FakeRedis();
        const limiter = new StoryConcurrencyLimiter({ redis });

        const userIds = plans.map((_, i) => `user-${i}`);
        const jobIds = Array.from({ length: MAX_JOBS }, (_, j) => `job-${j}`);

        // Model: jobs we have successfully acquired (and not yet released)
        // for each user. Using a Set mirrors Redis SADD's idempotence.
        const held: Set<string>[] = plans.map(() => new Set<string>());

        for (const action of actions) {
          const userId = userIds[action.userIdx]!;
          const plan = plans[action.userIdx]!;
          const cap = capFor(plan);
          const jobId = jobIds[action.jobIdx]!;
          const userHeld = held[action.userIdx]!;

          if (action.kind === 'acquire') {
            const wasAlreadyHeld = userHeld.has(jobId);
            const decision = await limiter.acquire({ userId, plan, jobId });
            if (decision.allowed) {
              if (decision.jobId !== jobId) return false;
              userHeld.add(jobId);
            } else {
              // (Property 6 / Requirement 5.9)
              if (decision.errorCode !== 'rate_limited') return false;
              if (!(decision.retryAfterSeconds >= 1)) return false;
              // A denial only makes sense when the slot set is already
              // at cap AND the new jobId is not already a member
              // (re-acquiring a held job is idempotent and must be
              // allowed since SADD does not inflate cardinality).
              if (wasAlreadyHeld) return false;
              if (userHeld.size < cap) return false;
            }
          } else if (action.kind === 'finish') {
            // Lifecycle finish: release a job we believe is held. If the
            // index does not match a held job for this user, treat it as
            // a no-op (covered by the `release` branch below).
            const before = await limiter.current({ userId });
            const wasHeld = userHeld.has(jobId);
            await limiter.release({ userId, jobId });
            userHeld.delete(jobId);
            const after = await limiter.current({ userId });
            if (wasHeld) {
              if (after !== before - 1) return false;
            } else {
              // Releasing-not-held safety property.
              if (after !== before) return false;
            }
          } else {
            // action.kind === 'release' — explicit branch that may target
            // any jobId (held or not). Validates that releasing an unheld
            // jobId leaves cardinality unchanged.
            const before = await limiter.current({ userId });
            const wasHeld = userHeld.has(jobId);
            await limiter.release({ userId, jobId });
            userHeld.delete(jobId);
            const after = await limiter.current({ userId });
            if (wasHeld) {
              if (after !== before - 1) return false;
            } else {
              if (after !== before) return false;
            }
          }

          // Global cap invariant: every user's current ≤ cap, every step.
          for (let i = 0; i < userIds.length; i += 1) {
            const userCap = capFor(plans[i]!);
            const current = await limiter.current({ userId: userIds[i]! });
            if (current > userCap) return false;
            // Model and Redis must stay in lockstep.
            if (current !== held[i]!.size) return false;
          }
        }

        return true;
      }),
      { numRuns: 500 }
    );
  });
});
