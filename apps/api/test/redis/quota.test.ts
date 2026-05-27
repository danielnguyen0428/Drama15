import { describe, it, expect } from 'vitest';
import {
  addToConcurrencySet,
  addToSlidingWindow,
  incrementWithTTL,
  removeFromConcurrencySet
} from '../../src/redis/quota.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';

/**
 * In-memory RedisLike stand-in. Implements only what the helpers under
 * test actually call — no Lua eval, so `incrementWithTTL` exercises its
 * MULTI/EXEC fallback path.
 */
class FakeRedis implements RedisLike {
  // strings: key -> value
  private strings = new Map<string, string>();
  // ttl in ms; 0 means "no ttl set"
  private ttls = new Map<string, number>();
  // sets: key -> Set<string>
  private sets = new Map<string, Set<string>>();
  // sorted sets: key -> Map<member, score>
  private zsets = new Map<string, Map<string, number>>();

  // Track when EXPIRE was applied per key for assertions
  public expireCalls: Array<{ key: string; seconds: number }> = [];

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
    this.expireCalls.push({ key, seconds });
    if (!this.strings.has(key) && !this.sets.has(key) && !this.zsets.has(key)) {
      return 0;
    }
    this.ttls.set(key, seconds * 1000);
    return 1;
  }

  async pexpire(key: string, ms: number): Promise<number> {
    if (!this.strings.has(key) && !this.sets.has(key) && !this.zsets.has(key)) {
      return 0;
    }
    this.ttls.set(key, ms);
    return 1;
  }

  async pttl(key: string): Promise<number> {
    if (!this.strings.has(key) && !this.sets.has(key) && !this.zsets.has(key)) {
      return -2;
    }
    const t = this.ttls.get(key);
    if (t === undefined || t === 0) return -1;
    return t;
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const k of keys) {
      if (this.strings.delete(k)) removed += 1;
      if (this.sets.delete(k)) removed += 1;
      if (this.zsets.delete(k)) removed += 1;
      this.ttls.delete(k);
    }
    return removed;
  }

  async exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const k of keys) {
      if (this.strings.has(k) || this.sets.has(k) || this.zsets.has(k)) count += 1;
    }
    return count;
  }

  async eval(): Promise<unknown> {
    // Simulate a client without Lua scripting; helpers must fall back.
    throw new Error('eval_not_supported');
  }

  async scard(key: string): Promise<number> {
    return this.sets.get(key)?.size ?? 0;
  }

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

  async zadd(key: string, ...args: (string | number)[]): Promise<number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    // args layout: score, member, [score, member]...
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
    const minVal = parseScoreBound(min, '-inf');
    const maxVal = parseScoreBound(max, '+inf');
    let removed = 0;
    for (const [member, score] of z.entries()) {
      if (score >= minVal.value && score < maxVal.bound) {
        // Within [min, max) when max is exclusive; include score == minVal.bound only when not exclusive.
        if (
          (minVal.exclusive ? score > minVal.value : score >= minVal.value) &&
          (maxVal.exclusive ? score < maxVal.value : score <= maxVal.value)
        ) {
          z.delete(member);
          removed += 1;
        }
      }
    }
    if (z.size === 0) this.zsets.delete(key);
    return removed;
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) return [];
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    const realStop = stop === -1 ? sorted.length - 1 : stop;
    return sorted.slice(start, realStop + 1);
  }

  multi(): RedisMultiLike {
    const ops: Array<() => Promise<[Error | null, unknown]>> = [];
    const tx: RedisMultiLike = {
      incr: (key: string) => {
        ops.push(async () => {
          const v = await this.incr(key);
          return [null, v];
        });
        return tx;
      },
      expire: (key: string, seconds: number) => {
        ops.push(async () => {
          const v = await this.expire(key, seconds);
          return [null, v];
        });
        return tx;
      },
      pttl: (key: string) => {
        ops.push(async () => {
          const v = await this.pttl(key);
          return [null, v];
        });
        return tx;
      },
      exec: async () => {
        const results: Array<[Error | null, unknown]> = [];
        for (const op of ops) {
          results.push(await op());
        }
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

function parseScoreBound(
  raw: number | string,
  whenInf: '-inf' | '+inf'
): { value: number; exclusive: boolean; bound: number } {
  if (typeof raw === 'number') {
    return { value: raw, exclusive: false, bound: raw };
  }
  if (raw === '-inf') return { value: -Infinity, exclusive: false, bound: -Infinity };
  if (raw === '+inf') return { value: Infinity, exclusive: false, bound: Infinity };
  if (raw.startsWith('(')) {
    const v = Number(raw.slice(1));
    return { value: v, exclusive: true, bound: v };
  }
  const v = Number(raw);
  return { value: v, exclusive: false, bound: v };
}

describe('incrementWithTTL', () => {
  it('sets the TTL only on the first INCR and leaves it alone afterwards', async () => {
    const redis = new FakeRedis();

    const first = await incrementWithTTL(redis, 'quota:free:chapter:u1:2025-03-09', 60);
    expect(first.value).toBe(1);

    const second = await incrementWithTTL(redis, 'quota:free:chapter:u1:2025-03-09', 60);
    expect(second.value).toBe(2);

    const third = await incrementWithTTL(redis, 'quota:free:chapter:u1:2025-03-09', 60);
    expect(third.value).toBe(3);

    // EXPIRE should have been called exactly once (on the first INCR).
    const expiresForKey = redis.expireCalls.filter(
      (c) => c.key === 'quota:free:chapter:u1:2025-03-09'
    );
    expect(expiresForKey).toHaveLength(1);
    expect(expiresForKey[0]!.seconds).toBe(60);
  });

  it('rejects non-positive TTLs', async () => {
    const redis = new FakeRedis();
    await expect(incrementWithTTL(redis, 'k', 0)).rejects.toBeInstanceOf(RangeError);
    await expect(incrementWithTTL(redis, 'k', -1)).rejects.toBeInstanceOf(RangeError);
    await expect(incrementWithTTL(redis, 'k', 1.5)).rejects.toBeInstanceOf(RangeError);
  });
});

describe('addToSlidingWindow', () => {
  it('returns 1 on the first add', async () => {
    const redis = new FakeRedis();
    const t = new Date('2025-03-09T12:00:00Z');
    const { count } = await addToSlidingWindow(redis, 'rate:rpm:u1', t, 60);
    expect(count).toBe(1);
  });

  it('counts multiple adds within the window and trims older entries', async () => {
    const redis = new FakeRedis();
    const t0 = new Date('2025-03-09T12:00:00Z');

    // 5 entries inside the 60-second window.
    for (let i = 0; i < 5; i += 1) {
      await addToSlidingWindow(redis, 'rate:rpm:u1', new Date(t0.getTime() + i * 1000), 60);
    }
    const beforeTrim = await redis.zcard('rate:rpm:u1');
    expect(beforeTrim).toBe(5);

    // Now jump 70 seconds forward; all 5 prior entries are older than
    // (now − 60s) and must be trimmed before the new one is added.
    const tFuture = new Date(t0.getTime() + 70_000);
    const { count } = await addToSlidingWindow(redis, 'rate:rpm:u1', tFuture, 60);
    expect(count).toBe(1);
  });

  it('rejects bad inputs', async () => {
    const redis = new FakeRedis();
    await expect(
      addToSlidingWindow(redis, 'k', new Date('NaN'), 60)
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      addToSlidingWindow(redis, 'k', new Date(), 0)
    ).rejects.toBeInstanceOf(RangeError);
  });
});

describe('addToConcurrencySet / removeFromConcurrencySet', () => {
  it('adds and removes job ids and reports cardinality', async () => {
    const redis = new FakeRedis();
    const key = 'concurrency:story:u1';

    expect(await addToConcurrencySet(redis, key, 'job-1', 60)).toBe(1);
    expect(await addToConcurrencySet(redis, key, 'job-2', 60)).toBe(2);
    expect(await addToConcurrencySet(redis, key, 'job-2', 60)).toBe(2); // duplicate add

    await removeFromConcurrencySet(redis, key, 'job-1');
    expect(await redis.scard(key)).toBe(1);

    await removeFromConcurrencySet(redis, key, 'job-2');
    expect(await redis.scard(key)).toBe(0);
  });

  it('rejects empty job ids', async () => {
    const redis = new FakeRedis();
    await expect(addToConcurrencySet(redis, 'k', '', 60)).rejects.toBeInstanceOf(TypeError);
    await expect(removeFromConcurrencySet(redis, 'k', '')).rejects.toBeInstanceOf(TypeError);
  });
});
