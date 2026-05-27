import { describe, it, expect } from 'vitest';
import { TotpSecretVault } from '../../../src/admin/totp/index.js';

/**
 * AES-256-GCM round-trip tests. Coverage:
 *
 *   - Encrypt → decrypt round-trips a 20-byte TOTP secret unchanged.
 *   - Each encryption call uses a fresh 12-byte IV (so the same
 *     plaintext yields a different ciphertext each time).
 *   - Tampering with the auth tag, ciphertext, or IV causes the
 *     decryption to throw — guaranteeing the storage layer cannot
 *     return a silently-corrupted secret.
 *
 * Validates: Requirement 16.1 (TOTP secret stored encrypted, integrity-
 * protected).
 */

// 32-byte fixed key — only used in this unit test; never deploy.
const TEST_KEY = Buffer.alloc(32, 0xa5);

function makeVault(): TotpSecretVault {
  return new TotpSecretVault({ encryptionKey: TEST_KEY });
}

describe('TotpSecretVault — round-trip', () => {
  it('encrypts and decrypts a 20-byte TOTP secret', () => {
    const vault = makeVault();
    const secret = Buffer.from('12345678901234567890', 'ascii');
    const enc = vault.encryptSecret(secret);
    expect(enc.iv).toHaveLength(12);
    expect(enc.tag).toHaveLength(16);
    expect(enc.ciphertext).toHaveLength(secret.length);
    const dec = vault.decryptSecret(enc);
    expect(dec.equals(secret)).toBe(true);
  });

  it('produces a fresh IV on every call (no IV reuse)', () => {
    const vault = makeVault();
    const secret = Buffer.from('abcdefghijklmnopqrst', 'ascii');
    const a = vault.encryptSecret(secret);
    const b = vault.encryptSecret(secret);
    expect(a.iv.equals(b.iv)).toBe(false);
    // Different IV ⇒ different ciphertext for the same plaintext.
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(vault.decryptSecret(a).equals(secret)).toBe(true);
    expect(vault.decryptSecret(b).equals(secret)).toBe(true);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(
      () => new TotpSecretVault({ encryptionKey: Buffer.alloc(16) })
    ).toThrow(/must be 32 bytes/u);
  });
});

describe('TotpSecretVault — tampering detection', () => {
  it('throws when the auth tag has been altered', () => {
    const vault = makeVault();
    const enc = vault.encryptSecret(Buffer.from('aaaaaaaaaaaaaaaaaaaa', 'ascii'));
    const tamperedTag = Buffer.from(enc.tag);
    tamperedTag[0] = (tamperedTag[0]! ^ 0x01) & 0xff;
    expect(() =>
      vault.decryptSecret({ ...enc, tag: tamperedTag })
    ).toThrow();
  });

  it('throws when the ciphertext has been altered', () => {
    const vault = makeVault();
    const enc = vault.encryptSecret(Buffer.from('aaaaaaaaaaaaaaaaaaaa', 'ascii'));
    const tamperedCt = Buffer.from(enc.ciphertext);
    tamperedCt[0] = (tamperedCt[0]! ^ 0x01) & 0xff;
    expect(() =>
      vault.decryptSecret({ ...enc, ciphertext: tamperedCt })
    ).toThrow();
  });

  it('throws when the IV has been altered', () => {
    const vault = makeVault();
    const enc = vault.encryptSecret(Buffer.from('aaaaaaaaaaaaaaaaaaaa', 'ascii'));
    const tamperedIv = Buffer.from(enc.iv);
    tamperedIv[0] = (tamperedIv[0]! ^ 0x01) & 0xff;
    expect(() =>
      vault.decryptSecret({ ...enc, iv: tamperedIv })
    ).toThrow();
  });
});
