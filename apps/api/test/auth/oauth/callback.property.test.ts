/**
 * Property test for `OAuthCallbackHandler` ID-token verification.
 *
 * **Property 4 — ID token verification.**
 *
 * For every authorisation-code callback the handler succeeds iff *all* of
 * the following hold; otherwise it throws `OAuthCallbackError` with the
 * precedence-ordered failure code:
 *
 *   1. `signatureValid === true`                     (else `signature_invalid`)
 *   2. `iss ∈ { 'https://accounts.google.com',
 *               'accounts.google.com' }`             (else `iss_mismatch`)
 *   3. `aud === expectedClientId`                    (else `aud_mismatch`)
 *   4. `exp > now` (seconds since epoch)             (else `expired_id_token`)
 *   5. `nonce === challenge.nonce`                   (else `nonce_mismatch`)
 *   6. `email_verified === true`                     (else `google_email_unverified`)
 *
 * The precedence reflects the order the handler asserts each claim in
 * `OAuthCallbackHandler.handle`. Invalid-signature is modelled by the
 * verifier throwing — the handler does not catch around `verify`, so the
 * thrown `OAuthCallbackError('signature_invalid')` propagates verbatim.
 *
 * The test seeds the `ChallengeStore` with a stable expected `nonce` and
 * configures the handler with a fixed expected `aud`/`iss`. For each
 * sample drawn from `arbIDToken()` we generate two independent boolean
 * flags that decide whether to overwrite the sample's `aud` / `nonce`
 * with the expected stable values, so roughly half the runs match each
 * field and roughly half do not — exercising every failure branch and
 * the success branch.
 *
 * **Validates: Requirements 1.3, 1.4**
 */

import { generateKeyPairSync } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { fc, arbIDToken } from '@drama15/test-helpers';

import {
  InMemoryChallengeStore,
  OAuthCallbackError,
  OAuthCallbackHandler,
  type GoogleTokenExchangeClient,
  type IdTokenClaims,
  type IdTokenVerifier,
  type OAuthCallbackErrorCode,
  type OAuthCallbackHandlerLicense,
  type OAuthChallenge,
  type PlanStateReader,
  type UpsertUserArgs,
  type UserRegistry
} from '../../../src/auth/oauth/index.js';

import {
  JwksKeyset,
  TokenService,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import { DeviceConstraintService } from '../../../src/devices/service.js';
import type { DeviceContext } from '../../../src/devices/types.js';
import type { LicenseStateMachine } from '../../../src/license/stateMachine.js';

import { FakeRefreshDb } from '../tokens/fakeRefreshDb.js';

// ---------------------------------------------------------------------------
// Stable expected values
// ---------------------------------------------------------------------------

/** Matches the `arbIDToken` aud format `^[0-9]{12}-[a-z0-9]{32}\.apps\.googleusercontent\.com$`. */
const EXPECTED_AUD = '000000000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.apps.googleusercontent.com';
/** Matches `arbIDToken` nonce format `^[A-Za-z0-9_-]{16,64}$`. */
const EXPECTED_NONCE = 'expected-nonce-stable-value-0001';
const EXPECTED_ISS = 'https://accounts.google.com';
const ALLOWED_ISS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const STATE = 'state-token-property';
const CODE_VERIFIER = 'verifier-property-12345678901234567890abcd';
const REDIRECT_URI = 'https://app.example.com/auth/google/callback';

// ---------------------------------------------------------------------------
// Hand-rolled fakes (intentionally minimal — only what `handle` calls).
// We reuse the unit-test patterns but inline them so the property test is
// self-contained.
// ---------------------------------------------------------------------------

class FakeUserRegistry implements UserRegistry {
  private next = 0;
  public async upsertUser(_args: UpsertUserArgs) {
    this.next += 1;
    return { userId: `user-${this.next}`, isNewUser: true };
  }
}

class FakeExchange implements GoogleTokenExchangeClient {
  public async exchange(_args: Parameters<GoogleTokenExchangeClient['exchange']>[0]) {
    return { idToken: 'id-token-from-google' };
  }
}

/**
 * Stub verifier driven directly by the sample. When `signatureValid` is
 * false the verifier throws `OAuthCallbackError('signature_invalid')`,
 * mirroring how a real JWKS verifier surfaces a bad RS256 signature.
 */
class StubVerifier implements IdTokenVerifier {
  public constructor(
    private readonly claims: IdTokenClaims,
    private readonly signatureValid: boolean
  ) {}

  public async verify(_idToken: string): Promise<IdTokenClaims> {
    if (!this.signatureValid) {
      throw new OAuthCallbackError('signature_invalid');
    }
    return this.claims;
  }
}

class FakeStateMachine {
  public async assignFreeOnSignup(userId: string) {
    return { userId, plan: 'Free_Plan' as const, status: 'active' as const };
  }
}

class FakePlanReader implements PlanStateReader {
  public async readPlanForLogin(_userId: string) {
    return { plan: 'Free_Plan' as const, tokenEpoch: 0 };
  }
}

/** Device-constraint stub that always lets the login through; the property
 * is about ID-token verification, not device gating. */
class StubDeviceService {
  public async enforceLoginConstraints(_ctx: DeviceContext): Promise<void> {
    /* no-op */
  }
  public async recordHeartbeat(_ctx: DeviceContext): Promise<void> {
    /* no-op */
  }
}

// ---------------------------------------------------------------------------
// Shared, expensive resources hoisted out of the property loop
// ---------------------------------------------------------------------------

function makeKey(kid: string): TokenSigningKey {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

const SHARED_KEY = makeKey('property-test-key');
const SHARED_KEYSET = new JwksKeyset({ keys: [SHARED_KEY] });

// ---------------------------------------------------------------------------
// Property-input arbitrary
// ---------------------------------------------------------------------------

interface Scenario {
  readonly sample: ReturnType<typeof arbIDToken> extends fc.Arbitrary<infer T> ? T : never;
  readonly matchAud: boolean;
  readonly matchNonce: boolean;
}

const arbScenario = (): fc.Arbitrary<Scenario> =>
  fc.record({
    sample: arbIDToken(),
    matchAud: fc.boolean(),
    matchNonce: fc.boolean()
  });

// ---------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------

describe('OAuthCallbackHandler.handle (property) — Property 4: ID token verification', () => {
  it(
    'resolves iff signature/iss/aud/exp/nonce/email_verified all hold; otherwise throws OAuthCallbackError with precedence-ordered code',
    async () => {
      // **Validates: Requirements 1.3, 1.4**
      await fc.assert(
        fc.asyncProperty(arbScenario(), async (scenario) => {
          const { sample, matchAud, matchNonce } = scenario;

          // Pin "now" to (iat + 1800) seconds. arbIDToken sets
          // exp = iat + 3600 + offset with offset ∈ [-3600, 3600], so
          // exp > now iff offset > -1800 — about 75% of samples are
          // unexpired, leaving real shrink targets for `expired_id_token`.
          const nowSeconds = sample.iat + 1800;
          const nowMs = nowSeconds * 1000;

          // Compose the effective claims the verifier will surface.
          // `aud`/`nonce` are conditionally swapped to the stable
          // expected values; everything else is taken from the sample
          // verbatim so the property exercises the original distribution
          // of `iss`, `exp`, and `email_verified`.
          const effectiveAud = matchAud ? EXPECTED_AUD : sample.aud;
          const effectiveNonce = matchNonce ? EXPECTED_NONCE : sample.nonce;
          const claims: IdTokenClaims = {
            iss: sample.iss,
            aud: effectiveAud,
            sub: sample.sub,
            email: sample.email,
            email_verified: sample.email_verified,
            nonce: effectiveNonce,
            exp: sample.exp,
            iat: sample.iat
          };

          // Compute the expected handler outcome from the same predicates
          // the handler itself enforces, in the SAME order. Any
          // disagreement falsifies the property.
          let expected: OAuthCallbackErrorCode | 'success';
          if (!sample.signatureValid) {
            expected = 'signature_invalid';
          } else if (!ALLOWED_ISS.has(claims.iss)) {
            expected = 'iss_mismatch';
          } else if (claims.aud !== EXPECTED_AUD) {
            expected = 'aud_mismatch';
          } else if (!Number.isFinite(claims.exp) || claims.exp <= nowSeconds) {
            expected = 'expired_id_token';
          } else if (claims.nonce !== EXPECTED_NONCE) {
            expected = 'nonce_mismatch';
          } else if (claims.email_verified !== true) {
            expected = 'google_email_unverified';
          } else {
            expected = 'success';
          }

          // Build a fresh harness per iteration so no cross-run state
          // leaks. The RSA keypair is shared across iterations because
          // its generation dominates run time and the property does not
          // depend on key identity.
          const store = new InMemoryChallengeStore();
          const challenge: OAuthChallenge = {
            state: STATE,
            nonce: EXPECTED_NONCE,
            codeVerifier: CODE_VERIFIER,
            redirectUri: REDIRECT_URI,
            createdAt: nowMs - 60_000,
            expiresAt: nowMs + 60_000,
            fingerprint: null
          };
          await store.put(STATE, challenge);

          const license: OAuthCallbackHandlerLicense = {
            stateMachine: new FakeStateMachine() as unknown as LicenseStateMachine,
            reader: new FakePlanReader()
          };

          const tokenService = new TokenService({
            keyset: SHARED_KEYSET,
            db: new FakeRefreshDb(),
            clock: () => new Date(nowMs),
            newId: (() => {
              let n = 0;
              return () => `tok-prop-${++n}`;
            })()
          });

          const handler = new OAuthCallbackHandler({
            store,
            exchange: new FakeExchange(),
            verify: new StubVerifier(claims, sample.signatureValid),
            license,
            devices: new StubDeviceService() as unknown as DeviceConstraintService,
            tokenService,
            userRegistry: new FakeUserRegistry(),
            expectedClientId: EXPECTED_AUD,
            expectedIssuer: EXPECTED_ISS,
            clock: () => nowMs,
            sessionIdFactory: () => 'sess-prop'
          });

          const input = {
            state: STATE,
            code: 'auth-code-property',
            fingerprint: 'fp-' + 'a'.repeat(60),
            ip: '198.51.100.7',
            browserLocale: 'en-US'
          };

          // Execute and compare against the expected outcome.
          let caught: unknown;
          let resolved = false;
          try {
            await handler.handle(input);
            resolved = true;
          } catch (err) {
            caught = err;
          }

          if (expected === 'success') {
            expect(resolved).toBe(true);
          } else {
            expect(resolved).toBe(false);
            expect(caught).toBeInstanceOf(OAuthCallbackError);
            expect((caught as OAuthCallbackError).code).toBe(expected);
          }
        }),
        { numRuns: 100 }
      );
    }
  );
});
