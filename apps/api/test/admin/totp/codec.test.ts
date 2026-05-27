import { describe, it, expect } from 'vitest';
import { base32Encode, base32Decode } from '../../../src/admin/totp/index.js';

/**
 * Round-trip tests for the RFC 4648 base32 codec used to format /
 * parse TOTP shared secrets. Coverage focuses on:
 *
 *   - byte lengths that are NOT multiples of 5 (encoding ends with
 *     fractional bits, decoding has to drop the padding zeroes);
 *   - tolerant decoding (lower-case input, embedded whitespace,
 *     trailing `=` padding produced by other libraries);
 *   - rejection of out-of-alphabet characters.
 *
 * Validates: Requirement 16.1 (encoding format used by enrolment).
 */

describe('base32 codec round-trip', () => {
  it.each([
    ['empty', Buffer.alloc(0)],
    ['1 byte', Buffer.from([0xff])],
    ['2 bytes', Buffer.from([0x00, 0x01])],
    ['3 bytes', Buffer.from([0xde, 0xad, 0xbe])],
    ['4 bytes', Buffer.from([0xde, 0xad, 0xbe, 0xef])],
    // 5 bytes — exact group boundary, no fractional bits.
    ['5 bytes (group boundary)', Buffer.from([0x00, 0x44, 0x32, 0x14, 0xc7])],
    // RFC 6238 reference TOTP secret (20 bytes of ASCII '1'..'0').
    ['20 bytes (RFC 6238 secret)', Buffer.from('12345678901234567890', 'ascii')]
  ])('round-trips %s', (_label, input) => {
    const encoded = base32Encode(input);
    expect(encoded).toMatch(/^[A-Z2-7]*$/u);
    const decoded = base32Decode(encoded);
    expect(decoded.equals(input)).toBe(true);
  });
});

describe('base32 codec — tolerant decoding', () => {
  it('decodes upper- and lower-case identically', () => {
    const upper = 'JBSWY3DPEHPK3PXP';
    const lower = upper.toLowerCase();
    const a = base32Decode(upper);
    const b = base32Decode(lower);
    expect(a.equals(b)).toBe(true);
  });

  it('strips ASCII whitespace from the input', () => {
    const clean = base32Decode('JBSWY3DPEHPK3PXP');
    const messy = base32Decode('JBSW Y3DP\tEHPK\n3PXP');
    expect(messy.equals(clean)).toBe(true);
  });

  it('strips trailing `=` padding', () => {
    // 1 byte (0xff) base32-encodes to "74" (or "74======" with padding).
    expect(base32Decode('74').equals(Buffer.from([0xff]))).toBe(true);
    expect(base32Decode('74======').equals(Buffer.from([0xff]))).toBe(true);
  });

  it('produces no padding on output', () => {
    expect(base32Encode(Buffer.from([0xff]))).not.toMatch(/=/u);
  });
});

describe('base32 codec — error path', () => {
  it('throws on an out-of-alphabet character', () => {
    expect(() => base32Decode('JBSWY3DPEHPK3PX!')).toThrow(/invalid character/u);
  });

  it('throws on a digit outside [2,7]', () => {
    // 0, 1, 8, 9 are not part of the RFC 4648 base32 alphabet.
    expect(() => base32Decode('JBSWY3DP1HPK3PXP')).toThrow(/invalid character/u);
  });
});
