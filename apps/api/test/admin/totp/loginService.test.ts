import { describe, it, expect, beforeEach } from 'vitest';
import {
  AdminTotpLoginService,
  TotpLoginError,
  TotpSecretVault,
  computeTotp,
  currentCounter,
  type AdminTotpDb,
  type AdminTotpRow,
  type EncryptedSecret
} from '../../../src/admin/totp/index.js';

/**
 * Hand-rolled in-memory `AdminTotpDb`. We deliberately avoid `vi.mock`
 * here because the login service is a thin policy layer and the fake
 * doubles as a behavioural spec for the real `PgAdminTotpDb` once the
 * admin schema lands in task 18.1.
 *
 * Validates: Requirement 16.1 — every admin login must present a valid
 * current TOTP code; missing or wrong codes are rejected.
 */
class FakeAdminTotpDb implements AdminTotpDb {
  private readonly byEmail = new Map<string, AdminTotpRow>();

  seed(email: string, row: AdminTotpRow): void {
    this.byEmail.set(email.toLowerCase(), row);
  }

  async findAdminByEmail(email: string): Promise<AdminTotpRow | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async setAdminTotpSecret(
    userId: string,
    encrypted: EncryptedSecret
  ): Promise<void> {
    for (const [email, row] of this.byEmail) {
      if (row.userId === userId) {
        this.byEmail.set(email, { ...row, totp: encrypted });
        return;
      }
    }
    throw new Error(`FakeAdminTotpDb.setAdminTotpSecret: unknown userId=${userId}`);
  }
}

// 32-byte fixed key for the in-test vault.
const TEST_KEY = Buffer.alloc(32, 0x33);
// 20-byte fixed TOTP secret so we can compute reference codes.
const SHARED_SECRET = Buffer.from('12345678901234567890', 'ascii');
// A pinned wall-clock so the verification window is deterministic.
const FIXED_NOW = new Date('2025-03-09T12:34:56.000Z');

function makeService(opts: {
  db: AdminTotpDb;
  vault: TotpSecretVault;
  clock?: () => Date;
  window?: number;
}): AdminTotpLoginService {
  return new AdminTotpLoginService({
    db: opts.db,
    vault: opts.vault,
    clock: opts.clock ?? (() => FIXED_NOW),
    window: opts.window ?? 1
  });
}

function codeFor(secret: Buffer, atOffsetSeconds = 0): string {
  const at = new Date(FIXED_NOW.getTime() + atOffsetSeconds * 1000);
  return computeTotp({
    secret,
    counter: currentCounter(at)
  });
}

describe('AdminTotpLoginService.verifyAdminLogin', () => {
  let db: FakeAdminTotpDb;
  let vault: TotpSecretVault;
  let svc: AdminTotpLoginService;
  let encryptedSecret: EncryptedSecret;

  beforeEach(() => {
    db = new FakeAdminTotpDb();
    vault = new TotpSecretVault({ encryptionKey: TEST_KEY });
    encryptedSecret = vault.encryptSecret(SHARED_SECRET);
    svc = makeService({ db, vault });
  });

  it('throws admin_required when the email is unknown', async () => {
    await expect(
      svc.verifyAdminLogin({
        email: 'nobody@example.com',
        totpCode: codeFor(SHARED_SECRET)
      })
    ).rejects.toMatchObject({ code: 'admin_required' });
  });

  it('throws admin_required (not user_required) when the role is not admin', async () => {
    db.seed('user@example.com', {
      userId: 'u-1',
      role: 'user',
      totp: encryptedSecret
    });
    await expect(
      svc.verifyAdminLogin({
        email: 'user@example.com',
        totpCode: codeFor(SHARED_SECRET)
      })
    ).rejects.toMatchObject({ code: 'admin_required' });
  });

  it('throws totp_not_enrolled for an admin that has no secret bound', async () => {
    db.seed('admin@example.com', {
      userId: 'u-admin',
      role: 'admin',
      totp: null
    });
    await expect(
      svc.verifyAdminLogin({
        email: 'admin@example.com',
        totpCode: '123456'
      })
    ).rejects.toMatchObject({ code: 'totp_not_enrolled' });
  });

  it('throws totp_required when the code is missing or empty', async () => {
    db.seed('admin@example.com', {
      userId: 'u-admin',
      role: 'admin',
      totp: encryptedSecret
    });
    for (const missing of [undefined, null, '', '   ']) {
      await expect(
        svc.verifyAdminLogin({
          email: 'admin@example.com',
          totpCode: missing as string | null | undefined
        })
      ).rejects.toMatchObject({ code: 'totp_required' });
    }
  });

  it('throws totp_invalid for a wrong code', async () => {
    db.seed('admin@example.com', {
      userId: 'u-admin',
      role: 'admin',
      totp: encryptedSecret
    });
    await expect(
      svc.verifyAdminLogin({
        email: 'admin@example.com',
        totpCode: '000000'
      })
    ).rejects.toMatchObject({ code: 'totp_invalid' });
    await expect(
      svc.verifyAdminLogin({
        email: 'admin@example.com',
        totpCode: '000000'
      })
    ).rejects.toBeInstanceOf(TotpLoginError);
  });

  it('returns the admin profile on a correct current-period code', async () => {
    db.seed('admin@example.com', {
      userId: 'u-admin',
      role: 'admin',
      totp: encryptedSecret
    });
    const result = await svc.verifyAdminLogin({
      email: 'admin@example.com',
      totpCode: codeFor(SHARED_SECRET)
    });
    expect(result).toEqual({
      userId: 'u-admin',
      email: 'admin@example.com',
      role: 'admin',
      totpEnrolled: true
    });
  });

  it('accepts a code from one period in the past (window=1, ±30s drift)', async () => {
    db.seed('admin@example.com', {
      userId: 'u-admin',
      role: 'admin',
      totp: encryptedSecret
    });
    // Code valid 30 s ago — still within the default ±1 period window.
    const driftCode = codeFor(SHARED_SECRET, -30);
    await expect(
      svc.verifyAdminLogin({
        email: 'admin@example.com',
        totpCode: driftCode
      })
    ).resolves.toMatchObject({ role: 'admin' });
  });

  it('rejects a code from three periods in the past (>±60s drift)', async () => {
    db.seed('admin@example.com', {
      userId: 'u-admin',
      role: 'admin',
      totp: encryptedSecret
    });
    // 90 s old — outside the ±1 period window.
    const staleCode = codeFor(SHARED_SECRET, -90);
    await expect(
      svc.verifyAdminLogin({
        email: 'admin@example.com',
        totpCode: staleCode
      })
    ).rejects.toMatchObject({ code: 'totp_invalid' });
  });
});
