import { describe, expect, it } from 'vitest';
import {
  PreExpiryNotifier,
  SLA_72H_MS,
  type EmailMessage,
  type EmailSender,
  type Locale,
  type NotificationDb,
  type PaidUserDueForPreExpiry,
  type RecordEmailSentArgs,
  type RecordBreachAttemptArgs,
  type UserBreachContact
} from '../../src/notifications/index.js';

/**
 * In-memory NotificationDb the unit tests drive. We model the
 * production query shape — only return users that:
 *
 *   1. Are within `leadTime` of expiry (`paidExpireAt - now <= leadTime`),
 *   2. Have not already received a pre-expiry email for the same
 *      `idempotencyKey = pre_expiry:{userId}:{paidCycleId}`.
 *
 * Returning rows that the production query would NOT return is a
 * tempting shortcut but defeats the point of the test — the
 * scheduler's idempotency assertion depends on the join being modelled
 * faithfully.
 */
class FakeDb implements NotificationDb {
  public seedUsers: Array<{
    userId: string;
    email: string;
    displayName: string;
    paidExpireAt: Date;
    paidCycleId: string;
    uiLocale: Locale;
  }> = [];

  public emailSent: Array<{ userId: string; idempotencyKey: string; ts: Date }> = [];

  public breachAttempts: RecordBreachAttemptArgs[] = [];

  public async findPaidUsersDueForPreExpiry(args: {
    now: Date;
    leadTime: number;
  }): Promise<PaidUserDueForPreExpiry[]> {
    const now = args.now.getTime();
    return this.seedUsers
      .filter((u) => u.paidExpireAt.getTime() - now <= args.leadTime)
      .filter((u) => {
        const key = `pre_expiry:${u.userId}:${u.paidCycleId}`;
        return !this.emailSent.some(
          (e) => e.userId === u.userId && e.idempotencyKey === key
        );
      });
  }

  public async recordEmailSent(args: RecordEmailSentArgs): Promise<void> {
    this.emailSent.push({ ...args });
  }

  public async findUsersForBreach(): Promise<UserBreachContact[]> {
    return [];
  }

  public async recordBreachAttempt(args: RecordBreachAttemptArgs): Promise<void> {
    this.breachAttempts.push({ ...args });
  }
}

class FakeSender implements EmailSender {
  public sent: EmailMessage[] = [];
  public response: 'delivered' | 'bounced' | 'transient' = 'delivered';

  public async send(msg: EmailMessage): Promise<{ status: 'delivered' | 'bounced' | 'transient' }> {
    this.sent.push(msg);
    return { status: this.response };
  }
}

describe('PreExpiryNotifier.runTick', () => {
  const tickAt = new Date('2025-04-15T00:00:00Z');

  it('emails users whose paidExpireAt is within the 72h window', async () => {
    const db = new FakeDb();
    db.seedUsers = [
      // 24h away — inside the window, should be emailed.
      {
        userId: 'inside-1',
        email: 'a@example.com',
        displayName: 'Anna',
        paidExpireAt: new Date(tickAt.getTime() + 24 * 3600 * 1000),
        paidCycleId: 'cycle-A',
        uiLocale: 'vi'
      },
      // 71h away — inside the window.
      {
        userId: 'inside-2',
        email: 'b@example.com',
        displayName: 'Ben',
        paidExpireAt: new Date(tickAt.getTime() + 71 * 3600 * 1000),
        paidCycleId: 'cycle-B',
        uiLocale: 'en'
      },
      // 73h away — strictly outside the window, must NOT be emailed.
      {
        userId: 'outside-1',
        email: 'c@example.com',
        displayName: 'Carol',
        paidExpireAt: new Date(tickAt.getTime() + 73 * 3600 * 1000),
        paidCycleId: 'cycle-C',
        uiLocale: 'en'
      }
    ];

    const sender = new FakeSender();
    const notifier = new PreExpiryNotifier({ db, sender });

    const summary = await notifier.runTick(tickAt);
    expect(summary.attempted).toBe(2);
    expect(summary.delivered).toBe(2);

    const recipients = sender.sent.map((m) => m.to).sort();
    expect(recipients).toEqual(['a@example.com', 'b@example.com']);

    // Idempotency keys are recorded with the right shape.
    expect(db.emailSent.map((e) => e.idempotencyKey).sort()).toEqual([
      'pre_expiry:inside-1:cycle-A',
      'pre_expiry:inside-2:cycle-B'
    ]);
  });

  it('does not re-send within the same paid cycle on a follow-up tick', async () => {
    const db = new FakeDb();
    db.seedUsers = [
      {
        userId: 'u1',
        email: 'a@example.com',
        displayName: 'Anna',
        paidExpireAt: new Date(tickAt.getTime() + 12 * 3600 * 1000),
        paidCycleId: 'cycle-A',
        uiLocale: 'en'
      }
    ];
    const sender = new FakeSender();
    const notifier = new PreExpiryNotifier({ db, sender });

    const first = await notifier.runTick(tickAt);
    expect(first.delivered).toBe(1);

    // Tick again 30 minutes later — still inside the 72h window for
    // the same cycle. The DB join eliminates the user, so no re-send.
    const second = await notifier.runTick(new Date(tickAt.getTime() + 30 * 60 * 1000));
    expect(second.attempted).toBe(0);
    expect(second.delivered).toBe(0);
    expect(sender.sent).toHaveLength(1);
  });

  it('treats a new paidCycleId as a fresh notification target', async () => {
    const db = new FakeDb();
    const u1 = {
      userId: 'u1',
      email: 'a@example.com',
      displayName: 'Anna',
      paidExpireAt: new Date(tickAt.getTime() + 12 * 3600 * 1000),
      paidCycleId: 'cycle-A',
      uiLocale: 'en' as const
    };
    db.seedUsers = [u1];

    const sender = new FakeSender();
    const notifier = new PreExpiryNotifier({ db, sender });

    await notifier.runTick(tickAt);
    expect(sender.sent).toHaveLength(1);

    // Renewal: cycle changes; the next pre-expiry tick must email again.
    db.seedUsers = [
      {
        ...u1,
        paidCycleId: 'cycle-B',
        paidExpireAt: new Date(tickAt.getTime() + 30 * 24 * 3600 * 1000 + 12 * 3600 * 1000)
      }
    ];
    const laterTick = new Date(
      db.seedUsers[0]!.paidExpireAt.getTime() - 12 * 3600 * 1000
    );

    const summary = await notifier.runTick(laterTick);
    expect(summary.delivered).toBe(1);
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[1]!.idempotencyKey).toBe('pre_expiry:u1:cycle-B');
  });

  it('does not record email_sent when the transport returns transient', async () => {
    const db = new FakeDb();
    db.seedUsers = [
      {
        userId: 'u1',
        email: 'a@example.com',
        displayName: 'Anna',
        paidExpireAt: new Date(tickAt.getTime() + 12 * 3600 * 1000),
        paidCycleId: 'cycle-A',
        uiLocale: 'en'
      }
    ];
    const sender = new FakeSender();
    sender.response = 'transient';
    const notifier = new PreExpiryNotifier({ db, sender });

    const summary = await notifier.runTick(tickAt);
    expect(summary.attempted).toBe(1);
    expect(summary.delivered).toBe(0);
    expect(db.emailSent).toHaveLength(0);

    // Next tick can retry because no email_sent row was written.
    sender.response = 'delivered';
    const retry = await notifier.runTick(new Date(tickAt.getTime() + 60 * 1000));
    expect(retry.delivered).toBe(1);
  });

  it('honours the application-side 72h ceiling even if the DB returns a stale row', async () => {
    // Production query is supposed to filter; this guards against a
    // future regression in the SQL by re-checking on the app side.
    const db = new FakeDb();
    db.seedUsers = [
      {
        userId: 'leak',
        email: 'leak@example.com',
        displayName: 'Leak',
        paidExpireAt: new Date(tickAt.getTime() + SLA_72H_MS + 1000),
        paidCycleId: 'cycle-leak',
        uiLocale: 'en'
      }
    ];
    // Force the DB to return the row by overriding the filter.
    db.findPaidUsersDueForPreExpiry = async () =>
      db.seedUsers.map((u) => ({ ...u }));

    const sender = new FakeSender();
    const notifier = new PreExpiryNotifier({ db, sender });

    const summary = await notifier.runTick(tickAt);
    expect(summary.delivered).toBe(0);
    expect(sender.sent).toHaveLength(0);
  });
});
