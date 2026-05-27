/**
 * Property 25: PII breach notification timeline.
 *
 * **Validates: Requirements 15.5**
 *
 * Spec text (design.md):
 *   "For all incident được xác nhận làm lộ PII, License_Service phát
 *    thông báo tới mọi user bị ảnh hưởng trong vòng ≤ 72 giờ kể từ
 *    thời điểm xác nhận."
 *
 * The breach notifier walks the affected user list and, per user,
 * applies the spec-pinned exponential backoff schedule
 * (1m → 2m → 4m → 8m → 16m → 32m → 60m → 60m+) bounded by the 72h
 * SLA budget measured from `scheduledAt`. This property pins three
 * universal outcomes and one timing invariant:
 *
 *   1. If a `delivered` response is reachable inside the 72h budget,
 *      the user ends in `delivered`.
 *   2. Else if the first non-`transient` response that the notifier
 *      reaches is `bounced`, the user ends in `bounced` (no further
 *      retries).
 *   3. Else (every reachable response is `transient` until the budget
 *      runs out), the user ends in `slaExceeded` and the audit trail
 *      ends with exactly one `sla_exceeded` row.
 *   4. Every send fires inside `[scheduledAt, scheduledAt + 72h]` —
 *      the notifier never punches through the SLA budget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fc } from '@drama15/test-helpers';
import {
  BreachNotifier,
  SLA_72H_MS,
  backoffForAttempt,
  type EmailMessage,
  type EmailSender,
  type NotificationDb,
  type PaidUserDueForPreExpiry,
  type RecordBreachAttemptArgs,
  type RecordEmailSentArgs,
  type UserBreachContact
} from '../../src/notifications/index.js';

type Status = 'delivered' | 'bounced' | 'transient';

class PropertyDb implements NotificationDb {
  public contacts: UserBreachContact[] = [];
  public breachAttempts: RecordBreachAttemptArgs[] = [];
  public emailSent: RecordEmailSentArgs[] = [];

  public async findPaidUsersDueForPreExpiry(): Promise<PaidUserDueForPreExpiry[]> {
    return [];
  }

  public async recordEmailSent(args: RecordEmailSentArgs): Promise<void> {
    this.emailSent.push({ ...args });
  }

  public async findUsersForBreach(
    userIds: readonly string[]
  ): Promise<UserBreachContact[]> {
    return this.contacts.filter((c) => userIds.includes(c.userId));
  }

  public async recordBreachAttempt(args: RecordBreachAttemptArgs): Promise<void> {
    this.breachAttempts.push({ ...args });
  }
}

/**
 * Sender that walks a pre-programmed script. Once the script is
 * exhausted, it pads with `transient` so a property iteration with a
 * short, all-transient script behaves identically to one whose script
 * is long enough to fill the 72h budget — both end in `sla_exceeded`
 * for the same reason.
 */
class ScriptedSender implements EmailSender {
  private idx = 0;
  public readonly sent: Array<{ msg: EmailMessage; ts: number }> = [];

  public constructor(
    private readonly script: ReadonlyArray<Status>,
    private readonly clockMs: () => number
  ) {}

  public async send(msg: EmailMessage): Promise<{ status: Status }> {
    this.sent.push({ msg, ts: this.clockMs() });
    const r = this.script[this.idx] ?? 'transient';
    this.idx += 1;
    return { status: r };
  }
}

interface Expected {
  outcome: 'delivered' | 'bounced' | 'sla_exceeded';
  attemptCount: number;
}

/**
 * Pure reference implementation of the notifier's outcome rule. The
 * test treats this as ground truth and asserts the actual notifier
 * agrees for every fc draw.
 *
 * The walk mirrors `BreachNotifier.deliverForUser`:
 *   - `attempt = 1` fires immediately (wait = 0).
 *   - For `attempt >= 2`, the wait before the attempt is
 *     `backoffForAttempt(attempt)`. If the cumulative wait would push
 *     past the 72h budget, the notifier short-circuits to
 *     `sla_exceeded`; the previous iteration was the last actual send.
 *   - On `delivered` or `bounced`, the loop terminates immediately.
 */
function computeExpected(responses: ReadonlyArray<Status>): Expected {
  let cumulativeWaitMs = 0;
  for (let attempt = 1; ; attempt += 1) {
    const wait = backoffForAttempt(attempt);
    cumulativeWaitMs += wait;
    if (cumulativeWaitMs > SLA_72H_MS) {
      return { outcome: 'sla_exceeded', attemptCount: attempt - 1 };
    }
    const r = responses[attempt - 1] ?? 'transient';
    if (r === 'delivered') return { outcome: 'delivered', attemptCount: attempt };
    if (r === 'bounced') return { outcome: 'bounced', attemptCount: attempt };
    // transient → continue
  }
}

describe('Property 25: PII breach notification timeline', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * **Validates: Requirements 15.5**
   */
  it('matches the deterministic outcome table for any response sequence and stays within the 72h budget', async () => {
    await fc.assert(
      fc.asyncProperty(
        // scheduledAt: any wall-clock instant in a realistic window.
        // We project through `fc.integer().map(...)` so we can keep
        // the bounds locked to known-valid Date instants without
        // relying on `fc.date()`'s timezone defaults.
        fc
          .integer({
            min: new Date('2025-01-01T00:00:00Z').getTime(),
            max: new Date('2030-01-01T00:00:00Z').getTime()
          })
          .map((t) => new Date(t)),
        // affectedUserIds is part of the property tuple per the spec
        // wording; the response sequence is consumed by a single user
        // walk so we restrict the list to one user. Multi-user fan-out
        // is exercised by the unit-test file alongside this one.
        fc.constant(['user-property-25'] as const),
        // responses: per-attempt sender outcomes. Length 1-80 covers
        // every feasible attempt count under the 72h budget given the
        // 1m → 2m → 4m → 8m → 16m → 32m → 60m → 60m+ schedule. Shorter
        // arrays are padded with `transient` by the sender.
        fc.array(fc.constantFrom<Status>('delivered', 'bounced', 'transient'), {
          minLength: 1,
          maxLength: 80
        }),
        async (scheduledAt, affectedUserIds, responses) => {
          vi.setSystemTime(scheduledAt);

          const userId = affectedUserIds[0];
          const db = new PropertyDb();
          db.contacts = [
            {
              userId,
              email: `${userId}@example.com`,
              displayName: 'Property User',
              uiLocale: 'en'
            }
          ];

          const sender = new ScriptedSender(responses, () => Date.now());
          const sleep = async (ms: number) => {
            await vi.advanceTimersByTimeAsync(ms);
          };

          const notifier = new BreachNotifier({ db, sender, sleep });

          const result = await notifier.notifyBreach({
            breachId: 'breach-property-25',
            affectedUserIds: [...affectedUserIds],
            scheduledAt
          });

          const expected = computeExpected(responses);

          // (1) Outcome correctness for the user.
          if (expected.outcome === 'delivered') {
            expect(result.delivered).toEqual([userId]);
            expect(result.bounced).toEqual([]);
            expect(result.slaExceeded).toEqual([]);
          } else if (expected.outcome === 'bounced') {
            expect(result.delivered).toEqual([]);
            expect(result.bounced).toEqual([userId]);
            expect(result.slaExceeded).toEqual([]);
          } else {
            expect(result.delivered).toEqual([]);
            expect(result.bounced).toEqual([]);
            expect(result.slaExceeded).toEqual([userId]);
          }

          // (2) Total send attempts equal the schedule walk.
          expect(sender.sent).toHaveLength(expected.attemptCount);

          // (3) Every send fires inside the 72h budget after
          // scheduledAt — never before, never after.
          const startMs = scheduledAt.getTime();
          const deadlineMs = startMs + SLA_72H_MS;
          for (const { ts } of sender.sent) {
            expect(ts).toBeGreaterThanOrEqual(startMs);
            expect(ts).toBeLessThanOrEqual(deadlineMs);
          }

          // (4) Persisted audit trail mirrors the outcome.
          const userAttempts = db.breachAttempts.filter((a) => a.userId === userId);
          if (expected.outcome === 'sla_exceeded') {
            // attemptCount actual sends + one trailing 'sla_exceeded' row.
            expect(userAttempts).toHaveLength(expected.attemptCount + 1);
            expect(userAttempts.at(-1)?.status).toBe('sla_exceeded');
          } else {
            expect(userAttempts).toHaveLength(expected.attemptCount);
            expect(userAttempts.at(-1)?.status).toBe(expected.outcome);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
