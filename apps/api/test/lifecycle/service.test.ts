import { describe, expect, it, vi } from 'vitest';
import {
  DailyPurgeScheduler,
  DEFAULT_PURGE_INTERVAL_MS,
  DeletionLifecycleService,
  PII_DELETION_WINDOW_MS,
  computeDueAt,
  type LifecycleDb,
  type LifecycleStorage,
  type MarkPendingResult,
  type PurgedContentIds
} from '../../src/lifecycle/index.js';

/**
 * Fake `LifecycleDb` backed by in-memory maps. The tests drive the
 * service against this fake; the migration test (`0005-user-deletion-
 * schedule.test.ts`) exercises the SQL side.
 */
interface FakeUserRow {
  status: 'active' | 'pending_deletion' | 'deleted';
}

interface FakeDb extends LifecycleDb {
  users: Map<string, FakeUserRow>;
  schedule: Map<string, Date>;
  contentByUser: Map<string, PurgedContentIds>;
  purgePiiCalls: string[];
  purgeContentCalls: string[];
}

function makeFakeDb(): FakeDb {
  const users = new Map<string, FakeUserRow>();
  const schedule = new Map<string, Date>();
  const contentByUser = new Map<string, PurgedContentIds>();
  const purgePiiCalls: string[] = [];
  const purgeContentCalls: string[] = [];

  const db: FakeDb = {
    users,
    schedule,
    contentByUser,
    purgePiiCalls,
    purgeContentCalls,
    async markUserPendingDeletion({ userId }): Promise<MarkPendingResult> {
      const row = users.get(userId);
      if (!row) {
        // Treat unknown users as fresh actives so we don't have to
        // pre-populate every test.
        users.set(userId, { status: 'pending_deletion' });
        return { alreadyPending: false, alreadyDeleted: false };
      }
      if (row.status === 'deleted') {
        return { alreadyPending: false, alreadyDeleted: true };
      }
      if (row.status === 'pending_deletion') {
        return { alreadyPending: true, alreadyDeleted: false };
      }
      row.status = 'pending_deletion';
      return { alreadyPending: false, alreadyDeleted: false };
    },
    async findUsersDueForPurge({ now }) {
      const due: { userId: string }[] = [];
      for (const [userId, scheduledAt] of schedule.entries()) {
        const dueAt = computeDueAt(scheduledAt);
        if (dueAt.getTime() <= now.getTime()) {
          due.push({ userId });
        }
      }
      return due;
    },
    async purgeUserPii({ userId }) {
      purgePiiCalls.push(userId);
      const row = users.get(userId);
      if (row) row.status = 'deleted';
    },
    async purgeUserContent({ userId }) {
      purgeContentCalls.push(userId);
      const ids = contentByUser.get(userId) ?? { storyIds: [], voiceJobIds: [] };
      contentByUser.delete(userId);
      // Also drain the schedule so `findUsersDueForPurge` does not
      // return the same user on the next tick.
      schedule.delete(userId);
      return ids;
    },
    async recordPendingDeletionAt({ userId, ts }) {
      // Schedule once: re-requests do not extend the window.
      if (!schedule.has(userId)) {
        schedule.set(userId, ts);
      }
    },
    async getPendingDeletionAt(userId) {
      return schedule.get(userId) ?? null;
    }
  };

  return db;
}

describe('DeletionLifecycleService.requestDeletion (Requirement 15.3)', () => {
  it('flips a fresh active user to pending_deletion and schedules dueAt = now + 30d', async () => {
    const db = makeFakeDb();
    db.users.set('u-1', { status: 'active' });
    const now = new Date('2025-01-01T00:00:00Z');
    const service = new DeletionLifecycleService({ db, clock: () => now });

    const entry = await service.requestDeletion('u-1');

    expect(db.users.get('u-1')!.status).toBe('pending_deletion');
    expect(entry.userId).toBe('u-1');
    expect(entry.scheduledAt.toISOString()).toBe(now.toISOString());
    expect(entry.dueAt.getTime() - now.getTime()).toBe(PII_DELETION_WINDOW_MS);
    expect(db.schedule.get('u-1')!.toISOString()).toBe(now.toISOString());
  });

  it('records the schedule exactly once across two calls (no window extension)', async () => {
    const db = makeFakeDb();
    db.users.set('u-1', { status: 'active' });

    const firstCall = new Date('2025-01-01T00:00:00Z');
    const secondCall = new Date('2025-01-15T00:00:00Z');
    let now = firstCall;
    const service = new DeletionLifecycleService({ db, clock: () => now });

    const first = await service.requestDeletion('u-1');
    now = secondCall;
    const second = await service.requestDeletion('u-1');

    // The schedule did not move.
    expect(first.scheduledAt.toISOString()).toBe(firstCall.toISOString());
    expect(second.scheduledAt.toISOString()).toBe(firstCall.toISOString());
    expect(second.dueAt.getTime() - first.scheduledAt.getTime()).toBe(
      PII_DELETION_WINDOW_MS
    );
    // Only one schedule entry exists.
    expect(db.schedule.size).toBe(1);
  });
});

describe('DeletionLifecycleService.isContentVisible (Requirement 15.3)', () => {
  const service = new DeletionLifecycleService({ db: makeFakeDb() });

  it('returns true for active users', () => {
    expect(service.isContentVisible('u-1', 'active')).toBe(true);
  });

  it('returns false for pending_deletion users', () => {
    expect(service.isContentVisible('u-1', 'pending_deletion')).toBe(false);
  });

  it('returns false for deleted users', () => {
    expect(service.isContentVisible('u-1', 'deleted')).toBe(false);
  });
});

describe('DeletionLifecycleService.runDailyPurgeTick (Requirement 15.3)', () => {
  it('purges content + PII at scheduledAt + 30d', async () => {
    const db = makeFakeDb();
    db.users.set('u-1', { status: 'active' });
    db.contentByUser.set('u-1', {
      storyIds: ['s-1', 's-2'],
      voiceJobIds: ['v-1']
    });

    const scheduledAt = new Date('2025-01-01T00:00:00Z');
    let now = scheduledAt;
    const service = new DeletionLifecycleService({ db, clock: () => now });
    await service.requestDeletion('u-1');

    // Tick exactly at scheduledAt + 30d.
    now = new Date(scheduledAt.getTime() + PII_DELETION_WINDOW_MS);
    const result = await service.runDailyPurgeTick(now);

    expect(result.purged).toBe(1);
    expect(db.purgeContentCalls).toEqual(['u-1']);
    expect(db.purgePiiCalls).toEqual(['u-1']);
    expect(db.users.get('u-1')!.status).toBe('deleted');
  });

  it('does NOT purge before scheduledAt + 30d (29d 23h elapsed)', async () => {
    const db = makeFakeDb();
    db.users.set('u-1', { status: 'active' });

    const scheduledAt = new Date('2025-01-01T00:00:00Z');
    let now = scheduledAt;
    const service = new DeletionLifecycleService({ db, clock: () => now });
    await service.requestDeletion('u-1');

    // Tick at 29d 23h after scheduling.
    const oneHourMs = 60 * 60 * 1000;
    now = new Date(scheduledAt.getTime() + PII_DELETION_WINDOW_MS - oneHourMs);
    const result = await service.runDailyPurgeTick(now);

    expect(result.purged).toBe(0);
    expect(db.purgeContentCalls).toEqual([]);
    expect(db.purgePiiCalls).toEqual([]);
    expect(db.users.get('u-1')!.status).toBe('pending_deletion');
  });

  it('drives storage.deleteObject for every returned story / voice id (Property 24)', async () => {
    const db = makeFakeDb();
    db.users.set('u-1', { status: 'active' });
    db.contentByUser.set('u-1', {
      storyIds: ['s-1', 's-2'],
      voiceJobIds: ['v-1', 'v-2', 'v-3']
    });

    const storage: LifecycleStorage = {
      deleteObject: vi.fn().mockResolvedValue(undefined)
    };

    const scheduledAt = new Date('2025-02-01T00:00:00Z');
    let now = scheduledAt;
    const service = new DeletionLifecycleService({
      db,
      storage,
      clock: () => now
    });
    await service.requestDeletion('u-1');

    now = new Date(scheduledAt.getTime() + PII_DELETION_WINDOW_MS);
    await service.runDailyPurgeTick(now);

    const deleteSpy = storage.deleteObject as ReturnType<typeof vi.fn>;
    // 2 stories + 3 voice jobs = 5 deleteObject calls.
    expect(deleteSpy).toHaveBeenCalledTimes(5);

    const calls = deleteSpy.mock.calls.map((c) => (c[0] as { key: string }).key);
    expect(calls).toEqual(
      expect.arrayContaining([
        'users/u-1/stories/s-1',
        'users/u-1/stories/s-2',
        'users/u-1/voice/v-1',
        'users/u-1/voice/v-2',
        'users/u-1/voice/v-3'
      ])
    );
    // Every key is owner-scoped.
    for (const key of calls) {
      expect(key.startsWith('users/u-1/')).toBe(true);
    }
  });

  it('catches per-user errors so one bad user does not stall the tick', async () => {
    const db = makeFakeDb();
    db.users.set('u-good', { status: 'active' });
    db.users.set('u-bad', { status: 'active' });

    const scheduledAt = new Date('2025-03-01T00:00:00Z');
    let now = scheduledAt;
    const errors: object[] = [];
    const logger = {
      info: () => {},
      warn: () => {},
      error: (obj: object) => {
        errors.push(obj);
      }
    };
    const service = new DeletionLifecycleService({ db, clock: () => now, logger });
    await service.requestDeletion('u-good');
    await service.requestDeletion('u-bad');

    // Make purgeUserContent throw for `u-bad`.
    const original = db.purgeUserContent.bind(db);
    db.purgeUserContent = async (input) => {
      if (input.userId === 'u-bad') {
        throw new Error('boom');
      }
      return original(input);
    };

    now = new Date(scheduledAt.getTime() + PII_DELETION_WINDOW_MS);
    const result = await service.runDailyPurgeTick(now);

    expect(result.purged).toBe(1);
    expect(db.purgePiiCalls).toEqual(['u-good']);
    expect(errors.length).toBe(1);
  });
});

describe('DailyPurgeScheduler', () => {
  it('runs an immediate tick on start and stops cleanly', async () => {
    const db = makeFakeDb();
    const service = new DeletionLifecycleService({ db });
    const tickSpy = vi.spyOn(service, 'runDailyPurgeTick').mockResolvedValue({ purged: 0 });

    const scheduler = new DailyPurgeScheduler({ service, intervalMs: 1000 });
    scheduler.start();
    // Allow the immediate microtask tick to flush.
    await Promise.resolve();
    await Promise.resolve();
    scheduler.stop();

    expect(tickSpy).toHaveBeenCalled();
  });

  it('rejects non-positive intervalMs', () => {
    const db = makeFakeDb();
    const service = new DeletionLifecycleService({ db });
    expect(() => new DailyPurgeScheduler({ service, intervalMs: 0 })).toThrow();
    expect(() => new DailyPurgeScheduler({ service, intervalMs: -1 })).toThrow();
  });

  it('exposes a 24h default interval', () => {
    expect(DEFAULT_PURGE_INTERVAL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
