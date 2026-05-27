import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  signJwtRS256,
  TokenError,
  verifyJwtRS256
} from '../../../src/auth/tokens/index.js';

function makeKeypair() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  };
}

describe('jwt RS256 round-trip', () => {
  const NOW_S = 1_730_000_000;

  it('verifies a token it just signed', () => {
    const { publicKeyPem, privateKeyPem } = makeKeypair();
    const token = signJwtRS256({
      payload: { sub: 'user-1', iat: NOW_S, exp: NOW_S + 900 },
      privateKeyPem,
      kid: 'k1'
    });

    const result = verifyJwtRS256({
      token,
      publicKeyPem,
      nowSeconds: () => NOW_S + 1
    });
    expect(result.header.alg).toBe('RS256');
    expect(result.header.typ).toBe('JWT');
    expect(result.header.kid).toBe('k1');
    expect(result.payload).toMatchObject({ sub: 'user-1', exp: NOW_S + 900 });
  });

  it('throws invalid_signature when the signature segment is tampered', () => {
    const { publicKeyPem, privateKeyPem } = makeKeypair();
    const token = signJwtRS256({
      payload: { sub: 'user-1', iat: NOW_S, exp: NOW_S + 900 },
      privateKeyPem,
      kid: 'k1'
    });

    // Flip a character in the middle of the signature segment.
    // (The last base64url character of an RS256 signature only encodes
    // a few bits, so flipping it can decode to identical bytes; pick
    // the middle to guarantee the signature changes.)
    const lastDot = token.lastIndexOf('.');
    const sigStart = lastDot + 1;
    const midIndex = sigStart + Math.floor((token.length - sigStart) / 2);
    const ch = token.charAt(midIndex);
    const replacement = ch === 'A' ? 'B' : 'A';
    const tampered =
      token.slice(0, midIndex) + replacement + token.slice(midIndex + 1);

    expect.assertions(2);
    try {
      verifyJwtRS256({
        token: tampered,
        publicKeyPem,
        nowSeconds: () => NOW_S + 1
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).code).toBe('invalid_signature');
    }
  });

  it('throws expired when the exp claim is in the past', () => {
    const { publicKeyPem, privateKeyPem } = makeKeypair();
    const token = signJwtRS256({
      payload: { sub: 'user-1', iat: NOW_S - 1000, exp: NOW_S - 100 },
      privateKeyPem,
      kid: 'k1'
    });

    expect.assertions(2);
    try {
      verifyJwtRS256({
        token,
        publicKeyPem,
        nowSeconds: () => NOW_S
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).code).toBe('expired');
    }
  });

  it('throws kid_unknown when the header kid does not match expectedKid', () => {
    const { publicKeyPem, privateKeyPem } = makeKeypair();
    const token = signJwtRS256({
      payload: { sub: 'user-1', iat: NOW_S, exp: NOW_S + 900 },
      privateKeyPem,
      kid: 'other-key'
    });

    expect.assertions(2);
    try {
      verifyJwtRS256({
        token,
        publicKeyPem,
        expectedKid: 'k1',
        nowSeconds: () => NOW_S + 1
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).code).toBe('kid_unknown');
    }
  });

  it('throws malformed when the token has the wrong number of segments', () => {
    const { publicKeyPem } = makeKeypair();
    expect(() =>
      verifyJwtRS256({
        token: 'a.b',
        publicKeyPem,
        nowSeconds: () => NOW_S
      })
    ).toThrow(TokenError);
  });
});
