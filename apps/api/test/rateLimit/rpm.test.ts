import { describe, it, expect } from 'vitest';
import {
  RpmRateLimiter,
  RPM_LIMIT,
  RPM_WINDOW_SECONDS,
  applyRetryAfterHeader,
  type RetryAfterReplyLike,
  type RpmQuotaDecision
} from '../../src/rateLimit/rpm.js';
import type { RedisLike, RedisMultiLike } from '../../src/redis/client.js';

/**
 * In-memory RedisLike that supports the operations the rpm limiter
 * actually exercises (zadd / zremrangebyscore / zcard / zrange with
 * WITHSCORES, plus expire). Mirrors the shape used in
 * `test/redis/quota.test.ts` but focused on sorted-set semantics.
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
    const lo = parseBound(min, '-inf');
    const hi = parseBound(max, '+inf');
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

function parseBound(
  raw: number | string,
  whenInf: '-inf' | '+inf'
): { value: number; exclusive: boolean } {
  if (typeof raw === 'number') return { value: raw, exclusive: false };
  if (raw === '-inf') return { value: -Infinity, exclusive: false };
  if (raw === '+inf') return { value: Infinity, exclusive: false };
  if (raw.startsWith('(')) return { value: Number(raw.slice(1)), exclusive: true };
  // Fallback referencing whenInf to keep the parameter meaningful.
  void whenInf;
  return { value: Number(raw), exclusive: false };
}

describe('RpmRateLimiter.consume', () => {
  it('exposes the expected defaults', () => {
    expect(RPM_LIMIT).toBe(60);
    expect(RPM_WINDOW_SECONDS).toBe(60);
  });

  it('allows up to 60 requests inside a 60 second window and denies the 61st (Requirement 5.1)', async () => {
    const redis = new FakeRedis();
    const limiter = new RpmRateLimiter({ redis });
    const t0 = new Date('2025-03-09T12:00:00Z');

    // 60 calls spaced 0.5 s apart land between t0 and t0 + 29.5 s, all
    // inside one rolling 60 s window.
    let lastDecision: RpmQuotaDecision | null = null;
    for (let i = 0; i < 60; i += 1) {
      const now = new Date(t0.getTime() + i * 500);
      const d = await limiter.consume({ userId: 'u1', now });
      expect(d.allowed).toBe(true);
      expect(d.errorCode).toBeUndefined();
      expect(d.remaining).toBe(60 - (i + 1));
      lastDecision = d;
    }
    // 60th call's remaining should be 0.
    expect(lastDecision?.remaining).toBe(0);

    // 61st call inside the same window must be denied with rate_limited.
    const denied = await limiter.consume({
      userId: 'u1',
      now: new Date(t0.getTime() + 60 * 500)
    });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('rate_limited');
    expect(denied.remaining).toBe(0);
    expect(typeof denied.retryAfterSeconds).toBe('number');
    expect(denied.retryAfterSeconds!).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds!).toBeLessThanOrEqual(RPM_WINDOW_SECONDS);
  });

  it('reports retryAfterSeconds = 1 when the oldest entry is about to leave the window', async () => {
    const redis = new FakeRedis();
    const limiter = new RpmRateLimiter({ redis });
    const t0 = new Date('2025-03-09T12:00:00Z');

    // First 60 calls all stamped at t0 (the oldest score is t0).
    for (let i = 0; i < 60; i += 1) {
      const d = await limiter.consume({ userId: 'u2', now: t0 });
      expect(d.allowed).toBe(true);
    }

    // The 61st arrives at t0 + 59 s. The oldest entry leaves the window
    // at t0 + 60 s, so retryAfterSeconds must be exactly 1.
    const denied = await limiter.consume({
      userId: 'u2',
      now: new Date(t0.getTime() + 59_000)
    });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('rate_limited');
    expect(denied.retryAfterSeconds).toBe(1);
  });

  it('reports retryAfterSeconds close to windowSec for a tight burst (Requirement 5.9)', async () => {
    const redis = new FakeRedis();
    const limiter = new RpmRateLimiter({ redis });
    const t0 = new Date('2025-03-09T12:00:00Z');

    for (let i = 0; i < 60; i += 1) {
      const d = await limiter.consume({ userId: 'u3', now: t0 });
      expect(d.allowed).toBe(true);
    }

    // 61st arrives at the same instant; oldest entry leaves the window
    // at t0 + 60 s, so retryAfterSeconds must equal windowSec (60).
    const denied = await limiter.consume({ userId: 'u3', now: t0 });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('rate_limited');
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(RPM_WINDOW_SECONDS - 1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(RPM_WINDOW_SECONDS);
  });

  it('allows the next call after waiting retryAfterSeconds (Requirement 5.1)', async () => {
    const redis = new FakeRedis();
    const limiter = new RpmRateLimiter({ redis });
    const t0 = new Date('2025-03-09T12:00:00Z');

    for (let i = 0; i < 60; i += 1) {
      await limiter.consume({ userId: 'u4', now: t0 });
    }
    const denied = await limiter.consume({ userId: 'u4', now: t0 });
    expect(denied.allowed).toBe(false);
    const wait = denied.retryAfterSeconds!;
    expect(wait).toBeGreaterThanOrEqual(1);

    // Wait `retryAfterSeconds` and try again — the oldest entries should
    // have been trimmed and the call should succeed.
    const tNext = new Date(t0.getTime() + (wait + 1) * 1000);
    const next = await limiter.consume({ userId: 'u4', now: tNext });
    expect(next.allowed).toBe(true);
    expect(next.errorCode).toBeUndefined();
  });

  it('honours custom limit and windowSec', async () => {
    const redis = new FakeRedis();
    const limiter = new RpmRateLimiter({ redis, limit: 3, windowSec: 10 });
    const t0 = new Date('2025-03-09T12:00:00Z');

    expect((await limiter.consume({ userId: 'u5', now: t0 })).allowed).toBe(true);
    expect((await limiter.consume({ userId: 'u5', now: t0 })).allowed).toBe(true);
    expect((await limiter.consume({ userId: 'u5', now: t0 })).allowed).toBe(true);
    const denied = await limiter.consume({ userId: 'u5', now: t0 });
    expect(denied.allowed).toBe(false);
    expect(denied.errorCode).toBe('rate_limited');
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.retryAfterSeconds).toBeLessThanOrEqual(10);
  });

  it('uses the injected clock when `now` is omitted', async () => {
    const redis = new FakeRedis();
    const fixed = new Date('2025-03-09T12:00:00Z');
    const limiter = new RpmRateLimiter({ redis, clock: () => fixed });
    const d = await limiter.consume({ userId: 'u6' });
    expect(d.allowed).toBe(true);
    expect(d.remaining).toBe(59);
  });

  it('rejects bad inputs', async () => {
    const redis = new FakeRedis();
    const limiter = new RpmRateLimiter({ redis });
    await expect(
      limiter.consume({ userId: '' as string, now: new Date() })
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      limiter.consume({ userId: 'u', now: new Date('not-a-date') })
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('rejects non-positive limit / windowSec at construction', () => {
    const redis = new FakeRedis();
    expect(() => new RpmRateLimiter({ redis, limit: 0 })).toThrow(RangeError);
    expect(() => new RpmRateLimiter({ redis, windowSec: -1 })).toThrow(RangeError);
    expect(() => new RpmRateLimiter({ redis, limit: 1.5 })).toThrow(RangeError);
  });
});

describe('applyRetryAfterHeader', () => {
  function makeReply(): RetryAfterReplyLike & { headers: Record<string, string> } {
    const headers: Record<string, string> = {};
    return {
      headers,
      header(name: string, value: string) {
        headers[name] = value;
        return this;
      }
    };
  }

  it('sets Retry-After only when the decision is denied (Requirement 5.9)', () => {
    const allowed: RpmQuotaDecision = { allowed: true, remaining: 5 };
    const reply1 = makeReply();
    applyRetryAfterHeader(reply1, allowed);
    expect(reply1.headers['Retry-After']).toBeUndefined();

    const denied: RpmQuotaDecision = {
      allowed: false,
      errorCode: 'rate_limited',
      retryAfterSeconds: 17
    };
    const reply2 = makeReply();
    applyRetryAfterHeader(reply2, denied);
    expect(reply2.headers['Retry-After']).toBe('17');
  });

  it('does nothing when retryAfterSeconds is missing or non-positive', () => {
    const reply1 = makeReply();
    applyRetryAfterHeader(reply1, { allowed: false, errorCode: 'rate_limited' });
    expect(reply1.headers['Retry-After']).toBeUndefined();

    const reply2 = makeReply();
    applyRetryAfterHeader(reply2, {
      allowed: false,
      errorCode: 'rate_limited',
      retryAfterSeconds: 0
    });
    expect(reply2.headers['Retry-After']).toBeUndefined();
  });
});
