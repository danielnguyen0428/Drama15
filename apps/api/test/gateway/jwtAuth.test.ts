/**
 * Unit tests for `JwtAuthMiddleware` and `InMemoryEpochCache`.
 *
 * Validates: Requirements 3.1, 2.8.
 *
 * The tests pin a deterministic clock so the 30-second epoch cache
 * TTL can be exercised without sleeping. The fakes for `TokenService`
 * and `EpochSource` are intentionally tiny — the verification logic
 * lives in `TokenService`, and these tests only assert that the
 * middleware composes the parts correctly.
 */

import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  JwksKeyset,
  TokenService,
  type TokenSigningKey
} from '../../src/auth/tokens/index.js';
import { FakeRefreshDb } from '../auth/tokens/fakeRefreshDb.js';

import {
  DEFAULT_EPOCH_CACHE_TTL_MS,
  InMemoryEpochCache,
  JwtAuthMiddleware,
  UnauthenticatedError,
  type EpochSource
} from '../../src/gateway/jwtAuth.js';

// ---------------------------------------------------------------------------
// Test scaffolding
// ---------------------------------------------------------------------------

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
const USER_ID = 'user-1';
const EMAIL = 'user@example.com';
const SESSION_ID = 'sess-1';
const FINGERPRINT = 'fp-bound';

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

/**
 * Counting `EpochSource` so tests can assert hit/miss behaviour
 * without resorting to mocking libraries.
 */
class FakeEpochSource implements EpochSource {
  public readonly calls: string[] = [];
  public epoch = 7;

  async getCurrentEpoch(userId: string): Promise<number> {
    this.calls.push(userId);
    return this.epoch;
  }
}

let key: TokenSigningKey;
let refreshDb: FakeRefreshDb;
let now: Date;
let tokenService: TokenService;
let epochCache: InMemoryEpochCache;
let epochSource: FakeEpochSource;
let middleware: JwtAuthMiddleware;
let cacheClockMs: number;

beforeEach(() => {
  key = makeKey('auth-2026-01');
  refreshDb = new FakeRefreshDb();
  now = FIXED_NOW;
  tokenService = new TokenService({
    keyset: new JwksKeyset({ keys: [key] }),
    db: refreshDb,
    clock: () => now
  });
  cacheClockMs = FIXED_NOW.getTime();
  epochCache = new InMemoryEpochCache({
    clock: () => cacheClockMs,
    ttlMs: DEFAULT_EPOCH_CACHE_TTL_MS
  });
  epochSource = new FakeEpochSource();
  middleware = new JwtAuthMiddleware({
    tokenService,
    epochCache,
    epochSource
  });
});

async function issueAccessToken(
  overrides: { epoch?: number; fingerprint?: string } = {}
): Promise<string> {
  const issued = await tokenService.issue({
    userId: USER_ID,
    email: EMAIL,
    sessionId: SESSION_ID,
    fingerprint: overrides.fingerprint ?? FINGERPRINT,
    epoch: overrides.epoch ?? epochSource.epoch
  });
  return issued.accessToken;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JwtAuthMiddleware.verify (Req 3.1, 2.8)', () => {
  it('rejects a missing raw token with reason "missing_token"', async () => {
    expect.assertions(3);
    try {
      await middleware.verify({
        rawToken: undefined,
        expectedFingerprint: FINGERPRINT
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthenticatedError);
      expect((err as UnauthenticatedError).code).toBe('unauthenticated');
      expect((err as UnauthenticatedError).reason).toBe('missing_token');
    }
  });

  it('rejects an empty / whitespace-only header as "missing_token"', async () => {
    expect.assertions(2);
    try {
      await middleware.verify({
        rawToken: '   ',
        expectedFingerprint: FINGERPRINT
      });
    } catch (err) {
      expect((err as UnauthenticatedError).reason).toBe('missing_token');
    }
    try {
      await middleware.verify({
        rawToken: 'Bearer   ',
        expectedFingerprint: FINGERPRINT
      });
    } catch (err) {
      expect((err as UnauthenticatedError).reason).toBe('missing_token');
    }
  });

  it('strips a "Bearer " prefix before verification (case-insensitive)', async () => {
    const token = await issueAccessToken();
    const claimsLower = await middleware.verify({
      rawToken: `bearer ${token}`,
      expectedFingerprint: FINGERPRINT
    });
    const claimsCanonical = await middleware.verify({
      rawToken: `Bearer ${token}`,
      expectedFingerprint: FINGERPRINT
    });
    expect(claimsLower.sub).toBe(USER_ID);
    expect(claimsCanonical.sub).toBe(USER_ID);
  });

  it('returns the claims when the token is valid and the fingerprint matches', async () => {
    const token = await issueAccessToken();
    const claims = await middleware.verify({
      rawToken: token,
      expectedFingerprint: FINGERPRINT
    });
    expect(claims.sub).toBe(USER_ID);
    expect(claims.email).toBe(EMAIL);
    expect(claims.sid).toBe(SESSION_ID);
    expect(claims.fp).toBe(FINGERPRINT);
    expect(claims.epoch).toBe(epochSource.epoch);
    expect(claims.kid).toBe('auth-2026-01');
    expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
  });

  it('rejects with "fingerprint_mismatch" when the request fp differs from claims.fp', async () => {
    const token = await issueAccessToken();
    expect.assertions(2);
    try {
      await middleware.verify({
        rawToken: token,
        expectedFingerprint: 'fp-other-device'
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthenticatedError);
      expect((err as UnauthenticatedError).reason).toBe('fingerprint_mismatch');
    }
  });

  it('rejects an expired token with reason "expired"', async () => {
    const token = await issueAccessToken();
    // Advance both clocks past the access-token TTL.
    now = new Date(FIXED_NOW.getTime() + (ACCESS_TOKEN_TTL_SECONDS + 1) * 1000);
    expect.assertions(2);
    try {
      await middleware.verify({
        rawToken: token,
        expectedFingerprint: FINGERPRINT
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthenticatedError);
      expect((err as UnauthenticatedError).reason).toBe('expired');
    }
  });

  it('rejects with "epoch_mismatch" when claim.epoch differs from the cached epoch (cache 5, claim 4)', async () => {
    // Cache says 5 (newest revoke), but the claim was issued under epoch 4.
    epochSource.epoch = 5;
    await epochCache.set(USER_ID, 5);
    const tokenWithStaleEpoch = await issueAccessToken({ epoch: 4 });
    expect.assertions(2);
    try {
      await middleware.verify({
        rawToken: tokenWithStaleEpoch,
        expectedFingerprint: FINGERPRINT
      });
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthenticatedError);
      expect((err as UnauthenticatedError).reason).toBe('epoch_mismatch');
    }
  });

  it('uses the cached epoch first; refetches from the source after the TTL elapses', async () => {
    // Pre-populate the cache with a stale value of 5 while the
    // source has freshly bumped to 6.
    epochSource.epoch = 6;
    await epochCache.set(USER_ID, 5);

    // Token minted under epoch 5 — matches cache, mismatches source.
    const tokenAtFive = await issueAccessToken({ epoch: 5 });

    // First call — cache hit, source NOT consulted.
    const claims = await middleware.verify({
      rawToken: tokenAtFive,
      expectedFingerprint: FINGERPRINT
    });
    expect(claims.epoch).toBe(5);
    expect(epochSource.calls).toHaveLength(0);

    // Advance the cache clock past the TTL — the next get returns null.
    cacheClockMs += DEFAULT_EPOCH_CACHE_TTL_MS;

    // Second call — cache miss forces a source read; the freshly
    // fetched epoch 6 no longer matches the token's epoch 5, so the
    // middleware now rejects.
    expect.assertions(4);
    try {
      await middleware.verify({
        rawToken: tokenAtFive,
        expectedFingerprint: FINGERPRINT
      });
    } catch (err) {
      expect((err as UnauthenticatedError).reason).toBe('epoch_mismatch');
    }
    expect(epochSource.calls).toEqual([USER_ID]);
  });
});

describe('InMemoryEpochCache TTL semantics', () => {
  it('returns the cached value within the TTL', async () => {
    let nowMs = 1_000_000;
    const cache = new InMemoryEpochCache({
      clock: () => nowMs,
      ttlMs: 30_000
    });
    await cache.set('u', 11);
    nowMs += 29_999;
    expect(await cache.get('u')).toBe(11);
  });

  it('evicts entries at or after the TTL boundary', async () => {
    let nowMs = 1_000_000;
    const cache = new InMemoryEpochCache({
      clock: () => nowMs,
      ttlMs: 30_000
    });
    await cache.set('u', 11);
    nowMs += 30_000;
    expect(await cache.get('u')).toBeNull();
  });

  it('distinguishes a missing entry from a cached zero', async () => {
    const cache = new InMemoryEpochCache();
    expect(await cache.get('absent')).toBeNull();
    await cache.set('present', 0);
    expect(await cache.get('present')).toBe(0);
  });
});
