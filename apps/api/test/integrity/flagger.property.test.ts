/**
 * Property test for the integrity-failure flagger.
 *
 * **Property 23: Flag user vượt ngưỡng integrity**
 * **Validates: Requirements 14.4**
 *
 * Requirement 14.4 (verbatim):
 *
 *   "WHEN một tài khoản phát sinh hơn 50 yêu cầu bị từ chối do
 *    `client_integrity_failed` trong 24 giờ, THE License_Service SHALL
 *    gắn cờ tài khoản đó để Admin_Console xem xét thủ công."
 *
 * The wording "hơn 50" is strict greater-than: 50 failures in any
 * rolling 24h window do NOT flag the user; 51 do.
 *
 * Property under test (over an arbitrary sequence of failure
 * timestamps spanning 0–48 hours, processed in generation order):
 *
 *   1. If at any step the rolling 24h count (post-add) strictly
 *      exceeds 50, then after the run:
 *        - `users.flagged_for_review` is true,
 *        - exactly one OPEN `admin_flags` row exists,
 *        - exactly one `admin_flag_opened` audit event was emitted.
 *   2. If no step ever exceeds 50, no flag, no admin row, no audit.
 *   3. The number of audit events equals the number of newly-opened
 *      admin flags (which is at most 1 per run because of the partial
 *      unique index `admin_flags_one_open_idx`).
 *
 * The oracle that decides "did any step exceed 50?" simulates the
 * exact same sliding-window trim semantics as the production redis
 * sorted-set helper (`addToSlidingWindow`): on each insert, drop
 * scores strictly less than `ts - 24h`, then count. That keeps the
 * property well-defined even for non-monotone timestamp sequences
 * that drop earlier failures off the window before later ones arrive.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { IntegrityFlagger } from '../../src/integrity/flagger.js';
import type {
  IntegrityFlaggerDb,
  IntegrityTx
} from '../../src/integrity/db.js';
import type {
  AdminFlagReason,
  AuditLoggerLike,
  IntegrityFailureEvent
} from '../../src/integrity/types.js';

// ---------------------------------------------------------------------------
// Constants — locked to the production policy in `flagger.ts`.
// ---------------------------------------------------------------------------

const WINDOW_MS = 24 * 60 * 60 * 1000;
const THRESHOLD = 50;
const HORIZON_MS = 48 * 60 * 60 * 1000; // events span 0–48h
const USER = 'user-prop';
const FP = 'fp-prop';
const IP = '203.0.113.1';

// ---------------------------------------------------------------------------
// In-memory fakes. We deliberately do NOT import the fakes from
// `flagger.test.ts` (the unit-test file) — those are private to that
// module and the task forbids modifying it. The fakes below are the
// minimal shapes the flagger exercises and mirror the partial unique
// index `admin_flags_one_open_idx` so a second open attempt returns
// `created: false`.
// ---------------------------------------------------------------------------

class FakeDb implements IntegrityFlaggerDb {
  public readonly flagged = new Set<string>();
  public readonly openFlags = new Map<
    string,
    { reason: AdminFlagReason; ts: Date }
  >();

  async incrementWithSlidingWindow(): Promise<{ count: number }> {
    // Unused — the flagger talks to redis via `IntegrityFlaggerRedis`,
    // not via `IntegrityFlaggerDb.incrementWithSlidingWindow`.
    throw new Error('unused');
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
    const key = `${args.userId}|${args.reason}`;
    if (this.openFlags.has(key)) {
      return { created: false };
    }
    this.openFlags.set(key, { reason: args.reason, ts: args.ts });
    return { created: true };
  }
}

class FakeWindowRedis {
  private readonly windows = new Map<string, number[]>();

  async addToSlidingWindow(
    key: string,
    ts: Date,
    windowSec: number
  ): Promise<{ count: number }> {
    const cutoff = ts.getTime() - windowSec * 1000;
    const arr = this.windows.get(key) ?? [];
    // Keep only scores >= cutoff (matches `ZREMRANGEBYSCORE -inf cutoff` exclusive).
    const trimmed = arr.filter((score) => score >= cutoff);
    trimmed.push(ts.getTime());
    this.windows.set(key, trimmed);
    return { count: trimmed.length };
  }
}

class FakeAuditLogger implements AuditLoggerLike {
  public readonly events: Array<{
    eventType: string;
    details: Record<string, unknown>;
  }> = [];
  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    this.events.push({ eventType, details: { ...details } });
  }
}

// ---------------------------------------------------------------------------
// Oracle — simulates the same sliding-window arithmetic the flagger /
// fake redis use. Returns the post-add cardinality at each step.
// ---------------------------------------------------------------------------

function simulateRollingCounts(timestampsMs: readonly number[]): number[] {
  let stored: number[] = [];
  const counts: number[] = [];
  for (const ts of timestampsMs) {
    const cutoff = ts - WINDOW_MS;
    stored = stored.filter((score) => score >= cutoff);
    stored.push(ts);
    counts.push(stored.length);
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Generator — array of millisecond offsets in [0, 48h]. Length is
// allowed up to 200 so runs comfortably straddle the 50/51 boundary
// in both directions; fast-check's shrinker will minimise toward the
// smallest counterexample if any property fails.
// ---------------------------------------------------------------------------

const arbOffsetsMs: fc.Arbitrary<number[]> = fc.array(
  fc.integer({ min: 0, max: HORIZON_MS }),
  { minLength: 0, maxLength: 200 }
);

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('IntegrityFlagger property test (Property 23)', () => {
  it('flags exactly when some rolling 24h count exceeds 50, opens at most one admin flag, and emits one audit event per open (Validates: Requirements 14.4)', async () => {
    const base = Date.parse('2025-03-09T00:00:00.000Z');

    await fc.assert(
      fc.asyncProperty(arbOffsetsMs, async (offsets) => {
        const db = new FakeDb();
        const redis = new FakeWindowRedis();
        const audit = new FakeAuditLogger();
        const flagger = new IntegrityFlagger({
          db,
          redis,
          auditLogger: audit
          // defaults: threshold=50, windowMs=24h
        });

        for (const offset of offsets) {
          const event: IntegrityFailureEvent = {
            userId: USER,
            fingerprint: FP,
            ip: IP,
            ts: new Date(base + offset)
          };
          await flagger.recordIntegrityFailure(event);
        }

        const counts = simulateRollingCounts(offsets);
        const everExceededThreshold = counts.some((c) => c > THRESHOLD);

        if (everExceededThreshold) {
          // Threshold tripped at least once → exactly one flag opened,
          // exactly one audit event emitted, user marked for review.
          expect(db.flagged.has(USER)).toBe(true);
          expect(db.openFlags.size).toBe(1);
          expect(audit.events).toHaveLength(1);
          expect(audit.events[0]!.eventType).toBe('admin_flag_opened');
          expect(audit.events[0]!.details.userId).toBe(USER);
        } else {
          // Threshold never crossed → no flag, no admin row, no audit.
          expect(db.flagged.has(USER)).toBe(false);
          expect(db.openFlags.size).toBe(0);
          expect(audit.events).toHaveLength(0);
        }

        // Symmetry invariant — audit count matches admin-flag count.
        expect(audit.events.length).toBe(db.openFlags.size);
      }),
      { numRuns: 100 }
    );
  });
});
