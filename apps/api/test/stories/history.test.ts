/**
 * Unit tests for the story history routes (Task 10.8).
 *
 * Coverage:
 *   - empty list (Requirement 10.1)
 *   - ordering by `created_at DESC` with multiple rows (Requirement 10.1)
 *   - ownership scope: caller only sees own rows (Requirement 10.4)
 *   - forbidden detail access for non-owner (Requirements 10.4, 15.2)
 *
 * Tests run against an in-memory `FakeHistoryDb` to keep the surface
 * focused on routing + authz behaviour rather than SQL plumbing. The
 * production `PgHistoryDb` is exercised by integration tests (Task 19.2)
 * once the DB harness is stood up.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

import type {
  HistoryDb,
  HistoryListItem,
  HistoryStoryDetail
} from '../../src/stories/historyDb.js';
import historyRoutes, {
  type GetCallerUserId
} from '../../src/stories/history.js';
import {
  ServerAuthorityAuthzMiddleware
} from '../../src/gateway/authz.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// In-memory `HistoryDb`
// ---------------------------------------------------------------------------

interface SeedRow {
  id: string;
  userId: string;
  title: string | null;
  overview: string | null;
  plan: unknown;
  status: HistoryStoryDetail['status'];
  createdAt: string;
  chapters: HistoryStoryDetail['chapters'];
}

class FakeHistoryDb implements HistoryDb {
  private readonly rows = new Map<string, SeedRow>();

  public seed(row: SeedRow): void {
    this.rows.set(row.id, row);
  }

  public async listStoriesByUser(userId: string): Promise<HistoryListItem[]> {
    const owned = [...this.rows.values()].filter((r) => r.userId === userId);
    // Production SQL applies `ORDER BY created_at DESC`; mirror the
    // contract here so the route's expected output is well-defined.
    owned.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return owned.map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt
    }));
  }

  public async getStoryDetail(
    storyId: string
  ): Promise<HistoryStoryDetail | null> {
    const r = this.rows.get(storyId);
    if (!r) return null;
    return {
      id: r.id,
      userId: r.userId,
      title: r.title,
      overview: r.overview,
      plan: r.plan,
      chapters: r.chapters,
      status: r.status,
      createdAt: r.createdAt
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const STORY_A1 = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const STORY_A2 = 'aaaa2222-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const STORY_A3 = 'aaaa3333-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const STORY_B1 = 'bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbb1';

interface BuildAppOptions {
  historyDb: HistoryDb;
  authz?: ServerAuthorityAuthzMiddleware;
  /** Override the caller resolver per test. */
  getCallerUserId: GetCallerUserId;
}

async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  // We do not exercise the plan-state path in these tests (the route
  // only needs `assertOwner`), but `ServerAuthorityAuthzMiddleware`
  // requires a `licenseDb` in its constructor — wire a fake.
  const authz =
    opts.authz ??
    new ServerAuthorityAuthzMiddleware({ licenseDb: new FakeLicenseDb() });

  const app = Fastify({ logger: false });
  await app.register(historyRoutes, {
    historyDb: opts.historyDb,
    authz,
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

describe('GET /stories — history list', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns an empty list when the caller owns no stories', async () => {
    const db = new FakeHistoryDb();
    // Seed a row for a different user to confirm scope isolation.
    db.seed({
      id: STORY_B1,
      userId: USER_B,
      title: 'B-1',
      overview: null,
      plan: null,
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
      chapters: []
    });

    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({ method: 'GET', url: '/stories' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ stories: [] });
  });

  it('orders multiple owned rows by createdAt DESC', async () => {
    const db = new FakeHistoryDb();
    db.seed({
      id: STORY_A1,
      userId: USER_A,
      title: 'oldest',
      overview: null,
      plan: null,
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
      chapters: []
    });
    db.seed({
      id: STORY_A2,
      userId: USER_A,
      title: 'middle',
      overview: null,
      plan: null,
      status: 'running',
      createdAt: '2025-02-15T12:34:56.000Z',
      chapters: []
    });
    db.seed({
      id: STORY_A3,
      userId: USER_A,
      title: 'newest',
      overview: null,
      plan: null,
      status: 'partial',
      createdAt: '2025-03-31T23:59:59.000Z',
      chapters: []
    });

    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({ method: 'GET', url: '/stories' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stories: HistoryListItem[] };
    expect(body.stories.map((s) => s.id)).toEqual([
      STORY_A3,
      STORY_A2,
      STORY_A1
    ]);
    // Spot-check the wire shape of a single item.
    expect(body.stories[0]).toEqual({
      id: STORY_A3,
      title: 'newest',
      status: 'partial',
      createdAt: '2025-03-31T23:59:59.000Z'
    });
  });

  it('returns ONLY rows owned by the calling user (Requirement 10.4)', async () => {
    const db = new FakeHistoryDb();
    db.seed({
      id: STORY_A1,
      userId: USER_A,
      title: 'A-1',
      overview: null,
      plan: null,
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
      chapters: []
    });
    db.seed({
      id: STORY_A2,
      userId: USER_A,
      title: 'A-2',
      overview: null,
      plan: null,
      status: 'completed',
      createdAt: '2025-01-02T00:00:00.000Z',
      chapters: []
    });
    db.seed({
      id: STORY_B1,
      userId: USER_B,
      title: 'B-1',
      overview: null,
      plan: null,
      status: 'completed',
      createdAt: '2025-01-03T00:00:00.000Z',
      chapters: []
    });

    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({ method: 'GET', url: '/stories' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stories: HistoryListItem[] };
    const ids = body.stories.map((s) => s.id).sort();
    expect(ids).toEqual([STORY_A1, STORY_A2].sort());
    // No row from USER_B should leak through.
    expect(body.stories.find((s) => s.id === STORY_B1)).toBeUndefined();
  });

  it('rejects the request with 401 when no caller identity is attached', async () => {
    const db = new FakeHistoryDb();
    app = await buildApp({ historyDb: db, getCallerUserId: noCaller });

    const res = await app.inject({ method: 'GET', url: '/stories' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'unauthenticated' }
    });
  });
});

describe('GET /stories/:id — owner-scoped detail', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  function seedDetail(db: FakeHistoryDb, ownerId: string): SeedRow {
    const row: SeedRow = {
      id: STORY_A1,
      userId: ownerId,
      title: 'The Heir',
      overview: 'A reclusive billionaire ...',
      plan: { acts: ['setup', 'rise', 'twist'] },
      status: 'completed',
      createdAt: '2025-03-01T10:00:00.000Z',
      chapters: [
        {
          storyId: STORY_A1,
          index: 1,
          status: 'done',
          updatedAt: '2025-03-01T10:05:00.000Z',
          content: 's3://bucket/users/x/c1.txt'
        },
        {
          storyId: STORY_A1,
          index: 2,
          status: 'done',
          updatedAt: '2025-03-01T10:10:00.000Z'
        }
      ]
    };
    db.seed(row);
    return row;
  }

  it('returns the full payload to the resource owner', async () => {
    const db = new FakeHistoryDb();
    const seeded = seedDetail(db, USER_A);

    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_A1}`
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      title: string | null;
      overview: string | null;
      plan: unknown;
      chapters: HistoryStoryDetail['chapters'];
    };
    expect(body.id).toBe(seeded.id);
    expect(body.title).toBe(seeded.title);
    expect(body.overview).toBe(seeded.overview);
    expect(body.plan).toEqual(seeded.plan);
    expect(body.chapters).toEqual(seeded.chapters);
    // Ownership is authoritative on the server only — the wire payload
    // should NOT echo the user_id.
    expect((body as Record<string, unknown>).userId).toBeUndefined();
  });

  it('rejects detail access for a non-owner with `forbidden` (Requirement 10.4)', async () => {
    const db = new FakeHistoryDb();
    seedDetail(db, USER_A);

    // User B authenticates and tries to read User A's story.
    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_B)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_A1}`
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: {
        code: 'forbidden',
        message: expect.any(String)
      }
    });
  });

  it('returns 404 when the story does not exist', async () => {
    const db = new FakeHistoryDb();
    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_A)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_A1}`
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) }
    });
  });

  it('rejects the request with 401 when no caller identity is attached', async () => {
    const db = new FakeHistoryDb();
    seedDetail(db, USER_A);

    app = await buildApp({ historyDb: db, getCallerUserId: noCaller });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_A1}`
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'unauthenticated' }
    });
  });

  it('admin role bypasses ownership (Requirement 15.2)', async () => {
    const db = new FakeHistoryDb();
    seedDetail(db, USER_A);

    // Admin user (different from the resource owner) reads the row.
    app = await buildApp({
      historyDb: db,
      getCallerUserId: callerForUser(USER_B, 'admin')
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_A1}`
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('history routes — defaultCallerResolver', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('reads the verified `sub` claim off `req.auth` injected by the JWT middleware', async () => {
    const db = new FakeHistoryDb();
    db.seed({
      id: STORY_A1,
      userId: USER_A,
      title: 'A-1',
      overview: null,
      plan: null,
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z',
      chapters: []
    });

    // Use the real default resolver and forge `req.auth` via an
    // onRequest hook so we exercise the full path that production
    // wiring will follow.
    const authz = new ServerAuthorityAuthzMiddleware({
      licenseDb: new FakeLicenseDb()
    });
    app = Fastify({ logger: false });
    app.addHook('onRequest', async (request) => {
      // Mimic the JWT middleware attaching trusted claims.
      (request as unknown as { auth: { sub: string } }).auth = {
        sub: USER_A
      };
    });
    await app.register(historyRoutes, { historyDb: db, authz });
    await app.ready();

    const res = await app.inject({ method: 'GET', url: '/stories' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { stories: HistoryListItem[] };
    expect(body.stories.map((s) => s.id)).toEqual([STORY_A1]);
  });
});
