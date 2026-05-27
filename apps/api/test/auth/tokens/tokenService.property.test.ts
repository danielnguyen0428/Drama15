import { generateKeyPairSync } from 'node:crypto';

import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  ACCESS_TOKEN_TTL_SECONDS,
  JwksKeyset,
  REFRESH_TOKEN_TTL_SECONDS,
  TokenService,
  type TokenIssuanceContext,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import { FakeRefreshDb } from './fakeRefreshDb.js';

/**
 * Property 3 — Token TTL bounds.
 *
 * **Validates: Requirements 1.5, 1.6, 3.5, 3.6**
 *
 * For every issuance, regardless of wall-clock instant or `epoch`
 * value, `TokenService.issue` must:
 *
 *   1. Report `accessExpiresInSeconds === 900` (Requirements 1.5, 1.6,
 *      3.5: Access_Token TTL ≤ 15 minutes — we mint at exactly 15 min).
 *   2. Embed `exp - iat === 900` in the signed Access_Token (Req 3.5).
 *   3. Set `refreshExpiresAt` to exactly 7 days after `now`
 *      (Requirements 1.5, 1.6, 3.6: Refresh_Token TTL = 7 days).
 *   4. Mirror the caller-supplied `epoch` into the access token claim
 *      verbatim (precondition for the License_Service ≤ 60s revocation
 *      property in Req 2.8 / Req 3.6).
 *
 * The RSA keypair is generated once for the whole property — a single
 * 2048-bit keygen costs ~100ms whereas 100 of them would dominate
 * the suite's runtime without buying any additional coverage (the
 * property under test is independent of the key material).
 */

// One key for the entire property. The TTL invariants do not depend on
// which kid signs the token, so we keep this hoisted to the module
// scope (and therefore to a single keygen per `vitest run`).
const SHARED_KEY: TokenSigningKey = (() => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  return {
    kid: 'prop-test-key',
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    publicKeyPem: publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString()
  };
})();

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// `now` arbitrary: any reasonable wall-clock instant. We bound to
// [2000-01-01, 2100-01-01] so the JWT `iat`/`exp` numbers stay safely
// inside Number.MAX_SAFE_INTEGER and so signed-token JSON round-trips
// without precision loss.
const arbNow = fc.date({
  min: new Date('2000-01-01T00:00:00.000Z'),
  max: new Date('2100-01-01T00:00:00.000Z'),
  noInvalidDate: true
});

// `epoch` arbitrary: non-negative safe integer. `users.token_epoch` is
// monotonically increasing from 0; we cap below 2^31 so it serialises
// without surprises.
const arbEpoch = fc.integer({ min: 0, max: 2_147_483_647 });

const BASE_CTX: Omit<TokenIssuanceContext, 'epoch'> = {
  userId: 'user-prop',
  email: 'prop@example.com',
  sessionId: 'sess-prop',
  fingerprint: 'fp-prop'
};

describe('Property 3: Token TTL bounds (Validates: Requirements 1.5, 1.6, 3.5, 3.6)', () => {
  it('access TTL = 900s, refresh TTL = 7d, and epoch claim mirrors input for arbitrary (now, epoch)', async () => {
    await fc.assert(
      fc.asyncProperty(arbNow, arbEpoch, async (now, epoch) => {
        // Fresh service per iteration so the FakeRefreshDb does not
        // carry rows between runs and the clock is pinned to `now`.
        const db = new FakeRefreshDb();
        const svc = new TokenService({
          keyset: new JwksKeyset({ keys: [SHARED_KEY] }),
          db,
          clock: () => now
        });

        const issued = await svc.issue({ ...BASE_CTX, epoch });

        // (1) Reported access TTL is exactly 900 seconds.
        if (issued.accessExpiresInSeconds !== ACCESS_TOKEN_TTL_SECONDS) {
          return false;
        }
        if (issued.accessExpiresInSeconds !== 900) {
          return false;
        }

        // (3) Refresh TTL is exactly 7 days from `now`.
        const refreshDeltaMs =
          issued.refreshExpiresAt.getTime() - now.getTime();
        if (refreshDeltaMs !== SEVEN_DAYS_MS) {
          return false;
        }
        if (refreshDeltaMs !== REFRESH_TOKEN_TTL_SECONDS * 1000) {
          return false;
        }

        // (2) + (4) Verify the signed token and inspect its claims.
        const claims = await svc.verifyAccessToken({
          token: issued.accessToken
        });
        if (claims.exp - claims.iat !== ACCESS_TOKEN_TTL_SECONDS) {
          return false;
        }
        if (claims.epoch !== epoch) {
          return false;
        }

        return true;
      }),
      { numRuns: 100 }
    );
  });
});
