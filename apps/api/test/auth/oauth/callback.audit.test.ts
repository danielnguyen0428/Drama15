/**
 * Audit-emission tests for `OAuthCallbackHandler`.
 *
 * The structural fakes mirror those in `callback.test.ts`; we keep
 * them local rather than import them so the existing tests are not
 * coupled to the audit hook.
 *
 * Validates: Requirements 14.1, 16.7.
 */

import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  InMemoryChallengeStore,
  type IdTokenClaims,
  type IdTokenVerifier,
  type GoogleTokenExchangeClient,
  type OAuthCallbackHandlerLicense,
  type PlanStateReader,
  type UpsertUserArgs,
  type UserRegistry,
  OAuthCallbackHandler,
  type OAuthChallenge
} from '../../../src/auth/oauth/index.js';

import {
  JwksKeyset,
  TokenService,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import type { DeviceConstraintService } from '../../../src/devices/service.js';
import {
  DeviceServiceError,
  type DeviceContext
} from '../../../src/devices/types.js';
import type { LicenseStateMachine } from '../../../src/license/stateMachine.js';
import type { AuditLoggerLike } from '../../../src/audit/types.js';

import { FakeRefreshDb } from '../tokens/fakeRefreshDb.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FIXED_NOW_MS = Date.parse('2026-06-01T00:00:00.000Z');
const VALID_AUD = '1234567890.apps.googleusercontent.com';
const VALID_ISS = 'https://accounts.google.com';
const STATE = 'state-token-xyz';
const NONCE = 'nonce-token-abc';
const CODE_VERIFIER = 'verifier-12345678901234567890abcd';
const REDIRECT_URI = 'https://app.example.com/auth/google/callback';

// ---------------------------------------------------------------------------
// Fakes (intentionally local)
// ---------------------------------------------------------------------------

interface RecordedEvent {
  eventType: string;
  details: Record<string, unknown>;
}

class RecordingAuditLogger implements AuditLoggerLike {
  public readonly events: RecordedEvent[] = [];
  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    this.events.push({ eventType, details: { ...details } });
  }
}

class FakeUserRegistry implements UserRegistry {
  public readonly calls: UpsertUserArgs[] = [];
  private readonly knownSubs = new Map<string, string>();
  public preExistingUserId: string | null = null;

  public async upsertUser(args: UpsertUserArgs) {
    this.calls.push(args);
    if (this.preExistingUserId !== null) {
      this.knownSubs.set(args.googleSub, this.preExistingUserId);
      return { userId: this.preExistingUserId, isNewUser: false };
    }
    const existing = this.knownSubs.get(args.googleSub);
    if (existing !== undefined) {
      return { userId: existing, isNewUser: false };
    }
    const id = `user-${this.knownSubs.size + 1}`;
    this.knownSubs.set(args.googleSub, id);
    return { userId: id, isNewUser: true };
  }
}

class FakeExchange implements GoogleTokenExchangeClient {
  public idToken = 'id-token-from-google';
  public async exchange(_args: Parameters<GoogleTokenExchangeClient['exchange']>[0]) {
    return { idToken: this.idToken };
  }
}

class FakeVerifier implements IdTokenVerifier {
  public claims: IdTokenClaims;
  constructor(claims: IdTokenClaims) {
    this.claims = claims;
  }
  public async verify(_idToken: string): Promise<IdTokenClaims> {
    return this.claims;
  }
}

class FakeStateMachine {
  public async assignFreeOnSignup(userId: string) {
    return {
      userId,
      plan: 'Free_Plan' as const,
      status: 'active' as const
    };
  }
}

class FakePlanReader implements PlanStateReader {
  public plan: 'Free_Plan' | 'Paid_Plan' = 'Free_Plan';
  public tokenEpoch = 0;
  public async readPlanForLogin(_userId: string) {
    return { plan: this.plan, tokenEpoch: this.tokenEpoch };
  }
}

class StubDeviceService {
  public throwOnEnforce: DeviceServiceError | null = null;
  public async enforceLoginConstraints(_ctx: DeviceContext) {
    if (this.throwOnEnforce !== null) throw this.throwOnEnforce;
  }
  public async recordHeartbeat(_ctx: DeviceContext) {}
}

function makeKey(kid: string): TokenSigningKey {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  return {
    kid,
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString()
  };
}

interface Harness {
  handler: OAuthCallbackHandler;
  audit: RecordingAuditLogger;
  devices: StubDeviceService;
}

async function setUp(opts: {
  emailVerified?: boolean;
  iss?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  storeChallenge?: boolean;
  deviceError?: DeviceServiceError;
} = {}): Promise<Harness> {
  const store = new InMemoryChallengeStore();
  if (opts.storeChallenge !== false) {
    const challenge: OAuthChallenge = {
      state: STATE,
      nonce: NONCE,
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI,
      createdAt: FIXED_NOW_MS - 60_000,
      expiresAt: FIXED_NOW_MS + 60_000,
      fingerprint: null
    };
    await store.put(STATE, challenge);
  }

  const futureExp = Math.floor(FIXED_NOW_MS / 1000) + 600;
  const claims: IdTokenClaims = {
    iss: opts.iss ?? VALID_ISS,
    aud: opts.aud ?? VALID_AUD,
    sub: 'google-sub-1',
    email: 'user@example.com',
    email_verified: opts.emailVerified ?? true,
    nonce: opts.nonce ?? NONCE,
    exp: opts.exp ?? futureExp,
    iat: Math.floor(FIXED_NOW_MS / 1000) - 30
  };

  const exchange = new FakeExchange();
  const verifier = new FakeVerifier(claims);
  const stateMachine = new FakeStateMachine();
  const planReader = new FakePlanReader();
  const userRegistry = new FakeUserRegistry();
  const devices = new StubDeviceService();
  if (opts.deviceError) {
    devices.throwOnEnforce = opts.deviceError;
  }

  const key = makeKey('test-key');
  const refreshDb = new FakeRefreshDb();
  const tokenService = new TokenService({
    keyset: new JwksKeyset({ keys: [key] }),
    db: refreshDb,
    clock: () => new Date(FIXED_NOW_MS),
    newId: (() => {
      let n = 0;
      return () => `tok-${++n}`;
    })()
  });

  const license: OAuthCallbackHandlerLicense = {
    stateMachine: stateMachine as unknown as LicenseStateMachine,
    reader: planReader
  };

  const audit = new RecordingAuditLogger();
  const handler = new OAuthCallbackHandler({
    store,
    exchange,
    verify: verifier,
    license,
    devices: devices as unknown as DeviceConstraintService,
    tokenService,
    userRegistry,
    expectedClientId: VALID_AUD,
    clock: () => FIXED_NOW_MS,
    sessionIdFactory: () => 'sess-1',
    auditLogger: audit
  });

  return { handler, audit, devices };
}

const BASE_INPUT = {
  state: STATE,
  code: 'auth-code-123',
  fingerprint: 'fp-' + 'a'.repeat(60),
  ip: '203.0.113.7',
  browserLocale: 'en-US'
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let h: Harness;

describe('OAuthCallbackHandler audit emission - happy path', () => {
  beforeEach(async () => {
    h = await setUp();
  });

  it('emits login_success with userId, email, fingerprint, ip and browserLocale', async () => {
    await h.handler.handle(BASE_INPUT);
    const successes = h.audit.events.filter((e) => e.eventType === 'login_success');
    expect(successes).toHaveLength(1);
    expect(successes[0]!.details).toEqual({
      userId: 'user-1',
      email: 'user@example.com',
      fingerprint: BASE_INPUT.fingerprint,
      ip: BASE_INPUT.ip,
      browserLocale: BASE_INPUT.browserLocale
    });
  });

  it('does not emit login_failed on success', async () => {
    await h.handler.handle(BASE_INPUT);
    const failures = h.audit.events.filter((e) => e.eventType === 'login_failed');
    expect(failures).toHaveLength(0);
  });
});

describe('OAuthCallbackHandler audit emission - failure paths', () => {
  it('emits login_failed with state_not_found when state is missing', async () => {
    h = await setUp({ storeChallenge: false });
    await expect(h.handler.handle(BASE_INPUT)).rejects.toMatchObject({
      code: 'state_not_found'
    });
    const failures = h.audit.events.filter((e) => e.eventType === 'login_failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]!.details).toEqual({
      code: 'state_not_found',
      fingerprint: BASE_INPUT.fingerprint,
      ip: BASE_INPUT.ip,
      browserLocale: BASE_INPUT.browserLocale
    });
  });

  it('does NOT include email on login_failed even if claims carried one', async () => {
    h = await setUp({ nonce: 'mismatch' });
    await expect(h.handler.handle(BASE_INPUT)).rejects.toMatchObject({
      code: 'nonce_mismatch'
    });
    const failures = h.audit.events.filter((e) => e.eventType === 'login_failed');
    expect(failures).toHaveLength(1);
    expect(failures[0]!.details).not.toHaveProperty('email');
  });

  it('emits login_failed for each documented OAuth error code', async () => {
    const cases: Array<[string, () => Promise<Harness>]> = [
      ['nonce_mismatch', () => setUp({ nonce: 'something-else' })],
      ['iss_mismatch', () => setUp({ iss: 'https://evil.example.com' })],
      ['aud_mismatch', () => setUp({ aud: 'someone-else.apps.googleusercontent.com' })],
      [
        'expired_id_token',
        () => setUp({ exp: Math.floor(FIXED_NOW_MS / 1000) - 60 })
      ],
      ['google_email_unverified', () => setUp({ emailVerified: false })],
      [
        'free_plan_device_already_used',
        () =>
          setUp({
            deviceError: new DeviceServiceError('free_plan_device_already_used')
          })
      ],
      [
        'device_limit_reached',
        () =>
          setUp({
            deviceError: new DeviceServiceError('device_limit_reached')
          })
      ]
    ];

    for (const [code, factory] of cases) {
      const harness = await factory();
      await expect(harness.handler.handle(BASE_INPUT)).rejects.toMatchObject({
        code
      });
      const failures = harness.audit.events.filter(
        (e) => e.eventType === 'login_failed'
      );
      expect(failures).toHaveLength(1);
      expect(failures[0]!.details.code).toBe(code);
      // Successes never emitted on a failed flow.
      const successes = harness.audit.events.filter(
        (e) => e.eventType === 'login_success'
      );
      expect(successes).toHaveLength(0);
    }
  });
});
