/**
 * Audit-emission tests for `LicenseStateMachine`.
 *
 * Drives each transition with a recording AuditLogger and asserts:
 *   * the right event sequence is emitted;
 *   * each event carries the documented detail keys;
 *   * audit-side failures are swallowed so a flaky `audit_events`
 *     insert never breaks the license transition.
 *
 * Validates: Requirements 14.1, 16.7.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  LicenseStateMachine,
  PAID_PLAN_DURATION_MS
} from '../../src/license/stateMachine.js';
import type { AuditLoggerLike } from '../../src/audit/types.js';
import { FakeLicenseDb } from './fakeLicenseDb.js';

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ADMIN_ID = '22222222-2222-2222-2222-222222222222';

interface RecordedEvent {
  eventType: string;
  details: Record<string, unknown>;
}

class RecordingAuditLogger implements AuditLoggerLike {
  public readonly events: RecordedEvent[] = [];
  public throwNext: Error | null = null;

  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    if (this.throwNext) {
      const e = this.throwNext;
      this.throwNext = null;
      throw e;
    }
    this.events.push({ eventType, details: { ...details } });
  }
}

function machineWith(
  db: FakeLicenseDb,
  audit: RecordingAuditLogger,
  opts?: { now?: Date; cycleIds?: string[] }
): LicenseStateMachine {
  const now = opts?.now ?? new Date('2025-03-01T00:00:00.000Z');
  const cycleIds = opts?.cycleIds ?? ['cycle-aaaa', 'cycle-bbbb'];
  let i = 0;
  return new LicenseStateMachine({
    db,
    clock: () => now,
    newCycleId: () => {
      const v = cycleIds[i] ?? `cycle-${i}`;
      i += 1;
      return v;
    },
    auditLogger: audit
  });
}

let db: FakeLicenseDb;
let audit: RecordingAuditLogger;

beforeEach(() => {
  db = new FakeLicenseDb();
  audit = new RecordingAuditLogger();
});

describe('assignFreeOnSignup audit emission', () => {
  it('emits free_plan_granted exactly once on the first assignment', async () => {
    const m = machineWith(db, audit);
    await m.assignFreeOnSignup(USER_ID);
    const granted = audit.events.filter((e) => e.eventType === 'free_plan_granted');
    expect(granted).toHaveLength(1);
    expect(granted[0]!.details).toEqual({ userId: USER_ID });
  });

  it('does not re-emit free_plan_granted on idempotent reassignments', async () => {
    const m = machineWith(db, audit);
    await m.assignFreeOnSignup(USER_ID);
    await m.assignFreeOnSignup(USER_ID);
    const granted = audit.events.filter((e) => e.eventType === 'free_plan_granted');
    expect(granted).toHaveLength(1);
  });
});

describe('upgradeToPaid audit emission', () => {
  it('emits paid_plan_upgraded then admin_action with actorAdminId (Req 16.7)', async () => {
    const now = new Date('2025-03-01T12:34:56.000Z');
    const m = machineWith(db, audit, { now, cycleIds: ['cycle-001'] });
    await m.assignFreeOnSignup(USER_ID);
    audit.events.length = 0; // Drop the free_plan_granted from setup.

    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    const types = audit.events.map((e) => e.eventType);
    expect(types).toEqual(['paid_plan_upgraded', 'admin_action']);

    expect(audit.events[0]!.details).toEqual({
      userId: USER_ID,
      paidStartAt: now.toISOString(),
      paidExpireAt: new Date(now.getTime() + PAID_PLAN_DURATION_MS).toISOString(),
      paidCycleId: 'cycle-001',
      actorAdminId: ADMIN_ID
    });
    expect(audit.events[1]!.details).toEqual({
      actorAdminId: ADMIN_ID,
      userId: USER_ID,
      action: 'paid_plan_upgraded'
    });
  });
});

describe('revokePaid audit emission', () => {
  it('emits paid_plan_revoked then admin_action with actorAdminId', async () => {
    const m = machineWith(db, audit);
    await m.assignFreeOnSignup(USER_ID);
    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });
    audit.events.length = 0;

    await m.revokePaid({ userId: USER_ID, actorAdminId: ADMIN_ID });

    const types = audit.events.map((e) => e.eventType);
    expect(types).toEqual(['paid_plan_revoked', 'admin_action']);
    expect(audit.events[0]!.details).toEqual({
      userId: USER_ID,
      actorAdminId: ADMIN_ID
    });
    expect(audit.events[1]!.details).toEqual({
      actorAdminId: ADMIN_ID,
      userId: USER_ID,
      action: 'paid_plan_revoked'
    });
  });
});

describe('expirePaid audit emission', () => {
  it('emits paid_plan_expired with the pre-transition paidExpireAt', async () => {
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    const m = machineWith(db, audit, { now: upgradeAt });
    await m.assignFreeOnSignup(USER_ID);
    const upgraded = await m.upgradeToPaid({
      userId: USER_ID,
      actorAdminId: ADMIN_ID
    });
    audit.events.length = 0;

    const expireAt = new Date(upgradeAt.getTime() + PAID_PLAN_DURATION_MS + 1_000);
    const expirer = new LicenseStateMachine({
      db,
      clock: () => expireAt,
      auditLogger: audit
    });
    await expirer.expirePaid(USER_ID);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]!.eventType).toBe('paid_plan_expired');
    expect(audit.events[0]!.details).toEqual({
      userId: USER_ID,
      paidExpireAt: upgraded.paidExpireAt
    });
  });
});

describe('renewPaid audit emission', () => {
  it('emits paid_plan_upgraded with reason renewed', async () => {
    const upgradeAt = new Date('2025-03-01T00:00:00.000Z');
    const m = machineWith(db, audit, {
      now: upgradeAt,
      cycleIds: ['cycle-A', 'cycle-B']
    });
    await m.assignFreeOnSignup(USER_ID);
    await m.upgradeToPaid({ userId: USER_ID, actorAdminId: ADMIN_ID });
    audit.events.length = 0;

    const renewAt = new Date(upgradeAt.getTime() + PAID_PLAN_DURATION_MS - 1000);
    const renewer = new LicenseStateMachine({
      db,
      clock: () => renewAt,
      newCycleId: () => 'cycle-B',
      auditLogger: audit
    });
    const renewed = await renewer.renewPaid(USER_ID);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]!.eventType).toBe('paid_plan_upgraded');
    expect(audit.events[0]!.details).toEqual({
      userId: USER_ID,
      paidStartAt: renewed.paidStartAt,
      paidExpireAt: renewed.paidExpireAt,
      paidCycleId: renewed.paidCycleId,
      reason: 'renewed'
    });
  });
});

describe('audit failure isolation', () => {
  it('does not break the license transition when the audit logger throws', async () => {
    const m = machineWith(db, audit);
    audit.throwNext = new Error('audit_db_down');
    const state = await m.assignFreeOnSignup(USER_ID);
    expect(state.plan).toBe('Free_Plan');
    expect(state.status).toBe('active');
    // The throw was swallowed; subsequent emits proceed normally.
    expect(audit.events).toHaveLength(0);
  });

  it('still commits an upgrade even if the audit insert fails', async () => {
    const m = machineWith(db, audit);
    await m.assignFreeOnSignup(USER_ID);
    audit.events.length = 0;
    audit.throwNext = new Error('audit_db_down');

    const state = await m.upgradeToPaid({
      userId: USER_ID,
      actorAdminId: ADMIN_ID
    });
    expect(state.plan).toBe('Paid_Plan');
    // The first emit threw; the second still runs because the helper
    // swallows per-call errors.
    const types = audit.events.map((e) => e.eventType);
    expect(types).toEqual(['admin_action']);
  });
});
