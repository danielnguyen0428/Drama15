/**
 * Unit tests for `LogoutService`.
 *
 * Validates: Requirements 1.9, 4.6, 4.7.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { LogoutService } from '../../src/auth/logout.js';
import { DeviceServiceError } from '../../src/devices/types.js';
import type { DeviceConstraintService } from '../../src/devices/service.js';
import {
  hashRefreshToken,
  REFRESH_COOKIE_NAME
} from '../../src/auth/tokens/index.js';

import { FakeRefreshDb } from './tokens/fakeRefreshDb.js';

// ---------------------------------------------------------------------------
// Hand-rolled fakes
// ---------------------------------------------------------------------------

interface RecordedAuditEvent {
  readonly eventType: string;
  readonly details: Readonly<Record<string, unknown>>;
}

class RecordingAuditLogger {
  public readonly events: RecordedAuditEvent[] = [];
  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    this.events.push({ eventType, details });
  }
}

interface RemoveDeviceArgs {
  userId: string;
  fingerprint: string;
}

/**
 * Minimal stand-in for `DeviceConstraintService` — `LogoutService`
 * only ever calls `removeDevice` on it, so we expose just that
 * method (plus the call log the assertions consume). Cast to the
 * full type at construction time so we don't have to widen
 * `LogoutService`'s constructor surface for tests.
 */
class FakeDeviceService {
  public readonly calls: RemoveDeviceArgs[] = [];
  /** When set, the next `removeDevice` call throws this error. */
  public failWith?: DeviceServiceError;

  async removeDevice(args: RemoveDeviceArgs): Promise<void> {
    this.calls.push(args);
    if (this.failWith) {
      throw this.failWith;
    }
  }
}

class FakeLicenseShim {
  public readonly calls: string[] = [];
  /** Return value mirrors the production `bumpTokenEpoch` — bigint. */
  public next: bigint = 1n;
  async bumpTokenEpoch(userId: string): Promise<bigint> {
    this.calls.push(userId);
    const out = this.next;
    this.next = this.next + 1n;
    return out;
  }
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-04-15T12:00:00.000Z');
const RAW_REFRESH = 'raw-refresh-token-abc';
const TOKEN_HASH = hashRefreshToken(RAW_REFRESH);

let tokens: FakeRefreshDb;
let devices: FakeDeviceService;
let license: FakeLicenseShim;
let audit: RecordingAuditLogger;
let svc: LogoutService;

function makeService(): LogoutService {
  return new LogoutService({
    tokens,
    devices: devices as unknown as DeviceConstraintService,
    license,
    auditLogger: audit,
    clock: () => FIXED_NOW
  });
}

beforeEach(() => {
  tokens = new FakeRefreshDb();
  tokens.clockNow = FIXED_NOW;
  devices = new FakeDeviceService();
  license = new FakeLicenseShim();
  audit = new RecordingAuditLogger();
  svc = makeService();
});

/**
 * Seed the fake refresh DB with one active row that matches
 * `TOKEN_HASH`. Used by the happy-path logout test.
 */
async function seedActiveRefreshRow(): Promise<{ id: string }> {
  const result = await tokens.insertRefreshToken({
    userId: 'user-1',
    familyId: 'fam-1',
    tokenHash: TOKEN_HASH,
    deviceFingerprint: 'fp-current',
    issuedAt: new Date(FIXED_NOW.getTime() - 1000),
    expiresAt: new Date(FIXED_NOW.getTime() + 7 * 24 * 60 * 60 * 1000)
  });
  return { id: result.id };
}

// ---------------------------------------------------------------------------
// logoutCurrentSession
// ---------------------------------------------------------------------------

describe('LogoutService.logoutCurrentSession (Req 1.9)', () => {
  it('finds the active token and revokes it with reason "logout"', async () => {
    const { id } = await seedActiveRefreshRow();

    const result = await svc.logoutCurrentSession({
      rawRefreshToken: RAW_REFRESH,
      sessionId: 'sess-1',
      userId: 'user-1',
      fingerprint: 'fp-current',
      ip: '203.0.113.5',
      browserLocale: 'vi'
    });

    expect(tokens.revokeTokens).toHaveLength(1);
    expect(tokens.revokeTokens[0]).toEqual({ id, reason: 'logout' });
    expect(result).toEqual({ clearedCookieName: REFRESH_COOKIE_NAME });
    expect(REFRESH_COOKIE_NAME).toBe('__Host-refresh');
  });

  it('emits a "logout" audit event including the fingerprint, ip, and locale', async () => {
    await seedActiveRefreshRow();

    await svc.logoutCurrentSession({
      rawRefreshToken: RAW_REFRESH,
      sessionId: 'sess-1',
      userId: 'user-1',
      fingerprint: 'fp-current',
      ip: '203.0.113.5',
      browserLocale: 'vi'
    });

    expect(audit.events).toHaveLength(1);
    const ev = audit.events[0]!;
    expect(ev.eventType).toBe('logout');
    expect(ev.details).toMatchObject({
      userId: 'user-1',
      fingerprint: 'fp-current',
      ip: '203.0.113.5',
      browserLocale: 'vi',
      session_id: 'sess-1'
    });
  });

  it('is idempotent on the DB when the token is unknown — no revokeToken call, but cookie + audit still emitted', async () => {
    // Note: NO seedActiveRefreshRow() — the hash lookup will return null.
    const result = await svc.logoutCurrentSession({
      rawRefreshToken: 'never-existed',
      sessionId: 'sess-2',
      userId: 'user-1',
      fingerprint: 'fp-current',
      ip: '203.0.113.5'
    });

    expect(tokens.revokeTokens).toHaveLength(0);
    expect(result).toEqual({ clearedCookieName: REFRESH_COOKIE_NAME });
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]!.eventType).toBe('logout');
  });
});

// ---------------------------------------------------------------------------
// removeDevice
// ---------------------------------------------------------------------------

describe('LogoutService.removeDevice (Req 4.6, 4.7)', () => {
  it('calls devices.removeDevice and license.bumpTokenEpoch exactly once, in that order', async () => {
    const callOrder: string[] = [];

    // Wrap the fakes' methods to capture call order without coupling
    // the assertion to internal ordering of the call-log arrays.
    const origRemove = devices.removeDevice.bind(devices);
    devices.removeDevice = async (args) => {
      callOrder.push('devices.removeDevice');
      await origRemove(args);
    };
    const origBump = license.bumpTokenEpoch.bind(license);
    license.bumpTokenEpoch = async (userId) => {
      callOrder.push('license.bumpTokenEpoch');
      return origBump(userId);
    };

    await svc.removeDevice({
      userId: 'user-1',
      fingerprint: 'fp-other',
      actorIp: '203.0.113.5',
      actorBrowserLocale: 'vi'
    });

    expect(devices.calls).toEqual([
      { userId: 'user-1', fingerprint: 'fp-other' }
    ]);
    expect(license.calls).toEqual(['user-1']);
    expect(callOrder).toEqual([
      'devices.removeDevice',
      'license.bumpTokenEpoch'
    ]);

    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]!.eventType).toBe('logout');
    expect(audit.events[0]!.details).toMatchObject({
      userId: 'user-1',
      fingerprint: 'fp-other',
      ip: '203.0.113.5',
      browserLocale: 'vi',
      removed_device: true
    });
  });

  it('propagates DeviceServiceError("unknown_device") without bumping token_epoch and without emitting audit', async () => {
    devices.failWith = new DeviceServiceError('unknown_device');

    await expect(
      svc.removeDevice({
        userId: 'user-1',
        fingerprint: 'fp-ghost'
      })
    ).rejects.toMatchObject({
      name: 'DeviceServiceError',
      code: 'unknown_device'
    });

    // Device service was invoked once; epoch must NOT have been bumped.
    expect(devices.calls).toEqual([
      { userId: 'user-1', fingerprint: 'fp-ghost' }
    ]);
    expect(license.calls).toEqual([]);
    // Audit row only fires on success (no session was actually
    // removed; nothing to log a `logout` for).
    expect(audit.events).toHaveLength(0);
  });
});
