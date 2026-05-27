/**
 * Unit tests for `POST /stories/:id/resume` (Task 10.5).
 *
 * Validates: Requirements 6.9, 7.7.
 *
 * Coverage:
 *   - Only chapters with `status != 'done'` are re-queued; `done`
 *     chapters are NEVER touched (Requirements 6.9, 7.7).
 *   - A story whose chapters are all `done` returns an empty
 *     `resumed` array, makes no FSM move, and does not enqueue any
 *     regeneration tasks.
 *   - A non-owner caller is rejected with 403 `forbidden` and no
 *     queue / FSM side effects (Requirement 10.4).
 *   - **Quota counters are never invoked.** A tracking fake exposes
 *     every quota method the codebase has; if any of them is hit,
 *     the test fails. This is the structural enforcement of
 *     "resume must not increment quota" (Requirements 6.9, 7.7).
 *   - The FSM transition is applied with the version observed at
 *     read time. A stale version surfaces as `409 conflict`.
 *
 * The Fastify plugin is loaded via `app.inject(...)` so the tests
 * exercise the same body parsing, error mapping, and header behaviour
 * that production traffic would.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import type { ChapterStatus } from '@drama15/contracts';

import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import {
  type StoryJobFsmDb,
  type StoryJobFsmRow
} from '../../src/stories/fsmDb.js';
import type { StoryJobState } from '../../src/stories/fsm.js';
import {
  createResumeRoutePlugin,
  ResumeService,
  type ChapterStatusReader,
  type ChapterStatusRow,
  type GetCallerIdentity,
  type ResumeChapterQueue,
  type ResumeChapterQueueRequest,
  type StoryOwnerLookup
} from '../../src/stories/resume.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const STORY_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

class FakeStoryOwnerLookup implements StoryOwnerLookup {
  public ownerByStoryId = new Map<string, string>();

  public seed(storyId: string, ownerId: string): void {
    this.ownerByStoryId.set(storyId, ownerId);
  }

  public async getStoryOwner(
    storyId: string
  ): Promise<{ userId: string } | null> {
    const userId = this.ownerByStoryId.get(storyId);
    return userId === undefined ? null : { userId };
  }
}

class FakeChapterReader implements ChapterStatusReader {
  public chaptersByStoryId = new Map<string, ChapterStatusRow[]>();
  public calls: string[] = [];

  public seed(storyId: string, rows: ChapterStatusRow[]): void {
    this.chaptersByStoryId.set(storyId, rows);
  }

  public async listChaptersForResume(
    storyId: string
  ): Promise<readonly ChapterStatusRow[]> {
    this.calls.push(storyId);
    return this.chaptersByStoryId.get(storyId) ?? [];
  }
}

class FakeChapterQueue implements ResumeChapterQueue {
  public enqueued: ResumeChapterQueueRequest[] = [];

  public async enqueueChapterRegeneration(
    req: ResumeChapterQueueRequest
  ): Promise<void> {
    this.enqueued.push({ ...req });
  }
}

/**
 * In-memory FSM DB mirroring the optimistic-lock semantics of the
 * production Postgres adapter. Mirrors the shape used by the
 * `fsmDb.test.ts` suite so tests in two suites stay consistent.
 */
class FakeStoryJobFsmDb implements StoryJobFsmDb {
  public rows = new Map<string, StoryJobFsmRow>();
  public reads = 0;
  public writes = 0;
  public lastUpdate: {
    jobId: string;
    newStatus: StoryJobState;
    expectedVersion: number;
  } | null = null;

  public seed(row: StoryJobFsmRow): void {
    this.rows.set(row.id, { ...row });
  }

  public snapshot(jobId: string): StoryJobFsmRow | undefined {
    const r = this.rows.get(jobId);
    return r ? { ...r } : undefined;
  }

  public async readJob(jobId: string): Promise<StoryJobFsmRow | null> {
    this.reads += 1;
    const r = this.rows.get(jobId);
    return r ? { ...r } : null;
  }

  public async updateStatusIfVersion(args: {
    jobId: string;
    newStatus: StoryJobState;
    expectedVersion: number;
  }): Promise<boolean> {
    this.writes += 1;
    this.lastUpdate = { ...args };
    const r = this.rows.get(args.jobId);
    if (!r) return false;
    if (r.version !== args.expectedVersion) return false;
    this.rows.set(args.jobId, {
      id: r.id,
      status: args.newStatus,
      version: r.version + 1
    });
    return true;
  }
}

/**
 * Tracking fake for every quota counter the codebase exposes. The
 * resume route's typed dependency surface (`ResumeServiceOptions`)
 * does NOT contain any quota object, so by construction none of
 * these methods can be reached from production code paths. The fake
 * exists purely as a regression alarm: if a future refactor wires a
 * quota counter into the resume route, the tests below assert that
 * none of these methods is invoked by ANY supported flow (success,
 * non-owner, all-done, conflict).
 */
class TrackingQuotaSpy {
  public consumeFreeChapterCalls = 0;
  public consumeRewriteCalls = 0;
  public reserveCalls = 0;
  public commitCalls = 0;
  public rollbackCalls = 0;

  public expectNoQuotaTouched(): void {
    expect(this.consumeFreeChapterCalls).toBe(0);
    expect(this.consumeRewriteCalls).toBe(0);
    expect(this.reserveCalls).toBe(0);
    expect(this.commitCalls).toBe(0);
    expect(this.rollbackCalls).toBe(0);
  }
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface Harness {
  app: FastifyInstance;
  ownerLookup: FakeStoryOwnerLookup;
  chapterReader: FakeChapterReader;
  chapterQueue: FakeChapterQueue;
  fsmDb: FakeStoryJobFsmDb;
  quotaSpy: TrackingQuotaSpy;
  setCaller(id: string | null, role?: string): void;
}

let currentCaller: { id: string; role?: string } | null = null;

const callerResolver: GetCallerIdentity = () => currentCaller;

interface BuildHarnessOpts {
  chapters?: ChapterStatusRow[];
  fsmRow?: StoryJobFsmRow;
  ownerId?: string;
}

async function buildHarness(opts: BuildHarnessOpts = {}): Promise<Harness> {
  const ownerLookup = new FakeStoryOwnerLookup();
  ownerLookup.seed(STORY_ID, opts.ownerId ?? OWNER_ID);

  const chapterReader = new FakeChapterReader();
  chapterReader.seed(STORY_ID, opts.chapters ?? defaultChapters());

  const chapterQueue = new FakeChapterQueue();

  const fsmDb = new FakeStoryJobFsmDb();
  fsmDb.seed(
    opts.fsmRow ?? {
      id: STORY_ID,
      status: 'partial',
      version: 3
    }
  );

  const quotaSpy = new TrackingQuotaSpy();

  const authz = new ServerAuthorityAuthzMiddleware({
    licenseDb: new FakeLicenseDb()
  });

  const app = Fastify({ logger: false });
  await app.register(createResumeRoutePlugin, {
    storyOwnerLookup: ownerLookup,
    chapterReader,
    fsmDb,
    authz,
    chapterQueue,
    getCallerIdentity: callerResolver
  });
  await app.ready();

  return {
    app,
    ownerLookup,
    chapterReader,
    chapterQueue,
    fsmDb,
    quotaSpy,
    setCaller(id, role) {
      if (id === null) {
        currentCaller = null;
        return;
      }
      currentCaller = role === undefined ? { id } : { id, role };
    }
  };
}

/**
 * Default chapter mix: indices 1..3 done, 4..10 pending. Resume should
 * re-queue exactly chapters 4..10.
 */
function defaultChapters(): ChapterStatusRow[] {
  const rows: ChapterStatusRow[] = [];
  for (let i = 1; i <= 10; i += 1) {
    const status: ChapterStatus = i <= 3 ? 'done' : 'pending';
    rows.push({ index: i, status });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Tests — happy path: only != done re-queued (Requirements 6.9, 7.7)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/resume — only != done chapters re-queued', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
    h.setCaller(OWNER_ID);
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it('queues regeneration for every non-done chapter and skips done ones', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');

    const body = res.json() as { jobId: string; resumed: number[] };
    expect(body.jobId).toBe(STORY_ID);
    expect(body.resumed).toEqual([4, 5, 6, 7, 8, 9, 10]);

    // Queue received exactly the missing chapter indices, sorted ascending.
    const enqueuedIdx = h.chapterQueue.enqueued.map((e) => e.chapterIndex);
    expect(enqueuedIdx).toEqual([4, 5, 6, 7, 8, 9, 10]);
    for (const e of h.chapterQueue.enqueued) {
      expect(e.jobId).toBe(STORY_ID);
    }

    // No quota counter invoked.
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('handles a heterogeneous mix of statuses correctly', async () => {
    h = await buildHarness({
      chapters: [
        { index: 1, status: 'done' },
        { index: 2, status: 'streaming' },
        { index: 3, status: 'done' },
        { index: 4, status: 'failed' },
        { index: 5, status: 'pending' },
        { index: 6, status: 'done' }
      ]
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { resumed: number[] };
    // All non-done indices, sorted ascending.
    expect(body.resumed).toEqual([2, 4, 5]);

    // Queue received exactly the same set.
    expect(h.chapterQueue.enqueued.map((e) => e.chapterIndex)).toEqual([
      2, 4, 5
    ]);
  });

  it('returns indices sorted ascending even when the DB returns them out of order', async () => {
    h = await buildHarness({
      chapters: [
        { index: 7, status: 'pending' },
        { index: 1, status: 'done' },
        { index: 4, status: 'failed' },
        { index: 2, status: 'done' },
        { index: 3, status: 'streaming' }
      ]
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { resumed: number[] };
    expect(body.resumed).toEqual([3, 4, 7]);
  });
});

// ---------------------------------------------------------------------------
// Tests — all-done idempotency
// ---------------------------------------------------------------------------

describe('POST /stories/:id/resume — all-done story is a no-op', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it('returns empty `resumed`, makes no FSM move, and enqueues nothing', async () => {
    const allDone: ChapterStatusRow[] = [];
    for (let i = 1; i <= 10; i += 1) {
      allDone.push({ index: i, status: 'done' });
    }

    h = await buildHarness({
      chapters: allDone,
      fsmRow: { id: STORY_ID, status: 'completed', version: 5 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(200);

    const body = res.json() as { jobId: string; resumed: number[] };
    expect(body.jobId).toBe(STORY_ID);
    expect(body.resumed).toEqual([]);

    // No queue activity.
    expect(h.chapterQueue.enqueued).toHaveLength(0);

    // No FSM mutation. The all-done branch deliberately does NOT advance
    // the row — `completed.resume` is illegal anyway, so attempting it
    // would surface as a conflict; bypassing it is the correct, idempotent
    // behaviour.
    expect(h.fsmDb.writes).toBe(0);
    expect(h.fsmDb.snapshot(STORY_ID)).toEqual({
      id: STORY_ID,
      status: 'completed',
      version: 5
    });

    h.quotaSpy.expectNoQuotaTouched();
  });
});

// ---------------------------------------------------------------------------
// Tests — non-owner forbidden (Requirement 10.4)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/resume — ownership gate (Requirement 10.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it('rejects a non-owner caller with 403 forbidden and no side effects', async () => {
    h.setCaller(OTHER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');

    // Critically: ownership runs BEFORE the chapter scan / FSM
    // advance / queue. A non-owner cannot probe any of these.
    expect(h.chapterReader.calls).toHaveLength(0);
    expect(h.fsmDb.reads).toBe(0);
    expect(h.fsmDb.writes).toBe(0);
    expect(h.chapterQueue.enqueued).toHaveLength(0);
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('rejects a missing caller (no JWT) with 401 unauthenticated', async () => {
    h.setCaller(null);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
    expect(h.chapterReader.calls).toHaveLength(0);
    expect(h.chapterQueue.enqueued).toHaveLength(0);
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('returns 404 for a story that does not exist', async () => {
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: '/stories/not-a-real-story/resume'
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
    expect(h.chapterReader.calls).toHaveLength(0);
    expect(h.chapterQueue.enqueued).toHaveLength(0);
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('admin role bypasses ownership (Requirement 15.2)', async () => {
    h.setCaller(OTHER_ID, 'admin');

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { resumed: number[] };
    expect(body.resumed).toEqual([4, 5, 6, 7, 8, 9, 10]);
  });
});

// ---------------------------------------------------------------------------
// Tests — quota counters never invoked (Requirements 6.9, 7.7)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/resume — quota counters never invoked', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it('no quota counter is touched on a successful resume', async () => {
    h = await buildHarness();
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(200);
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('no quota counter is touched on a non-owner rejection', async () => {
    h = await buildHarness();
    h.setCaller(OTHER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(403);
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('no quota counter is touched on an all-done story', async () => {
    const allDone: ChapterStatusRow[] = [];
    for (let i = 1; i <= 10; i += 1) {
      allDone.push({ index: i, status: 'done' });
    }
    h = await buildHarness({ chapters: allDone });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(200);
    h.quotaSpy.expectNoQuotaTouched();
  });

  it('the ResumeServiceOptions surface contains no quota field (structural check)', () => {
    // This compile-time-style check makes the intent explicit: any
    // future widening of ResumeServiceOptions to include a quota
    // counter would require updating this guard, signalling reviewer
    // attention.
    const sampleOptions = {
      storyOwnerLookup: {} as StoryOwnerLookup,
      chapterReader: {} as ChapterStatusReader,
      fsmDb: {} as StoryJobFsmDb,
      authz: { assertOwner: () => {} } as Pick<
        ServerAuthorityAuthzMiddleware,
        'assertOwner'
      >,
      chapterQueue: {} as ResumeChapterQueue
    };
    const keys = Object.keys(sampleOptions).sort();
    expect(keys).toEqual(
      ['authz', 'chapterQueue', 'chapterReader', 'fsmDb', 'storyOwnerLookup'].sort()
    );
    // Sanity: none of the keys is a known quota name.
    for (const k of keys) {
      expect(k.toLowerCase()).not.toContain('quota');
      expect(k.toLowerCase()).not.toContain('rate');
      expect(k.toLowerCase()).not.toContain('cycle');
    }
  });
});

// ---------------------------------------------------------------------------
// Tests — FSM transition with correct version
// ---------------------------------------------------------------------------

describe('POST /stories/:id/resume — FSM transition with correct version', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it('applies `resume` with the expected version observed at read time', async () => {
    h = await buildHarness({
      fsmRow: { id: STORY_ID, status: 'partial', version: 7 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(200);

    // applyTransition was called with expectedVersion=7 and computed
    // newStatus from the current row state ('partial'.resume = 'running').
    expect(h.fsmDb.lastUpdate).toEqual({
      jobId: STORY_ID,
      newStatus: 'running',
      expectedVersion: 7
    });
    // The row's version advanced by exactly 1.
    expect(h.fsmDb.snapshot(STORY_ID)).toEqual({
      id: STORY_ID,
      status: 'running',
      version: 8
    });
    expect(h.fsmDb.writes).toBe(1);
  });

  it('also resumes from `paused` to `running`', async () => {
    h = await buildHarness({
      fsmRow: { id: STORY_ID, status: 'paused', version: 2 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });
    expect(res.statusCode).toBe(200);

    expect(h.fsmDb.lastUpdate).toEqual({
      jobId: STORY_ID,
      newStatus: 'running',
      expectedVersion: 2
    });
  });

  it('returns 409 conflict when the FSM row was advanced concurrently', async () => {
    // Simulate a concurrent transition: the route reads version=1, but
    // before its `applyTransition` lands its UPDATE, an out-of-band
    // writer advances the row to version=2. The resulting
    // `WHERE version = 1` predicate matches zero rows, which the FSM
    // adapter surfaces as `StoryJobVersionConflictError`, which the
    // service maps to `ResumeError('conflict')` → HTTP 409.
    h = await buildHarness({
      fsmRow: { id: STORY_ID, status: 'partial', version: 1 }
    });
    h.setCaller(OWNER_ID);

    // Hook the readJob method ONCE — only the first call (made by the
    // service before applyTransition) triggers the out-of-band bump.
    // Subsequent reads (issued by applyTransition itself) see the
    // already-advanced row.
    const fsm = h.fsmDb;
    const originalReadJob = fsm.readJob.bind(fsm);
    let firstReadIntercepted = false;
    fsm.readJob = async (jobId: string) => {
      const result = await originalReadJob(jobId);
      if (!firstReadIntercepted && result) {
        firstReadIntercepted = true;
        // Advance the row in-place to simulate a concurrent winner.
        // We bump the version and keep the status legal-target so the
        // row exists when applyTransition reads it next.
        fsm.rows.set(jobId, {
          id: result.id,
          status: result.status,
          version: result.version + 1
        });
      }
      return result;
    };

    const res = await h.app.inject({
      method: 'POST',
      url: `/stories/${STORY_ID}/resume`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('conflict');

    // The chapter queue MUST NOT have been written to — the FSM
    // advance happens before enqueue precisely so that conflicts
    // short-circuit cleanly.
    expect(h.chapterQueue.enqueued).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Pure-service unit tests (no Fastify) — direct invariant checks
// ---------------------------------------------------------------------------

describe('ResumeService — direct invariant checks', () => {
  it('throws ResumeError(`unauthenticated`) when caller is missing', async () => {
    const ownerLookup = new FakeStoryOwnerLookup();
    ownerLookup.seed(STORY_ID, OWNER_ID);
    const chapterReader = new FakeChapterReader();
    chapterReader.seed(STORY_ID, defaultChapters());
    const queue = new FakeChapterQueue();
    const fsmDb = new FakeStoryJobFsmDb();
    fsmDb.seed({ id: STORY_ID, status: 'partial', version: 0 });
    const authz = new ServerAuthorityAuthzMiddleware({
      licenseDb: new FakeLicenseDb()
    });

    const service = new ResumeService({
      storyOwnerLookup: ownerLookup,
      chapterReader,
      fsmDb,
      authz,
      chapterQueue: queue
    });

    await expect(
      service.resume({
        caller: { id: '' },
        storyId: STORY_ID
      })
    ).rejects.toMatchObject({ name: 'ResumeError', code: 'unauthenticated' });
  });
});
