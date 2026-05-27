import { describe, it, expect } from 'vitest';
import {
  computeTotp,
  currentCounter,
  generateTotpSecret,
  verifyTotp
} from '../../../src/admin/totp/index.js';

/**
 * RFC 6238 reference vectors for the SHA-1 variant.
 *
 * Per RFC 6238 Appendix B the vectors are computed against an ASCII
 * shared secret `"12345678901234567890"` (20 bytes). The 8-digit
 * SHA-1 codes for representative timestamps:
 *
 *   T=        59s          → counter      0x0000000000000001 → 94287082
 *   T= 1111111109s         → counter      0x00000000023523EC → 07081804
 *   T= 1111111111s         → counter      0x00000000023523ED → 14050471
 *   T= 1234567890s         → counter      0x000000000273EF07 → 89005924
 *   T= 2000000000s         → counter      0x0000000003F940AA → 69279037
 *
 * Source: RFC 6238 §A.2 / Appendix B (SHA-1 column).
 *
 * Validates: Requirement 16.1 (admin login depends on RFC-compliant
 * TOTP verification).
 */

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('computeTotp — RFC 6238 SHA-1 reference vectors', () => {
  it.each<[number, string]>([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037']
  ])('T=%i seconds yields code %s', (epochSeconds, expectedCode) => {
    const counter = BigInt(Math.floor(epochSeconds / 30));
    expect(
      computeTotp({ secret: RFC_SECRET, counter, digits: 8 })
    ).toBe(expectedCode);
  });

  it('produces a 6-digit zero-padded code by default', () => {
    const code = computeTotp({ secret: RFC_SECRET, counter: 0n });
    expect(code).toMatch(/^\d{6}$/u);
  });

  it('rejects unsupported digit lengths', () => {
    expect(() =>
      computeTotp({ secret: RFC_SECRET, counter: 0n, digits: 5 })
    ).toThrow(/digits must be in/u);
    expect(() =>
      computeTotp({ secret: RFC_SECRET, counter: 0n, digits: 11 })
    ).toThrow(/digits must be in/u);
  });
});

describe('currentCounter', () => {
  it('uses floor(seconds / period) — 30s default', () => {
    expect(currentCounter(new Date(0))).toBe(0n);
    expect(currentCounter(new Date(29_999))).toBe(0n);
    expect(currentCounter(new Date(30_000))).toBe(1n);
    expect(currentCounter(new Date(59_999))).toBe(1n);
    expect(currentCounter(new Date(60_000))).toBe(2n);
  });

  it('honours a custom period', () => {
    expect(currentCounter(new Date(120_000), 60)).toBe(2n);
  });

  it('rejects a non-positive period', () => {
    expect(() => currentCounter(new Date(0), 0)).toThrow(/period must be > 0/u);
    expect(() => currentCounter(new Date(0), -30)).toThrow(/period must be > 0/u);
  });
});

describe('verifyTotp — drift tolerance', () => {
  // Pin "now" so the verification window is deterministic. T=60s means
  // counter=2 (current); counter=1 covers ±30s of clock skew.
  const NOW = new Date(60_000);

  it('accepts the code for the current counter', () => {
    const code = computeTotp({
      secret: RFC_SECRET,
      counter: currentCounter(NOW)
    });
    expect(
      verifyTotp({ secret: RFC_SECRET, code, now: NOW, window: 1 })
    ).toBe(true);
  });

  it('accepts a code from the previous period (window=1)', () => {
    const code = computeTotp({
      secret: RFC_SECRET,
      counter: currentCounter(NOW) - 1n
    });
    expect(
      verifyTotp({ secret: RFC_SECRET, code, now: NOW, window: 1 })
    ).toBe(true);
  });

  it('accepts a code from the next period (window=1)', () => {
    const code = computeTotp({
      secret: RFC_SECRET,
      counter: currentCounter(NOW) + 1n
    });
    expect(
      verifyTotp({ secret: RFC_SECRET, code, now: NOW, window: 1 })
    ).toBe(true);
  });

  it('rejects a code that is two periods stale (>±30s drift)', () => {
    const code = computeTotp({
      secret: RFC_SECRET,
      counter: currentCounter(NOW) - 2n
    });
    expect(
      verifyTotp({ secret: RFC_SECRET, code, now: NOW, window: 1 })
    ).toBe(false);
  });

  it('rejects malformed input (too short / non-digit)', () => {
    expect(
      verifyTotp({ secret: RFC_SECRET, code: '12345', now: NOW })
    ).toBe(false);
    expect(
      verifyTotp({ secret: RFC_SECRET, code: '12345a', now: NOW })
    ).toBe(false);
  });

  it('with window=0 only accepts the exact current period', () => {
    const center = currentCounter(NOW);
    const ok = computeTotp({ secret: RFC_SECRET, counter: center });
    const drift = computeTotp({ secret: RFC_SECRET, counter: center - 1n });
    expect(
      verifyTotp({ secret: RFC_SECRET, code: ok, now: NOW, window: 0 })
    ).toBe(true);
    expect(
      verifyTotp({ secret: RFC_SECRET, code: drift, now: NOW, window: 0 })
    ).toBe(false);
  });
});

describe('generateTotpSecret', () => {
  it('returns 20 random bytes plus the matching base32 encoding', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a.secret).toHaveLength(20);
    expect(b.secret).toHaveLength(20);
    expect(a.secretBase32).toMatch(/^[A-Z2-7]+$/u);
    // Two independent calls must produce distinct secrets with
    // overwhelming probability — collision space is 2^160.
    expect(a.secret.equals(b.secret)).toBe(false);
  });

  it('round-trips: base32-decoded form equals the raw secret', async () => {
    const { secret, secretBase32 } = generateTotpSecret();
    const { base32Decode } = await import('../../../src/admin/totp/index.js');
    expect(base32Decode(secretBase32).equals(secret)).toBe(true);
  });
});
