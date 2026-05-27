/**
 * Unit tests for `DELETE /stories/:id` (Task 10.9).
 *
 * Coverage:
 *   - Owner DELETE → 204 + content erased immediately (Requirement 10.3).
 *   - Voice file deletion is scheduled with `deleteBy = now + 24h`
 *     (Requirement 10.3).
 *   - Non-owner → 403 `forbidden` (Requirement 10.4).
 *   - Missing story → 404 `not_found`.
 *   - Idempotent: deleting an already-deleted story → 404, not 500.
 *   - Empty caller (missing JWT decoration) → 401 `unauthenticated`.
 *   - Admin role bypasses the ownership gate (Requirement 15.2).
 *
 * Tests run against an in-memory `FakeStoriesDeleteDb` and reuse the
 * `FakeHistoryDb` shape from `history.test.ts` so the two suites stay
 * in lock-step. The production `PgStoriesDeleteDb` (when wired) is
 * exercised by integration tests in Task 19.2.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

import type {
  HistoryDb,
  HistoryStoryDetail
} from '../../src/stories/historyDb.js';
import storiesDeleteRoutes, {
  VOICE_FILE_DELETION_WINDOW_MS,
  type ScheduleVoiceFileDeletionInput,
  type StoriesDeleteDb
} from '../../src/stories/delete.js';
import type { GetCallerUserId } from '../../src/stories/history.js';
import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// In-memory `HistoryDb` (subset needed by delete)
// ---------------------------------------------------------------------------

interface SeedRow {
  id: string;
  userId: string;
  voiceJobIds: string[];
}

class FakeHistoryDb implements Pick<HistoryDb, 'getStoryDetail'> {
  private readonly rows = new Map<string, SeedRow>();

  public seed(row: SeedRow): void {
    this.rows.set(row.id, { ...row, voiceJobIds: [...row.voiceJobIds] });
  }

  public remove(storyId: string): void {
    this.rows.delete(storyId);
  }

  public has(storyId: string): boolean {
    return this.rows.has(storyId);
  }

  public async getStoryDetail(
    storyId: string
  ): Promise<HistoryStoryDetail | null> {
    const r = this.rows.get(storyId);
    if (!r) return null;
    // Only the fields the route reads need to be populated. The rest
    // are filled with safe defaults so the type narrows correctly.
    return {
      id: r.id,
      userId: r.userId,
      title: null,
      overview: null,
      plan: null,
      chapters: [],
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z'
    };
  }
}

// ---------------------------------------------------------------------------
// In-memory `StoriesDeleteDb`
// ---------------------------------------------------------------------------

class FakeStoriesDeleteDb implements StoriesDeleteDb {
  /**
   * Backing store of voice_job ids per story_id, populated by
   * `seedVoice`. Kept in sync with `FakeHistoryDb` so the two fakes
   * agree on what content is "live".
   */
  private readonly voiceJobs = new Map<string, string[]>();
  /** Story rows that exist in the storage layer (for delete bookkeeping). */
  private readonly rows = new Set<string>();

  public readonly schedules: ScheduleVoiceFileDeletionInput[] = [];
  public listVoiceCalls = 0;
  public deleteCalls = 0;

  public seed(storyId: string, voiceJobIds: string[]): void {
    this.rows.add(storyId);
    this.voiceJobs.set(storyId, [...voiceJobIds]);
  }

  public has(storyId: string): boolean {
    return this.rows.has(storyId);
  }

  public async listVoiceJobsForStory(storyId: string): Promise<string[]> {
    this.listVoiceCalls += 1;
    return [...(this.voiceJobs.get(storyId) ?? [])];
  }

  public async deleteStoryContent(
    storyId: string
  ): Promise<{ deleted: number }> {
    this.deleteCalls += 1;
    if (!this.rows.has(storyId)) return { deleted: 0 };
    this.rows.delete(storyId);
    // Cascade behaviour mirrored at the application level so the test
    // can assert the schedule captured the snapshot taken before the
    // cascade.
    this.voiceJobs.delete(storyId);
    return { deleted: 1 };
  }

  public async scheduleVoiceFileDeletion(
    input: ScheduleVoiceFileDeletionInput
  ): Promise<void> {
    // Defensive copy so subsequent mutations to the input object can't
    // affect what the test observes.
    this.schedules.push({
      storyId: input.storyId,
      userId: input.userId,
      voiceJobIds: [...input.voiceJobIds],
      deleteBy: new Date(input.deleteBy.getTime())
    });
  }
}

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const STORY_A1 = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const STORY_MISSING = 'cccc9999-cccc-4ccc-8ccc-cccccccccccc';

const VOICE_J1 = 'v1111111-1111-4111-8111-111111111111';
const VOICE_J2 = 'v2222222-2222-4222-8222-222222222222';

const FIXED_NOW = new Date('2025-04-01T12:00:00.000Z');

interface BuildAppOptions {
  historyDb: Pick<HistoryDb, 'getStoryDetail'>;
  storiesDeleteDb: StoriesDeleteDb;
  getCallerUserId: GetCallerUserId;
  now?: Date;
}

async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const authz = new ServerAuthorityAuthzMiddleware({
    licenseDb: new FakeLicenseDb()
  });
  const app = Fastify({ logger: false });
  await app.register(storiesDeleteRoutes, {
    historyDb: opts.historyDb,
    storiesDeleteDb: opts.storiesDeleteDb,
    authz,
    clock: () => opts.now ?? FIXED_NOW,
    getCallerUserId: opts.getCallerUserId
  });
  await app.ready();
  return app;
}

function callerForUser(userId: string, role?: string): GetCallerUserId {
  return () => {
    const out: { id: string; role?: string } = { id: userId };
    if (role !== undefined) out.role = role;
    return out;
  };
}

const noCaller: GetCallerUserId = () => null;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DELETE /stories/:id — owner deletion', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('deletes the story content immediately and returns 204 (Requirement 10.3)', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [] });
    deleteDb.seed(STORY_A1, []);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(204);
    expect(res.body).toBe('');
    // Content row erased synchronously — verifies "delete content
    // immediately" half of Requirement 10.3.
    expect(deleteDb.has(STORY_A1)).toBe(false);
    expect(deleteDb.deleteCalls).toBe(1);
  });

  it('schedules voice file deletion with deleteBy = now + 24h (Requirement 10.3)', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({
      id: STORY_A1,
      userId: USER_A,
      voiceJobIds: [VOICE_J1, VOICE_J2]
    });
    deleteDb.seed(STORY_A1, [VOICE_J1, VOICE_J2]);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A),
      now: FIXED_NOW
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(204);
    expect(deleteDb.schedules).toHaveLength(1);
    const schedule = deleteDb.schedules[0]!;
    expect(schedule.storyId).toBe(STORY_A1);
    expect(schedule.userId).toBe(USER_A);
    // Voice ids captured BEFORE the cascade — both ids must be present
    // even though the cascade has since cleared the underlying store.
    expect([...schedule.voiceJobIds].sort()).toEqual(
      [VOICE_J1, VOICE_J2].sort()
    );
    // Exact 24h deadline from the injected clock.
    expect(schedule.deleteBy.getTime()).toBe(
      FIXED_NOW.getTime() + VOICE_FILE_DELETION_WINDOW_MS
    );
    // Sanity: 24h in milliseconds.
    expect(VOICE_FILE_DELETION_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('records a schedule row even when the story has no voice artefacts', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [] });
    deleteDb.seed(STORY_A1, []);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(204);
    // Authoritative "deletion was requested" entry — empty list is fine.
    expect(deleteDb.schedules).toHaveLength(1);
    expect(deleteDb.schedules[0]!.voiceJobIds).toEqual([]);
  });

  it('lists voice jobs BEFORE deleting story content (cascade safety)', async () => {
    // Verifies the call ordering: listVoiceJobsForStory must run
    // strictly before deleteStoryContent so the FK cascade can't erase
    // the ids we need.
    const history = new FakeHistoryDb();
    history.seed({
      id: STORY_A1,
      userId: USER_A,
      voiceJobIds: [VOICE_J1]
    });

    const callOrder: string[] = [];
    const deleteDb: StoriesDeleteDb = {
      async listVoiceJobsForStory(storyId) {
        callOrder.push('list');
        expect(storyId).toBe(STORY_A1);
        return [VOICE_J1];
      },
      async deleteStoryContent(storyId) {
        callOrder.push('delete');
        expect(storyId).toBe(STORY_A1);
        return { deleted: 1 };
      },
      async scheduleVoiceFileDeletion() {
        callOrder.push('schedule');
      }
    };

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(204);
    expect(callOrder).toEqual(['list', 'delete', 'schedule']);
  });
});

describe('DELETE /stories/:id — authorisation', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('rejects a non-owner with 403 forbidden (Requirement 10.4)', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [VOICE_J1] });
    deleteDb.seed(STORY_A1, [VOICE_J1]);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_B)
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: { code: 'forbidden', message: expect.any(String) }
    });
    // No mutation: row still present, no schedule recorded.
    expect(deleteDb.has(STORY_A1)).toBe(true);
    expect(deleteDb.schedules).toEqual([]);
    expect(deleteDb.deleteCalls).toBe(0);
  });

  it('returns 401 when no caller identity is attached', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [] });
    deleteDb.seed(STORY_A1, []);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: noCaller
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'unauthenticated' }
    });
    expect(deleteDb.has(STORY_A1)).toBe(true);
  });

  it('admin role bypasses the ownership gate (Requirement 15.2)', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [VOICE_J1] });
    deleteDb.seed(STORY_A1, [VOICE_J1]);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      // Admin is a different user from the resource owner.
      getCallerUserId: callerForUser(USER_B, 'admin')
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(204);
    expect(deleteDb.has(STORY_A1)).toBe(false);
    // Schedule still records the original owner so the worker erases
    // files under `users/{USER_A}/...` rather than the admin's prefix.
    expect(deleteDb.schedules).toHaveLength(1);
    expect(deleteDb.schedules[0]!.userId).toBe(USER_A);
  });
});

describe('DELETE /stories/:id — idempotency', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 404 when the story does not exist', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    // Nothing seeded — STORY_MISSING is genuinely absent.

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_MISSING}`
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) }
    });
    expect(deleteDb.deleteCalls).toBe(0);
    expect(deleteDb.schedules).toEqual([]);
  });

  it('is idempotent: a second DELETE on an already-deleted story → 404, not 500', async () => {
    const history = new FakeHistoryDb();
    const deleteDb = new FakeStoriesDeleteDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [VOICE_J1] });
    deleteDb.seed(STORY_A1, [VOICE_J1]);

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A)
    });

    // First DELETE: succeeds.
    const first = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });
    expect(first.statusCode).toBe(204);
    // Mirror the cascade in the history fake so the second DELETE
    // sees a row that is genuinely gone (matches production wiring
    // where both adapters read the same `story_jobs` table).
    history.remove(STORY_A1);

    // Second DELETE on the same id: must return 404, not crash.
    const second = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });
    expect(second.statusCode).toBe(404);
    expect(second.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) }
    });
    // Only one schedule recorded across the two calls.
    expect(deleteDb.schedules).toHaveLength(1);
  });

  it('races the row delete: history says exists, but cascade deleted it first → 404 (no schedule)', async () => {
    // Simulates the rare race where the ownership read sees the row
    // but a concurrent delete removes it before our `deleteStoryContent`
    // runs. The route must NOT schedule voice deletion in that case.
    const history = new FakeHistoryDb();
    history.seed({ id: STORY_A1, userId: USER_A, voiceJobIds: [VOICE_J1] });
    const deleteDb = new FakeStoriesDeleteDb();
    // Note: we do NOT seed deleteDb — the row is "already gone" from
    // its perspective, mimicking the racing concurrent delete.

    app = await buildApp({
      historyDb: history,
      storiesDeleteDb: deleteDb,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/stories/${STORY_A1}`
    });

    expect(res.statusCode).toBe(404);
    expect(deleteDb.schedules).toEqual([]);
  });
});
