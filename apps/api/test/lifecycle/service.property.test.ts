import { describe, it } from 'vitest';
import { fc } from '@drama15/test-helpers';
import {
  DeletionLifecycleService,
  PII_DELETION_WINDOW_MS,
  computeDueAt,
  type LifecycleDb,
  type LifecycleStorage,
  type MarkPendingResult,
  type PurgedContentIds
} from '../../src/lifecycle/index.js';

/**
 * Property 24: PII deletion timeline.
 *
 * **Validates: Requirements 15.3**
 *
 * Generates a `requestedAt` and a `tickAt` and exercises a single
 * `requestDeletion` followed by a single `runDailyPurgeTick`. The
 * property holds when, for every pair of timestamps:
 *
 *   - `tickAt <  requestedAt + 30d`  ⇒  user remains in
 *     `pending_deletion`, PII fields untouched, owner-scoped content
 *     still present, and `runDailyPurgeTick` reports zero purges.
 *   - `tickAt >= requestedAt + 30d`  ⇒  user is in `deleted`, PII
 *     fields zeroed (display_name = null, email rewritten to
 *     `deleted-<id>@invalid.local`), owner-scoped content removed,
 *     and `storage.deleteObject` is invoked exactly once per story
 *     and voice id returned by `purgeUserContent`.
 *
 * The same property also pins down the idempotency guarantee from
 * `requestDeletion`: a second call for the same user (at a later
 * clock tick) does not extend the 30-day window — both `scheduledAt`
 * and `dueAt` returned by the second call match the first, and the
 * underlying schedule map still holds exactly one entry for the
 * original `requestedAt`.
 *
 * The fake `LifecycleDb` mirrors the in-memory shape used by
 * `service.test.ts`, but tracks the PII columns explicitly so the
 * property can assert "PII fields zeroed" rather than just "purge
 * called". The `service.test.ts` unit tests are not modified.
 */

interface FakeUserRow {
  status: 'active' | 'pending_deletion' | 'deleted';
  /** Tracked so `purgeUserPii` can be observed to overwrite it. */
  email: string;
  /** Tracked so `purgeUserPii` can be observed to set it to null. */
  displayName: string | null;
}

interface FakeDb extends LifecycleDb {
  users: Map<string, FakeUserRow>;
  schedule: Map<string, Date>;
  contentByUser: Map<string, PurgedContentIds>;
}

function makeFakeDb(): FakeDb {
  const users = new Map<string, FakeUserRow>();
  const schedule = new Map<string, Date>();
  const contentByUser = new Map<string, PurgedContentIds>();

  const db: FakeDb = {
    users,
    schedule,
    contentByUser,
    async markUserPendingDeletion({ userId }): Promise<MarkPendingResult> {
      const row = users.get(userId);
      if (!row) {
        users.set(userId, {
          status: 'pending_deletion',
          email: `${userId}@example.com`,
          displayName: 'Test User'
        });
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
      const row = users.get(userId);
      if (row) {
        row.status = 'deleted';
        row.email = `deleted-${userId}@invalid.local`;
        row.displayName = null;
      }
    },
    async purgeUserContent({ userId }) {
      const ids = contentByUser.get(userId) ?? { storyIds: [], voiceJobIds: [] };
      contentByUser.delete(userId);
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

/**
 * Capturing storage adapter — records every `deleteObject` key so the
 * property can assert that physical purge fans out exactly one call
 * per story / voice id returned by `purgeUserContent`.
 */
function makeRecordingStorage(): LifecycleStorage & { keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    async deleteObject({ key }) {
      keys.push(key);
    }
  };
}

/**
 * Date arbitrary clamped well inside the JS `Date` safe range so
 * `requestedAt + 30 days` never overflows. Both `requestedAt` and
 * `tickAt` use the same range; ordering is intentionally not
 * constrained so the property covers `tickAt < requestedAt` as well
 * (those still satisfy the "not purged" branch).
 */
const arbTimelineDate = (): fc.Arbitrary<Date> =>
  fc.date({
    min: new Date('2024-01-01T00:00:00.000Z'),
    max: new Date('2030-06-30T23:59:59.000Z'),
    noInvalidDate: true
  });

describe('Property 24: PII deletion timeline (Requirement 15.3)', () => {
  it('purges iff tickAt >= requestedAt + 30d, and re-requests do not move dueAt', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbTimelineDate(),
        arbTimelineDate(),
        async (requestedAt, tickAt) => {
          const db = makeFakeDb();
          const storage = makeRecordingStorage();
          const userId = 'u-prop';
          const storyIds = ['s-1', 's-2'];
          const voiceJobIds = ['v-1'];

          db.users.set(userId, {
            status: 'active',
            email: `${userId}@example.com`,
            displayName: 'Test User'
          });
          db.contentByUser.set(userId, { storyIds, voiceJobIds });

          let now = requestedAt;
          const service = new DeletionLifecycleService({
            db,
            storage,
            clock: () => now
          });

          // First request schedules dueAt = requestedAt + 30d.
          const first = await service.requestDeletion(userId);
          if (first.scheduledAt.getTime() !== requestedAt.getTime()) return false;
          if (
            first.dueAt.getTime() - first.scheduledAt.getTime() !==
            PII_DELETION_WINDOW_MS
          ) {
            return false;
          }

          // Idempotency: advance the clock by a tiny amount and request
          // again. The second result must match the first, and only one
          // schedule entry should exist.
          now = new Date(requestedAt.getTime() + 1);
          const second = await service.requestDeletion(userId);
          if (second.scheduledAt.getTime() !== first.scheduledAt.getTime()) return false;
          if (second.dueAt.getTime() !== first.dueAt.getTime()) return false;
          if (db.schedule.size !== 1) return false;
          if (db.schedule.get(userId)?.getTime() !== requestedAt.getTime()) {
            return false;
          }

          // Drive the daily tick at the generated `tickAt`.
          now = tickAt;
          const tickResult = await service.runDailyPurgeTick(tickAt);

          const dueAtMs = requestedAt.getTime() + PII_DELETION_WINDOW_MS;
          const shouldBePurged = tickAt.getTime() >= dueAtMs;
          const userRow = db.users.get(userId);
          if (!userRow) return false;

          if (shouldBePurged) {
            // The tick reports the user as purged.
            if (tickResult.purged !== 1) return false;

            // PII zeroed and content removed.
            if (userRow.status !== 'deleted') return false;
            if (userRow.displayName !== null) return false;
            if (userRow.email !== `deleted-${userId}@invalid.local`) return false;
            if (db.contentByUser.has(userId)) return false;
            // Schedule entry is drained by `purgeUserContent`.
            if (db.schedule.has(userId)) return false;

            // Storage receives one deleteObject per returned id, and
            // every key is owner-scoped to `users/{userId}/...`.
            const expectedKeys = [
              ...storyIds.map((id) => `users/${userId}/stories/${id}`),
              ...voiceJobIds.map((id) => `users/${userId}/voice/${id}`)
            ];
            if (storage.keys.length !== expectedKeys.length) return false;
            const actual = [...storage.keys].sort();
            const expected = [...expectedKeys].sort();
            for (let i = 0; i < expected.length; i += 1) {
              if (actual[i] !== expected[i]) return false;
              if (!actual[i]!.startsWith(`users/${userId}/`)) return false;
            }
          } else {
            // Still pending: tick reports zero purges and nothing moved.
            if (tickResult.purged !== 0) return false;
            if (userRow.status !== 'pending_deletion') return false;
            if (userRow.displayName === null) return false;
            if (userRow.email.startsWith('deleted-')) return false;
            if (!db.contentByUser.has(userId)) return false;
            if (!db.schedule.has(userId)) return false;
            if (storage.keys.length !== 0) return false;
          }

          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
