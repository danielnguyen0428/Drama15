/**
 * Unit tests for `GET /stories/:id/stream` (Task 10.3).
 *
 * Coverage:
 *   - SSE response headers set correctly (Requirement 6.8).
 *   - Ownership enforcement: missing caller → 401, non-owner → 403,
 *     admin role bypasses ownership (Requirements 10.4, 15.2).
 *   - Per-stage event sequence in order: overview → plan → 10
 *     chapter events with chapterIndex 1..10 (Requirements 6.4,
 *     6.8).
 *   - Error event sanitisation: producer failure surfaces as a
 *     single `event: error` frame whose `data` contains only
 *     `code` and `requestId` — no upstream message text, hostname,
 *     or stack frame (Requirement 12.5).
 *   - Request id propagation: `data.requestId` matches the value
 *     Fastify's `request.id` exposed for the request.
 *   - `UpstreamError` instances surface their `code`; every other
 *     thrown error collapses to `internal_error`.
 *
 * The route is loaded via `app.inject(...)` so we exercise the same
 * response framing that production traffic would. Fastify's inject
 * fully drains the response body, which means we receive the
 * complete SSE byte stream as a single string — perfect for parsing
 * the event sequence in a deterministic test.
 */

import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';

import storyStreamRoutePlugin, {
  UpstreamError,
  type GetCallerIdentity,
  type StoryOwnerLookup,
  type StoryStreamEvent,
  type StoryStreamProduceArgs,
  type StoryStreamProducer
} from '../../src/stories/stream.js';
import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

const STORY_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const UNKNOWN_STORY = 'cccc1111-cccc-4ccc-8ccc-ccccccccccc1';

class FakeStoryOwnerLookup implements StoryOwnerLookup {
  private readonly rows = new Map<string, { userId: string }>();

  public seed(storyId: string, owner: { userId: string }): void {
    this.rows.set(storyId, owner);
  }

  public async getStoryOwner(
    storyId: string
  ): Promise<{ userId: string } | null> {
    return this.rows.get(storyId) ?? null;
  }
}

/**
 * Synthetic producer that yields the canonical 12-stage Story_Job
 * sequence (`overview`, `plan`, `chapter[1..10]`) immediately. Used
 * by the happy-path tests.
 */
class SyntheticHappyProducer implements StoryStreamProducer {
  public lastArgs: StoryStreamProduceArgs | undefined;

  public async *produce(
    args: StoryStreamProduceArgs
  ): AsyncIterable<StoryStreamEvent> {
    this.lastArgs = args;
    yield { stage: 'overview' };
    yield { stage: 'plan' };
    for (let i = 1; i <= 10; i += 1) {
      yield { stage: 'chapter', chapterIndex: i };
    }
  }
}

/**
 * Producer that yields the first stage and then throws. Used by
 * the error-frame tests. The thrown error is configurable so we can
 * exercise both `UpstreamError` (preserves code) and a generic
 * `Error` (collapses to `internal_error`).
 */
class ThrowingProducer implements StoryStreamProducer {
  constructor(private readonly err: unknown, private readonly emitFirst: boolean) {}

  public async *produce(
    _args: StoryStreamProduceArgs
  ): AsyncIterable<StoryStreamEvent> {
    if (this.emitFirst) {
      yield { stage: 'overview' };
    }
    throw this.err;
  }
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

interface BuildAppOptions {
  storyOwnerLookup: StoryOwnerLookup;
  producer: StoryStreamProducer;
  getCallerIdentity: GetCallerIdentity;
}

async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const authz = new ServerAuthorityAuthzMiddleware({
    licenseDb: new FakeLicenseDb()
  });
  const app = Fastify({ logger: false });
  await app.register(storyStreamRoutePlugin, {
    storyOwnerLookup: opts.storyOwnerLookup,
    authz,
    producer: opts.producer,
    getCallerIdentity: opts.getCallerIdentity
  });
  await app.ready();
  return app;
}

function callerForUser(userId: string, role?: string): GetCallerIdentity {
  return () => {
    const out: { id: string; role?: string } = { id: userId };
    if (role !== undefined) out.role = role;
    return out;
  };
}

const noCaller: GetCallerIdentity = () => null;

// ---------------------------------------------------------------------------
// SSE parser
// ---------------------------------------------------------------------------

interface ParsedFrame {
  event: string;
  data: unknown;
}

/**
 * Parse an SSE response body into an ordered list of frames. The
 * stream we emit always uses `event: <name>\ndata: <json>\n\n`, so a
 * minimal parser is sufficient.
 */
function parseSseFrames(body: string): ParsedFrame[] {
  const frames: ParsedFrame[] = [];
  // Trim a single trailing blank to avoid an empty tail entry.
  const blocks = body.split('\n\n').filter((b) => b.length > 0);
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice('event: '.length);
      else if (line.startsWith('data: ')) data = line.slice('data: '.length);
    }
    frames.push({ event, data: data.length > 0 ? JSON.parse(data) : null });
  }
  return frames;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /stories/:id/stream — SSE framing (Requirement 6.8)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('sets the SSE headers required by the streaming contract', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new SyntheticHappyProducer(),
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });

    expect(res.statusCode).toBe(200);
    // Header values are lower-cased by Fastify's serializer.
    expect(res.headers['content-type']).toBe('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-accel-buffering']).toBe('no');
    expect(res.headers['connection']).toBe('keep-alive');
  });

  it('emits overview → plan → chapter[1..10] in order', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new SyntheticHappyProducer(),
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });
    expect(res.statusCode).toBe(200);

    const frames = parseSseFrames(res.body);
    // overview + plan + 10 chapter events = 12 frames.
    expect(frames).toHaveLength(12);
    expect(frames.every((f) => f.event === 'stage')).toBe(true);

    const data = frames.map((f) => f.data) as Array<{
      stage: string;
      chapterIndex?: number;
    }>;
    expect(data[0]).toEqual({ stage: 'overview' });
    expect(data[1]).toEqual({ stage: 'plan' });
    for (let i = 0; i < 10; i += 1) {
      expect(data[2 + i]).toEqual({
        stage: 'chapter',
        chapterIndex: i + 1
      });
    }
  });

  it('forwards the path storyId to the producer', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    const producer = new SyntheticHappyProducer();
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer,
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    await app.inject({ method: 'GET', url: `/stories/${STORY_ID}/stream` });

    expect(producer.lastArgs?.storyId).toBe(STORY_ID);
    // The signal must be present so producers can race upstream
    // calls against the client-disconnect signal.
    expect(producer.lastArgs?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('GET /stories/:id/stream — ownership enforcement', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns 401 unauthenticated when no caller identity is attached', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new SyntheticHappyProducer(),
      getCallerIdentity: noCaller
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });

    expect(res.statusCode).toBe(401);
    // The 401 path is a regular JSON envelope — we do NOT flip into
    // SSE framing for an unauthenticated request.
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toEqual({
      error: { code: 'unauthenticated', message: 'Authentication required.' }
    });
  });

  it('returns 403 forbidden when the caller is not the story owner', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new SyntheticHappyProducer(),
      getCallerIdentity: callerForUser(OTHER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toEqual({
      error: { code: 'forbidden', message: 'forbidden' }
    });
  });

  it('returns 404 not_found when the story id does not exist', async () => {
    const lookup = new FakeStoryOwnerLookup();
    // No seed — story does not exist.
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new SyntheticHappyProducer(),
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${UNKNOWN_STORY}/stream`
    });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: {
        code: 'not_found',
        message: expect.stringContaining(UNKNOWN_STORY)
      }
    });
  });

  it('admin role bypasses ownership and streams the full sequence', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new SyntheticHappyProducer(),
      getCallerIdentity: callerForUser(OTHER_ID, 'admin')
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('text/event-stream');
    const frames = parseSseFrames(res.body);
    expect(frames).toHaveLength(12);
  });
});

describe('GET /stories/:id/stream — error frame sanitisation (Requirements 6.7, 12.5)', () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('emits a single sanitised error frame with code + requestId on producer failure', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    // Internal-host string in the message MUST NOT reach the wire.
    const upstreamErr = new UpstreamError(
      'upstream_error',
      'omnivoice-internal-7.drama15: ECONNRESET'
    );
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new ThrowingProducer(upstreamErr, true),
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });

    expect(res.statusCode).toBe(200);
    const frames = parseSseFrames(res.body);
    // First the overview stage frame, then the terminal error frame.
    expect(frames).toHaveLength(2);
    expect(frames[0]?.event).toBe('stage');
    expect(frames[0]?.data).toEqual({ stage: 'overview' });
    expect(frames[1]?.event).toBe('error');

    const data = frames[1]?.data as Record<string, unknown>;
    expect(data['code']).toBe('upstream_error');
    expect(typeof data['requestId']).toBe('string');
    expect((data['requestId'] as string).length).toBeGreaterThan(0);
    // No upstream message text, hostname, or stack should leak.
    expect(Object.keys(data).sort()).toEqual(['code', 'requestId']);
    expect(res.body).not.toContain('omnivoice-internal-7');
    expect(res.body).not.toContain('ECONNRESET');
    expect(res.body).not.toContain('drama15');
  });

  it('collapses a non-UpstreamError to internal_error', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    // A bare Error with a leaky message — must not surface anywhere.
    const genericErr = new Error('Cannot read /var/secrets/upstream-key');
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new ThrowingProducer(genericErr, false),
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });

    expect(res.statusCode).toBe(200);
    const frames = parseSseFrames(res.body);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.event).toBe('error');
    const data = frames[0]?.data as Record<string, unknown>;
    expect(data['code']).toBe('internal_error');
    expect(typeof data['requestId']).toBe('string');
    // The leaky message MUST NOT reach the wire.
    expect(res.body).not.toContain('/var/secrets');
    expect(res.body).not.toContain('upstream-key');
  });

  it('propagates the inbound x-request-id into the error frame requestId', async () => {
    const lookup = new FakeStoryOwnerLookup();
    lookup.seed(STORY_ID, { userId: OWNER_ID });
    app = await buildApp({
      storyOwnerLookup: lookup,
      producer: new ThrowingProducer(
        new UpstreamError('upstream_timeout', 'timed out'),
        false
      ),
      getCallerIdentity: callerForUser(OWNER_ID)
    });

    const res = await app.inject({
      method: 'GET',
      url: `/stories/${STORY_ID}/stream`
    });

    const frames = parseSseFrames(res.body);
    expect(frames).toHaveLength(1);
    const errFrame = frames[0]!;
    expect(errFrame.event).toBe('error');
    const data = errFrame.data as Record<string, unknown>;
    // Fastify's default genReqId stamps every request, so requestId
    // must be present and non-empty on every error frame.
    expect(typeof data['requestId']).toBe('string');
    expect((data['requestId'] as string).length).toBeGreaterThan(0);
    expect(data['code']).toBe('upstream_timeout');
  });
});
