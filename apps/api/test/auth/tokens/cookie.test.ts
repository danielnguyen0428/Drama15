import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  JwksKeyset,
  REFRESH_COOKIE_FLAGS,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_SECONDS,
  TokenService,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import { FakeRefreshDb } from './fakeRefreshDb.js';

function makeService(): TokenService {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  const key: TokenSigningKey = {
    kid: 'k1',
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    publicKeyPem: publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString()
  };
  return new TokenService({
    keyset: new JwksKeyset({ keys: [key] }),
    db: new FakeRefreshDb()
  });
}

describe('refresh cookie attributes (Requirement 13.7)', () => {
  it('exposes the canonical hardened flags', () => {
    const svc = makeService();
    const flags = svc.cookieAttributes();
    expect(flags).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: 'Strict',
      path: '/auth',
      maxAge: REFRESH_TOKEN_TTL_SECONDS
    });
    expect(flags.maxAge).toBe(7 * 24 * 60 * 60);
  });

  it('cookie name is __Host-refresh', () => {
    expect(REFRESH_COOKIE_NAME).toBe('__Host-refresh');
  });

  it('returned attributes are frozen', () => {
    const svc = makeService();
    const flags = svc.cookieAttributes();
    expect(Object.isFrozen(flags)).toBe(true);
    expect(() => {
      // Cast to any to force a runtime mutation attempt; in strict
      // mode (vitest enables it) this should throw rather than
      // silently no-op.
      (flags as unknown as { maxAge: number }).maxAge = 1;
    }).toThrow();
  });

  it('module-level REFRESH_COOKIE_FLAGS is also frozen', () => {
    expect(Object.isFrozen(REFRESH_COOKIE_FLAGS)).toBe(true);
  });
});
