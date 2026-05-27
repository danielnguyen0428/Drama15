// Feature: commercial-web-saas, Property 5: Quota counters tôn trọng cap, window và idempotence
// Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.3, 6.5, 6.9, 7.4, 7.5, 7.6, 8.4, 8.5, 8.7, 9.5, 9.9
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  DailyQuotaCounter,
  FREE_CHAPTER_DAILY_LIMIT,
  REWRITE_DAILY_LIMIT
} from '../../src/rateLimit/dailyCounters.js';
import {
  PAID_FULL_STORY_LIMIT,
  PAID_VOICE_LIMIT,
  PaidCycleQuota,
  type MarkQuotaCharged
} from '../../src/rateLimit/paidCycle.js';
import {
  formatUtcDate,
  quotaFreeChapterKey,
  quotaPaidStoryKey,
  quotaPaidVoiceKey,
  quotaRewriteKey
} from '../../src/redis/keys.js';
import { secondsUntilCycleEnd } from '../../src/redis/ttl.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';

/**
 * Property 5 — Quota counters across all four windows respect their
 * cap, their window boundary, and idempotent retry semantics.
 *
 * **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.3, 6.5,
 * 6.9, 7.4, 7.5, 7.6, 8.4, 8.5, 8.7, 9.5, 9.9**
 *
 * State-machine property: across an arbitrary timestamped sequence of
 * mixed `free_chapter` / `rewrite` / `paid_full_story` / `paid_voice`
 * actions spanning a 60-day window (so the test crosses both UTC-day
 * rollovers and the Paid 30-day cycle boundary):
 *
 *   1. `free_chapter`: capped at 3 per UTC day per user (Req 5.2,
 *      5.3, 6.3). The 4th call in the same UTC day returns
 *      `errorCode: 'free_chapter_quota_exhausted'` with a Retry-After
 *      ≤ seconds-until-next-UTC-midnight; the underlying counter is
 *      pinned at 3 and never observed at 4.
 *   2. `rewrite`: capped at 30 per UTC day per user (Req 7.4, 7.6).
 *      The 31st returns `errorCode: 'rewrite_quota_exhausted'`.
 *      Crucially the rewrite call MUST NOT mutate any other counter
 *      (Req 7.5).
 *   3. `paid_full_story` (reserve+commit lifecycle, Req 5.4, 5.5,
 *      6.5, 8.4, 8.5): capped at 20 per Paid 30-day cycle. Reserve
 *      past the cap → `paid_story_quota_exhausted`. A successful
 *      reserve+commit(markQuotaCharged → true) increments by 1; a
 *      retry of an already-committed job (`markQuotaCharged → false`)
 *      MUST leave the counter unchanged (Req 6.9, 8.7, 9.9).
 *   4. `paid_voice`: same shape as paid_full_story but capped at 20
 *      per Paid 30-day cycle (Req 5.6, 5.7, 9.5, 9.9). The denial
 *      code is `paid_voice_quota_exhausted`.
 *   5. A `reserve+rollback` after a successful reserve never drives
 *      the counter below 0 (Req 6.5 / 8.7 / 9.9 — rollback does not
 *      penalise a counter that's already at 0).
 *   6. Crossing the Paid cycle boundary (Req 5.10) gives a fresh
 *      20/20 budget keyed by a different `paidCycleId`, with the old
 *      cycle's counter left at its final value.
 *
 * The reference model maintains the per-window expected counter map
 * in plain TypeScript, and at every step we assert that the raw Redis
 * counter equals the reference and that no counter ever exceeds its
 * cap. `numRuns: 500` per the design's "sensitive" property tier
 * (token rotation, quota state machine).
 */

// ---------------------------------------------------------------------------
// FakeRedis — same surface as test/rateLimit/dailyCounters.test.ts and
// test/rateLimit/paidCycle.test.ts. Copied inline rather than imported
// so the property test does not depend on test-helpers from sibling
// suites.
// ---------------------------------------------------------------------------

class FakeRedis implements RedisLike {
  private strings = new Map<string, string>();
  private ttls = new Map<string, number>();

  rawValue(key: string): number {
    const v = this.strings.get(key);
    return v === undefined ? 0 : Number(v);
  }

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<unknown> {
    this.strings.set(key, value);
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const cur = Number(this.strings.get(key) ?? '0');
    const next = cur + 1;
    this.strings.set(key, String(next));
    return next;
  }

  async incrby(key: string, increment: number): Promise<number> {
    const cur = Number(this.strings.get(key) ?? '0');
    const next = cur + increment;
    this.strings.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.strings.has(key)) return 0;
    this.ttls.set(key, seconds * 1000);
    return 1;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    if (!this.strings.has(key)) return 0;
    this.ttls.set(key, ms);
    return 1;
  }

  async pttl(key: string): Promise<number> {
    if (!this.strings.has(key)) return -2;
    const t = this.ttls.get(key);
    if (t === undefined) return -1;
    return t;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) {
      if (this.strings.delete(k)) removed += 1;
      this.ttls.delete(k);
    }
    return removed;
  }

  async exists(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.strings.has(k)) n += 1;
    return n;
  }

  // Force every helper into its non-Lua MULTI/GET fallback path.
  async eval(): Promise<unknown> {
    throw new Error('eval_not_supported');
  }

  async scard(): Promise<number> {
    return 0;
  }
  async sadd(): Promise<number> {
    return 0;
  }
  async srem(): Promise<number> {
    return 0;
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
    const ops: Array<() => Promise<[Error | null, unknown]>> = [];
    const tx: RedisMultiLike = {
      incr: (key: string) => {
        ops.push(async () => [null, await this.incr(key)]);
        return tx;
      },
      expire: (key: string, seconds: number) => {
        ops.push(async () => [null, await this.expire(key, seconds)]);
        return tx;
      },
      pttl: (key: string) => {
        ops.push(async () => [null, await this.pttl(key)]);
        return tx;
      },
      exec: async () => {
        const results: Array<[Error | null, unknown]> = [];
        for (const op of ops) results.push(await op());
        return results;
      }
    };
    return tx;
  }

  async quit(): Promise<unknown> {
    return 'OK';
  }
  disconnect(): void {
    // no-op
  }
}

// ---------------------------------------------------------------------------
// Scenario constants — 60-day window covering two Paid cycles.
// ---------------------------------------------------------------------------

const USER_ID = 'user-prop-5';
const T0 = new Date('2025-03-01T00:00:00.000Z');
const T0_MS = T0.getTime();
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const CYCLE_DAYS = 30;
const CYCLE_MS = CYCLE_DAYS * ONE_DAY_MS;
const SCENARIO_DAYS = 60;
const SCENARIO_MS = SCENARIO_DAYS * ONE_DAY_MS;

const CYCLE_A_ID = 'cycle-A';
const CYCLE_B_ID = 'cycle-B';
const CYCLE_A_EXPIRE = new Date(T0_MS + CYCLE_MS);
const CYCLE_B_EXPIRE = new Date(T0_MS + 2 * CYCLE_MS);

/**
 * Map a scenario timestamp offset to the active Paid cycle. Cycle A
 * spans days 0–30 (`paidExpireAt = T0 + 30 days`); cycle B spans
 * days 30–60 (`paidExpireAt = T0 + 60 days`). Crossing offset 30d
 * exercises Requirement 5.10 (renew rotates `paidCycleId` and gives
 * a fresh 20/20 budget).
 */
function activeCycle(offsetMs: number): {
  cycleId: string;
  paidExpireAt: Date;
} {
  if (offsetMs < CYCLE_MS) {
    return { cycleId: CYCLE_A_ID, paidExpireAt: CYCLE_A_EXPIRE };
  }
  return { cycleId: CYCLE_B_ID, paidExpireAt: CYCLE_B_EXPIRE };
}

function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0
    )
  );
}

// ---------------------------------------------------------------------------
// Action arbitraries.
// ---------------------------------------------------------------------------

type ActionKind =
  | 'free_chapter'
  | 'rewrite'
  | 'paid_story_commit'
  | 'paid_story_retry'
  | 'paid_story_rollback'
  | 'paid_voice_commit'
  | 'paid_voice_retry'
  | 'paid_voice_rollback';

interface Action {
  kind: ActionKind;
  offsetMs: number;
  /** Job id for paid_*_commit / paid_*_retry pairs (retry uses commit-only). */
  jobId: string;
}

const arbAction: fc.Arbitrary<Action> = fc.record({
  kind: fc.constantFrom<ActionKind>(
    'free_chapter',
    'rewrite',
    'paid_story_commit',
    'paid_story_retry',
    'paid_story_rollback',
    'paid_voice_commit',
    'paid_voice_retry',
    'paid_voice_rollback'
  ),
  offsetMs: fc.integer({ min: 0, max: SCENARIO_MS - 1 }),
  jobId: fc
    .integer({ min: 0, max: 1_000_000 })
    .map((n) => `job-${n.toString(36)}`)
});

const arbScenario: fc.Arbitrary<Action[]> = fc
  .array(arbAction, { minLength: 1, maxLength: 150 })
  .map((arr) => [...arr].sort((a, b) => a.offsetMs - b.offsetMs));

// ---------------------------------------------------------------------------
// Property 5 state-machine test.
// ---------------------------------------------------------------------------

describe('Quota counters state machine — Property 5', () => {
  it('caps, window resets, error codes, and idempotent retry hold across mixed action sequences', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async (actions) => {
        const redis = new FakeRedis();
        const dailyQuota = new DailyQuotaCounter({ redis });
        const paidQuota = new PaidCycleQuota({ redis });

        // Reference model: per-window expected counter values.
        const refFreeChapter = new Map<string, number>();
        const refRewrite = new Map<string, number>();
        const refPaidStory = new Map<string, number>();
        const refPaidVoice = new Map<string, number>();

        const trueMark: MarkQuotaCharged = async () => true;
        const falseMark: MarkQuotaCharged = async () => false;

        for (const action of actions) {
          const now = new Date(T0_MS + action.offsetMs);
          const utcDate = formatUtcDate(now);
          const { cycleId, paidExpireAt } = activeCycle(action.offsetMs);

          // Snapshot non-target counters BEFORE the action so we can
          // assert action-specific non-interference (Req 7.5: rewrite
          // never touches free_chapter or paid_story; commit/retry
          // never touches the daily counters).
          const beforeFC = redis.rawValue(quotaFreeChapterKey(USER_ID, utcDate));
          const beforeRW = redis.rawValue(quotaRewriteKey(USER_ID, utcDate));
          const beforeStoryA = redis.rawValue(
            quotaPaidStoryKey(USER_ID, CYCLE_A_ID)
          );
          const beforeStoryB = redis.rawValue(
            quotaPaidStoryKey(USER_ID, CYCLE_B_ID)
          );
          const beforeVoiceA = redis.rawValue(
            quotaPaidVoiceKey(USER_ID, CYCLE_A_ID)
          );
          const beforeVoiceB = redis.rawValue(
            quotaPaidVoiceKey(USER_ID, CYCLE_B_ID)
          );

          switch (action.kind) {
            case 'free_chapter': {
              const cur = refFreeChapter.get(utcDate) ?? 0;
              const decision = await dailyQuota.consumeFreeChapter({
                userId: USER_ID,
                now
              });
              if (cur < FREE_CHAPTER_DAILY_LIMIT) {
                if (!decision.allowed) return false;
                if (decision.errorCode !== undefined) return false;
                if (decision.remaining !== FREE_CHAPTER_DAILY_LIMIT - (cur + 1)) {
                  return false;
                }
                refFreeChapter.set(utcDate, cur + 1);
              } else {
                if (decision.allowed) return false;
                if (decision.errorCode !== 'free_chapter_quota_exhausted') {
                  return false;
                }
                if (decision.remaining !== 0) return false;
                if (
                  decision.resetAt !==
                  nextUtcMidnight(now).toISOString()
                ) {
                  return false;
                }
                if (
                  typeof decision.retryAfterSeconds !== 'number' ||
                  decision.retryAfterSeconds < 1
                ) {
                  return false;
                }
              }
              // free_chapter must not touch any other counter.
              if (
                redis.rawValue(quotaRewriteKey(USER_ID, utcDate)) !== beforeRW
              ) {
                return false;
              }
              if (
                redis.rawValue(quotaPaidStoryKey(USER_ID, CYCLE_A_ID)) !==
                  beforeStoryA ||
                redis.rawValue(quotaPaidStoryKey(USER_ID, CYCLE_B_ID)) !==
                  beforeStoryB
              ) {
                return false;
              }
              if (
                redis.rawValue(quotaPaidVoiceKey(USER_ID, CYCLE_A_ID)) !==
                  beforeVoiceA ||
                redis.rawValue(quotaPaidVoiceKey(USER_ID, CYCLE_B_ID)) !==
                  beforeVoiceB
              ) {
                return false;
              }
              break;
            }

            case 'rewrite': {
              const cur = refRewrite.get(utcDate) ?? 0;
              const decision = await dailyQuota.consumeRewrite({
                userId: USER_ID,
                now
              });
              if (cur < REWRITE_DAILY_LIMIT) {
                if (!decision.allowed) return false;
                if (decision.errorCode !== undefined) return false;
                if (decision.remaining !== REWRITE_DAILY_LIMIT - (cur + 1)) {
                  return false;
                }
                refRewrite.set(utcDate, cur + 1);
              } else {
                if (decision.allowed) return false;
                if (decision.errorCode !== 'rewrite_quota_exhausted') {
                  return false;
                }
                if (decision.remaining !== 0) return false;
                if (
                  decision.resetAt !==
                  nextUtcMidnight(now).toISOString()
                ) {
                  return false;
                }
                if (
                  typeof decision.retryAfterSeconds !== 'number' ||
                  decision.retryAfterSeconds < 1
                ) {
                  return false;
                }
              }
              // Requirement 7.5: rewrite NEVER mutates the free_chapter
              // or paid_story counters. Verify against the raw Redis
              // values, both for the "now" cycle and the dormant one.
              if (
                redis.rawValue(quotaFreeChapterKey(USER_ID, utcDate)) !==
                beforeFC
              ) {
                return false;
              }
              if (
                redis.rawValue(quotaPaidStoryKey(USER_ID, CYCLE_A_ID)) !==
                  beforeStoryA ||
                redis.rawValue(quotaPaidStoryKey(USER_ID, CYCLE_B_ID)) !==
                  beforeStoryB
              ) {
                return false;
              }
              if (
                redis.rawValue(quotaPaidVoiceKey(USER_ID, CYCLE_A_ID)) !==
                  beforeVoiceA ||
                redis.rawValue(quotaPaidVoiceKey(USER_ID, CYCLE_B_ID)) !==
                  beforeVoiceB
              ) {
                return false;
              }
              break;
            }

            case 'paid_story_commit': {
              const cur = refPaidStory.get(cycleId) ?? 0;
              const ttl = secondsUntilCycleEnd(paidExpireAt, now);
              const decision = await paidQuota.reserve({
                userId: USER_ID,
                paidCycleId: cycleId,
                paidExpireAt,
                action: 'full_story',
                now
              });
              if (ttl > 0 && cur < PAID_FULL_STORY_LIMIT) {
                if (!decision.allowed) return false;
                if (decision.errorCode !== undefined) return false;
                if (decision.remaining !== PAID_FULL_STORY_LIMIT - (cur + 1)) {
                  return false;
                }
                if (decision.resetAt !== paidExpireAt.toISOString()) {
                  return false;
                }
                refPaidStory.set(cycleId, cur + 1);

                // Fresh commit (markQuotaCharged → true): committed=true,
                // counter unchanged from the post-reserve value.
                const counterBeforeCommit = redis.rawValue(
                  quotaPaidStoryKey(USER_ID, cycleId)
                );
                const result = await paidQuota.commit({
                  userId: USER_ID,
                  paidCycleId: cycleId,
                  action: 'full_story',
                  jobId: action.jobId,
                  markQuotaCharged: trueMark
                });
                if (!result.committed) return false;
                if (
                  redis.rawValue(quotaPaidStoryKey(USER_ID, cycleId)) !==
                  counterBeforeCommit
                ) {
                  return false;
                }
              } else {
                if (decision.allowed) return false;
                if (decision.errorCode !== 'paid_story_quota_exhausted') {
                  return false;
                }
                if (decision.remaining !== 0) return false;
                if (decision.resetAt !== paidExpireAt.toISOString()) {
                  return false;
                }
              }
              break;
            }

            case 'paid_story_retry': {
              // Requirement 6.9 / 8.7 / 9.9: a retry of an already-
              // committed job (markQuotaCharged returns false) MUST
              // NOT decrement the counter. We model the retry as a
              // bare commit (no preceding reserve) — the production
              // workflow does not call reserve a second time for the
              // same job; only commit is replayed.
              const cur = refPaidStory.get(cycleId) ?? 0;
              const counterBefore = redis.rawValue(
                quotaPaidStoryKey(USER_ID, cycleId)
              );
              const result = await paidQuota.commit({
                userId: USER_ID,
                paidCycleId: cycleId,
                action: 'full_story',
                jobId: action.jobId,
                markQuotaCharged: falseMark
              });
              if (result.committed) return false;
              if (
                redis.rawValue(quotaPaidStoryKey(USER_ID, cycleId)) !==
                counterBefore
              ) {
                return false;
              }
              if ((refPaidStory.get(cycleId) ?? 0) !== cur) return false;
              break;
            }

            case 'paid_story_rollback': {
              const cur = refPaidStory.get(cycleId) ?? 0;
              const ttl = secondsUntilCycleEnd(paidExpireAt, now);
              const decision = await paidQuota.reserve({
                userId: USER_ID,
                paidCycleId: cycleId,
                paidExpireAt,
                action: 'full_story',
                now
              });
              if (ttl > 0 && cur < PAID_FULL_STORY_LIMIT) {
                if (!decision.allowed) return false;
                refPaidStory.set(cycleId, cur + 1);
                await paidQuota.rollback({
                  userId: USER_ID,
                  paidCycleId: cycleId,
                  action: 'full_story'
                });
                refPaidStory.set(cycleId, cur);
                // Rollback never drives the counter below 0 — it
                // returned to the pre-reserve value.
                if (
                  redis.rawValue(quotaPaidStoryKey(USER_ID, cycleId)) < 0
                ) {
                  return false;
                }
              } else {
                if (decision.allowed) return false;
                if (decision.errorCode !== 'paid_story_quota_exhausted') {
                  return false;
                }
                // Reserve was denied (and rolled back internally). Do
                // NOT call rollback() externally; production callers
                // only rollback after a SUCCESSFUL reserve.
              }
              break;
            }

            case 'paid_voice_commit': {
              const cur = refPaidVoice.get(cycleId) ?? 0;
              const ttl = secondsUntilCycleEnd(paidExpireAt, now);
              const decision = await paidQuota.reserve({
                userId: USER_ID,
                paidCycleId: cycleId,
                paidExpireAt,
                action: 'voice',
                now
              });
              if (ttl > 0 && cur < PAID_VOICE_LIMIT) {
                if (!decision.allowed) return false;
                if (decision.errorCode !== undefined) return false;
                if (decision.remaining !== PAID_VOICE_LIMIT - (cur + 1)) {
                  return false;
                }
                if (decision.resetAt !== paidExpireAt.toISOString()) {
                  return false;
                }
                refPaidVoice.set(cycleId, cur + 1);

                const counterBeforeCommit = redis.rawValue(
                  quotaPaidVoiceKey(USER_ID, cycleId)
                );
                const result = await paidQuota.commit({
                  userId: USER_ID,
                  paidCycleId: cycleId,
                  action: 'voice',
                  jobId: action.jobId,
                  markQuotaCharged: trueMark
                });
                if (!result.committed) return false;
                if (
                  redis.rawValue(quotaPaidVoiceKey(USER_ID, cycleId)) !==
                  counterBeforeCommit
                ) {
                  return false;
                }
              } else {
                if (decision.allowed) return false;
                if (decision.errorCode !== 'paid_voice_quota_exhausted') {
                  return false;
                }
                if (decision.remaining !== 0) return false;
                if (decision.resetAt !== paidExpireAt.toISOString()) {
                  return false;
                }
              }
              break;
            }

            case 'paid_voice_retry': {
              const cur = refPaidVoice.get(cycleId) ?? 0;
              const counterBefore = redis.rawValue(
                quotaPaidVoiceKey(USER_ID, cycleId)
              );
              const result = await paidQuota.commit({
                userId: USER_ID,
                paidCycleId: cycleId,
                action: 'voice',
                jobId: action.jobId,
                markQuotaCharged: falseMark
              });
              if (result.committed) return false;
              if (
                redis.rawValue(quotaPaidVoiceKey(USER_ID, cycleId)) !==
                counterBefore
              ) {
                return false;
              }
              if ((refPaidVoice.get(cycleId) ?? 0) !== cur) return false;
              break;
            }

            case 'paid_voice_rollback': {
              const cur = refPaidVoice.get(cycleId) ?? 0;
              const ttl = secondsUntilCycleEnd(paidExpireAt, now);
              const decision = await paidQuota.reserve({
                userId: USER_ID,
                paidCycleId: cycleId,
                paidExpireAt,
                action: 'voice',
                now
              });
              if (ttl > 0 && cur < PAID_VOICE_LIMIT) {
                if (!decision.allowed) return false;
                refPaidVoice.set(cycleId, cur + 1);
                await paidQuota.rollback({
                  userId: USER_ID,
                  paidCycleId: cycleId,
                  action: 'voice'
                });
                refPaidVoice.set(cycleId, cur);
                if (
                  redis.rawValue(quotaPaidVoiceKey(USER_ID, cycleId)) < 0
                ) {
                  return false;
                }
              } else {
                if (decision.allowed) return false;
                if (decision.errorCode !== 'paid_voice_quota_exhausted') {
                  return false;
                }
              }
              break;
            }
          }

          // ------------------------------------------------------------
          // Step-end invariants — reference model and Redis must agree
          // on every counter and no counter ever exceeds its cap.
          // ------------------------------------------------------------

          for (const [date, count] of refFreeChapter) {
            if (count > FREE_CHAPTER_DAILY_LIMIT) return false;
            if (count < 0) return false;
            if (
              redis.rawValue(quotaFreeChapterKey(USER_ID, date)) !== count
            ) {
              return false;
            }
          }
          for (const [date, count] of refRewrite) {
            if (count > REWRITE_DAILY_LIMIT) return false;
            if (count < 0) return false;
            if (redis.rawValue(quotaRewriteKey(USER_ID, date)) !== count) {
              return false;
            }
          }
          for (const [cid, count] of refPaidStory) {
            if (count > PAID_FULL_STORY_LIMIT) return false;
            if (count < 0) return false;
            if (
              redis.rawValue(quotaPaidStoryKey(USER_ID, cid)) !== count
            ) {
              return false;
            }
          }
          for (const [cid, count] of refPaidVoice) {
            if (count > PAID_VOICE_LIMIT) return false;
            if (count < 0) return false;
            if (
              redis.rawValue(quotaPaidVoiceKey(USER_ID, cid)) !== count
            ) {
              return false;
            }
          }
        }

        return true;
      }),
      { numRuns: 500 }
    );
  });
});
