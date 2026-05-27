import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  hashRefreshToken,
  JwksKeyset,
  REFRESH_TOKEN_TTL_SECONDS,
  TokenError,
  TokenService,
  type TokenIssuanceContext,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import { FakeRefreshDb } from './fakeRefreshDb.js';

function makeKey(kid: string): TokenSigningKey {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  return {
    kid,
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    publicKeyPem: publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString()
  };
}

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

const BASE_CTX: TokenIssuanceContext = {
  userId: 'user-1',
  email: 'user@example.com',
  sessionId: 'sess-1',
  fingerprint: 'fp-hash',
  epoch: 7
};

let svc: TokenService;
let db: FakeRefreshDb;
let key: TokenSigningKey;

beforeEach(() => {
  key = makeKey('auth-2026-01');
  db = new FakeRefreshDb();
  let counter = 0;
  svc = new TokenService({
    keyset: new JwksKeyset({ keys: [key] }),
    db,
    clock: () => FIXED_NOW,
    newId: () => `id-${++counter}`
  });
});

describe('TokenService.issue', () => {
  it('mints an access token whose accessExpiresInSeconds is exactly 900', async () => {
    const issued = await svc.issue(BASE_CTX);
    expect(issued.accessExpiresInSeconds).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
  });

  it('sets refreshExpiresAt to exactly 7 days after now', async () => {
    const issued = await svc.issue(BASE_CTX);
    const deltaMs = issued.refreshExpiresAt.getTime() - FIXED_NOW.getTime();
    expect(deltaMs).toBe(REFRESH_TOKEN_TTL_SECONDS * 1000);
    expect(deltaMs).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('access token epoch claim mirrors the input epoch', async () => {
    const issued = await svc.issue({ ...BASE_CTX, epoch: 42 });
    const claims = await svc.verifyAccessToken({ token: issued.accessToken });
    expect(claims.epoch).toBe(42);
    expect(claims.sub).toBe(BASE_CTX.userId);
    expect(claims.email).toBe(BASE_CTX.email);
    expect(claims.sid).toBe(BASE_CTX.sessionId);
    expect(claims.fp).toBe(BASE_CTX.fingerprint);
    expect(claims.kid).toBe('auth-2026-01');
    expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('persists the refresh row hashed with the in-band raw token', async () => {
    const issued = await svc.issue(BASE_CTX);
    expect(db.inserts).toHaveLength(1);
    const insert = db.inserts[0]!;
    expect(insert.tokenHash).toBe(hashRefreshToken(issued.refreshToken));
    expect(insert.userId).toBe(BASE_CTX.userId);
    expect(insert.deviceFingerprint).toBe(BASE_CTX.fingerprint);
    expect(insert.familyId).toBe(issued.familyId);
    expect(insert.issuedAt).toEqual(FIXED_NOW);
    expect(insert.expiresAt).toEqual(issued.refreshExpiresAt);
  });

  it('mints a fresh familyId when none is supplied', async () => {
    const a = await svc.issue(BASE_CTX);
    const b = await svc.issue(BASE_CTX);
    expect(a.familyId).not.toBe(b.familyId);
  });

  it('reuses the supplied familyId for a rotation', async () => {
    const issued = await svc.issue({ ...BASE_CTX, familyId: 'fam-existing' });
    expect(issued.familyId).toBe('fam-existing');
    expect(db.inserts[0]!.familyId).toBe('fam-existing');
  });
});

describe('TokenService.verifyAccessToken', () => {
  it('returns the claims when expectedEpoch matches', async () => {
    const issued = await svc.issue(BASE_CTX);
    const claims = await svc.verifyAccessToken({
      token: issued.accessToken,
      expectedEpoch: BASE_CTX.epoch
    });
    expect(claims.epoch).toBe(BASE_CTX.epoch);
  });

  it('throws epoch_mismatch when expectedEpoch differs', async () => {
    const issued = await svc.issue(BASE_CTX);
    expect.assertions(2);
    try {
      await svc.verifyAccessToken({
        token: issued.accessToken,
        expectedEpoch: BASE_CTX.epoch + 1
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).code).toBe('epoch_mismatch');
    }
  });

  it('throws kid_unknown when the token kid is not in the keyset', async () => {
    // Sign a token with an unknown key to simulate a rogue kid.
    const rogue = makeKey('rogue-key');
    const rogueSvc = new TokenService({
      keyset: new JwksKeyset({ keys: [rogue] }),
      db,
      clock: () => FIXED_NOW
    });
    const issued = await rogueSvc.issue(BASE_CTX);

    expect.assertions(2);
    try {
      await svc.verifyAccessToken({ token: issued.accessToken });
    } catch (err) {
      expect(err).toBeInstanceOf(TokenError);
      expect((err as TokenError).code).toBe('kid_unknown');
    }
  });
});
