import { describe, it, expect, beforeEach } from 'vitest';
import {
  LicenseStateMachine,
  PAID_PLAN_DURATION_MS
} from '../../src/license/stateMachine.js';
import { LicenseError } from '../../src/license/types.js';
import { FakeLicenseDb } from './fakeLicenseDb.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';

function machineWith(
  db: FakeLicenseDb,
  opts?: { now?: Date; cycleIds?: string[] }
): LicenseStateMachine {
  const now = opts?.now ?? new Date('2025-03-01T00:00:00.000Z');
  let nowRef = now;
  const cycleIds = opts?.cycleIds ?? [
    'cycle-aaaa',
    'cycle-bbbb',
    'cycle-cccc',
    'cycle-dddd'
  ];
  let i = 0;
  return new LicenseStateMachine({
    db,
    clock: () => nowRef,
    newCycleId: () => {
      const v = cycleIds[i] ?? `cycle-${i}`;
      i += 1;
      return v;
    }
  });
}

describe('LicenseStateMachine.assignFreeOnSignup', () => {
  let db: FakeLicenseDb;

  beforeEach(() => {
    db = new FakeLicenseDb();
  });

  it('creates a Free_Plan/active row and writes auto_assign history', async () => {
    const m = machineWith(db);
    const state = await m.assignFreeOnSignup(USER_ID);

    expect(state.plan).toBe('Free_Plan');
    expect(state.status).toBe('active');
    expect(state.paidStartAt).toBeUndefined();
    expect(state.paidExpireAt).toBeUndefined();
    expect(state.paidCycleId).toBeUndefined();

    expect(db.history).toHaveLength(1);
    expect(db.history[0]).toMatchObject({
      userId: USER_ID,
      fromPlan: null,
      toPlan: 'Free_Plan',
      reason: 'auto_assign'
    });
  });

  it('is idempotent — second call does not append another history row', async () => {
    const m = machineWith(db);
    const first = await m.assignFreeOnSignup(USER_ID);
    const second = await m.assignFreeOnSignup(USER_ID);

    expect(second).toEqual(first);
    expect(db.history).toHaveLength(1);
  });
});

describe('LicenseStateMachine.upgradeToPaid', () => {
  let db: FakeLicenseDb;

  beforeEach(() => {
    db = new FakeLicenseDb();
  });

  it('produces a 30-day Paid window, fresh cycle id, zero paid quotas', async () => {
    const now = new Date('2025-03-01T12:34:56.000Z');
    const m = machineWith(db, { now, cycleIds: ['cycle-001'] });
    await m.assignFreeOnSignup(USER_ID);

    const state = await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    expect(state.plan).toBe('Paid_Plan');
    expect(state.status).toBe('active');
    expect(state.paidStartAt).toBe(now.toISOString());

    const expectedExpire = new Date(now.getTime() + PAID_PLAN_DURATION_MS);
    expect(state.paidExpireAt).toBe(expectedExpire.toISOString());

    // Window is exactly 30 days.
    const startMs = new Date(state.paidStartAt!).getTime();
    const expireMs = new Date(state.paidExpireAt!).getTime();
    expect(expireMs - startMs).toBe(PAID_PLAN_DURATION_MS);

    expect(state.paidCycleId).toBe('cycle-001');

    // Underlying plan row reflects zero paid quotas.
    const row = db.requirePlan(USER_ID);
    expect(row.paidStoryQuotaUsed).toBe(0);
    expect(row.paidVoiceQuotaUsed).toBe(0);

    // History recorded admin_upgrade with actor.
    const upgradeEntry = db.history.find((h) => h.reason === 'admin_upgrade');
    expect(upgradeEntry).toBeDefined();
    expect(upgradeEntry).toMatchObject({
      userId: USER_ID,
      fromPlan: 'Free_Plan',
      toPlan: 'Paid_Plan',
      actorAdminId: ADMIN_ID
    });

    // token_epoch was NOT bumped on upgrade.
    expect(db.tokenEpoch.get(USER_ID) ?? 0n).toBe(0n);
  });

  it('rejects upgrade when user is already on Paid_Plan', async () => {
    const m = machineWith(db);
    await m.assignFreeOnSignup(USER_ID);
    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    await expect(
      m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID })
    ).rejects.toBeInstanceOf(LicenseError);
    await expect(
      m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID })
    ).rejects.toMatchObject({ code: 'plan_invalid_transition' });
  });

  it('rejects upgrade when user has no plan row', async () => {
    const m = machineWith(db);
    await expect(
      m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID })
    ).rejects.toMatchObject({ code: 'user_not_found' });
  });
});

describe('LicenseStateMachine.revokePaid', () => {
  let db: FakeLicenseDb;

  beforeEach(() => {
    db = new FakeLicenseDb();
  });

  it('downgrades to Free_Plan/active, clears paid_*, bumps token_epoch exactly once', async () => {
    const m = machineWith(db);
    await m.assignFreeOnSignup(USER_ID);
    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    expect(db.bumpTokenEpochCalls).toBe(0);

    const state = await m.revokePaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    expect(state.plan).toBe('Free_Plan');
    expect(state.status).toBe('active');
    expect(state.paidStartAt).toBeUndefined();
    expect(state.paidExpireAt).toBeUndefined();
    expect(state.paidCycleId).toBeUndefined();

    const row = db.requirePlan(USER_ID);
    expect(row.paidStoryQuotaUsed).toBe(0);
    expect(row.paidVoiceQuotaUsed).toBe(0);

    expect(db.bumpTokenEpochCalls).toBe(1);
    expect(db.tokenEpoch.get(USER_ID)).toBe(1n);

    const revokeEntry = db.history.find((h) => h.reason === 'admin_revoke');
    expect(revokeEntry).toMatchObject({
      userId: USER_ID,
      fromPlan: 'Paid_Plan',
      toPlan: 'Free_Plan',
      actorAdminId: ADMIN_ID
    });
  });

  it('rejects revoke on a Free_Plan account', async () => {
    const m = machineWith(db);
    await m.assignFreeOnSignup(USER_ID);
    await expect(
      m.revokePaid({ userId: USER_ID, actorAdminId: ADMIN_ID })
    ).rejects.toMatchObject({ code: 'plan_invalid_transition' });
    expect(db.bumpTokenEpochCalls).toBe(0);
  });
});

describe('LicenseStateMachine.expirePaid', () => {
  let db: FakeLicenseDb;

  beforeEach(() => {
    db = new FakeLicenseDb();
  });

  it('downgrades to Free_Plan/active and clears paid_* but does NOT bump token_epoch', async () => {
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    const m = machineWith(db, { now: upgradeAt });
    await m.assignFreeOnSignup(USER_ID);
    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    // Build a second machine whose clock is past the expire time.
    const expireAt = new Date(upgradeAt.getTime() + PAID_PLAN_DURATION_MS + 1_000);
    const expirer = new LicenseStateMachine({
      db,
      clock: () => expireAt
    });

    const state = await expirer.expirePaid(USER_ID);

    expect(state.plan).toBe('Free_Plan');
    expect(state.status).toBe('active');
    expect(state.paidStartAt).toBeUndefined();
    expect(state.paidExpireAt).toBeUndefined();
    expect(state.paidCycleId).toBeUndefined();

    expect(db.bumpTokenEpochCalls).toBe(0);
    expect(db.tokenEpoch.get(USER_ID) ?? 0n).toBe(0n);

    const expiredEntry = db.history.find((h) => h.reason === 'expired');
    expect(expiredEntry).toMatchObject({
      userId: USER_ID,
      fromPlan: 'Paid_Plan',
      toPlan: 'Free_Plan'
    });
    expect(expiredEntry?.actorAdminId).toBeUndefined();
  });

  it('rejects expirePaid before paid_expire_at has been reached', async () => {
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    const m = machineWith(db, { now: upgradeAt });
    await m.assignFreeOnSignup(USER_ID);
    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    // Clock still inside the Paid window.
    const tooEarly = new Date(upgradeAt.getTime() + 1_000);
    const expirer = new LicenseStateMachine({ db, clock: () => tooEarly });
    await expect(expirer.expirePaid(USER_ID)).rejects.toMatchObject({
      code: 'plan_invalid_transition'
    });
  });

  it('rejects expirePaid on a Free_Plan account', async () => {
    const m = machineWith(db);
    await m.assignFreeOnSignup(USER_ID);
    await expect(m.expirePaid(USER_ID)).rejects.toMatchObject({
      code: 'plan_invalid_transition'
    });
  });
});

describe('LicenseStateMachine.renewPaid', () => {
  let db: FakeLicenseDb;

  beforeEach(() => {
    db = new FakeLicenseDb();
  });

  it('rotates the cycle id, resets paid quotas, and shifts the window forward when renewing before expiry', async () => {
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    const m = machineWith(db, {
      now: upgradeAt,
      cycleIds: ['cycle-A', 'cycle-B']
    });
    await m.assignFreeOnSignup(USER_ID);
    const upgraded = await m.upgradeToPaid({
      userId: USER_ID,
      actorAdminId: ADMIN_ID
    });

    // Simulate paid quota usage prior to renewal.
    const row = db.requirePlan(USER_ID);
    row.paidStoryQuotaUsed = 17;
    row.paidVoiceQuotaUsed = 11;

    // Renew 5 days before the existing expiry.
    const renewAt = new Date(upgradeAt.getTime() + (PAID_PLAN_DURATION_MS - 5 * 24 * 60 * 60 * 1000));
    const renewer = new LicenseStateMachine({
      db,
      clock: () => renewAt,
      newCycleId: () => 'cycle-B'
    });
    const renewed = await renewer.renewPaid(USER_ID);

    // Renewing before expiry: new start = old expire (so the user is
    // not penalised by overlapping windows) and new expire = old + 30d.
    expect(renewed.paidStartAt).toBe(upgraded.paidExpireAt);
    const newExpireMs = new Date(renewed.paidExpireAt!).getTime();
    const newStartMs = new Date(renewed.paidStartAt!).getTime();
    expect(newExpireMs - newStartMs).toBe(PAID_PLAN_DURATION_MS);
    // Forward shift relative to the previous expiry exactly 30 days.
    expect(newExpireMs - new Date(upgraded.paidExpireAt!).getTime()).toBe(
      PAID_PLAN_DURATION_MS
    );

    expect(renewed.paidCycleId).toBe('cycle-B');
    expect(renewed.paidCycleId).not.toBe(upgraded.paidCycleId);

    const refreshed = db.requirePlan(USER_ID);
    expect(refreshed.paidStoryQuotaUsed).toBe(0);
    expect(refreshed.paidVoiceQuotaUsed).toBe(0);

    const renewEntry = db.history.find((h) => h.reason === 'renewed');
    expect(renewEntry).toMatchObject({
      userId: USER_ID,
      fromPlan: 'Paid_Plan',
      toPlan: 'Paid_Plan'
    });
  });

  it('shifts the window forward by 30 days when renewing AFTER expiry (clock > oldExpireAt)', async () => {
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    const m = machineWith(db, {
      now: upgradeAt,
      cycleIds: ['cycle-A', 'cycle-B']
    });
    await m.assignFreeOnSignup(USER_ID);
    const upgraded = await m.upgradeToPaid({
      userId: USER_ID,
      actorAdminId: ADMIN_ID
    });

    // Renew 1 day past the original expiry (e.g. scanner hadn't ticked).
    const renewAt = new Date(
      new Date(upgraded.paidExpireAt!).getTime() + 24 * 60 * 60 * 1000
    );
    const renewer = new LicenseStateMachine({
      db,
      clock: () => renewAt,
      newCycleId: () => 'cycle-B'
    });
    const renewed = await renewer.renewPaid(USER_ID);

    // Renewing after expiry: new start = clock(); new expire = start + 30d.
    expect(renewed.paidStartAt).toBe(renewAt.toISOString());
    const newStartMs = new Date(renewed.paidStartAt!).getTime();
    const newExpireMs = new Date(renewed.paidExpireAt!).getTime();
    expect(newExpireMs - newStartMs).toBe(PAID_PLAN_DURATION_MS);
  });

  it('rejects renewPaid on a Free_Plan account', async () => {
    const m = machineWith(db);
    await m.assignFreeOnSignup(USER_ID);
    await expect(m.renewPaid(USER_ID)).rejects.toMatchObject({
      code: 'plan_invalid_transition'
    });
  });
});
