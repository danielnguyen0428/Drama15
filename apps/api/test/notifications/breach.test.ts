import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BreachNotifier,
  SLA_72H_MS,
  backoffForAttempt,
  type EmailMessage,
  type EmailSender,
  type Locale,
  type NotificationDb,
  type PaidUserDueForPreExpiry,
  type RecordBreachAttemptArgs,
  type RecordEmailSentArgs,
  type UserBreachContact
} from '../../src/notifications/index.js';

/**
 * Sender that lets each test pre-program the response sequence.
 *
 * `responses[i]` is consumed for the (i+1)-th send (1-indexed in the
 * scheduler); once exhausted the sender returns `delivered` so a test
 * that does not pre-program enough entries fails noisily by stopping
 * the loop rather than spinning forever.
 */
class ProgrammableSender implements EmailSender {
  public sent: EmailMessage[] = [];
  public responses: Array<'delivered' | 'bounced' | 'transient'> = [];

  public async send(msg: EmailMessage): Promise<{ status: 'delivered' | 'bounced' | 'transient' }> {
    this.sent.push(msg);
    const next = this.responses.shift() ?? 'delivered';
    return { status: next };
  }
}

class FakeDb implements NotificationDb {
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

function makeContact(userId: string, locale: Locale = 'en'): UserBreachContact {
  return {
    userId,
    email: `${userId}@example.com`,
    displayName: `User ${userId}`,
    uiLocale: locale
  };
}

interface FakeLogger {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
}

function makeLogger(): FakeLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

describe('backoffForAttempt', () => {
  it('returns 0 for the first attempt (no preceding wait)', () => {
    expect(backoffForAttempt(1)).toBe(0);
  });

  it('returns the spec-pinned schedule 1m, 2m, 4m, 8m, 16m, 32m, 60m', () => {
    expect(backoffForAttempt(2)).toBe(60_000);
    expect(backoffForAttempt(3)).toBe(2 * 60_000);
    expect(backoffForAttempt(4)).toBe(4 * 60_000);
    expect(backoffForAttempt(5)).toBe(8 * 60_000);
    expect(backoffForAttempt(6)).toBe(16 * 60_000);
    expect(backoffForAttempt(7)).toBe(32 * 60_000);
    expect(backoffForAttempt(8)).toBe(60 * 60_000);
  });

  it('caps at 60m for attempts past the schedule tail', () => {
    expect(backoffForAttempt(20)).toBe(60 * 60_000);
    expect(backoffForAttempt(1000)).toBe(60 * 60_000);
  });
});

describe('BreachNotifier with fake timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries with 1m/2m/4m backoff after transient and stops on delivered', async () => {
    const scheduledAt = new Date('2025-04-08T00:00:00Z');
    vi.setSystemTime(scheduledAt);

    const db = new FakeDb();
    db.contacts = [makeContact('user-1', 'en')];

    const sender = new ProgrammableSender();
    sender.responses = ['transient', 'transient', 'transient', 'delivered'];

    const logger = makeLogger();
    const notifier = new BreachNotifier({ db, sender, logger });

    const pending = notifier.notifyBreach({
      breachId: 'incident-A',
      affectedUserIds: ['user-1'],
      scheduledAt
    });

    // Attempt 1 fires immediately (no preceding wait).
    await vi.advanceTimersByTimeAsync(0);
    expect(sender.sent).toHaveLength(1);

    // Backoff for attempt 2 is 1 minute.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sender.sent).toHaveLength(2);

    // Backoff for attempt 3 is 2 minutes.
    await vi.advanceTimersByTimeAsync(2 * 60_000);
    expect(sender.sent).toHaveLength(3);

    // Backoff for attempt 4 is 4 minutes; this attempt returns delivered.
    await vi.advanceTimersByTimeAsync(4 * 60_000);

    const result = await pending;
    expect(result.delivered).toEqual(['user-1']);
    expect(result.bounced).toEqual([]);
    expect(result.slaExceeded).toEqual([]);
    expect(sender.sent).toHaveLength(4);

    // Every attempt was persisted, in order, with the right status sequence.
    const userAttempts = db.breachAttempts.filter((a) => a.userId === 'user-1');
    expect(userAttempts.map((a) => a.status)).toEqual([
      'transient',
      'transient',
      'transient',
      'delivered'
    ]);
    expect(userAttempts.map((a) => a.attempt)).toEqual([1, 2, 3, 4]);

    // Logger surfaces the success at info level.
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ breachId: 'incident-A', userId: 'user-1' }),
      'breach_delivered'
    );
  });

  it('does not retry after a permanent bounce and records it as terminal', async () => {
    const scheduledAt = new Date('2025-04-08T00:00:00Z');
    vi.setSystemTime(scheduledAt);

    const db = new FakeDb();
    db.contacts = [makeContact('user-2', 'vi')];

    const sender = new ProgrammableSender();
    sender.responses = ['bounced'];

    const logger = makeLogger();
    const notifier = new BreachNotifier({ db, sender, logger });

    const pending = notifier.notifyBreach({
      breachId: 'incident-B',
      affectedUserIds: ['user-2'],
      scheduledAt
    });

    await vi.advanceTimersByTimeAsync(0);

    const result = await pending;
    expect(result.bounced).toEqual(['user-2']);
    expect(result.delivered).toEqual([]);
    expect(sender.sent).toHaveLength(1);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ breachId: 'incident-B', userId: 'user-2' }),
      'breach_bounced'
    );
  });

  it('emits logger.error and stops retrying when the 72h SLA budget is exhausted', async () => {
    // Strategy: schedule the breach with a tight budget (already 72h
    // minus 30 seconds in the past) so the very first backoff (1m)
    // would push the next wakeup past the deadline.
    const now = new Date('2025-04-08T12:00:00Z');
    const scheduledAt = new Date(now.getTime() - SLA_72H_MS + 30_000);
    vi.setSystemTime(now);

    const db = new FakeDb();
    db.contacts = [makeContact('user-3', 'en')];

    const sender = new ProgrammableSender();
    // First attempt is transient — that triggers a backoff that the
    // SLA gate will refuse to honour.
    sender.responses = ['transient', 'transient', 'transient'];

    const logger = makeLogger();
    const notifier = new BreachNotifier({ db, sender, logger });

    const pending = notifier.notifyBreach({
      breachId: 'incident-C',
      affectedUserIds: ['user-3'],
      scheduledAt
    });

    // Attempt 1 fires immediately.
    await vi.advanceTimersByTimeAsync(0);
    expect(sender.sent).toHaveLength(1);

    // The notifier sees the next backoff (60s) would land past the
    // deadline, logs an error, persists `sla_exceeded`, and returns.
    const result = await pending;
    expect(result.slaExceeded).toEqual(['user-3']);
    expect(result.delivered).toEqual([]);
    expect(sender.sent).toHaveLength(1); // no further sends after SLA blow

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        breachId: 'incident-C',
        userId: 'user-3',
        budgetMs: SLA_72H_MS
      }),
      'breach_sla_exceeded'
    );

    // Last persisted attempt for the user has status 'sla_exceeded'.
    const last = db.breachAttempts.at(-1);
    expect(last?.status).toBe('sla_exceeded');
    expect(last?.userId).toBe('user-3');
  });
});

describe('BreachNotifier missing contacts', () => {
  it('skips users with no contact row, surfaces via logger.error, and continues with the rest', async () => {
    const db = new FakeDb();
    db.contacts = [makeContact('present', 'en')];

    const sender = new ProgrammableSender();
    sender.responses = ['delivered'];

    const logger = makeLogger();
    const notifier = new BreachNotifier({ db, sender, logger });

    const result = await notifier.notifyBreach({
      breachId: 'incident-D',
      affectedUserIds: ['present', 'missing'],
      scheduledAt: new Date()
    });

    expect(result.delivered).toEqual(['present']);
    expect(result.slaExceeded).toEqual(['missing']);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ breachId: 'incident-D', userId: 'missing' }),
      'breach_contact_missing'
    );
  });
});
