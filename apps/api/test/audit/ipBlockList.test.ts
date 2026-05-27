import { describe, it, expect, beforeEach } from 'vitest';
import {
  IpBlockListChecker,
  IpBlockListJob,
  IpBlockedError,
  to24Block,
  type AddBlockedRangeArgs,
  type BlockCountRow,
  type CountLoginFailedArgs,
  type IpBlockListDb,
  type IpBlockListLogger
} from '../../src/audit/ipBlockList.js';

/**
 * In-memory `IpBlockListDb`. Captures every call so assertions can
 * inspect the `bannedUntil` arithmetic and the GC behaviour.
 */
class FakeDb implements IpBlockListDb {
  /** Rows the next `countLoginFailedPer24Block` call should return. */
  public aggregations: BlockCountRow[] = [];
  /** Calls captured for inspection. */
  public addCalls: AddBlockedRangeArgs[] = [];
  public removeExpiredCalls: Date[] = [];
  public removeExpiredCount = 0;
  public removeExpiredError: Error | null = null;
  /** Currently active bans: block → bannedUntil. */
  public store = new Map<string, Date>();

  async countLoginFailedPer24Block(
    args: CountLoginFailedArgs
  ): Promise<readonly BlockCountRow[]> {
    void args;
    return this.aggregations.slice();
  }

  async addBlockedRange(args: AddBlockedRangeArgs): Promise<void> {
    this.addCalls.push(args);
    // Mirror the upsert-with-extension semantics described on the
    // interface so the checker tests below see consistent state.
    const existing = this.store.get(args.block);
    if (!existing || args.bannedUntil > existing) {
      this.store.set(args.block, args.bannedUntil);
    }
  }

  async removeExpiredBlocks(now: Date): Promise<number> {
    this.removeExpiredCalls.push(now);
    if (this.removeExpiredError) {
      const err = this.removeExpiredError;
      this.removeExpiredError = null;
      throw err;
    }
    let removed = 0;
    for (const [block, bannedUntil] of [...this.store.entries()]) {
      if (bannedUntil.getTime() < now.getTime()) {
        this.store.delete(block);
        removed += 1;
      }
    }
    this.removeExpiredCount = removed;
    return removed;
  }

  async isBlocked(ip: string, now: Date): Promise<boolean> {
    const block = to24Block(ip);
    const bannedUntil = this.store.get(block);
    return bannedUntil !== undefined && bannedUntil.getTime() > now.getTime();
  }
}

class CapturingLogger implements IpBlockListLogger {
  public warnings: { message: string; meta?: Record<string, unknown> }[] = [];
  warn(message: string, meta?: Record<string, unknown>): void {
    this.warnings.push({ message, ...(meta ? { meta } : {}) });
  }
}

const NOW = new Date('2025-04-01T12:00:00Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;

describe('to24Block', () => {
  it('reduces a valid IPv4 to its /24 form', () => {
    expect(to24Block('203.0.113.42')).toBe('203.0.113.0/24');
  });

  it('keeps a /24 host portion at zero (idempotent over its own output)', () => {
    expect(to24Block('203.0.113.0')).toBe('203.0.113.0/24');
  });

  it('handles boundary octet values', () => {
    expect(to24Block('0.0.0.1')).toBe('0.0.0.0/24');
    expect(to24Block('255.255.255.255')).toBe('255.255.255.0/24');
  });

  it('rejects empty strings and non-strings with TypeError', () => {
    expect(() => to24Block('')).toThrow(TypeError);
    // @ts-expect-error — runtime guard
    expect(() => to24Block(undefined)).toThrow(TypeError);
    // @ts-expect-error — runtime guard
    expect(() => to24Block(123)).toThrow(TypeError);
  });

  it('rejects strings that are neither IPv4 nor IPv6 with TypeError', () => {
    expect(() => to24Block('not.an.ip.address')).toThrow(TypeError);
    expect(() => to24Block('256.0.0.1')).toThrow(TypeError);
    expect(() => to24Block('1.2.3')).toThrow(TypeError);
    expect(() => to24Block('hello')).toThrow(TypeError);
  });

  it('passes IPv6 through unchanged and warns via the optional logger', () => {
    const logger = new CapturingLogger();
    const v6 = '2001:db8::1';
    expect(to24Block(v6, logger)).toBe(v6);
    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]!.message).toMatch(/IPv6/);
  });

  it('does not throw on IPv6 even when no logger is supplied', () => {
    expect(to24Block('::1')).toBe('::1');
  });
});

describe('IpBlockListJob.runTick', () => {
  let db: FakeDb;
  let job: IpBlockListJob;

  beforeEach(() => {
    db = new FakeDb();
    job = new IpBlockListJob({
      db,
      threshold: 100,
      banDurationMs: TWENTY_FOUR_HOURS_MS,
      clock: () => NOW
    });
  });

  it('bans only /24 blocks with count strictly greater than threshold', async () => {
    db.aggregations = [
      { block: '10.0.0.0/24', count: 101 },   // banned
      { block: '10.0.1.0/24', count: 100 },   // NOT banned (boundary)
      { block: '10.0.2.0/24', count: 50 },    // NOT banned
      { block: '10.0.3.0/24', count: 5000 }   // banned
    ];

    const result = await job.runTick(NOW);

    expect(result.scanned).toBe(4);
    expect(result.bannedRanges).toEqual(['10.0.0.0/24', '10.0.3.0/24']);

    const bannedBlocks = db.addCalls.map((c) => c.block);
    expect(bannedBlocks).toEqual(['10.0.0.0/24', '10.0.3.0/24']);
  });

  it('writes bannedUntil = now + banDurationMs and the auto-ban reason', async () => {
    db.aggregations = [{ block: '198.51.100.0/24', count: 200 }];

    await job.runTick(NOW);

    expect(db.addCalls).toHaveLength(1);
    const call = db.addCalls[0]!;
    expect(call.block).toBe('198.51.100.0/24');
    expect(call.bannedUntil.getTime()).toBe(NOW.getTime() + TWENTY_FOUR_HOURS_MS);
    expect(call.reason).toBe('login_failed_threshold');
  });

  it('calls removeExpiredBlocks at the end of every tick', async () => {
    db.aggregations = [];
    await job.runTick(NOW);
    expect(db.removeExpiredCalls).toHaveLength(1);
    expect(db.removeExpiredCalls[0]).toEqual(NOW);
  });

  it('still calls removeExpiredBlocks when there are bans', async () => {
    db.aggregations = [{ block: '10.0.0.0/24', count: 9999 }];
    await job.runTick(NOW);
    expect(db.removeExpiredCalls).toHaveLength(1);
    expect(db.addCalls).toHaveLength(1);
  });

  it('does not crash when removeExpiredBlocks fails — security path is the bans', async () => {
    db.aggregations = [{ block: '10.0.0.0/24', count: 9999 }];
    db.removeExpiredError = new Error('transient');
    const result = await job.runTick(NOW);
    expect(result.bannedRanges).toEqual(['10.0.0.0/24']);
    expect(db.addCalls).toHaveLength(1);
  });

  it('uses the injected clock when runTick is called without an argument', async () => {
    db.aggregations = [{ block: '10.0.0.0/24', count: 9999 }];
    await job.runTick();
    expect(db.addCalls[0]!.bannedUntil.getTime()).toBe(
      NOW.getTime() + TWENTY_FOUR_HOURS_MS
    );
  });

  it('rejects an invalid `now` argument with TypeError', async () => {
    await expect(job.runTick(new Date('not-a-date'))).rejects.toThrow(TypeError);
    // @ts-expect-error — runtime guard
    await expect(job.runTick('2025-04-01')).rejects.toThrow(TypeError);
  });

  it('returns scanned=0 and bannedRanges=[] for an empty aggregation', async () => {
    db.aggregations = [];
    const result = await job.runTick(NOW);
    expect(result).toEqual({ scanned: 0, bannedRanges: [] });
  });
});

describe('IpBlockListJob constructor validation', () => {
  it('rejects missing options and missing db', () => {
    // @ts-expect-error — runtime guard
    expect(() => new IpBlockListJob()).toThrow(TypeError);
    // @ts-expect-error — runtime guard
    expect(() => new IpBlockListJob({})).toThrow(TypeError);
  });

  it('rejects non-integer or negative thresholds', () => {
    const db = new FakeDb();
    expect(() => new IpBlockListJob({ db, threshold: -1 })).toThrow(RangeError);
    expect(() => new IpBlockListJob({ db, threshold: 1.5 })).toThrow(RangeError);
  });

  it('rejects non-positive banDurationMs', () => {
    const db = new FakeDb();
    expect(() => new IpBlockListJob({ db, banDurationMs: 0 })).toThrow(RangeError);
    expect(() => new IpBlockListJob({ db, banDurationMs: -1 })).toThrow(RangeError);
  });
});

describe('IpBlockListChecker', () => {
  let db: FakeDb;
  let checker: IpBlockListChecker;

  beforeEach(() => {
    db = new FakeDb();
    checker = new IpBlockListChecker({ db, clock: () => NOW });
  });

  it('throws IpBlockedError when the /24 has an active ban at now', async () => {
    db.store.set('10.0.0.0/24', new Date(NOW.getTime() + ONE_HOUR_MS));
    await expect(checker.assertNotBlocked('10.0.0.42')).rejects.toBeInstanceOf(
      IpBlockedError
    );
    await expect(checker.assertNotBlocked('10.0.0.42')).rejects.toMatchObject({
      code: 'ip_blocked',
      block: '10.0.0.0/24'
    });
  });

  it('no-ops when the /24 is not banned', async () => {
    await expect(checker.assertNotBlocked('203.0.113.7')).resolves.toBeUndefined();
  });

  it('no-ops when an unrelated /24 is banned', async () => {
    db.store.set('198.51.100.0/24', new Date(NOW.getTime() + ONE_HOUR_MS));
    await expect(checker.assertNotBlocked('203.0.113.7')).resolves.toBeUndefined();
  });

  it('no-ops when the ban has already expired (treated as unblocked)', async () => {
    db.store.set('10.0.0.0/24', new Date(NOW.getTime() - 1));
    await expect(checker.assertNotBlocked('10.0.0.42')).resolves.toBeUndefined();
  });

  it('rejects non-string / empty IP arguments with TypeError', async () => {
    // @ts-expect-error — runtime guard
    await expect(checker.assertNotBlocked(undefined)).rejects.toThrow(TypeError);
    await expect(checker.assertNotBlocked('')).rejects.toThrow(TypeError);
  });

  it('surfaces malformed IPs as TypeError, not IpBlockedError', async () => {
    await expect(checker.assertNotBlocked('not-an-ip')).rejects.toThrow(TypeError);
  });
});
