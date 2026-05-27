import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  FORBIDDEN_KEYS,
  HASH_PREFIX_LEN,
  hashSensitiveFields,
  redactDetails,
  truncateHash
} from '../../src/audit/redaction.js';
import { AuditError } from '../../src/audit/types.js';

/**
 * Reference implementation of the truncated SHA-256 used by the audit
 * layer. Computing the expected value here (rather than hard-coding
 * one) keeps the test self-documenting: if the hash function or the
 * truncation length ever changes, this expectation moves with it.
 */
function expectedTruncated(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, HASH_PREFIX_LEN);
}

describe('truncateHash', () => {
  it("returns the first 16 hex chars of sha256(value)", () => {
    // sha256('hello') = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(truncateHash('hello')).toBe('2cf24dba5fb0a30e');
    expect(truncateHash('hello')).toBe(expectedTruncated('hello'));
    expect(truncateHash('hello')).toHaveLength(HASH_PREFIX_LEN);
  });

  it('produces hex output of length 16 for any input', () => {
    for (const input of ['', 'a', 'user@example.com', '🔥 raw secret 🔥', 'x'.repeat(10_000)]) {
      const out = truncateHash(input);
      expect(out).toHaveLength(HASH_PREFIX_LEN);
      expect(out).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('rejects non-string input', () => {
    // @ts-expect-error — runtime guard
    expect(() => truncateHash(123)).toThrow(TypeError);
  });
});

describe('redactDetails — forbidden keys', () => {
  for (const key of FORBIDDEN_KEYS) {
    it(`throws AuditError('forbidden_field') when "${key}" appears at the top level`, () => {
      expect(() => redactDetails({ [key]: 'value' })).toThrowError(AuditError);
      try {
        redactDetails({ [key]: 'value' });
      } catch (e) {
        expect(e).toBeInstanceOf(AuditError);
        expect((e as AuditError).code).toBe('forbidden_field');
      }
    });

    it(`throws AuditError('forbidden_field') when "${key}" is nested deeply`, () => {
      const payload = {
        a: {
          b: {
            c: { [key]: 'value' }
          }
        }
      };
      expect(() => redactDetails(payload)).toThrowError(AuditError);
    });

    it(`throws AuditError('forbidden_field') when "${key}" appears inside an array`, () => {
      const payload = { arr: [{ [key]: 'value' }] };
      expect(() => redactDetails(payload)).toThrowError(AuditError);
    });
  }

  it('does NOT throw when forbidden values appear under safe keys', () => {
    // Only the literal forbidden KEYS are rejected, not values that
    // happen to look like tokens. This matches the DB CHECK exactly.
    const out = redactDetails({ note: 'access_token=abc' });
    expect(out).toEqual({ note: 'access_token=abc' });
  });
});

describe('redactDetails — hash truncation', () => {
  it('truncates *_hash keys whose value is longer than 16 chars', () => {
    const fullHash = 'a'.repeat(64);
    const out = redactDetails({
      email_hash: fullHash,
      token_hash: fullHash,
      fingerprint_hash: fullHash,
      ip_hash: fullHash
    });
    expect(out.email_hash).toBe('a'.repeat(16));
    expect(out.token_hash).toBe('a'.repeat(16));
    expect(out.fingerprint_hash).toBe('a'.repeat(16));
    expect(out.ip_hash).toBe('a'.repeat(16));
  });

  it('leaves *_hash values <= 16 chars untouched', () => {
    const out = redactDetails({ email_hash: 'short' });
    expect(out.email_hash).toBe('short');
  });

  it('only truncates string values under *_hash keys', () => {
    const out = redactDetails({ email_hash: 12345 });
    expect(out.email_hash).toBe(12345);
  });
});

describe('redactDetails — pass-through', () => {
  it('passes through normal keys unchanged', () => {
    const input = {
      userId: 'u-1',
      ip: '203.0.113.7',
      browserLocale: 'vi',
      retryAfterSeconds: 30,
      flags: ['integrity', 'review'],
      nested: { reason: 'rate_limited', count: 99 }
    };
    expect(redactDetails(input)).toEqual(input);
  });

  it('does not mutate the input', () => {
    const input = { email_hash: 'a'.repeat(64), nested: { v: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    redactDetails(input);
    expect(input).toEqual(snapshot);
  });

  it('rejects non-object inputs', () => {
    // @ts-expect-error — runtime guard
    expect(() => redactDetails(null)).toThrow(TypeError);
    // @ts-expect-error — runtime guard
    expect(() => redactDetails([])).toThrow(TypeError);
    // @ts-expect-error — runtime guard
    expect(() => redactDetails('string')).toThrow(TypeError);
  });

  it('handles cycles without infinite recursion', () => {
    const cyclic: Record<string, unknown> = { a: 1 };
    cyclic.self = cyclic;
    expect(() => redactDetails(cyclic)).not.toThrow();
  });
});

describe('hashSensitiveFields', () => {
  it("replaces 'email' with 'email_hash' (16 hex chars) and removes the original", () => {
    const out = hashSensitiveFields({ email: 'user@example.com' }, { hashKeys: ['email'] });
    expect(out).not.toHaveProperty('email');
    expect(out.email_hash).toBe(expectedTruncated('user@example.com'));
    expect(out.email_hash).toHaveLength(HASH_PREFIX_LEN);
    expect(out.email_hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('uses default hashKeys when none are provided', () => {
    const out = hashSensitiveFields({
      email: 'a@b.com',
      fingerprint: 'fp-1',
      access_token_jti: 'jti-1',
      keep: 'me'
    });
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('fingerprint');
    expect(out).not.toHaveProperty('access_token_jti');
    expect(out.email_hash).toBe(expectedTruncated('a@b.com'));
    expect(out.fingerprint_hash).toBe(expectedTruncated('fp-1'));
    expect(out.access_token_jti_hash).toBe(expectedTruncated('jti-1'));
    expect(out.keep).toBe('me');
  });

  it('drops keys whose value is null/undefined', () => {
    const out = hashSensitiveFields(
      { email: null, fingerprint: undefined, keep: 'yes' },
      { hashKeys: ['email', 'fingerprint'] }
    );
    expect(out).not.toHaveProperty('email');
    expect(out).not.toHaveProperty('email_hash');
    expect(out).not.toHaveProperty('fingerprint');
    expect(out).not.toHaveProperty('fingerprint_hash');
    expect(out.keep).toBe('yes');
  });

  it('throws TypeError when a hashed key holds a non-string value', () => {
    expect(() =>
      hashSensitiveFields({ email: 12345 }, { hashKeys: ['email'] })
    ).toThrow(TypeError);
  });

  it('does not mutate the input', () => {
    const input = { email: 'x@y', other: 1 };
    const snapshot = { ...input };
    hashSensitiveFields(input, { hashKeys: ['email'] });
    expect(input).toEqual(snapshot);
  });
});
