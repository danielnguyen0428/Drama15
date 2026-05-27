import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  generateRefreshToken,
  hashRefreshToken
} from '../../../src/auth/tokens/index.js';

describe('generateRefreshToken', () => {
  it('produces a base64url string with at least 32 characters', () => {
    const { raw } = generateRefreshToken();
    expect(raw.length).toBeGreaterThanOrEqual(32);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces a different raw value on each call', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) {
      seen.add(generateRefreshToken().raw);
    }
    expect(seen.size).toBe(32);
  });

  it('hash equals sha256(raw) hex', () => {
    const { raw, hash } = generateRefreshToken();
    const expected = createHash('sha256').update(raw, 'utf8').digest('hex');
    expect(hash).toBe(expected);
  });

  it('hashRefreshToken matches the in-band hash', () => {
    const { raw, hash } = generateRefreshToken();
    expect(hashRefreshToken(raw)).toBe(hash);
  });
});
