import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LicenseStateMachine,
  PAID_PLAN_DURATION_MS
} from '../../src/license/stateMachine.js';
import { PaidPlanExpiryScanner } from '../../src/license/expiryScanner.js';
import { FakeLicenseDb } from './fakeLicenseDb.js';

const ADMIN_ID = '22222222-2222-2222-2222-222222222222';

interface CapturedLog {
  level: 'info' | 'warn' | 'error';
  message: string;
  meta?: Record<string, unknown>;
}

function captureLogger(): {
  logs: CapturedLog[];
  logger: {
    info: (m: string, meta?: Record<string, unknown>) => void;
    warn: (m: string, meta?: Record<string, unknown>) => void;
    error: (m: string, meta?: Record<string, unknown>) => void;
  };
} {
  const logs: CapturedLog[] = [];
  return {
    logs,
    logger: {
      info: (message, meta) => logs.push({ level: 'info', message, meta }),
      warn: (message, meta) => logs.push({ level: 'warn', message, meta }),
      error: (message, meta) => logs.push({ level: 'error', message, meta })
    }
  };
}

async function seedUserWithPaidPlan(
  db: FakeLicenseDb,
  userId: string,
  upgradeAt: Date
): Promise<void> {
  const machine = new LicenseStateMachine({
    db,
    clock: () => upgradeAt,
    newCycleId: () => `cycle-${userId}`
  });
  await machine.assignFreeOnSignup(userId);
  await machine.upgradeToPaid({ userId, actorAdminId: ADMIN_ID });
}

describe('PaidPlanExpiryScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires every Paid plan whose paid_expire_at <= clock() on tick', async () => {
    const db = new FakeLicenseDb();
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    await seedUserWithPaidPlan(db, 'u-1', upgradeAt);
    await seedUserWithPaidPlan(db, 'u-2', upgradeAt);

    const past = new Date(upgradeAt.getTime() + PAID_PLAN_DURATION_MS + 1_000);

    const machine = new LicenseStateMachine({ db, clock: () => past });
    const { logger } = captureLogger();
    const scanner = new PaidPlanExpiryScanner({
      db,
      machine,
      intervalMs: 60_000,
      logger,
      clock: () => past
    });

    await scanner.tick();

    expect(db.requirePlan('u-1').plan).toBe('Free_Plan');
    expect(db.requirePlan('u-2').plan).toBe('Free_Plan');
    // expirePaid does NOT bump token_epoch.
    expect(db.bumpTokenEpochCalls).toBe(0);
  });

  it('continues processing other users when one expirePaid call fails', async () => {
    const db = new FakeLicenseDb();
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    await seedUserWithPaidPlan(db, 'u-bad', upgradeAt);
    await seedUserWithPaidPlan(db, 'u-good', upgradeAt);

    const past = new Date(upgradeAt.getTime() + PAID_PLAN_DURATION_MS + 1_000);

    const machine = new LicenseStateMachine({ db, clock: () => past });
    const { logs, logger } = captureLogger();
    const scanner = new PaidPlanExpiryScanner({
      db,
      machine,
      intervalMs: 60_000,
      logger,
      clock: () => past
    });

    db.failRevokeForUser = 'u-bad';

    await scanner.tick();

    expect(db.requirePlan('u-bad').plan).toBe('Paid_Plan'); // failed, unchanged
    expect(db.requirePlan('u-good').plan).toBe('Free_Plan'); // succeeded

    const warned = logs.find(
      (l) => l.level === 'warn' && l.message === 'paid_plan_expire_failed'
    );
    expect(warned).toBeDefined();
    expect(warned?.meta?.userId).toBe('u-bad');
  });

  it('runs ticks via setInterval after start() and stops on stop()', async () => {
    const db = new FakeLicenseDb();
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    await seedUserWithPaidPlan(db, 'u-1', upgradeAt);

    // Past the expiry from the start.
    const fixedNow = new Date(upgradeAt.getTime() + PAID_PLAN_DURATION_MS + 1_000);
    const machine = new LicenseStateMachine({ db, clock: () => fixedNow });
    const { logger } = captureLogger();
    const scanner = new PaidPlanExpiryScanner({
      db,
      machine,
      intervalMs: 60_000,
      logger,
      clock: () => fixedNow
    });

    scanner.start();
    try {
      // Advance past one interval; flush microtasks so the tick runs.
      await vi.advanceTimersByTimeAsync(60_000);
      // Allow any pending microtasks scheduled inside the interval.
      await vi.runOnlyPendingTimersAsync();
    } finally {
      scanner.stop();
    }

    expect(db.requirePlan('u-1').plan).toBe('Free_Plan');
  });

  it('start() is idempotent and stop() is idempotent', () => {
    const db = new FakeLicenseDb();
    const machine = new LicenseStateMachine({ db });
    const scanner = new PaidPlanExpiryScanner({
      db,
      machine,
      intervalMs: 60_000
    });

    expect(() => {
      scanner.start();
      scanner.start();
      scanner.stop();
      scanner.stop();
    }).not.toThrow();
  });

  it('catches and logs errors from findPaidPlansToExpire without throwing', async () => {
    const db = new FakeLicenseDb();
    const machine = new LicenseStateMachine({ db });
    const { logs, logger } = captureLogger();
    const scanner = new PaidPlanExpiryScanner({
      db,
      machine,
      intervalMs: 60_000,
      logger
    });

    db.failNextScan = true;
    await expect(scanner.tick()).resolves.toBeUndefined();
    const errored = logs.find((l) => l.level === 'error');
    expect(errored).toBeDefined();
  });
});
