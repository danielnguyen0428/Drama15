import { describe, it, expect, beforeEach } from 'vitest';
import { IntegrityFlagger } from '../../src/integrity/flagger.js';
import type {
  IntegrityFlaggerDb,
  IntegrityTx
} from '../../src/integrity/db.js';
import { integrityFailKey } from '../../src/integrity/db.js';
import type {
  AdminFlagReason,
  AuditLoggerLike,
  IntegrityFailureEvent
} from '../../src/integrity/types.js';

/**
 * In-memory `IntegrityFlaggerDb` used by every test below. Mirrors the
 * partial-unique-index semantics of `admin_flags_one_open_idx` so that
 * `openAdminFlag` reports `created: false` once an open row exists.
 *
 * `setUserFlaggedForReview` is idempotent — calling it twice on the
 * same user does not change observable state, matching the production
 * `UPDATE users SET flagged_for_review = true` behaviour.
 */
class FakeDb implements IntegrityFlaggerDb {
  public flagged = new Set<string>();
  public openFlags = new Map<string, { reason: AdminFlagReason; ts: Date }>();
  public openFlagInsertCalls = 0;

  // Sliding-window state, keyed exactly the way `integrityFailKey` does
  // it. Using a plain `Map<key, number[]>` is sufficient for the
  // properties under test.
  private windows = new Map<string, number[]>();

  async incrementWithSlidingWindow(args: {
    userId: string;
    ts: Date;
    windowMs: number;
    tx?: IntegrityTx;
  }): Promise<{ count: number }> {
    const key = integrityFailKey(args.userId);
    const cutoff = args.ts.getTime() - args.windowMs;
    const arr = this.windows.get(key) ?? [];
    // Trim entries strictly older than the cutoff (left-closed window).
    const trimmed = arr.filter((score) => score >= cutoff);
    trimmed.push(args.ts.getTime());
    this.windows.set(key, trimmed);
    return { count: trimmed.length };
  }

  async setUserFlaggedForReview(args: {
    userId: string;
    tx?: IntegrityTx;
  }): Promise<void> {
    this.flagged.add(args.userId);
  }

  async openAdminFlag(args: {
    userId: string;
    reason: AdminFlagReason;
    ts: Date;
    tx?: IntegrityTx;
  }): Promise<{ created: boolean }> {
    this.openFlagInsertCalls += 1;
    const key = `${args.userId}|${args.reason}`;
    if (this.openFlags.has(key)) {
      return { created: false };
    }
    this.openFlags.set(key, { reason: args.reason, ts: args.ts });
    return { created: true };
  }
}

/**
 * Tiny in-memory sliding-window redis stand-in. We do NOT reuse the
 * fake-redis from `test/redis/quota.test.ts` because the flagger only
 * needs the higher-level `addToSlidingWindow` adapter shape, and
 * keeping the test self-contained makes the property under test
 * obvious.
 */
class FakeWindowRedis {
  private windows = new Map<string, number[]>();

  async addToSlidingWindow(
    key: string,
    ts: Date,
    windowSec: number
  ): Promise<{ count: number }> {
    const cutoff = ts.getTime() - windowSec * 1000;
    const arr = this.windows.get(key) ?? [];
    const trimmed = arr.filter((score) => score >= cutoff);
    trimmed.push(ts.getTime());
    this.windows.set(key, trimmed);
    return { count: trimmed.length };
  }
}

class FakeAuditLogger implements AuditLoggerLike {
  public events: Array<{ eventType: string; details: Record<string, unknown> }> = [];
  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    this.events.push({ eventType, details: { ...details } });
  }
}

const USER = 'user-1';
const FP = 'fp-abc';
const IP = '203.0.113.7';

function event(at: Date): IntegrityFailureEvent {
  return { userId: USER, fingerprint: FP, ip: IP, ts: at };
}

describe('IntegrityFlagger (Requirement 14.4)', () => {
  let db: FakeDb;
  let redis: FakeWindowRedis;
  let audit: FakeAuditLogger;
  let flagger: IntegrityFlagger;

  beforeEach(() => {
    db = new FakeDb();
    redis = new FakeWindowRedis();
    audit = new FakeAuditLogger();
    flagger = new IntegrityFlagger({
      db,
      redis,
      auditLogger: audit
      // defaults: threshold=50, windowMs=24h
    });
  });

  it('does NOT flag the user at exactly 50 failures in 24h (strict greater-than boundary)', async () => {
    const t0 = new Date('2025-03-09T00:00:00Z');
    let last: { flagged: boolean; count24h: number } | undefined;
    for (let i = 0; i < 50; i += 1) {
      last = await flagger.recordIntegrityFailure(
        event(new Date(t0.getTime() + i * 1000))
      );
    }
    expect(last).toBeDefined();
    expect(last!.count24h).toBe(50);
    expect(last!.flagged).toBe(false);
    expect(db.flagged.has(USER)).toBe(false);
    expect(db.openFlags.size).toBe(0);
    expect(audit.events).toHaveLength(0);
  });

  it('flags the user on the 51st failure in 24h, opens exactly one admin flag, and emits exactly one audit event even after 100+ extra failures', async () => {
    const t0 = new Date('2025-03-09T00:00:00Z');

    // First 50 failures — no flag yet.
    for (let i = 0; i < 50; i += 1) {
      await flagger.recordIntegrityFailure(
        event(new Date(t0.getTime() + i * 1000))
      );
    }
    expect(db.flagged.has(USER)).toBe(false);

    // 51st failure — must trip the flag.
    const trip = await flagger.recordIntegrityFailure(
      event(new Date(t0.getTime() + 50_000))
    );
    expect(trip.flagged).toBe(true);
    expect(trip.count24h).toBe(51);
    expect(db.flagged.has(USER)).toBe(true);
    expect(db.openFlags.size).toBe(1);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]!.eventType).toBe('admin_flag_opened');
    expect(audit.events[0]!.details.userId).toBe(USER);
    expect(audit.events[0]!.details.ts).toBe(
      new Date(t0.getTime() + 50_000).toISOString()
    );

    // 150 additional failures past the threshold. The flagger should
    // keep returning `flagged: true` but never open a second admin
    // flag and never emit a second audit event — both guarantees come
    // from the partial unique index `admin_flags_one_open_idx`
    // simulated by the FakeDb.
    for (let i = 51; i < 201; i += 1) {
      const r = await flagger.recordIntegrityFailure(
        event(new Date(t0.getTime() + i * 1000))
      );
      expect(r.flagged).toBe(true);
    }
    expect(db.openFlags.size).toBe(1);
    expect(audit.events).toHaveLength(1);
    // openAdminFlag is *attempted* every time past the threshold, but
    // ON CONFLICT DO NOTHING returns created=false on every call after
    // the first. That's the property we depend on.
    expect(db.openFlagInsertCalls).toBe(151); // 1 trip + 150 extras
  });

  it('does not flag when older failures age out of the rolling 24h window', async () => {
    const tFar = new Date('2025-03-08T00:00:00Z'); // 30h before "now"
    // 50 failures stamped 30 hours ago.
    for (let i = 0; i < 50; i += 1) {
      await flagger.recordIntegrityFailure(
        event(new Date(tFar.getTime() + i * 1000))
      );
    }
    // One failure stamped "now" — the rolling window has aged the
    // earlier batch out, so the 24h count for this event is 1.
    const tNow = new Date('2025-03-09T06:00:00Z'); // > 24h after tFar
    const result = await flagger.recordIntegrityFailure(event(tNow));
    expect(result.flagged).toBe(false);
    expect(result.count24h).toBe(1);
    expect(db.flagged.has(USER)).toBe(false);
    expect(db.openFlags.size).toBe(0);
    expect(audit.events).toHaveLength(0);
  });

  it('returns a count24h that matches the sliding-window cardinality', async () => {
    const t0 = new Date('2025-03-09T00:00:00Z');
    for (let i = 0; i < 5; i += 1) {
      const r = await flagger.recordIntegrityFailure(
        event(new Date(t0.getTime() + i * 1000))
      );
      expect(r.count24h).toBe(i + 1);
    }
  });

  it('honours custom threshold and windowMs settings', async () => {
    const customDb = new FakeDb();
    const customRedis = new FakeWindowRedis();
    const customAudit = new FakeAuditLogger();
    const customFlagger = new IntegrityFlagger({
      db: customDb,
      redis: customRedis,
      auditLogger: customAudit,
      threshold: 2,
      windowMs: 60_000 // 60 seconds
    });
    const t0 = new Date('2025-03-09T00:00:00Z');
    expect((await customFlagger.recordIntegrityFailure(event(new Date(t0.getTime() + 0)))).flagged).toBe(false);
    expect((await customFlagger.recordIntegrityFailure(event(new Date(t0.getTime() + 1_000)))).flagged).toBe(false);
    const trip = await customFlagger.recordIntegrityFailure(event(new Date(t0.getTime() + 2_000)));
    expect(trip.flagged).toBe(true);
    expect(trip.count24h).toBe(3);
    expect(customDb.flagged.has(USER)).toBe(true);
    expect(customDb.openFlags.size).toBe(1);
    expect(customAudit.events).toHaveLength(1);
  });

  it('does not emit an audit event when no auditLogger is supplied', async () => {
    const noAuditDb = new FakeDb();
    const noAuditRedis = new FakeWindowRedis();
    const noAuditFlagger = new IntegrityFlagger({
      db: noAuditDb,
      redis: noAuditRedis,
      threshold: 1
    });
    await noAuditFlagger.recordIntegrityFailure(event(new Date('2025-03-09T00:00:00Z')));
    const r = await noAuditFlagger.recordIntegrityFailure(event(new Date('2025-03-09T00:00:01Z')));
    expect(r.flagged).toBe(true);
    expect(noAuditDb.flagged.has(USER)).toBe(true);
    expect(noAuditDb.openFlags.size).toBe(1);
  });

  it('rejects malformed events with TypeError', async () => {
    await expect(
      flagger.recordIntegrityFailure({
        userId: '',
        fingerprint: FP,
        ip: IP,
        ts: new Date()
      } as IntegrityFailureEvent)
    ).rejects.toBeInstanceOf(TypeError);

    await expect(
      flagger.recordIntegrityFailure({
        userId: USER,
        fingerprint: FP,
        ip: IP,
        ts: new Date('NaN')
      } as IntegrityFailureEvent)
    ).rejects.toBeInstanceOf(TypeError);
  });

  it('runs flag writes through the supplied transaction wrapper', async () => {
    const txDb = new FakeDb();
    const txRedis = new FakeWindowRedis();
    const txAudit = new FakeAuditLogger();
    const seen: Array<symbol | undefined> = [];
    const txMarker = Symbol('tx');
    const txFlagger = new IntegrityFlagger({
      db: txDb,
      redis: txRedis,
      auditLogger: txAudit,
      threshold: 0, // every failure trips
      runInTransaction: async (work) => {
        seen.push(txMarker);
        return work(txMarker);
      }
    });
    await txFlagger.recordIntegrityFailure(event(new Date('2025-03-09T00:00:00Z')));
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(txMarker);
    expect(txDb.flagged.has(USER)).toBe(true);
    expect(txDb.openFlags.size).toBe(1);
  });
});
