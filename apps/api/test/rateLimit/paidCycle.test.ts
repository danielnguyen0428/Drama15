import { describe, it, expect } from 'vitest';
import {
  PAID_FULL_STORY_LIMIT,
  PAID_VOICE_LIMIT,
  PaidCycleQuota,
  type MarkQuotaCharged,
  type PaidCycleAction
} from '../../src/rateLimit/paidCycle.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';
import {
  quotaPaidStoryKey,
  quotaPaidVoiceKey
} from '../../src/redis/keys.js';

/**
 * In-memory RedisLike that supports the operations the Paid 30-day
 * cycle quota counter actually exercises:
 *
 *   - INCR + EXPIRE + PTTL through the MULTI fallback in
 *     `incrementWithTTL` (we throw `eval_not_supported` from `eval`).
 *   - GET / INCRBY for the `decrementCounter` fallback in paidCycle.ts.
 *
 * Mirrors `test/redis/quota.test.ts` and `test/rateLimit/rpm.test.ts`
 * patterns: same shape, only the methods we call are real.
 */
class FakeRedis implements RedisLike {
  private strings = new Map<string, string>();
  private ttls = new Map<string, number>();

  /** Counters of how many times INCR / EXPIRE were issued per key. */
  public readonly incrCalls = new Map<string, number>();
  public readonly expireCalls: Array<{ key: string; seconds: number }> = [];

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
    this.incrCalls.set(key, (this.incrCalls.get(key) ?? 0) + 1);
    return next;
  }

  async incrby(key: string, increment: number): Promise<number> {
    const cur = Number(this.strings.get(key) ?? '0');
    const next = cur + increment;
    this.strings.set(key, String(next));
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expireCalls.push({ key, seconds });
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
    if (t === undefined || t === 0) return -1;
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
    let count = 0;
    for (const k of keys) {
      if (this.strings.has(k)) count += 1;
    }
    return count;
  }

  /** Force every helper into its non-Lua MULTI/GET fallback path. */
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

  /** Test helper: read raw counter value. */
  rawCounter(key: string): number {
    const v = this.strings.get(key);
    return v === undefined ? 0 : Number(v);
  }
}

const NOW = new Date('2025-03-09T12:00:00Z');
const PAID_EXPIRE_AT = new Date('2025-04-08T12:00:00Z'); // 30 days later
const USER_ID = 'user-1';
const CYCLE_ID = 'cycle-A';

function makeQuota(redis: FakeRedis): PaidCycleQuota {
  return new PaidCycleQuota({ redis, clock: () => NOW });
}

describe('PaidCycleQuota.reserve', () => {
  it('exposes the documented Paid-cycle defaults', () => {
    expect(PAID_FULL_STORY_LIMIT).toBe(20);
    expect(PAID_VOICE_LIMIT).toBe(20);
  });

  it('allows the first 20 full-story reservations and denies the 21st (Requirement 5.4, 5.5)', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);

    for (let i = 1; i <= 20; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      });
      expect(d.allowed).toBe(true);
      expect(d.errorCode).toBeUndefined();
      expect(d.remaining).toBe(20 - i);
      expect(d.resetAt).toBe(PAID_EXPIRE_AT.toISOString());
    }

    const denied = await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('paid_story_quota_exhausted');
    expect(denied.remaining).toBe(0);
    expect(denied.resetAt).toBe(PAID_EXPIRE_AT.toISOString());

    // The reservation past the cap rolled back, so the counter is
    // pinned at exactly 20 — never observed at 21.
    const key = quotaPaidStoryKey(USER_ID, CYCLE_ID);
    expect(redis.rawCounter(key)).toBe(20);
  });

  it('allows the first 20 voice reservations and denies the 21st (Requirement 5.6, 5.7)', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);

    for (let i = 1; i <= 20; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'voice'
      });
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(20 - i);
    }

    const denied = await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'voice'
    });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('paid_voice_quota_exhausted');
    expect(denied.remaining).toBe(0);

    const key = quotaPaidVoiceKey(USER_ID, CYCLE_ID);
    expect(redis.rawCounter(key)).toBe(20);
  });

  it('keeps story and voice counters independent (Requirement 5.4 vs 5.6)', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);

    // Exhaust full-story quota first.
    for (let i = 0; i < 20; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      });
      expect(d.allowed).toBe(true);
    }
    const storyDenied = await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    expect(storyDenied.allowed).toBe(false);

    // Voice still has its full 20 budget — exhausting story does NOT
    // block voice.
    for (let i = 1; i <= 20; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'voice'
      });
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(20 - i);
    }
    const voiceDenied = await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'voice'
    });
    expect(voiceDenied.allowed).toBe(false);
    expect(voiceDenied.errorCode).toBe('paid_voice_quota_exhausted');
  });

  it('rolls back the speculative INCR so the counter never exceeds the cap', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const key = quotaPaidStoryKey(USER_ID, CYCLE_ID);

    for (let i = 0; i < 20; i += 1) {
      await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      });
    }
    expect(redis.rawCounter(key)).toBe(20);

    // Many denied reservations must each roll back; counter stays at 20.
    for (let i = 0; i < 5; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      });
      expect(d.allowed).toBe(false);
      expect(d.errorCode).toBe('paid_story_quota_exhausted');
      expect(redis.rawCounter(key)).toBe(20);
    }
  });

  it('refuses the call without INCR when paidExpireAt is in the past', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);

    const expired = new Date(NOW.getTime() - 1_000);
    const decision = await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: expired,
      action: 'full_story'
    });
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe('paid_story_quota_exhausted');
    expect(decision.remaining).toBe(0);
    expect(decision.resetAt).toBe(expired.toISOString());

    const key = quotaPaidStoryKey(USER_ID, CYCLE_ID);
    expect(redis.incrCalls.get(key) ?? 0).toBe(0);
    expect(redis.rawCounter(key)).toBe(0);
  });

  it('returns paid_voice_quota_exhausted when the voice cycle is over', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);

    const expired = new Date(NOW.getTime() - 60_000);
    const decision = await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: expired,
      action: 'voice'
    });
    expect(decision.allowed).toBe(false);
    expect(decision.errorCode).toBe('paid_voice_quota_exhausted');
    expect(redis.incrCalls.get(quotaPaidVoiceKey(USER_ID, CYCLE_ID)) ?? 0).toBe(0);
  });

  it('uses distinct keys per paidCycleId so a renew rotates the budget (Requirement 5.10)', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);

    // Exhaust full-story budget on cycle A.
    for (let i = 0; i < 20; i += 1) {
      await q.reserve({
        userId: USER_ID,
        paidCycleId: 'cycle-A',
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      });
    }
    const exhausted = await q.reserve({
      userId: USER_ID,
      paidCycleId: 'cycle-A',
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    expect(exhausted.allowed).toBe(false);

    // Renewal rotates to cycle-B with a fresh expiry; the user gets a
    // fresh 20/20 — same userId, different paidCycleId.
    const newExpire = new Date('2025-05-08T12:00:00Z');
    const fresh = await q.reserve({
      userId: USER_ID,
      paidCycleId: 'cycle-B',
      paidExpireAt: newExpire,
      action: 'full_story'
    });
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(19);

    expect(redis.rawCounter(quotaPaidStoryKey(USER_ID, 'cycle-A'))).toBe(20);
    expect(redis.rawCounter(quotaPaidStoryKey(USER_ID, 'cycle-B'))).toBe(1);
  });

  it('honours custom limit overrides for tests', async () => {
    const redis = new FakeRedis();
    const q = new PaidCycleQuota({
      redis,
      clock: () => NOW,
      fullStoryLimit: 2,
      voiceLimit: 3
    });

    for (let i = 0; i < 2; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      });
      expect(d.allowed).toBe(true);
    }
    expect(
      (
        await q.reserve({
          userId: USER_ID,
          paidCycleId: CYCLE_ID,
          paidExpireAt: PAID_EXPIRE_AT,
          action: 'full_story'
        })
      ).allowed
    ).toBe(false);

    for (let i = 0; i < 3; i += 1) {
      const d = await q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'voice'
      });
      expect(d.allowed).toBe(true);
    }
    expect(
      (
        await q.reserve({
          userId: USER_ID,
          paidCycleId: CYCLE_ID,
          paidExpireAt: PAID_EXPIRE_AT,
          action: 'voice'
        })
      ).allowed
    ).toBe(false);
  });

  it('rejects bad inputs', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    await expect(
      q.reserve({
        userId: '',
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.reserve({
        userId: USER_ID,
        paidCycleId: '',
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'full_story'
      })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: new Date('not-a-date'),
        action: 'full_story'
      })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.reserve({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        paidExpireAt: PAID_EXPIRE_AT,
        action: 'bogus' as PaidCycleAction
      })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects non-positive cap overrides at construction', () => {
    const redis = new FakeRedis();
    expect(() => new PaidCycleQuota({ redis, fullStoryLimit: 0 })).toThrow(RangeError);
    expect(() => new PaidCycleQuota({ redis, voiceLimit: -1 })).toThrow(RangeError);
    expect(() => new PaidCycleQuota({ redis, fullStoryLimit: 1.5 })).toThrow(RangeError);
  });
});

describe('PaidCycleQuota.commit', () => {
  it('flips quota_charged and reports committed=true on first commit (Requirement 6.5, 8.5, 9.5)', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const calls: Array<{ jobId: string; jobKind: 'story' | 'voice' }> = [];
    const markQuotaCharged: MarkQuotaCharged = async (input) => {
      calls.push(input);
      return true;
    };

    const result = await q.commit({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story',
      jobId: 'job-1',
      markQuotaCharged
    });
    expect(result.committed).toBe(true);
    expect(calls).toEqual([{ jobId: 'job-1', jobKind: 'story' }]);
  });

  it('passes jobKind="voice" for voice commits', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    let received: { jobId: string; jobKind: 'story' | 'voice' } | null = null;
    const markQuotaCharged: MarkQuotaCharged = async (input) => {
      received = input;
      return true;
    };

    await q.commit({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'voice',
      jobId: 'voice-job-7',
      markQuotaCharged
    });
    expect(received).toEqual({ jobId: 'voice-job-7', jobKind: 'voice' });
  });

  it('reports committed=false on retry without touching the counter (Requirements 6.9, 7.7, 8.7, 9.9)', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const key = quotaPaidStoryKey(USER_ID, CYCLE_ID);

    // Reserve once; counter is 1.
    await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    expect(redis.rawCounter(key)).toBe(1);

    // First commit flips the flag.
    const flipped: MarkQuotaCharged = async () => true;
    const first = await q.commit({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story',
      jobId: 'job-1',
      markQuotaCharged: flipped
    });
    expect(first.committed).toBe(true);
    expect(redis.rawCounter(key)).toBe(1);

    // A retry observes the flag already-true; commit MUST NOT decrement.
    const alreadyFlipped: MarkQuotaCharged = async () => false;
    const second = await q.commit({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story',
      jobId: 'job-1',
      markQuotaCharged: alreadyFlipped
    });
    expect(second.committed).toBe(false);
    expect(redis.rawCounter(key)).toBe(1);
  });

  it('rejects bad inputs', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const noop: MarkQuotaCharged = async () => true;
    await expect(
      q.commit({
        userId: '',
        paidCycleId: CYCLE_ID,
        action: 'full_story',
        jobId: 'j',
        markQuotaCharged: noop
      })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.commit({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        action: 'full_story',
        jobId: '',
        markQuotaCharged: noop
      })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.commit({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        action: 'full_story',
        jobId: 'j',
        markQuotaCharged: undefined as unknown as MarkQuotaCharged
      })
    ).rejects.toBeInstanceOf(TypeError);
  });
});

describe('PaidCycleQuota.rollback', () => {
  it('decrements the counter exactly once', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const key = quotaPaidStoryKey(USER_ID, CYCLE_ID);

    await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    expect(redis.rawCounter(key)).toBe(2);

    await q.rollback({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story'
    });
    expect(redis.rawCounter(key)).toBe(1);
  });

  it('never drives the counter below 0', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const key = quotaPaidStoryKey(USER_ID, CYCLE_ID);

    // No reservation, so the counter is 0. Rollback must be a no-op.
    await q.rollback({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story'
    });
    expect(redis.rawCounter(key)).toBe(0);

    // Reserve once, rollback twice — second rollback must clamp at 0.
    await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'full_story'
    });
    await q.rollback({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story'
    });
    expect(redis.rawCounter(key)).toBe(0);
    await q.rollback({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'full_story'
    });
    expect(redis.rawCounter(key)).toBe(0);
  });

  it('targets the voice key when action="voice"', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    const storyKey = quotaPaidStoryKey(USER_ID, CYCLE_ID);
    const voiceKey = quotaPaidVoiceKey(USER_ID, CYCLE_ID);

    await q.reserve({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      paidExpireAt: PAID_EXPIRE_AT,
      action: 'voice'
    });
    expect(redis.rawCounter(voiceKey)).toBe(1);
    expect(redis.rawCounter(storyKey)).toBe(0);

    await q.rollback({
      userId: USER_ID,
      paidCycleId: CYCLE_ID,
      action: 'voice'
    });
    expect(redis.rawCounter(voiceKey)).toBe(0);
    expect(redis.rawCounter(storyKey)).toBe(0);
  });

  it('rejects bad inputs', async () => {
    const redis = new FakeRedis();
    const q = makeQuota(redis);
    await expect(
      q.rollback({ userId: '', paidCycleId: CYCLE_ID, action: 'full_story' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.rollback({ userId: USER_ID, paidCycleId: '', action: 'full_story' })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      q.rollback({
        userId: USER_ID,
        paidCycleId: CYCLE_ID,
        action: 'bogus' as PaidCycleAction
      })
    ).rejects.toBeInstanceOf(TypeError);
  });
});
