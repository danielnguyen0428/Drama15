/**
 * Unit tests for the Automation_Job control endpoints (Task 12.3).
 *
 * Validates: Requirement 8.6.
 *
 * Coverage matrix (mirrors the task brief):
 *
 *   - Each of `pause`, `resume`, `stop` advances the FSM correctly
 *     against a legally-receptive starting state, returning 200 with
 *     `{ automationJobId, status, version }`.
 *   - A non-owner caller is rejected with 403 `forbidden` and no FSM
 *     mutation (defence in depth — the ownership gate runs BEFORE the
 *     FSM read).
 *   - Calling `pause` on a `completed` job (or `resume` on `running`,
 *     `stop` on `completed` …) surfaces 409 `invalid_transition` with
 *     no FSM mutation.
 *   - A version conflict (the row's version moved between read and
 *     write) surfaces 409 `conflict`.
 *   - A request for a non-existent `:id` returns 404 `not_found`.
 *
 * The Fastify plugin is loaded via `app.inject(...)` so the tests
 * exercise the same error mapping and header behaviour that production
 * traffic would.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { ServerAuthorityAuthzMiddleware } from '../../src/gateway/authz.js';
import {
  createAutomationControlRoutePlugin,
  type AutomationOwnerLookup,
  type GetAutomationControlCallerIdentity
} from '../../src/automation/index.js';
import {
  type AutomationJobFsmDb,
  type AutomationJobFsmRow
} from '../../src/automation/fsmDb.js';
import type { AutomationJobState } from '../../src/automation/fsm.js';
import { FakeLicenseDb } from '../license/fakeLicenseDb.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const AUTOMATION_ID = 'aaaa1111-aaaa-4aaa-8aaa-aaaaaaaaaaa1';

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

class FakeAutomationOwnerLookup implements AutomationOwnerLookup {
  public ownerByJobId = new Map<string, string>();
  public calls: string[] = [];

  public seed(jobId: string, ownerId: string): void {
    this.ownerByJobId.set(jobId, ownerId);
  }

  public async getAutomationOwner(
    automationJobId: string
  ): Promise<{ userId: string } | null> {
    this.calls.push(automationJobId);
    const userId = this.ownerByJobId.get(automationJobId);
    return userId === undefined ? null : { userId };
  }
}

/**
 * In-memory FSM DB mirroring the optimistic-lock semantics of the
 * production Postgres adapter. Mirrors the shape used in
 * `test/stories/resume.test.ts` so the two suites stay consistent.
 */
class FakeAutomationJobFsmDb implements AutomationJobFsmDb {
  public rows = new Map<string, AutomationJobFsmRow>();
  public reads = 0;
  public writes = 0;
  public lastUpdate: {
    jobId: string;
    newStatus: AutomationJobState;
    expectedVersion: number;
  } | null = null;

  /**
   * If set, the next call to `readJob` returns a row whose `version`
   * differs from the row in `rows`. Used to simulate a concurrent
   * transition winning the optimistic-lock race.
   */
  public versionDriftOnNextRead = false;

  public seed(row: AutomationJobFsmRow): void {
    this.rows.set(row.id, { ...row });
  }

  public snapshot(jobId: string): AutomationJobFsmRow | undefined {
    const r = this.rows.get(jobId);
    return r ? { ...r } : undefined;
  }

  public async readJob(
    jobId: string
  ): Promise<AutomationJobFsmRow | null> {
    this.reads += 1;
    const r = this.rows.get(jobId);
    if (!r) return null;
    if (this.versionDriftOnNextRead) {
      this.versionDriftOnNextRead = false;
      // Hand the caller the row but quietly bump the persisted
      // version so the subsequent UPDATE matches zero rows.
      this.rows.set(jobId, { ...r, version: r.version + 1 });
      return { ...r };
    }
    return { ...r };
  }

  public async updateStatusIfVersion(args: {
    jobId: string;
    newStatus: AutomationJobState;
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

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface Harness {
  app: FastifyInstance;
  ownerLookup: FakeAutomationOwnerLookup;
  fsmDb: FakeAutomationJobFsmDb;
  setCaller(id: string | null, role?: string): void;
}

let currentCaller: { id: string; role?: string } | null = null;

const callerResolver: GetAutomationControlCallerIdentity = () => currentCaller;

interface BuildHarnessOpts {
  fsmRow?: AutomationJobFsmRow;
  ownerId?: string | null;
}

async function buildHarness(opts: BuildHarnessOpts = {}): Promise<Harness> {
  const ownerLookup = new FakeAutomationOwnerLookup();
  if (opts.ownerId !== null) {
    ownerLookup.seed(AUTOMATION_ID, opts.ownerId ?? OWNER_ID);
  }

  const fsmDb = new FakeAutomationJobFsmDb();
  fsmDb.seed(
    opts.fsmRow ?? { id: AUTOMATION_ID, status: 'running', version: 3 }
  );

  const authz = new ServerAuthorityAuthzMiddleware({
    licenseDb: new FakeLicenseDb()
  });

  const app = Fastify({ logger: false });
  await app.register(createAutomationControlRoutePlugin, {
    ownerLookup,
    fsmDb,
    authz,
    getCallerIdentity: callerResolver
  });
  await app.ready();

  return {
    app,
    ownerLookup,
    fsmDb,
    setCaller(id, role) {
      if (id === null) {
        currentCaller = null;
        return;
      }
      currentCaller = role === undefined ? { id } : { id, role };
    }
  };
}

// ---------------------------------------------------------------------------
// Tests — each endpoint advances the FSM correctly
// ---------------------------------------------------------------------------

describe('POST /automation/:id/{pause,resume,stop} — happy path', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it('pause: running → paused, returns 200 with new status and version', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'running', version: 3 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/pause`
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json() as {
      automationJobId: string;
      status: string;
      version: number;
    };
    expect(body.automationJobId).toBe(AUTOMATION_ID);
    expect(body.status).toBe('paused');
    expect(body.version).toBe(4);

    expect(h.fsmDb.snapshot(AUTOMATION_ID)).toEqual({
      id: AUTOMATION_ID,
      status: 'paused',
      version: 4
    });
    expect(h.fsmDb.lastUpdate).toEqual({
      jobId: AUTOMATION_ID,
      newStatus: 'paused',
      expectedVersion: 3
    });
  });

  it('resume: paused → running, returns 200 with new status and version', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'paused', version: 7 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/resume`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      automationJobId: string;
      status: string;
      version: number;
    };
    expect(body.status).toBe('running');
    expect(body.version).toBe(8);

    expect(h.fsmDb.snapshot(AUTOMATION_ID)).toEqual({
      id: AUTOMATION_ID,
      status: 'running',
      version: 8
    });
  });

  it('stop: running → failed, returns 200 with new status and version', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'running', version: 1 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/stop`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      automationJobId: string;
      status: string;
      version: number;
    };
    expect(body.status).toBe('failed');
    expect(body.version).toBe(2);

    expect(h.fsmDb.snapshot(AUTOMATION_ID)).toEqual({
      id: AUTOMATION_ID,
      status: 'failed',
      version: 2
    });
  });

  it('stop: paused → failed (stop is legal from paused too)', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'paused', version: 4 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/stop`
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { status: string; version: number };
    expect(body.status).toBe('failed');
    expect(body.version).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Tests — non-owner forbidden (Requirement 10.4)
// ---------------------------------------------------------------------------

describe('Automation control — ownership gate (Requirement 10.4)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'running', version: 3 }
    });
  });

  afterEach(async () => {
    await h.app.close();
    currentCaller = null;
  });

  it.each(['pause', 'resume', 'stop'] as const)(
    '%s: rejects a non-owner caller with 403 forbidden and no FSM mutation',
    async (event) => {
      h.setCaller(OTHER_ID);

      const res = await h.app.inject({
        method: 'POST',
        url: `/automation/${AUTOMATION_ID}/${event}`
      });

      expect(res.statusCode).toBe(403);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('forbidden');

      // Critically: ownership runs BEFORE the FSM read / write.
      // A non-owner cannot probe the FSM state of someone else's job.
      expect(h.fsmDb.reads).toBe(0);
      expect(h.fsmDb.writes).toBe(0);
      expect(h.fsmDb.snapshot(AUTOMATION_ID)).toEqual({
        id: AUTOMATION_ID,
        status: 'running',
        version: 3
      });
    }
  );

  it.each(['pause', 'resume', 'stop'] as const)(
    '%s: rejects a missing caller with 401 unauthenticated',
    async (event) => {
      h.setCaller(null);

      const res = await h.app.inject({
        method: 'POST',
        url: `/automation/${AUTOMATION_ID}/${event}`
      });

      expect(res.statusCode).toBe(401);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('unauthenticated');

      // No persistence calls at all.
      expect(h.ownerLookup.calls).toEqual([]);
      expect(h.fsmDb.reads).toBe(0);
      expect(h.fsmDb.writes).toBe(0);
    }
  );
});

// ---------------------------------------------------------------------------
// Tests — illegal transition surfaces 409 invalid_transition
// ---------------------------------------------------------------------------

describe('Automation control — illegal transition (Requirement 8.6)', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it('pause on completed → 409 invalid_transition, no FSM mutation', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'completed', version: 9 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/pause`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('invalid_transition');
    // Message MUST surface enough context for the Web_Client to render
    // a meaningful label.
    expect(body.error.message).toMatch(/completed/);

    // No persisted change — the row remains exactly as seeded.
    expect(h.fsmDb.writes).toBe(0);
    expect(h.fsmDb.snapshot(AUTOMATION_ID)).toEqual({
      id: AUTOMATION_ID,
      status: 'completed',
      version: 9
    });
  });

  it('resume on running → 409 invalid_transition (running.resume is illegal)', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'running', version: 2 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/resume`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_transition');
    expect(h.fsmDb.writes).toBe(0);
  });

  it('stop on completed → 409 invalid_transition', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'completed', version: 5 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/stop`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_transition');
    expect(h.fsmDb.writes).toBe(0);
  });

  it('pause on failed → 409 invalid_transition', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'failed', version: 4 }
    });
    h.setCaller(OWNER_ID);

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/pause`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('invalid_transition');
    expect(h.fsmDb.writes).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — version conflict surfaces 409 conflict
// ---------------------------------------------------------------------------

describe('Automation control — version conflict (Requirement 8.6)', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it('pause: when the row version drifts between read and write → 409 conflict', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'running', version: 3 }
    });
    h.setCaller(OWNER_ID);
    h.fsmDb.versionDriftOnNextRead = true;

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/pause`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('conflict');
    // The drift simulator bumped the persisted version to 4 BEFORE
    // the UPDATE, so the row is unchanged from the orchestrator's
    // perspective (status still `running`).
    expect(h.fsmDb.snapshot(AUTOMATION_ID)).toEqual({
      id: AUTOMATION_ID,
      status: 'running',
      version: 4
    });
  });

  it('stop: version conflict surfaces as 409 conflict regardless of event', async () => {
    h = await buildHarness({
      fsmRow: { id: AUTOMATION_ID, status: 'running', version: 1 }
    });
    h.setCaller(OWNER_ID);
    h.fsmDb.versionDriftOnNextRead = true;

    const res = await h.app.inject({
      method: 'POST',
      url: `/automation/${AUTOMATION_ID}/stop`
    });

    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: { code: string } };
    expect(body.error.code).toBe('conflict');
  });
});

// ---------------------------------------------------------------------------
// Tests — missing automation row surfaces 404 not_found
// ---------------------------------------------------------------------------

describe('Automation control — missing automation row', () => {
  let h: Harness;

  afterEach(async () => {
    if (h) await h.app.close();
    currentCaller = null;
  });

  it.each(['pause', 'resume', 'stop'] as const)(
    '%s on non-existent id → 404 not_found, no FSM read',
    async (event) => {
      h = await buildHarness({ ownerId: null });
      h.setCaller(OWNER_ID);

      const res = await h.app.inject({
        method: 'POST',
        url: `/automation/${AUTOMATION_ID}/${event}`
      });

      expect(res.statusCode).toBe(404);
      const body = res.json() as { error: { code: string } };
      expect(body.error.code).toBe('not_found');

      // Owner lookup runs BEFORE the FSM read, so a 404 from the
      // ownership stage means no FSM persistence call happened.
      expect(h.fsmDb.reads).toBe(0);
      expect(h.fsmDb.writes).toBe(0);
    }
  );
});
