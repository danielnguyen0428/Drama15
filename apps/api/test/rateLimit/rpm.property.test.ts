import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  RpmRateLimiter,
  RPM_LIMIT,
  RPM_WINDOW_SECONDS
} from '../../src/rateLimit/rpm.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';

/**
 * Property tests for the 60 rpm sliding-window rate limiter.
 *
 * **Property 7: Rate limit 60 req/phút**
 * **Validates: Requirements 5.1, 5.9**
 *
 * For arbitrary sequences of timestamps within a 5-minute window:
 *   1. The number of accepted calls in any rolling 60-second window is
 *      always ≤ 60 (Requirement 5.1).
 *   2. Whenever a call is denied, the limiter returns
 *      `errorCode: 'rate_limited'` and a `retryAfterSeconds` value in
 *      `[1, 60]` (Requirement 5.9).
 *   3. Calls spaced strictly more than 60 seconds apart from every
 *      previous call always succeed (no rolling-window pressure).
 *
 * The FakeRedis implementation is intentionally copied from
 * `rpm.test.ts` because the unit-test file does not export it; the
 * fixture is the same, so the two test files share semantics without a
 * cross-file import.
 */
class FakeRedis implements RedisLike {
  private zsets = new Map<string, Map<string, number>>();
  private ttls = new Map<string, number>();

  async zadd(key: string, ...args: (string | number)[]): Promise<number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    let added = 0;
    for (let i = 0; i < args.length; i += 2) {
      const score = Number(args[i]);
      const member = String(args[i + 1]);
      if (!z.has(member)) added += 1;
      z.set(member, score);
    }
    return added;
  }

  async zremrangebyscore(
    key: string,
    min: number | string,
    max: number | string
  ): Promise<number> {
    const z = this.zsets.get(key);
    if (!z) return 0;
    const lo = parseBound(min);
    const hi = parseBound(max);
    let removed = 0;
    for (const [member, score] of [...z.entries()]) {
      const lowOk = lo.exclusive ? score > lo.value : score >= lo.value;
      const highOk = hi.exclusive ? score < hi.value : score <= hi.value;
      if (lowOk && highOk) {
        z.delete(member);
        removed += 1;
      }
    }
    if (z.size === 0) this.zsets.delete(key);
    return removed;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrange(
    key: string,
    start: number,
    stop: number,
    ...args: string[]
  ): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) return [];
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
    const realStop = stop === -1 ? sorted.length - 1 : stop;
    const slice = sorted.slice(start, realStop + 1);
    const withScores = args.some((a) => a.toUpperCase() === 'WITHSCORES');
    if (withScores) {
      const out: string[] = [];
      for (const [member, score] of slice) {
        out.push(member);
        out.push(String(score));
      }
      return out;
    }
    return slice.map(([m]) => m);
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.zsets.has(key)) return 0;
    this.ttls.set(key, seconds * 1000);
    return 1;
  }

  // --- Unused by the rpm limiter; kept to satisfy RedisLike. ---
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
  async scard(): Promise<number> {
    return 0;
  }
  async sadd(): Promise<number> {
    return 0;
  }
  async srem(): Promise<number> {
    return 0;
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

function parseBound(raw: number | string): { value: number; exclusive: boolean } {
  if (typeof raw === 'number') return { value: raw, exclusive: false };
  if (raw === '-inf') return { value: -Infinity, exclusive: false };
  if (raw === '+inf') return { value: Infinity, exclusive: false };
  if (raw.startsWith('(')) return { value: Number(raw.slice(1)), exclusive: true };
  return { value: Number(raw), exclusive: false };
}

const T0_MS = Date.parse('2025-03-09T12:00:00Z');
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const WINDOW_MS = RPM_WINDOW_SECONDS * 1000;

/**
 * Generator: a sorted, ascending sequence of millisecond offsets within
 * a 5-minute window. Length 0..200 keeps each run fast while still
 * being able to drive the limiter past its 60-request cap many times
 * over inside one window.
 */
function arbTimestampOffsets(): fc.Arbitrary<number[]> {
  return fc
    .array(fc.integer({ min: 0, max: FIVE_MINUTES_MS }), {
      minLength: 0,
      maxLength: 200
    })
    .map((arr) => [...arr].sort((a, b) => a - b));
}

describe('RpmRateLimiter property tests (Property 7)', () => {
  /**
   * Validates: Requirements 5.1, 5.9
   *
   * For an arbitrary sorted sequence of timestamps inside a 5-minute
   * window, on every step:
   *   - accepted calls in any rolling 60s window are ≤ 60 (Req 5.1)
   *   - denied calls return `errorCode: 'rate_limited'` and
   *     `retryAfterSeconds ∈ [1, 60]` (Req 5.9)
   */
  it('accepted ≤ 60 in any 60s window AND denial shape is rate_limited + Retry-After ∈ [1,60]', async () => {
    await fc.assert(
      fc.asyncProperty(arbTimestampOffsets(), async (offsets) => {
        const redis = new FakeRedis();
        const limiter = new RpmRateLimiter({ redis });
        const acceptedAtMs: number[] = [];

        for (const offset of offsets) {
          const nowMs = T0_MS + offset;
          const decision = await limiter.consume({
            userId: 'u-prop',
            now: new Date(nowMs)
          });

          if (decision.allowed) {
            // Allowed shape: no errorCode, remaining ∈ [0, 59].
            if (decision.errorCode !== undefined) return false;
            if (typeof decision.remaining !== 'number') return false;
            if (decision.remaining < 0 || decision.remaining > RPM_LIMIT - 1) {
              return false;
            }

            acceptedAtMs.push(nowMs);

            // Property 1 (Req 5.1): count of accepted calls whose
            // timestamp falls in [nowMs - 60000, nowMs] must be ≤ 60.
            const windowStart = nowMs - WINDOW_MS;
            let inWindow = 0;
            for (let i = acceptedAtMs.length - 1; i >= 0; i -= 1) {
              const t = acceptedAtMs[i];
              if (t < windowStart) break;
              inWindow += 1;
            }
            if (inWindow > RPM_LIMIT) return false;
          } else {
            // Property 2 (Req 5.9): denial shape.
            if (decision.errorCode !== 'rate_limited') return false;
            if (typeof decision.retryAfterSeconds !== 'number') return false;
            if (decision.retryAfterSeconds < 1) return false;
            if (decision.retryAfterSeconds > RPM_WINDOW_SECONDS) return false;
            if (decision.remaining !== 0) return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Validates: Requirements 5.1, 5.9
   *
   * If every call is spaced strictly more than 60 seconds (here: 61s)
   * after the previous one, no call ever falls inside another's window
   * so the limiter MUST allow each call (and report `remaining = 59`).
   *
   * The 61-second gap (rather than exactly 60s) is intentional: the
   * sliding-window cutoff is `nowMs - 60_000` and entries with
   * `score >= cutoff` survive, so a previous call at exactly 60s ago
   * would still occupy a slot and inflate the count.
   */
  it('calls spaced > 60s apart from every previous call are always allowed', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 30 }), async (n) => {
        const redis = new FakeRedis();
        const limiter = new RpmRateLimiter({ redis });

        for (let i = 0; i < n; i += 1) {
          const nowMs = T0_MS + i * (WINDOW_MS + 1000); // 61s apart
          const decision = await limiter.consume({
            userId: 'u-spaced',
            now: new Date(nowMs)
          });
          if (!decision.allowed) return false;
          if (decision.errorCode !== undefined) return false;
          if (decision.remaining !== RPM_LIMIT - 1) return false;
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
