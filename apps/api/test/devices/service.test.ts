import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeviceConstraintService,
  DeviceServiceError,
  type DeviceDb,
  type UpsertDeviceArgs,
  type MarkDeviceRevokedArgs,
  type DeviceContext
} from '../../src/devices/index.js';
import type { DeviceRecord } from '@drama15/contracts';

/**
 * Hand-rolled in-memory `DeviceDb`. We deliberately avoid `vi.mock` /
 * jest mocks here because the device service is a pure data shuffle
 * and the fake doubles as a behavioural spec for the production
 * `PgDeviceDb`.
 *
 * Internal state:
 *   - `devices[user][fp]`         — current device row (active / revoked)
 *   - `freeOwners[fp]`            — userId currently bound to a Free_Plan
 *                                    fingerprint, or undefined
 *   - `activeSessions[user]`      — number of NOT-revoked refresh tokens
 *   - `openTokens[user][fp]`      — number of open tokens for a FP, used
 *                                    to verify `markDeviceRevoked`
 *                                    decrements them properly
 */
class FakeDeviceDb implements DeviceDb {
  public devices = new Map<string, Map<string, DeviceRecord>>();
  public freeOwners = new Map<string, string>();
  public activeSessions = new Map<string, number>();
  public openTokens = new Map<string, Map<string, number>>();

  /** Test helper — seed an active Free fingerprint binding. */
  seedFreeOwner(fp: string, userId: string): void {
    this.freeOwners.set(fp, userId);
  }

  /** Test helper — set the active session count for a user. */
  seedActiveSessions(userId: string, n: number): void {
    this.activeSessions.set(userId, n);
  }

  /** Test helper — seed an existing device row (e.g. from a prior login). */
  seedDevice(userId: string, record: DeviceRecord): void {
    let bag = this.devices.get(userId);
    if (!bag) {
      bag = new Map();
      this.devices.set(userId, bag);
    }
    bag.set(record.fingerprint, record);
  }

  /** Test helper — seed N open refresh tokens for `(user, fp)`. */
  seedOpenTokens(userId: string, fingerprint: string, n: number): void {
    let bag = this.openTokens.get(userId);
    if (!bag) {
      bag = new Map();
      this.openTokens.set(userId, bag);
    }
    bag.set(fingerprint, n);
  }

  async findActiveFreeFingerprintOwner(
    fingerprint: string
  ): Promise<{ userId: string } | null> {
    const owner = this.freeOwners.get(fingerprint);
    return owner ? { userId: owner } : null;
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.activeSessions.get(userId) ?? 0;
  }

  async upsertDevice(args: UpsertDeviceArgs): Promise<void> {
    let bag = this.devices.get(args.userId);
    if (!bag) {
      bag = new Map();
      this.devices.set(args.userId, bag);
    }
    const existing = bag.get(args.fingerprint);
    const isoNow = args.now.toISOString();
    const record: DeviceRecord = {
      fingerprint: args.fingerprint,
      firstSeen: existing ? existing.firstSeen : isoNow,
      lastSeen: isoNow,
      lastIp: args.ip,
      ...(args.country !== undefined
        ? { lastCountry: args.country }
        : existing?.lastCountry !== undefined
          ? { lastCountry: existing.lastCountry }
          : {}),
      status: 'active'
    };
    bag.set(args.fingerprint, record);
  }

  async listDevices(userId: string): Promise<DeviceRecord[]> {
    const bag = this.devices.get(userId);
    if (!bag) return [];
    return [...bag.values()].sort((a, b) =>
      a.lastSeen < b.lastSeen ? 1 : a.lastSeen > b.lastSeen ? -1 : 0
    );
  }

  async markDeviceRevoked(args: MarkDeviceRevokedArgs): Promise<boolean> {
    const bag = this.devices.get(args.userId);
    const existing = bag?.get(args.fingerprint);
    if (!bag || !existing) {
      return false;
    }
    bag.set(args.fingerprint, { ...existing, status: 'revoked' });

    // Drain any open refresh tokens for this (user, fp).
    const tokens = this.openTokens.get(args.userId);
    if (tokens) tokens.set(args.fingerprint, 0);

    return true;
  }
}

const FIXED_NOW = new Date('2025-03-09T12:34:56.789Z');

function makeService(db: FakeDeviceDb): DeviceConstraintService {
  return new DeviceConstraintService({ db, clock: () => FIXED_NOW });
}

function freeCtx(over: Partial<DeviceContext> = {}): DeviceContext {
  return {
    userId: 'user-free-1',
    fingerprint: 'fp-A',
    ip: '198.51.100.10',
    country: 'VN',
    plan: 'Free_Plan',
    ...over
  };
}

function paidCtx(over: Partial<DeviceContext> = {}): DeviceContext {
  return {
    userId: 'user-paid-1',
    fingerprint: 'fp-P',
    ip: '203.0.113.42',
    country: 'JP',
    plan: 'Paid_Plan',
    ...over
  };
}

describe('DeviceConstraintService.enforceLoginConstraints — Free_Plan', () => {
  let db: FakeDeviceDb;
  let svc: DeviceConstraintService;

  beforeEach(() => {
    db = new FakeDeviceDb();
    svc = makeService(db);
  });

  it('allows a brand-new fingerprint and lets recordHeartbeat persist it', async () => {
    const ctx = freeCtx();
    await expect(svc.enforceLoginConstraints(ctx)).resolves.toBeUndefined();

    await svc.recordHeartbeat(ctx);

    const list = await svc.listDevicesFor(ctx.userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      fingerprint: 'fp-A',
      lastIp: '198.51.100.10',
      lastCountry: 'VN',
      lastSeen: FIXED_NOW.toISOString(),
      firstSeen: FIXED_NOW.toISOString(),
      status: 'active'
    });
  });

  it('rejects when the fingerprint is already bound to another active Free user (Req 2.3, 2.4)', async () => {
    db.seedFreeOwner('fp-shared', 'someone-else');
    const ctx = freeCtx({ fingerprint: 'fp-shared' });

    await expect(svc.enforceLoginConstraints(ctx)).rejects.toMatchObject({
      code: 'free_plan_device_already_used'
    });
    await expect(svc.enforceLoginConstraints(ctx)).rejects.toBeInstanceOf(
      DeviceServiceError
    );
  });

  it('allows the SAME user to log back in on their own Free fingerprint', async () => {
    db.seedFreeOwner('fp-A', 'user-free-1');
    db.seedActiveSessions('user-free-1', 0);
    await expect(svc.enforceLoginConstraints(freeCtx())).resolves.toBeUndefined();
  });

  it('rejects when the user already has 1 active session (Req 4.2)', async () => {
    db.seedActiveSessions('user-free-1', 1);
    await expect(svc.enforceLoginConstraints(freeCtx())).rejects.toMatchObject({
      code: 'device_limit_reached'
    });
  });
});

describe('DeviceConstraintService.enforceLoginConstraints — Paid_Plan', () => {
  let db: FakeDeviceDb;
  let svc: DeviceConstraintService;

  beforeEach(() => {
    db = new FakeDeviceDb();
    svc = makeService(db);
  });

  it.each([0, 1, 2])(
    'succeeds when the user already has %i active sessions',
    async (n) => {
      db.seedActiveSessions('user-paid-1', n);
      await expect(svc.enforceLoginConstraints(paidCtx())).resolves.toBeUndefined();
    }
  );

  it('rejects with device_limit_reached at 3 active sessions (Req 4.3)', async () => {
    db.seedActiveSessions('user-paid-1', 3);
    await expect(svc.enforceLoginConstraints(paidCtx())).rejects.toMatchObject({
      code: 'device_limit_reached'
    });
  });

  it('does NOT consult the Free-fingerprint owner for Paid logins', async () => {
    // A Free_Plan user owns fp-shared; a Paid login on the same FP is
    // legal because the constraint is only on Free_Plan accounts.
    db.seedFreeOwner('fp-shared', 'someone-else');
    db.seedActiveSessions('user-paid-1', 0);
    await expect(
      svc.enforceLoginConstraints(paidCtx({ fingerprint: 'fp-shared' }))
    ).resolves.toBeUndefined();
  });
});

describe('DeviceConstraintService.recordHeartbeat', () => {
  it('uses the injected clock so timestamps are deterministic', async () => {
    const db = new FakeDeviceDb();
    const t1 = new Date('2025-03-09T00:00:00Z');
    const t2 = new Date('2025-03-09T01:00:00Z');
    let clockValue = t1;
    const svc = new DeviceConstraintService({
      db,
      clock: () => clockValue
    });

    await svc.recordHeartbeat(freeCtx());
    clockValue = t2;
    await svc.recordHeartbeat(freeCtx());

    const list = await svc.listDevicesFor('user-free-1');
    expect(list).toHaveLength(1);
    expect(list[0]!.firstSeen).toBe(t1.toISOString());
    expect(list[0]!.lastSeen).toBe(t2.toISOString());
  });

  it('preserves the existing country when the heartbeat omits one', async () => {
    const db = new FakeDeviceDb();
    const svc = makeService(db);

    await svc.recordHeartbeat(freeCtx({ country: 'VN' }));
    await svc.recordHeartbeat(freeCtx({ country: undefined }));

    const list = await svc.listDevicesFor('user-free-1');
    expect(list[0]!.lastCountry).toBe('VN');
  });
});

describe('DeviceConstraintService.listDevicesFor', () => {
  it('returns rows sorted by lastSeen desc (Req 4.6)', async () => {
    const db = new FakeDeviceDb();
    db.seedDevice('user-1', {
      fingerprint: 'fp-old',
      firstSeen: '2025-01-01T00:00:00.000Z',
      lastSeen: '2025-01-01T00:00:00.000Z',
      lastIp: '198.51.100.10',
      status: 'active'
    });
    db.seedDevice('user-1', {
      fingerprint: 'fp-recent',
      firstSeen: '2025-03-09T11:00:00.000Z',
      lastSeen: '2025-03-09T11:00:00.000Z',
      lastIp: '198.51.100.11',
      status: 'active'
    });
    db.seedDevice('user-1', {
      fingerprint: 'fp-mid',
      firstSeen: '2025-02-15T00:00:00.000Z',
      lastSeen: '2025-02-15T00:00:00.000Z',
      lastIp: '198.51.100.12',
      status: 'revoked'
    });

    const svc = makeService(db);
    const list = await svc.listDevicesFor('user-1');
    expect(list.map((d) => d.fingerprint)).toEqual(['fp-recent', 'fp-mid', 'fp-old']);
  });

  it('returns an empty list for a user with no devices', async () => {
    const svc = makeService(new FakeDeviceDb());
    expect(await svc.listDevicesFor('ghost')).toEqual([]);
  });
});

describe('DeviceConstraintService.removeDevice', () => {
  let db: FakeDeviceDb;
  let svc: DeviceConstraintService;

  beforeEach(() => {
    db = new FakeDeviceDb();
    svc = makeService(db);
  });

  it('marks a known device revoked and revokes its open refresh tokens (Req 4.7)', async () => {
    db.seedDevice('user-1', {
      fingerprint: 'fp-A',
      firstSeen: '2025-03-09T00:00:00.000Z',
      lastSeen: '2025-03-09T11:00:00.000Z',
      lastIp: '198.51.100.10',
      status: 'active'
    });
    db.seedOpenTokens('user-1', 'fp-A', 1);

    await expect(
      svc.removeDevice({ userId: 'user-1', fingerprint: 'fp-A' })
    ).resolves.toBeUndefined();

    const [row] = await svc.listDevicesFor('user-1');
    expect(row!.status).toBe('revoked');
    expect(db.openTokens.get('user-1')!.get('fp-A')).toBe(0);
  });

  it('throws unknown_device when the fingerprint is not registered for the user', async () => {
    db.seedDevice('user-1', {
      fingerprint: 'fp-known',
      firstSeen: '2025-03-09T00:00:00.000Z',
      lastSeen: '2025-03-09T00:00:00.000Z',
      lastIp: '198.51.100.10',
      status: 'active'
    });

    await expect(
      svc.removeDevice({ userId: 'user-1', fingerprint: 'fp-missing' })
    ).rejects.toMatchObject({ code: 'unknown_device' });
    await expect(
      svc.removeDevice({ userId: 'other-user', fingerprint: 'fp-known' })
    ).rejects.toMatchObject({ code: 'unknown_device' });
  });

  it('is idempotent: re-removing an already-revoked device does not throw', async () => {
    db.seedDevice('user-1', {
      fingerprint: 'fp-A',
      firstSeen: '2025-03-09T00:00:00.000Z',
      lastSeen: '2025-03-09T11:00:00.000Z',
      lastIp: '198.51.100.10',
      status: 'active'
    });
    await svc.removeDevice({ userId: 'user-1', fingerprint: 'fp-A' });
    // Second call must not raise — the user removed the device twice
    // (e.g. clicked "Sign out" on two tabs); the row is still there.
    await expect(
      svc.removeDevice({ userId: 'user-1', fingerprint: 'fp-A' })
    ).resolves.toBeUndefined();
  });
});
