/**
 * Unit tests for `src/auth/pkce.ts`.
 *
 * Covers:
 *   - `code_verifier` length and charset per RFC 7636 §4.1.
 *   - `codeChallengeFromVerifier` matches the documented S256 hash for
 *     the canonical RFC 7636 Appendix B vector.
 *   - `state` and `nonce` are cryptographically random (different on
 *     each call) and carry at least 16 bytes of entropy.
 *
 * Validates: Requirements 1.2, 13.6, 13.7, 13.8.
 */

import { describe, it, expect } from 'vitest';
import {
  codeChallengeFromVerifier,
  generateCodeVerifier,
  generateNonce,
  generateState,
} from '../pkce';

/** RFC 7636 unreserved character set: ALPHA / DIGIT / "-" / "." / "_" / "~". */
const UNRESERVED = /^[A-Za-z0-9\-._~]+$/;

/**
 * Estimate the entropy in bytes of a base64url-encoded value. Each
 * base64url character carries 6 bits, so `bytes ≈ ceil(chars * 6 / 8)`.
 */
function base64UrlEntropyBytes(value: string): number {
  return Math.floor((value.length * 6) / 8);
}

describe('generateCodeVerifier', () => {
  it('returns a string within the RFC 7636 length window (43-128 chars)', () => {
    for (let i = 0; i < 64; i++) {
      const verifier = generateCodeVerifier();
      expect(verifier.length).toBeGreaterThanOrEqual(43);
      expect(verifier.length).toBeLessThanOrEqual(128);
    }
  });

  it('returns characters drawn only from the RFC 7636 unreserved set', () => {
    for (let i = 0; i < 64; i++) {
      const verifier = generateCodeVerifier();
      expect(verifier).toMatch(UNRESERVED);
    }
  });

  it('returns a fresh value on each invocation (randomness sanity check)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 32; i++) {
      seen.add(generateCodeVerifier());
    }
    // 32 independent 256-bit values colliding is astronomically unlikely.
    expect(seen.size).toBe(32);
  });
});

describe('codeChallengeFromVerifier', () => {
  it('matches the RFC 7636 Appendix B S256 vector', async () => {
    // From https://datatracker.ietf.org/doc/html/rfc7636#appendix-B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expected = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const challenge = await codeChallengeFromVerifier(verifier);
    expect(challenge).toBe(expected);
  });

  it('produces a 43-character base64url-encoded SHA-256 digest', async () => {
    const verifier = generateCodeVerifier();
    const challenge = await codeChallengeFromVerifier(verifier);
    expect(challenge).toHaveLength(43); // 32 bytes → 43 base64url chars (no padding)
    expect(challenge).toMatch(/^[A-Za-z0-9\-_]+$/);
  });

  it('is deterministic for a fixed verifier', async () => {
    const verifier = 'fixed-verifier-value-1234567890ABCDEFG';
    const a = await codeChallengeFromVerifier(verifier);
    const b = await codeChallengeFromVerifier(verifier);
    expect(a).toBe(b);
  });
});

describe('generateState', () => {
  it('returns a different value on each call', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      seen.add(generateState());
    }
    expect(seen.size).toBe(64);
  });

  it('carries at least 16 bytes (128 bits) of entropy', () => {
    const state = generateState();
    expect(base64UrlEntropyBytes(state)).toBeGreaterThanOrEqual(16);
  });
});

describe('generateNonce', () => {
  it('returns a different value on each call', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      seen.add(generateNonce());
    }
    expect(seen.size).toBe(64);
  });

  it('carries at least 16 bytes (128 bits) of entropy', () => {
    const nonce = generateNonce();
    expect(base64UrlEntropyBytes(nonce)).toBeGreaterThanOrEqual(16);
  });

  it('returns characters drawn only from the base64url alphabet', () => {
    for (let i = 0; i < 32; i++) {
      expect(generateNonce()).toMatch(/^[A-Za-z0-9\-_]+$/);
    }
  });
});
