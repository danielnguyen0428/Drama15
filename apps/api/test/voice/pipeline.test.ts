/**
 * Unit tests for the Voice_Job per-chapter pipeline (Task 13.4).
 *
 * Validates: Requirements 9.5, 9.7, 9.9.
 *
 * Coverage:
 *
 *   - chapter-by-chapter completion increments `chapters_completed`
 *     and only commits voice quota when the 10th chapter lands
 *     (Requirement 9.5).
 *   - `paidCycleQuota.commit` is invoked exactly once for a job, no
 *     matter how many times the 10th chapter is observed (idempotent
 *     via `voice_jobs.quota_charged`).
 *   - `retryChapter` re-renders a single failed chapter without ever
 *     calling `paidCycleQuota.commit` — the structural guarantee of
 *     Requirement 9.9.
 *   - Control-plane endpoints (`pause`, `resume`, `stop`,
 *     `chapter/:idx/retry`) are owner-only (Requirements 10.4, 9.7)
 *     and the FSM endpoints transition state via `applyTransition`.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import type { LicenseDb, TxClient } from '../../src/license/db.js';
import type { PlanState } from '@drama15/contracts';
import type {
  PaidCycleAction,
  PaidCycleCommitInput
} from '../../src/rateLimit/index.js';
import type {
  UpstreamRequest,
  UpstreamResponse
} from '../../src/gateway/upstreamProxy.js';
import {
  createVoiceControlRoutePlugin,
  type CallerIdentity,
  type GetCallerIdentity
} from '../../src/voice/control.ts';
import {
  VoiceJobPipeline,
  VoiceJobPipelineError,
  type BuildUpstreamRequest,
  type DecodeUpstreamAudio,
  type VoiceChapterRow,
  type VoiceJobPipelineDb,
  type VoiceJobPipelineRow
} from '../../src/voice/pipeline.ts';
import type {
  VoiceJobFsmDb,
  VoiceJobFsmRow,
  VoiceJobState
} from '../../src/voice/voiceJobsFsmDb.ts';

// ---------------------------------------------------------------------------
// Test scaffolding — fakes
// ---------------------------------------------------------------------------

const PAID_USER = '22222222-2222-4222-8222-222222222222';
const OTHER_USER = '33333333-3333-4333-8333-333333333333';
const STORY_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const VOICE_JOB_ID = 'bbbb1111-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const PAID_CYCLE_ID = 'cycle-1';
const VOICE_ID = 'voice-default';

class FakeLicenseDb implements Pick<LicenseDb, 'getPlanState'> {
  public readonly rows = new Map<string, PlanState>();

  public setPlan(state: PlanState): void {
    this.rows.set(state.userId, state);
  }

  public async getPlanState(
    userId: string,
    _tx: TxClient | null
  ): Promise<PlanState | null> {
    return this.rows.get(userId) ?? null;
  }
}

class FakePipelineDb implements VoiceJobPipelineDb, VoiceJobFsmDb {
  public readonly job: VoiceJobPipelineRow;
  public fsmStatus: VoiceJobState = 'running';
  public version = 0;
  public readonly chapters = new Map<number, VoiceChapterRow>();
  public markCalls = 0;

  constructor(job: VoiceJobPipelineRow) {
    this.job = { ...job };
  }

  // Pipeline reads --------------------------------------------------------

  public async readVoiceJob(
    voiceJobId: string
  ): Promise<VoiceJobPipelineRow | null> {
    if (voiceJobId !== this.job.id) return null;
    // Return a fresh copy so callers cannot mutate our internal state.
    return { ...this.job };
  }

  public async incrementChaptersCompleted(
    voiceJobId: string
  ): Promise<{ chaptersCompleted: number } | null> {
    if (voiceJobId !== this.job.id) return null;
    if (this.job.chaptersCompleted >= 10) {
      // The DB CHECK constraint refuses values > 10. Surface the same.
      throw new Error('chapters_completed range check violated');
    }
    this.job.chaptersCompleted += 1;
    return { chaptersCompleted: this.job.chaptersCompleted };
  }

  public async readSourceChapter(
    storyId: string,
    chapterIndex: number
  ): Promise<VoiceChapterRow | null> {
    if (storyId !== this.job.storyId) return null;
    return this.chapters.get(chapterIndex) ?? null;
  }

  public async markVoiceQuotaCharged(args: {
    voiceJobId: string;
  }): Promise<boolean> {
    if (args.voiceJobId !== this.job.id) return false;
    this.markCalls += 1;
    if (this.job.quotaCharged) return false;
    this.job.quotaCharged = true;
    return true;
  }

  // FSM reads -------------------------------------------------------------

  public async readJob(jobId: string): Promise<VoiceJobFsmRow | null> {
    if (jobId !== this.job.id) return null;
    return {
      id: this.job.id,
      status: this.fsmStatus,
      version: this.version,
      userId: this.job.userId
    };
  }

  public async updateStatusIfVersion(args: {
    jobId: string;
    newStatus: VoiceJobState;
    expectedVersion: number;
  }): Promise<boolean> {
    if (args.jobId !== this.job.id) return false;
    if (args.expectedVersion !== this.version) return false;
    this.fsmStatus = args.newStatus;
    this.version += 1;
    return true;
  }
}

class FakeUpstreamProxy {
  public calls: UpstreamRequest[] = [];
  public failNext = false;
  public statusOverride: number | null = null;

  public async forward(req: UpstreamRequest): Promise<UpstreamResponse> {
    this.calls.push(req);
    if (this.failNext) {
      this.failNext = false;
      return {
        status: 502,
        headers: {},
        body: JSON.stringify({ error: { code: 'upstream_error' } })
      };
    }
    return {
      status: this.statusOverride ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        audio: 'AAECAw==', // 4 bytes of placeholder base64
        contentType: 'audio/mpeg'
      })
    };
  }
}

class FakeObjectStorage {
  public puts: Array<{
    userId: string;
    storyId: string;
    chapterId: string | number;
    contentType?: string;
    bytes: number;
  }> = [];
  public failNext = false;

  public async putChapterAudio(input: {
    userId: string;
    storyId: string;
    chapterId: string | number;
    body: Uint8Array | Buffer | string;
    contentType?: string;
  }): Promise<{ key: string }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('storage offline');
    }
    const bytes =
      typeof input.body === 'string'
        ? input.body.length
        : (input.body as Uint8Array).length;
    const recorded: {
      userId: string;
      storyId: string;
      chapterId: string | number;
      contentType?: string;
      bytes: number;
    } = {
      userId: input.userId,
      storyId: input.storyId,
      chapterId: input.chapterId,
      bytes
    };
    if (input.contentType !== undefined) {
      recorded.contentType = input.contentType;
    }
    this.puts.push(recorded);
    return {
      key: `users/${input.userId}/stories/${input.storyId}/chapters/${String(
        input.chapterId
      )}.mp3`
    };
  }
}

class FakePaidCycleQuota {
  public readonly commitCalls: Array<{
    userId: string;
    paidCycleId: string;
    action: PaidCycleAction;
    jobId: string;
  }> = [];

  public async commit(
    input: PaidCycleCommitInput
  ): Promise<{ committed: boolean }> {
    this.commitCalls.push({
      userId: input.userId,
      paidCycleId: input.paidCycleId,
      action: input.action,
      jobId: input.jobId
    });
    const flipped = await input.markQuotaCharged({
      jobId: input.jobId,
      jobKind: input.action === 'voice' ? 'voice' : 'story'
    });
    return { committed: flipped === true };
  }
}

// ---------------------------------------------------------------------------
// Common helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<VoiceJobPipelineRow> = {}): VoiceJobPipelineRow {
  return {
    id: VOICE_JOB_ID,
    userId: PAID_USER,
    storyId: STORY_ID,
    voiceId: VOICE_ID,
    speed: 1.0,
    pitch: 0.0,
    chaptersCompleted: 0,
    quotaCharged: false,
    paidCycleId: PAID_CYCLE_ID,
    ...overrides
  };
}

const buildUpstreamRequest: BuildUpstreamRequest = (input) => ({
  method: 'POST',
  url: 'https://omnivoice.example/internal/tts',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    voiceId: input.voiceId,
    chapterIndex: input.chapterIndex,
    speed: input.speed,
    pitch: input.pitch,
    storyId: input.storyId
  }),
  requestId: `req-${input.voiceJobId}-${input.chapterIndex}`
});

const decodeUpstreamAudio: DecodeUpstreamAudio = (resp) => {
  const parsed = JSON.parse(resp.body) as {
    audio: string;
    contentType: string;
  };
  return {
    audio: Buffer.from(parsed.audio, 'base64'),
    contentType: parsed.contentType
  };
};

interface PipelineHarness {
  pipeline: VoiceJobPipeline;
  db: FakePipelineDb;
  upstream: FakeUpstreamProxy;
  storage: FakeObjectStorage;
  quota: FakePaidCycleQuota;
}

function buildPipelineHarness(
  jobOverrides: Partial<VoiceJobPipelineRow> = {}
): PipelineHarness {
  const db = new FakePipelineDb(makeJob(jobOverrides));
  const upstream = new FakeUpstreamProxy();
  const storage = new FakeObjectStorage();
  const quota = new FakePaidCycleQuota();
  const pipeline = new VoiceJobPipeline({
    upstreamProxy: upstream,
    objectStorage: storage,
    paidCycleQuota: quota,
    voiceJobPipelineDb: db,
    buildUpstreamRequest,
    decodeUpstreamAudio
  });
  return { pipeline, db, upstream, storage, quota };
}

// ---------------------------------------------------------------------------
// processChapter — happy path + commit semantics (Requirements 9.5, 9.9)
// ---------------------------------------------------------------------------

describe('VoiceJobPipeline.processChapter', () => {
  it('increments chapters_completed by exactly 1 per chapter', async () => {
    const h = buildPipelineHarness();

    for (let i = 1; i <= 5; i += 1) {
      const outcome = await h.pipeline.processChapter({
        voiceJobId: VOICE_JOB_ID,
        chapterIndex: i
      });
      expect(outcome.chaptersCompleted).toBe(i);
      expect(outcome.committed).toBe(false);
    }

    expect(h.db.job.chaptersCompleted).toBe(5);
    expect(h.upstream.calls).toHaveLength(5);
    expect(h.storage.puts).toHaveLength(5);
    expect(h.quota.commitCalls).toHaveLength(0);
  });

  it('commits the voice quota slot exactly once on the 10th chapter', async () => {
    const h = buildPipelineHarness();

    for (let i = 1; i <= 10; i += 1) {
      const outcome = await h.pipeline.processChapter({
        voiceJobId: VOICE_JOB_ID,
        chapterIndex: i
      });
      if (i < 10) {
        expect(outcome.committed).toBe(false);
      } else {
        expect(outcome.committed).toBe(true);
        expect(outcome.chaptersCompleted).toBe(10);
      }
    }

    // Exactly one commit, with action='voice' on the right cycle.
    expect(h.quota.commitCalls).toEqual([
      {
        userId: PAID_USER,
        paidCycleId: PAID_CYCLE_ID,
        action: 'voice',
        jobId: VOICE_JOB_ID
      }
    ]);
    // markVoiceQuotaCharged was invoked exactly once and the row is
    // now flipped to `true` (idempotency guard for any future retry).
    expect(h.db.markCalls).toBe(1);
    expect(h.db.job.quotaCharged).toBe(true);
  });

  it('refuses to re-render a chapter that is already completed', async () => {
    const h = buildPipelineHarness({ chaptersCompleted: 3 });

    await expect(
      h.pipeline.processChapter({ voiceJobId: VOICE_JOB_ID, chapterIndex: 2 })
    ).rejects.toThrow(VoiceJobPipelineError);
    await expect(
      h.pipeline.processChapter({ voiceJobId: VOICE_JOB_ID, chapterIndex: 3 })
    ).rejects.toThrow(VoiceJobPipelineError);

    // No upstream / storage / quota side effects for the rejected calls.
    expect(h.upstream.calls).toHaveLength(0);
    expect(h.storage.puts).toHaveLength(0);
    expect(h.quota.commitCalls).toHaveLength(0);
  });

  it('rejects out-of-range chapter indexes without touching upstream / storage', async () => {
    const h = buildPipelineHarness();

    for (const bad of [-1, 0, 11, 1.5, Number.NaN]) {
      await expect(
        h.pipeline.processChapter({
          voiceJobId: VOICE_JOB_ID,
          chapterIndex: bad
        })
      ).rejects.toThrow(VoiceJobPipelineError);
    }
    expect(h.upstream.calls).toHaveLength(0);
    expect(h.storage.puts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// retryChapter — Requirement 9.9 (no extra quota on retry)
// ---------------------------------------------------------------------------

describe('VoiceJobPipeline.retryChapter (Requirement 9.9)', () => {
  it('re-renders a failed chapter without calling paidCycleQuota.commit', async () => {
    const h = buildPipelineHarness({ chaptersCompleted: 4 });
    h.db.chapters.set(5, {
      storyId: STORY_ID,
      index: 5,
      status: 'failed'
    });

    const outcome = await h.pipeline.retryChapter({
      voiceJobId: VOICE_JOB_ID,
      chapterIndex: 5
    });

    expect(outcome.committed).toBe(false);
    expect(outcome.chaptersCompleted).toBe(5);
    expect(h.db.job.chaptersCompleted).toBe(5);

    // Critical: zero commits on retry (Requirement 9.9).
    expect(h.quota.commitCalls).toHaveLength(0);
    expect(h.db.markCalls).toBe(0);
    expect(h.db.job.quotaCharged).toBe(false);

    // Upstream + storage WERE invoked exactly once for the retry.
    expect(h.upstream.calls).toHaveLength(1);
    expect(h.storage.puts).toHaveLength(1);
    expect(h.storage.puts[0]?.chapterId).toBe(5);
  });

  it('still does not call commit even if a retry lands the 10th chapter', async () => {
    // Job already produced 9 chapters; chapter 10 failed. The user
    // retries chapter 10 — Requirement 9.9 says this MUST NOT charge
    // quota again. The original commit (if any) was the responsibility
    // of the processChapter path; retry alone never touches commit.
    const h = buildPipelineHarness({ chaptersCompleted: 9 });
    h.db.chapters.set(10, {
      storyId: STORY_ID,
      index: 10,
      status: 'failed'
    });

    const outcome = await h.pipeline.retryChapter({
      voiceJobId: VOICE_JOB_ID,
      chapterIndex: 10
    });

    expect(outcome.committed).toBe(false);
    expect(outcome.chaptersCompleted).toBe(10);
    // Retry does not invoke commit, even on the boundary case.
    expect(h.quota.commitCalls).toHaveLength(0);
    expect(h.db.markCalls).toBe(0);
  });

  it('refuses to retry a chapter that is not currently failed', async () => {
    const h = buildPipelineHarness({ chaptersCompleted: 4 });
    h.db.chapters.set(5, { storyId: STORY_ID, index: 5, status: 'pending' });

    await expect(
      h.pipeline.retryChapter({ voiceJobId: VOICE_JOB_ID, chapterIndex: 5 })
    ).rejects.toThrow(VoiceJobPipelineError);

    expect(h.upstream.calls).toHaveLength(0);
    expect(h.storage.puts).toHaveLength(0);
    expect(h.quota.commitCalls).toHaveLength(0);
  });

  it('returns 404-flavoured error when the source chapter does not exist', async () => {
    const h = buildPipelineHarness({ chaptersCompleted: 4 });

    await expect(
      h.pipeline.retryChapter({ voiceJobId: VOICE_JOB_ID, chapterIndex: 5 })
    ).rejects.toMatchObject({ code: 'voice_chapter_state_invalid' });
  });
});

// ---------------------------------------------------------------------------
// Control plane — owner-only + FSM transitions (Requirements 9.7, 10.4)
// ---------------------------------------------------------------------------

let currentCaller: CallerIdentity | null = null;
const callerResolver: GetCallerIdentity = () => currentCaller;

interface ControlHarness {
  app: FastifyInstance;
  db: FakePipelineDb;
  pipeline: VoiceJobPipeline;
  quota: FakePaidCycleQuota;
  setCaller(c: CallerIdentity | null): void;
}

async function buildControlHarness(
  jobOverrides: Partial<VoiceJobPipelineRow> = {},
  fsmInitial: VoiceJobState = 'running'
): Promise<ControlHarness> {
  const ph = buildPipelineHarness(jobOverrides);
  ph.db.fsmStatus = fsmInitial;

  const licenseDb = new FakeLicenseDb();
  licenseDb.setPlan({
    userId: PAID_USER,
    plan: 'Paid_Plan',
    status: 'active',
    paidStartAt: '2026-01-01T00:00:00.000Z',
    paidExpireAt: '2026-01-31T00:00:00.000Z',
    paidCycleId: PAID_CYCLE_ID
  });
  const authz = new ServerAuthorityAuthzMiddleware({ licenseDb });

  const app = Fastify({ logger: false });
  await app.register(createVoiceControlRoutePlugin, {
    fsmDb: ph.db,
    pipeline: ph.pipeline,
    authz,
    getCallerIdentity: callerResolver
  });
  await app.ready();

  return {
    app,
    db: ph.db,
    pipeline: ph.pipeline,
    quota: ph.quota,
    setCaller(c) {
      currentCaller = c;
    }
  };
}

afterEach(() => {
  currentCaller = null;
});

describe('Voice control plane — pause/resume/stop FSM endpoints (Requirement 9.7)', () => {
  let h: ControlHarness;

  afterEach(async () => {
    await h.app.close();
  });

  it('POST /voice/:id/pause transitions running → paused for the owner', async () => {
    h = await buildControlHarness({}, 'running');
    h.setCaller({ id: PAID_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/pause`,
      payload: {}
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { status: string; version: number };
    expect(body.status).toBe('paused');
    expect(body.version).toBe(1);
    expect(h.db.fsmStatus).toBe('paused');
    expect(h.db.version).toBe(1);
  });

  it('POST /voice/:id/resume transitions paused → running for the owner', async () => {
    h = await buildControlHarness({}, 'paused');
    h.setCaller({ id: PAID_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/resume`,
      payload: {}
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string };
    expect(body.status).toBe('running');
    expect(h.db.fsmStatus).toBe('running');
  });

  it('POST /voice/:id/stop transitions running → partial for the owner', async () => {
    h = await buildControlHarness({}, 'running');
    h.setCaller({ id: PAID_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/stop`,
      payload: {}
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string };
    expect(body.status).toBe('partial');
    expect(h.db.fsmStatus).toBe('partial');
  });

  it('refuses pause from a non-owner with 403 forbidden', async () => {
    h = await buildControlHarness({}, 'running');
    h.setCaller({ id: OTHER_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/pause`,
      payload: {}
    });

    expect(res.statusCode).toBe(403);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');
    // FSM is unchanged.
    expect(h.db.fsmStatus).toBe('running');
    expect(h.db.version).toBe(0);
  });

  it('refuses pause without a verified caller with 401 unauthenticated', async () => {
    h = await buildControlHarness({}, 'running');
    h.setCaller(null);

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/pause`,
      payload: {}
    });

    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthenticated');
  });

  it('returns 404 not_found for an unknown voice_job id', async () => {
    h = await buildControlHarness({}, 'running');
    h.setCaller({ id: PAID_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/00000000-0000-4000-8000-000000000000/pause`,
      payload: {}
    });

    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 409 voice_job_illegal_transition when the FSM rejects the move', async () => {
    // `completed` is terminal — every event from there is illegal.
    h = await buildControlHarness({}, 'completed');
    h.setCaller({ id: PAID_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/pause`,
      payload: {}
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('voice_job_illegal_transition');
  });
});

describe('Voice control plane — chapter retry endpoint (Requirement 9.9)', () => {
  let h: ControlHarness;

  afterEach(async () => {
    await h.app.close();
  });

  it('runs retryChapter for the owner and never invokes paidCycleQuota.commit', async () => {
    h = await buildControlHarness({ chaptersCompleted: 4 }, 'partial');
    h.setCaller({ id: PAID_USER });
    h.db.chapters.set(5, {
      storyId: STORY_ID,
      index: 5,
      status: 'failed'
    });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/chapter/5/retry`,
      payload: {}
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { chaptersCompleted: number };
    expect(body.chaptersCompleted).toBe(5);

    // The structural invariant: retry never touches commit / quota.
    expect(h.quota.commitCalls).toHaveLength(0);
    expect(h.db.markCalls).toBe(0);
    expect(h.db.job.quotaCharged).toBe(false);
  });

  it('refuses chapter retry from a non-owner with 403 forbidden', async () => {
    h = await buildControlHarness({ chaptersCompleted: 4 }, 'partial');
    h.setCaller({ id: OTHER_USER });
    h.db.chapters.set(5, {
      storyId: STORY_ID,
      index: 5,
      status: 'failed'
    });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/chapter/5/retry`,
      payload: {}
    });

    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('forbidden');

    // No retry side effects when the owner gate refuses.
    expect(h.db.job.chaptersCompleted).toBe(4);
    expect(h.quota.commitCalls).toHaveLength(0);
  });

  it('rejects out-of-range chapter index with 400 voice_chapter_index_invalid', async () => {
    h = await buildControlHarness({}, 'running');
    h.setCaller({ id: PAID_USER });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/chapter/0/retry`,
      payload: {}
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('voice_chapter_index_invalid');
  });

  it('returns 409 when the chapter is not in failed state', async () => {
    h = await buildControlHarness({ chaptersCompleted: 4 }, 'partial');
    h.setCaller({ id: PAID_USER });
    h.db.chapters.set(5, {
      storyId: STORY_ID,
      index: 5,
      status: 'pending'
    });

    const res = await h.app.inject({
      method: 'POST',
      url: `/voice/${VOICE_JOB_ID}/chapter/5/retry`,
      payload: {}
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('voice_chapter_not_failed');
  });
});
