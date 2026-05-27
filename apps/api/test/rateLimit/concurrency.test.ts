import { describe, it, expect } from 'vitest';
import {
  StoryConcurrencyLimiter,
  FREE_PLAN_STORY_CONCURRENCY,
  PAID_PLAN_STORY_CONCURRENCY,
  STORY_JOB_TTL_SECONDS
} from '../../src/rateLimit/concurrency.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';

/**
 * In-memory RedisLike supporting only the SET operations the
 * concurrency limiter exercises (sadd / srem / scard / expire) plus an
 * `expireCalls` ledger so we can prove the TTL safety net is applied
 * (Requirement 5.8).
 */
class FakeRedis implements RedisLike {
  private sets = new Map<string, Set<string>>();
  private ttls = new Map<string, number>();

  /** Append-only ledger of every EXPIRE call, keyed in arrival order. */
  public expireCalls: Array<{ key: string; seconds: number }> = [];

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

  async expire(key: string, seconds: number): Promise<number> {
    this.expireCalls.push({ key, seconds });
    if (!this.sets.has(key)) return 0;
    this.ttls.set(key, seconds * 1000);
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

describe('StoryConcurrencyLimiter — exposed defaults', () => {
  it('exports the caps and TTL defined in Requirement 5.8', () => {
    expect(FREE_PLAN_STORY_CONCURRENCY).toBe(1);
    expect(PAID_PLAN_STORY_CONCURRENCY).toBe(10);
    expect(STORY_JOB_TTL_SECONDS).toBe(24 * 60 * 60);
  });
});

describe('StoryConcurrencyLimiter.acquire — Free_Plan (Requirement 5.8)', () => {
  it('allows the first job and rejects the second concurrent job', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    const first = await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-1'
    });
    expect(first.allowed).toBe(true);
    if (first.allowed) {
      expect(first.jobId).toBe('job-1');
    }

    const second = await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-2'
    });
    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.errorCode).toBe('rate_limited');
      expect(second.retryAfterSeconds).toBe(1);
    }

    // After rejection, the set should still hold exactly one slot — the
    // first job. The denied jobId must have been rolled back.
    expect(await limiter.current({ userId: 'u1' })).toBe(1);
  });

  it('allows a new acquire after release frees the slot', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    const first = await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-1'
    });
    expect(first.allowed).toBe(true);

    await limiter.release({ userId: 'u1', jobId: 'job-1' });
    expect(await limiter.current({ userId: 'u1' })).toBe(0);

    const second = await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-2'
    });
    expect(second.allowed).toBe(true);
    expect(await limiter.current({ userId: 'u1' })).toBe(1);
  });
});

describe('StoryConcurrencyLimiter.acquire — Paid_Plan (Requirement 5.8)', () => {
  it('allows up to 10 concurrent jobs and rejects the 11th', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    for (let i = 1; i <= 10; i += 1) {
      const decision = await limiter.acquire({
        userId: 'paid-user',
        plan: 'Paid_Plan',
        jobId: `job-${i}`
      });
      expect(decision.allowed).toBe(true);
    }
    expect(await limiter.current({ userId: 'paid-user' })).toBe(10);

    const eleventh = await limiter.acquire({
      userId: 'paid-user',
      plan: 'Paid_Plan',
      jobId: 'job-11'
    });
    expect(eleventh.allowed).toBe(false);
    if (!eleventh.allowed) {
      expect(eleventh.errorCode).toBe('rate_limited');
      expect(eleventh.retryAfterSeconds).toBe(1);
    }
    // Set still holds exactly 10 — the rejected jobId was rolled back.
    expect(await limiter.current({ userId: 'paid-user' })).toBe(10);
  });

  it('admits a new job after releasing one of the ten slots', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    for (let i = 1; i <= 10; i += 1) {
      await limiter.acquire({
        userId: 'paid-user',
        plan: 'Paid_Plan',
        jobId: `job-${i}`
      });
    }
    await limiter.release({ userId: 'paid-user', jobId: 'job-3' });
    expect(await limiter.current({ userId: 'paid-user' })).toBe(9);

    const next = await limiter.acquire({
      userId: 'paid-user',
      plan: 'Paid_Plan',
      jobId: 'job-11'
    });
    expect(next.allowed).toBe(true);
    expect(await limiter.current({ userId: 'paid-user' })).toBe(10);
  });
});

describe('StoryConcurrencyLimiter.acquire — idempotence', () => {
  it('re-adding the same jobId does not exceed the cap', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    // Free_Plan cap = 1: re-acquiring the same jobId must stay allowed
    // because Redis SADD on an existing member returns 0 (the
    // cardinality stays at 1, which is still ≤ cap).
    const first = await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-1'
    });
    expect(first.allowed).toBe(true);

    const repeat = await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-1'
    });
    expect(repeat.allowed).toBe(true);
    if (repeat.allowed) {
      expect(repeat.jobId).toBe('job-1');
    }

    expect(await limiter.current({ userId: 'u1' })).toBe(1);
  });
});

describe('StoryConcurrencyLimiter — TTL safety net (Requirement 5.8)', () => {
  it('applies the 24-hour TTL on every acquire of a brand-new set', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    await limiter.acquire({
      userId: 'u1',
      plan: 'Free_Plan',
      jobId: 'job-1'
    });

    const expiresForKey = redis.expireCalls.filter(
      (c) => c.key === 'concurrency:story:u1'
    );
    expect(expiresForKey.length).toBeGreaterThanOrEqual(1);
    expect(expiresForKey[0]!.seconds).toBe(STORY_JOB_TTL_SECONDS);
    expect(STORY_JOB_TTL_SECONDS).toBe(24 * 60 * 60);
  });

  it('honours a custom ttlSec when provided', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({
      redis,
      ttlSec: 42
    });

    await limiter.acquire({
      userId: 'u-custom',
      plan: 'Paid_Plan',
      jobId: 'job-x'
    });

    const expiresForKey = redis.expireCalls.filter(
      (c) => c.key === 'concurrency:story:u-custom'
    );
    expect(expiresForKey).toHaveLength(1);
    expect(expiresForKey[0]!.seconds).toBe(42);
  });
});

describe('StoryConcurrencyLimiter.current', () => {
  it('returns the number of in-flight jobs', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    expect(await limiter.current({ userId: 'u1' })).toBe(0);

    await limiter.acquire({
      userId: 'u1',
      plan: 'Paid_Plan',
      jobId: 'job-1'
    });
    expect(await limiter.current({ userId: 'u1' })).toBe(1);

    await limiter.acquire({
      userId: 'u1',
      plan: 'Paid_Plan',
      jobId: 'job-2'
    });
    expect(await limiter.current({ userId: 'u1' })).toBe(2);

    await limiter.release({ userId: 'u1', jobId: 'job-1' });
    expect(await limiter.current({ userId: 'u1' })).toBe(1);
  });
});

describe('StoryConcurrencyLimiter — input validation', () => {
  it('rejects bad inputs to acquire', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    await expect(
      limiter.acquire({ userId: '', plan: 'Free_Plan', jobId: 'job-1' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      limiter.acquire({ userId: 'u1', plan: 'Free_Plan', jobId: '' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      limiter.acquire({
        userId: 'u1',
        // @ts-expect-error — runtime guard for unknown plan strings
        plan: 'Trial_Plan',
        jobId: 'job-1'
      })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects bad inputs to release / current', async () => {
    const redis = new FakeRedis();
    const limiter = new StoryConcurrencyLimiter({ redis });

    await expect(
      limiter.release({ userId: '', jobId: 'job-1' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      limiter.release({ userId: 'u1', jobId: '' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      limiter.current({ userId: '' })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects non-positive caps / ttl at construction', () => {
    const redis = new FakeRedis();
    expect(() => new StoryConcurrencyLimiter({ redis, freePlanCap: 0 })).toThrow(
      RangeError
    );
    expect(() => new StoryConcurrencyLimiter({ redis, paidPlanCap: -1 })).toThrow(
      RangeError
    );
    expect(() => new StoryConcurrencyLimiter({ redis, ttlSec: 0 })).toThrow(
      RangeError
    );
    expect(
      () => new StoryConcurrencyLimiter({ redis, freePlanCap: 1.5 })
    ).toThrow(RangeError);
  });
});
