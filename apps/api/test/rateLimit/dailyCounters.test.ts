import { describe, it, expect } from 'vitest';
import {
  DailyQuotaCounter,
  FREE_CHAPTER_DAILY_LIMIT,
  REWRITE_DAILY_LIMIT
} from '../../src/rateLimit/dailyCounters.js';
import {
  formatUtcDate,
  quotaFreeChapterKey,
  quotaRewriteKey
} from '../../src/redis/keys.js';
import { secondsUntilEndOfUtcDay } from '../../src/redis/ttl.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';

/**
 * In-memory RedisLike that supports the operations the daily counter
 * exercises (INCR/DECR/INCRBY, EXPIRE, GET, MULTI fallback for
 * `incrementWithTTL`). Self-contained so the test file does not depend
 * on test-helpers from sibling suites.
 */
class FakeRedis implements RedisLike {
  private strings = new Map<string, string>();
  private ttls = new Map<string, number>(); // ms; absent = no TTL

  // Public accessors for assertions on raw counter values / TTLs.
  rawValue(key: string): number | null {
    const v = this.strings.get(key);
    return v === undefined ? null : Number(v);
  }
  rawTtlMs(key: string): number | null {
    return this.ttls.get(key) ?? null;
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

  // The daily-counter exercises both code paths:
  //   - decrementCounter() expects eval to throw and falls back to incrby.
  //   - incrementWithTTL() expects eval to throw and falls back to MULTI.
  async eval(): Promise<unknown> {
    throw new Error('eval_not_supported');
  }

  // Sets / sorted-sets — unused, but RedisLike requires them.
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

const T_NOON = new Date('2025-03-09T12:00:00Z');

describe('DailyQuotaCounter constants', () => {
  it('exposes the documented caps', () => {
    expect(FREE_CHAPTER_DAILY_LIMIT).toBe(3);
    expect(REWRITE_DAILY_LIMIT).toBe(30);
  });
});

describe('DailyQuotaCounter.consumeFreeChapter (Requirements 5.2, 5.3)', () => {
  it('allows the first 3 calls and reports remaining = 2,1,0', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });

    const r1 = await counter.consumeFreeChapter({ userId: 'u1', now: T_NOON });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await counter.consumeFreeChapter({ userId: 'u1', now: T_NOON });
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await counter.consumeFreeChapter({ userId: 'u1', now: T_NOON });
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('denies the 4th call with free_chapter_quota_exhausted and rolls back the counter', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u1';

    for (let i = 0; i < 3; i += 1) {
      const ok = await counter.consumeFreeChapter({ userId, now: T_NOON });
      expect(ok.allowed).toBe(true);
    }

    const denied = await counter.consumeFreeChapter({ userId, now: T_NOON });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('free_chapter_quota_exhausted');
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBe(secondsUntilEndOfUtcDay(T_NOON));
    expect(denied.resetAt).toBe('2025-03-10T00:00:00.000Z');

    // The underlying counter must still be 3 after the rollback — the
    // "max 3 per day" cap is exact, with no leakage on denial.
    const utcDate = formatUtcDate(T_NOON);
    expect(redis.rawValue(quotaFreeChapterKey(userId, utcDate))).toBe(3);
  });

  it('repeated denials keep the counter pinned at the cap (no upward drift)', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u1';

    for (let i = 0; i < 3; i += 1) {
      await counter.consumeFreeChapter({ userId, now: T_NOON });
    }
    for (let i = 0; i < 5; i += 1) {
      const d = await counter.consumeFreeChapter({ userId, now: T_NOON });
      expect(d.allowed).toBe(false);
      expect(d.errorCode).toBe('free_chapter_quota_exhausted');
    }

    const utcDate = formatUtcDate(T_NOON);
    expect(redis.rawValue(quotaFreeChapterKey(userId, utcDate))).toBe(3);
  });

  it('grants a fresh 3 chapters on a new UTC day', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u1';

    for (let i = 0; i < 3; i += 1) {
      await counter.consumeFreeChapter({ userId, now: T_NOON });
    }
    const denied = await counter.consumeFreeChapter({ userId, now: T_NOON });
    expect(denied.allowed).toBe(false);

    // Next UTC day → new key, new window.
    const tNext = new Date('2025-03-10T00:00:00Z');
    const r1 = await counter.consumeFreeChapter({ userId, now: tNext });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    // Confirm the counter is keyed by a different UTC date.
    expect(formatUtcDate(tNext)).toBe('2025-03-10');
    expect(redis.rawValue(quotaFreeChapterKey(userId, '2025-03-10'))).toBe(1);
  });

  it('sets a TTL aligned to the next 00:00 UTC', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u1';
    const t = new Date('2025-03-09T23:30:00Z'); // 30 min before midnight

    await counter.consumeFreeChapter({ userId, now: t });

    const utcDate = formatUtcDate(t);
    const ttlMs = redis.rawTtlMs(quotaFreeChapterKey(userId, utcDate));
    expect(ttlMs).not.toBeNull();
    // TTL was applied as `seconds`, stored as ms; expect ~30 minutes.
    const expectedSec = secondsUntilEndOfUtcDay(t);
    expect(ttlMs).toBe(expectedSec * 1000);
  });
});

describe('DailyQuotaCounter.consumeRewrite (Requirements 7.4, 7.6)', () => {
  it('allows the first 30 calls and denies the 31st with rewrite_quota_exhausted', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u2';

    for (let i = 0; i < 30; i += 1) {
      const d = await counter.consumeRewrite({ userId, now: T_NOON });
      expect(d.allowed).toBe(true);
      expect(d.remaining).toBe(29 - i);
    }

    const denied = await counter.consumeRewrite({ userId, now: T_NOON });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('rewrite_quota_exhausted');
    expect(denied.remaining).toBe(0);
    expect(denied.retryAfterSeconds).toBe(secondsUntilEndOfUtcDay(T_NOON));
    expect(denied.resetAt).toBe('2025-03-10T00:00:00.000Z');

    // Cap remains exact after the rollback.
    const utcDate = formatUtcDate(T_NOON);
    expect(redis.rawValue(quotaRewriteKey(userId, utcDate))).toBe(30);
  });

  it('does not touch the Free-chapter counter (Requirement 7.5)', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u3';
    const utcDate = formatUtcDate(T_NOON);

    // Drive both flows on the same user on the same UTC day.
    for (let i = 0; i < 5; i += 1) {
      await counter.consumeRewrite({ userId, now: T_NOON });
    }

    // Free-chapter key must not exist or be zero — rewrite must NEVER
    // increment the chapter counter.
    expect(redis.rawValue(quotaFreeChapterKey(userId, utcDate))).toBeNull();

    // Now consume two free chapters and confirm the rewrite counter
    // is still exactly 5 (chapter consumption never touches rewrite).
    await counter.consumeFreeChapter({ userId, now: T_NOON });
    await counter.consumeFreeChapter({ userId, now: T_NOON });

    expect(redis.rawValue(quotaFreeChapterKey(userId, utcDate))).toBe(2);
    expect(redis.rawValue(quotaRewriteKey(userId, utcDate))).toBe(5);
  });

  it('grants a fresh 30 rewrites on a new UTC day', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u2';

    for (let i = 0; i < 30; i += 1) {
      await counter.consumeRewrite({ userId, now: T_NOON });
    }
    const denied = await counter.consumeRewrite({ userId, now: T_NOON });
    expect(denied.allowed).toBe(false);

    const tNext = new Date('2025-03-10T05:00:00Z');
    const r1 = await counter.consumeRewrite({ userId, now: tNext });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(29);
    expect(redis.rawValue(quotaRewriteKey(userId, '2025-03-10'))).toBe(1);
  });
});

describe('DailyQuotaCounter — independence of counters', () => {
  it('Free-chapter and rewrite counters are entirely independent', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u4';
    const utcDate = formatUtcDate(T_NOON);

    // Exhaust Free-chapter quota.
    for (let i = 0; i < 3; i += 1) {
      const d = await counter.consumeFreeChapter({ userId, now: T_NOON });
      expect(d.allowed).toBe(true);
    }
    const chapterDenied = await counter.consumeFreeChapter({ userId, now: T_NOON });
    expect(chapterDenied.allowed).toBe(false);

    // Rewrite must still be wide open (Requirement 7.5).
    const rw = await counter.consumeRewrite({ userId, now: T_NOON });
    expect(rw.allowed).toBe(true);
    expect(rw.remaining).toBe(REWRITE_DAILY_LIMIT - 1);

    expect(redis.rawValue(quotaFreeChapterKey(userId, utcDate))).toBe(3);
    expect(redis.rawValue(quotaRewriteKey(userId, utcDate))).toBe(1);
  });

  it('different users do not share counters', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });

    for (let i = 0; i < 3; i += 1) {
      await counter.consumeFreeChapter({ userId: 'a', now: T_NOON });
    }
    const aDenied = await counter.consumeFreeChapter({ userId: 'a', now: T_NOON });
    expect(aDenied.allowed).toBe(false);

    const bAllowed = await counter.consumeFreeChapter({ userId: 'b', now: T_NOON });
    expect(bAllowed.allowed).toBe(true);
    expect(bAllowed.remaining).toBe(2);
  });
});

describe('DailyQuotaCounter — custom limits and clock', () => {
  it('honours a freeChapterLimit override of 1', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis, freeChapterLimit: 1 });

    const r1 = await counter.consumeFreeChapter({ userId: 'u', now: T_NOON });
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(0);

    const r2 = await counter.consumeFreeChapter({ userId: 'u', now: T_NOON });
    expect(r2.allowed).toBe(false);
    expect(r2.errorCode).toBe('free_chapter_quota_exhausted');
  });

  it('honours a rewriteLimit override of 2', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis, rewriteLimit: 2 });

    expect((await counter.consumeRewrite({ userId: 'u', now: T_NOON })).allowed).toBe(
      true
    );
    expect((await counter.consumeRewrite({ userId: 'u', now: T_NOON })).allowed).toBe(
      true
    );
    const denied = await counter.consumeRewrite({ userId: 'u', now: T_NOON });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('rewrite_quota_exhausted');
  });

  it('uses the injected clock when `now` is omitted', async () => {
    const redis = new FakeRedis();
    const fixed = new Date('2025-03-09T12:00:00Z');
    const counter = new DailyQuotaCounter({ redis, clock: () => fixed });

    const d = await counter.consumeFreeChapter({ userId: 'u' });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(2);
    expect(redis.rawValue(quotaFreeChapterKey('u', '2025-03-09'))).toBe(1);
  });
});

describe('DailyQuotaCounter — commit hooks are no-ops', () => {
  it('commitFreeChapter / commitRewrite do not touch any counter', async () => {
    const redis = new FakeRedis();
    const counter = new DailyQuotaCounter({ redis });
    const userId = 'u';
    const utcDate = formatUtcDate(T_NOON);

    await counter.consumeFreeChapter({ userId, now: T_NOON });
    await counter.consumeRewrite({ userId, now: T_NOON });

    const beforeChapter = redis.rawValue(quotaFreeChapterKey(userId, utcDate));
    const beforeRewrite = redis.rawValue(quotaRewriteKey(userId, utcDate));

    await counter.commitFreeChapter({ userId, now: T_NOON });
    await counter.commitRewrite({ userId, now: T_NOON });

    expect(redis.rawValue(quotaFreeChapterKey(userId, utcDate))).toBe(beforeChapter);
    expect(redis.rawValue(quotaRewriteKey(userId, utcDate))).toBe(beforeRewrite);
  });
});

describe('DailyQuotaCounter — input validation', () => {
  it('rejects empty userId', async () => {
    const counter = new DailyQuotaCounter({ redis: new FakeRedis() });
    await expect(
      counter.consumeFreeChapter({ userId: '', now: T_NOON })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      counter.consumeRewrite({ userId: '', now: T_NOON })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects invalid Date', async () => {
    const counter = new DailyQuotaCounter({ redis: new FakeRedis() });
    await expect(
      counter.consumeFreeChapter({ userId: 'u', now: new Date('not-a-date') })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects bad construction options', () => {
    const redis = new FakeRedis();
    expect(
      () => new DailyQuotaCounter({ redis, freeChapterLimit: 0 })
    ).toThrow(RangeError);
    expect(
      () => new DailyQuotaCounter({ redis, freeChapterLimit: 1.5 })
    ).toThrow(RangeError);
    expect(
      () => new DailyQuotaCounter({ redis, rewriteLimit: -1 })
    ).toThrow(RangeError);
    expect(
      () => new DailyQuotaCounter({ redis: undefined as unknown as RedisLike })
    ).toThrow(TypeError);
  });
});
