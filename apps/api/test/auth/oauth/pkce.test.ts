import { describe, expect, it } from 'vitest';
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generateNonce,
  generateState
} from '../../../src/auth/oauth/index.js';

/**
 * The unreserved set per RFC 7636 §4.1: `[A-Za-z0-9-._~]`. base64url
 * emits a strict subset (`[A-Za-z0-9-_]`) so these regexes also serve
 * as a lower-bound charset assertion.
 */
const UNRESERVED_RE = /^[A-Za-z0-9\-._~]+$/;

describe('computeCodeChallenge', () => {
  it('matches the RFC 7636 Appendix B example verifier/challenge pair', () => {
    // From RFC 7636 Appendix B "Example for the S256 code_challenge_method".
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const expectedChallenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    expect(computeCodeChallenge(verifier)).toBe(expectedChallenge);
  });

  it('is deterministic for the same verifier', () => {
    const v = generateCodeVerifier();
    expect(computeCodeChallenge(v)).toBe(computeCodeChallenge(v));
  });
});

describe('generateCodeVerifier', () => {
  it('returns a string of at least 43 characters from the unreserved set', () => {
    const v = generateCodeVerifier();
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
    expect(UNRESERVED_RE.test(v)).toBe(true);
  });

  it('produces different values across calls (entropy)', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 256; i++) {
      samples.add(generateCodeVerifier());
    }
    // 256 collisions from a 384-bit space is astronomically unlikely;
    // a single duplicate would indicate a real bug.
    expect(samples.size).toBe(256);
  });
});

describe('generateState / generateNonce', () => {
  it('emit unreserved-set strings of non-trivial length', () => {
    const s = generateState();
    const n = generateNonce();
    expect(UNRESERVED_RE.test(s)).toBe(true);
    expect(UNRESERVED_RE.test(n)).toBe(true);
    // 32 bytes → 43 base64url characters with padding stripped.
    expect(s.length).toBeGreaterThanOrEqual(43);
    expect(n.length).toBeGreaterThanOrEqual(43);
  });

  it('are unique across many calls', () => {
    const states = new Set<string>();
    const nonces = new Set<string>();
    for (let i = 0; i < 256; i++) {
      states.add(generateState());
      nonces.add(generateNonce());
    }
    expect(states.size).toBe(256);
    expect(nonces.size).toBe(256);
  });
});
