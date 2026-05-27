/**
 * Unit tests for the export route plugin (Task 14.3).
 *
 * Validates: Requirement 11.2 — every export download MUST come back
 * as a signed URL whose TTL is ≤ 60 minutes and whose object key is
 * scoped to the requesting user's `users/{userId}/exports/...`
 * prefix.
 *
 * Coverage:
 *   - Markdown success path returns `{ url, expiresAt }` with the
 *     requested 3600s TTL and an owner-scoped key.
 *   - PDF success path returns `{ url, expiresAt }` with the
 *     requested 3600s TTL and an owner-scoped key.
 *   - Non-owner → 403 `forbidden` (no bytes written).
 *   - Missing story → 404 `not_found`.
 *   - Defensive `IllegalSignTtlError` from `signGet` is surfaced as
 *     `internal_error` (a regression that bumps the constant past
 *     3600s never leaks a non-compliant URL).
 *   - Missing caller identity → 401 `unauthenticated`.
 *   - Admin role bypasses the ownership gate (key still owner-scoped
 *     to the admin caller, mirroring the documented contract).
 *
 * Tests run against an in-memory `FakeHistoryDb` and a fake
 * `ObjectStorageService` so the assertions stay focused on routing /
 * authz / TTL behaviour rather than S3 plumbing. The production
 * `S3StorageAdapter` is exercised by `test/storage/s3.test.ts`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

import createExportRoutePlugin, {
  EXPORT_SIGNED_URL_TTL_SECONDS,
  defaultCallerResolver,
  type CallerIdentity,
  type GetCallerIdentity
} from '../../src/export/route.js';
import {
  IllegalSignTtlError,
  type ExportKind,
  type ObjectStorageService,
  type SignGetInput,
  type PutExportInput,
  type SignedUrl
} from '../../src/storage/index.js';
import type {
  HistoryDb,
  HistoryStoryDetail
} from '../../src/stories/historyDb.js';
import type {
  MarkdownExportInput,
  MarkdownZipExporter
} from '../../src/export/markdownZip.js';
import type {
  PdfExportInput,
  PdfExporter
} from '../../src/export/pdf.js';
import type {
  EpubExportInput,
  EpubExporter
} from '../../src/export/epub.js';
import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

interface SeedRow {
  id: string;
  userId: string;
  title: string | null;
  overview: string | null;
  chapters: HistoryStoryDetail['chapters'];
}

class FakeHistoryDb implements Pick<HistoryDb, 'getStoryDetail'> {
  private readonly rows = new Map<string, SeedRow>();

  public seed(row: SeedRow): void {
    this.rows.set(row.id, row);
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
      plan: null,
      chapters: r.chapters,
      status: 'completed',
      createdAt: '2025-01-01T00:00:00.000Z'
    };
  }
}

interface PutExportRecord {
  userId: string;
  storyId: string;
  kind: ExportKind;
  byteLength: number;
  contentType?: string;
  key: string;
}

interface SignGetRecord {
  key: string;
  ttlSeconds: number;
  requesterUserId: string;
}

/**
 * Mirrors `ObjectStorageService.putExport` / `signGet` behaviour:
 *
 *   - keys are owner-scoped via the documented
 *     `users/{userId}/exports/{storyId}.{ext}` layout,
 *   - `signGet` enforces the same TTL ceiling (3600s) the production
 *     class enforces.
 *
 * The fake records every call so tests can assert on the exact key,
 * TTL, and requester id used.
 */
class FakeObjectStorage implements
  Pick<ObjectStorageService, 'putExport' | 'signGet'> {
  public readonly putCalls: PutExportRecord[] = [];
  public readonly signCalls: SignGetRecord[] = [];
  /**
   * Override the TTL accepted by `signGet`. When set to a value < the
   * production ceiling (3600s), exceeding it raises
   * `IllegalSignTtlError` to simulate the defensive guard.
   */
  public maxTtlSeconds: number = 3600;
  public now: Date = new Date('2025-04-01T12:00:00.000Z');

  public async putExport(
    input: PutExportInput
  ): Promise<{ key: string }> {
    const ext =
      input.kind === 'markdown_zip'
        ? 'zip'
        : input.kind === 'epub'
          ? 'epub'
          : 'pdf';
    const key = `users/${input.userId}/exports/${input.storyId}.${ext}`;
    const body =
      typeof input.body === 'string'
        ? Buffer.byteLength(input.body)
        : input.body.byteLength;
    const record: PutExportRecord = {
      userId: input.userId,
      storyId: input.storyId,
      kind: input.kind,
      byteLength: body,
      key
    };
    if (input.contentType !== undefined) {
      record.contentType = input.contentType;
    }
    this.putCalls.push(record);
    return { key };
  }

  public async signGet(input: SignGetInput): Promise<SignedUrl> {
    this.signCalls.push({
      key: input.key,
      ttlSeconds: input.ttlSeconds,
      requesterUserId: input.requesterUserId
    });
    if (
      !Number.isFinite(input.ttlSeconds) ||
      input.ttlSeconds <= 0 ||
      input.ttlSeconds > this.maxTtlSeconds
    ) {
      throw new IllegalSignTtlError(input.ttlSeconds);
    }
    const expiresAt = new Date(
      this.now.getTime() + input.ttlSeconds * 1000
    );
    return {
      url: `https://storage.example/${input.key}?ttl=${input.ttlSeconds}`,
      expiresAt
    };
  }
}

class FakeMarkdownExporter implements
  Pick<MarkdownZipExporter, 'exportStory'> {
  public readonly calls: MarkdownExportInput[] = [];
  public bytes: Uint8Array = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04
  public throwOnNextCall: Error | undefined;

  public async exportStory(input: MarkdownExportInput): Promise<Uint8Array> {
    this.calls.push(input);
    if (this.throwOnNextCall) {
      const err = this.throwOnNextCall;
      this.throwOnNextCall = undefined;
      throw err;
    }
    return this.bytes;
  }
}

class FakePdfExporter implements Pick<PdfExporter, 'exportStory'> {
  public readonly calls: PdfExportInput[] = [];
  public bytes: Uint8Array = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

  public async exportStory(input: PdfExportInput): Promise<Uint8Array> {
    this.calls.push(input);
    return this.bytes;
  }
}

class FakeEpubExporter implements Pick<EpubExporter, 'exportStory'> {
  public readonly calls: EpubExportInput[] = [];
  public bytes: Uint8Array = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04 (ZIP magic)
  public throwOnNextCall: Error | undefined;

  public async exportStory(input: EpubExportInput): Promise<Uint8Array> {
    this.calls.push(input);
    if (this.throwOnNextCall) {
      const err = this.throwOnNextCall;
      this.throwOnNextCall = undefined;
      throw err;
    }
    return this.bytes;
  }
}

// ---------------------------------------------------------------------------
// Test harness helpers
// ---------------------------------------------------------------------------

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_A_EMAIL = 'alice@example.com';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_B_EMAIL = 'bob@example.com';

const STORY_A1 = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const STORY_MISSING = 'cccc9999-cccc-4ccc-8ccc-cccccccccccc';

function chapter(
  index: number,
  content: string
): HistoryStoryDetail['chapters'][number] {
  return {
    storyId: STORY_A1,
    index,
    status: 'done',
    content,
    updatedAt: '2025-03-31T23:59:59.000Z'
  };
}

function seedStory(
  history: FakeHistoryDb,
  ownerId: string,
  storyId: string = STORY_A1
): void {
  history.seed({
    id: storyId,
    userId: ownerId,
    title: 'The Heir',
    overview: 'A reclusive billionaire ...',
    chapters: [
      chapter(1, 'Body of chapter 1.'),
      chapter(2, 'Body of chapter 2.')
    ]
  });
}

interface BuildAppOptions {
  history: FakeHistoryDb;
  storage: FakeObjectStorage;
  markdownExporter?: FakeMarkdownExporter;
  pdfExporter?: FakePdfExporter;
  epubExporter?: FakeEpubExporter;
  getCallerIdentity: GetCallerIdentity;
}

async function buildApp(opts: BuildAppOptions): Promise<{
  app: FastifyInstance;
  markdownExporter: FakeMarkdownExporter;
  pdfExporter: FakePdfExporter;
  epubExporter: FakeEpubExporter;
}> {
  const authz = new ServerAuthorityAuthzMiddleware({
    licenseDb: new FakeLicenseDb()
  });
  const markdownExporter = opts.markdownExporter ?? new FakeMarkdownExporter();
  const pdfExporter = opts.pdfExporter ?? new FakePdfExporter();
  const epubExporter = opts.epubExporter ?? new FakeEpubExporter();
  const app = Fastify({ logger: false });
  await app.register(createExportRoutePlugin, {
    historyDb: opts.history,
    authz,
    objectStorage: opts.storage,
    markdownExporter,
    pdfExporter,
    epubExporter,
    getCallerIdentity: opts.getCallerIdentity
  });
  await app.ready();
  return { app, markdownExporter, pdfExporter, epubExporter };
}

function callerForUser(
  userId: string,
  email: string,
  role?: string
): GetCallerIdentity {
  return () => {
    const out: CallerIdentity = { id: userId, email };
    if (role !== undefined) out.role = role;
    return out;
  };
}

const noCaller: GetCallerIdentity = () => null;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /stories/:id/export/markdown — owner success path', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns { url, expiresAt } with the requested 3600s TTL and owner-scoped key', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/markdown`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; expiresAt: string };
    expect(body.url).toMatch(/^https:\/\/storage\.example\//);
    // `expiresAt` is ISO-8601 UTC and lands ≈ 3600s ahead of the
    // injected clock — this is the wire-level equivalent of asserting
    // TTL ≤ 3600s (Requirement 11.2).
    const expiresAt = new Date(body.expiresAt).getTime();
    const now = storage.now.getTime();
    expect(expiresAt - now).toBe(EXPORT_SIGNED_URL_TTL_SECONDS * 1000);

    // Owner-scoped key (Requirement 11.2 / 15.2): MUST start with
    // `users/{userId}/exports/`.
    expect(storage.putCalls).toHaveLength(1);
    const put = storage.putCalls[0]!;
    expect(put.userId).toBe(USER_A);
    expect(put.kind).toBe('markdown_zip');
    expect(put.key).toBe(`users/${USER_A}/exports/${STORY_A1}.zip`);
    expect(put.key.startsWith(`users/${USER_A}/exports/`)).toBe(true);
    expect(put.byteLength).toBeGreaterThan(0);

    // The TTL we sent to `signGet` matches the constant — defends
    // against a regression that secretly bumps the value.
    expect(storage.signCalls).toHaveLength(1);
    const sign = storage.signCalls[0]!;
    expect(sign.key).toBe(put.key);
    expect(sign.ttlSeconds).toBe(EXPORT_SIGNED_URL_TTL_SECONDS);
    expect(sign.ttlSeconds).toBeLessThanOrEqual(3600);
    expect(sign.requesterUserId).toBe(USER_A);

    // Cache-Control: no-store — exports embed PII watermarks; an
    // intermediary cache would defeat the 60-minute TTL.
    expect(res.headers['cache-control']).toBe('no-store');

    // Exporter received the verified email (never from the body) and
    // the persisted chapter content.
    expect(built.markdownExporter.calls).toHaveLength(1);
    const exporterInput = built.markdownExporter.calls[0]!;
    expect(exporterInput.account.email).toBe(USER_A_EMAIL);
    expect(exporterInput.story.id).toBe(STORY_A1);
    expect(exporterInput.story.chapters.map((c) => c.index)).toEqual([1, 2]);
  });
});

describe('POST /stories/:id/export/pdf — owner success path', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns { url, expiresAt } with the requested 3600s TTL and owner-scoped key', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/pdf`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; expiresAt: string };
    expect(body.url).toMatch(/^https:\/\/storage\.example\//);
    const expiresAt = new Date(body.expiresAt).getTime();
    const now = storage.now.getTime();
    expect(expiresAt - now).toBe(EXPORT_SIGNED_URL_TTL_SECONDS * 1000);

    // Owner-scoped key now ends in `.pdf`.
    expect(storage.putCalls).toHaveLength(1);
    const put = storage.putCalls[0]!;
    expect(put.userId).toBe(USER_A);
    expect(put.kind).toBe('pdf');
    expect(put.key).toBe(`users/${USER_A}/exports/${STORY_A1}.pdf`);
    expect(put.key.startsWith(`users/${USER_A}/exports/`)).toBe(true);

    // The TTL we send to `signGet` is the same canonical 3600s used
    // by the markdown path — both formats share the helper.
    expect(storage.signCalls).toHaveLength(1);
    expect(storage.signCalls[0]!.ttlSeconds).toBe(EXPORT_SIGNED_URL_TTL_SECONDS);
    expect(storage.signCalls[0]!.ttlSeconds).toBeLessThanOrEqual(3600);
    expect(storage.signCalls[0]!.requesterUserId).toBe(USER_A);

    expect(built.pdfExporter.calls).toHaveLength(1);
    expect(built.pdfExporter.calls[0]!.account.email).toBe(USER_A_EMAIL);
    expect(built.pdfExporter.calls[0]!.story.id).toBe(STORY_A1);
  });
});

describe('export route — authorisation', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('rejects a non-owner with 403 forbidden and writes nothing', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    // User B authenticates and tries to export User A's story.
    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_B, USER_B_EMAIL)
    });
    app = built.app;

    const md = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/markdown`
    });
    expect(md.statusCode).toBe(403);
    expect(md.json()).toEqual({
      error: { code: 'forbidden', message: expect.any(String) }
    });

    const pdf = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/pdf`
    });
    expect(pdf.statusCode).toBe(403);
    expect(pdf.json()).toEqual({
      error: { code: 'forbidden', message: expect.any(String) }
    });

    // No bytes ever hit storage and no signed URL was issued.
    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
    expect(built.markdownExporter.calls).toEqual([]);
    expect(built.pdfExporter.calls).toEqual([]);
  });

  it('returns 404 not_found when the story does not exist', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    // history is empty — STORY_MISSING is genuinely absent.

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const md = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_MISSING}/export/markdown`
    });
    expect(md.statusCode).toBe(404);
    expect(md.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) }
    });

    const pdf = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_MISSING}/export/pdf`
    });
    expect(pdf.statusCode).toBe(404);
    expect(pdf.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) }
    });

    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
  });

  it('returns 401 unauthenticated when no caller identity is attached', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: noCaller
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/markdown`
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: expect.any(String) }
    });
    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
  });

  it('admin role bypasses ownership; key is owner-scoped to the admin caller', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    // Admin USER_B exports USER_A's story.
    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_B, USER_B_EMAIL, 'admin')
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/markdown`
    });

    expect(res.statusCode).toBe(200);
    expect(storage.putCalls).toHaveLength(1);
    // Per the route's documented contract, the admin's export lives
    // under THEIR own owner prefix — so audit and lifecycle attach to
    // the admin, not the data subject.
    expect(storage.putCalls[0]!.userId).toBe(USER_B);
    expect(storage.putCalls[0]!.key.startsWith(`users/${USER_B}/exports/`)).toBe(true);
    // The signed URL is issued to the admin too.
    expect(storage.signCalls[0]!.requesterUserId).toBe(USER_B);
  });
});

describe('export route — defensive TTL guard (Requirement 11.2)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('surfaces IllegalSignTtlError as 500 internal_error and never leaks the URL', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    // Simulate a regression: the `signGet` cap is below the route's
    // requested TTL. The fake throws `IllegalSignTtlError` exactly
    // like the production class. The route must convert that into a
    // 500 instead of letting the URL through.
    storage.maxTtlSeconds = 60; // < 3600 → request will be rejected
    expect(EXPORT_SIGNED_URL_TTL_SECONDS).toBeGreaterThan(60);

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/markdown`
    });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      error: { code: 'internal_error', message: expect.any(String) }
    });
    // `putExport` ran (we assemble the key BEFORE signing) but no
    // signed URL is in the response body.
    expect(storage.signCalls).toHaveLength(1);
    expect(res.body).not.toContain('https://');
  });
});

describe('export route — owner-scoped path invariant (Requirement 11.2)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it.each([
    { route: 'markdown', kind: 'markdown_zip' as const, ext: 'zip' },
    { route: 'pdf', kind: 'pdf' as const, ext: 'pdf' }
  ])(
    'export key for $route starts with users/{userId}/exports/ and ends with .$ext',
    async ({ route, kind, ext }) => {
      const history = new FakeHistoryDb();
      const storage = new FakeObjectStorage();
      seedStory(history, USER_A);

      const built = await buildApp({
        history,
        storage,
        getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
      });
      app = built.app;

      const res = await app.inject({
        method: 'POST',
        url: `/stories/${STORY_A1}/export/${route}`
      });
      expect(res.statusCode).toBe(200);

      expect(storage.putCalls).toHaveLength(1);
      const key = storage.putCalls[0]!.key;
      expect(key.startsWith(`users/${USER_A}/exports/`)).toBe(true);
      expect(key.endsWith(`.${ext}`)).toBe(true);
      expect(storage.putCalls[0]!.kind).toBe(kind);

      // Belt-and-braces: the `signGet` request also names the
      // owner-scoped key.
      expect(storage.signCalls[0]!.key).toBe(key);
      expect(storage.signCalls[0]!.requesterUserId).toBe(USER_A);
    }
  );
});

// ---------------------------------------------------------------------------
// EPUB route tests (Task 4.6)
// ---------------------------------------------------------------------------

describe('POST /stories/:id/export/epub — auth checks', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 401 unauthenticated when caller is missing', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: noCaller
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/epub`
    });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: expect.any(String) }
    });
    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
  });

  it('returns 403 forbidden when caller does not own the story', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    // User B tries to export User A's story.
    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_B, USER_B_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/epub`
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({
      error: { code: 'forbidden', message: expect.any(String) }
    });
    // No bytes written, no signed URL issued.
    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
    expect(built.epubExporter.calls).toEqual([]);
  });
});

describe('POST /stories/:id/export/epub — not found', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 404 not_found when story does not exist', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    // history is empty — STORY_MISSING is genuinely absent.

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_MISSING}/export/epub`
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: { code: 'not_found', message: expect.any(String) }
    });
    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
  });
});

describe('POST /stories/:id/export/epub — empty story (invalid_request)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 400 invalid_request when EpubExporter throws for empty content', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    const epubExporter = new FakeEpubExporter();
    // Simulate the EpubExporter throwing for empty/no exportable content.
    epubExporter.throwOnNextCall = new Error(
      'no exportable content: all chapters are empty'
    );

    const built = await buildApp({
      history,
      storage,
      epubExporter,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/epub`
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: { code: 'invalid_request', message: expect.any(String) }
    });
    // The exporter was called (ownership passed) but no bytes persisted.
    expect(epubExporter.calls).toHaveLength(1);
    expect(storage.putCalls).toEqual([]);
    expect(storage.signCalls).toEqual([]);
  });
});

describe('POST /stories/:id/export/epub — owner success path', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 200 with { url, expiresAt } for a valid EPUB export', async () => {
    const history = new FakeHistoryDb();
    const storage = new FakeObjectStorage();
    seedStory(history, USER_A);

    const built = await buildApp({
      history,
      storage,
      getCallerIdentity: callerForUser(USER_A, USER_A_EMAIL)
    });
    app = built.app;

    const res = await app.inject({
      method: 'POST',
      url: `/stories/${STORY_A1}/export/epub`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { url: string; expiresAt: string };

    // url is a non-empty string
    expect(body.url).toMatch(/^https:\/\/storage\.example\//);
    expect(body.url.length).toBeGreaterThan(0);

    // expiresAt is a valid ISO timestamp ≈ 3600s ahead of now
    const expiresAt = new Date(body.expiresAt);
    expect(expiresAt.toISOString()).toBe(body.expiresAt);
    const now = storage.now.getTime();
    expect(expiresAt.getTime() - now).toBe(EXPORT_SIGNED_URL_TTL_SECONDS * 1000);

    // Owner-scoped key ends in `.epub`
    expect(storage.putCalls).toHaveLength(1);
    const put = storage.putCalls[0]!;
    expect(put.userId).toBe(USER_A);
    expect(put.kind).toBe('epub');
    expect(put.key).toBe(`users/${USER_A}/exports/${STORY_A1}.epub`);
    expect(put.key.startsWith(`users/${USER_A}/exports/`)).toBe(true);
    expect(put.byteLength).toBeGreaterThan(0);

    // signGet received the correct TTL and requester
    expect(storage.signCalls).toHaveLength(1);
    const sign = storage.signCalls[0]!;
    expect(sign.key).toBe(put.key);
    expect(sign.ttlSeconds).toBe(EXPORT_SIGNED_URL_TTL_SECONDS);
    expect(sign.ttlSeconds).toBeLessThanOrEqual(3600);
    expect(sign.requesterUserId).toBe(USER_A);

    // Cache-Control: no-store
    expect(res.headers['cache-control']).toBe('no-store');

    // Exporter received the verified email and story content
    expect(built.epubExporter.calls).toHaveLength(1);
    const exporterInput = built.epubExporter.calls[0]!;
    expect(exporterInput.account.email).toBe(USER_A_EMAIL);
    expect(exporterInput.story.id).toBe(STORY_A1);
    expect(exporterInput.story.chapters.map((c) => c.index)).toEqual([1, 2]);
    expect(exporterInput.story.language).toBe('vi');
  });
});

describe('defaultCallerResolver', () => {
  it('reads sub + email off req.auth (the canonical JWT-claim shape)', () => {
    const fakeReq = {
      auth: {
        sub: USER_A,
        email: USER_A_EMAIL,
        role: undefined
      }
    } as unknown as Parameters<typeof defaultCallerResolver>[0];

    const caller = defaultCallerResolver(fakeReq);
    expect(caller).toEqual({ id: USER_A, email: USER_A_EMAIL });
  });

  it('returns null when email is missing from req.auth', () => {
    // We cannot watermark an export without an email; the resolver
    // refuses partial identities so the route layer maps to 401.
    const fakeReq = {
      auth: { sub: USER_A }
    } as unknown as Parameters<typeof defaultCallerResolver>[0];

    expect(defaultCallerResolver(fakeReq)).toBeNull();
  });
});
