/**
 * Unit tests for `OAuthCallbackHandler`.
 *
 * These tests deliberately use hand-rolled fakes (not `vitest.mock`)
 * so the assertion payload is the captured args list, which gives a
 * clearer signal than spy stubs.
 *
 * Validates: Requirements 1.3, 1.4, 1.5, 1.6, 4.1, 2.4.
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
  OAuthCallbackError,
  OAuthCallbackHandler,
  type OAuthChallenge
} from '../../../src/auth/oauth/index.js';

import {
  JwksKeyset,
  TokenService,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import { DeviceConstraintService } from '../../../src/devices/service.js';
import {
  DeviceServiceError,
  type DeviceContext
} from '../../../src/devices/types.js';
import type {
  DeviceDb,
  UpsertDeviceArgs,
  MarkDeviceRevokedArgs
} from '../../../src/devices/db.js';
import type { DeviceRecord } from '@drama15/contracts';
import type { LicenseStateMachine } from '../../../src/license/stateMachine.js';

import { FakeRefreshDb } from '../tokens/fakeRefreshDb.js';

// ---------------------------------------------------------------------------
// Constants for the deterministic fixture
// ---------------------------------------------------------------------------

const FIXED_NOW_MS = Date.parse('2026-06-01T00:00:00.000Z');
const VALID_AUD = '1234567890.apps.googleusercontent.com';
const VALID_ISS = 'https://accounts.google.com';
const STATE = 'state-token-xyz';
const NONCE = 'nonce-token-abc';
const CODE_VERIFIER = 'verifier-12345678901234567890abcd';
const REDIRECT_URI = 'https://app.example.com/auth/google/callback';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeUserRegistry implements UserRegistry {
  public readonly calls: UpsertUserArgs[] = [];
  private readonly knownSubs = new Map<string, string>();
  /** When false, every upsert returns `isNewUser: true` (and assigns id). */
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
  public readonly calls: Parameters<GoogleTokenExchangeClient['exchange']>[0][] = [];
  public idToken = 'id-token-from-google';

  public async exchange(args: Parameters<GoogleTokenExchangeClient['exchange']>[0]) {
    this.calls.push(args);
    return { idToken: this.idToken };
  }
}

class FakeVerifier implements IdTokenVerifier {
  public readonly calls: string[] = [];
  public claims: IdTokenClaims;

  constructor(claims: IdTokenClaims) {
    this.claims = claims;
  }

  public async verify(idToken: string): Promise<IdTokenClaims> {
    this.calls.push(idToken);
    return this.claims;
  }
}

class FakeStateMachine {
  public readonly assignCalls: string[] = [];
  public async assignFreeOnSignup(userId: string) {
    this.assignCalls.push(userId);
    return {
      userId,
      plan: 'Free_Plan' as const,
      status: 'active' as const
    };
  }
}

class FakePlanReader implements PlanStateReader {
  public readonly calls: string[] = [];
  public plan: 'Free_Plan' | 'Paid_Plan' = 'Free_Plan';
  public tokenEpoch = 0;

  public async readPlanForLogin(userId: string) {
    this.calls.push(userId);
    return { plan: this.plan, tokenEpoch: this.tokenEpoch };
  }
}

class FakeDeviceDb implements DeviceDb {
  public readonly upserts: UpsertDeviceArgs[] = [];
  public freeOwnerOf: { userId: string } | null = null;
  public sessionCount = 0;

  public async findActiveFreeFingerprintOwner() {
    return this.freeOwnerOf;
  }
  public async countActiveSessions() {
    return this.sessionCount;
  }
  public async upsertDevice(args: UpsertDeviceArgs) {
    this.upserts.push(args);
  }
  public async listDevices(): Promise<DeviceRecord[]> {
    return [];
  }
  public async markDeviceRevoked(_args: MarkDeviceRevokedArgs) {
    return false;
  }
}

class StubDeviceService {
  public enforceCalls: DeviceContext[] = [];
  public heartbeatCalls: DeviceContext[] = [];
  public throwOnEnforce: DeviceServiceError | null = null;

  public async enforceLoginConstraints(ctx: DeviceContext) {
    this.enforceCalls.push(ctx);
    if (this.throwOnEnforce !== null) throw this.throwOnEnforce;
  }
  public async recordHeartbeat(ctx: DeviceContext) {
    this.heartbeatCalls.push(ctx);
  }
}

// ---------------------------------------------------------------------------
// Test factory
// ---------------------------------------------------------------------------

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
  store: InMemoryChallengeStore;
  exchange: FakeExchange;
  verifier: FakeVerifier;
  stateMachine: FakeStateMachine;
  planReader: FakePlanReader;
  devices: StubDeviceService;
  userRegistry: FakeUserRegistry;
  refreshDb: FakeRefreshDb;
}

async function setUp(opts: {
  emailVerified?: boolean;
  iss?: string;
  aud?: string;
  exp?: number;
  nonce?: string;
  preExistingUserId?: string | null;
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
  if (opts.preExistingUserId !== undefined) {
    userRegistry.preExistingUserId = opts.preExistingUserId;
  }

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
    sessionIdFactory: () => 'sess-1'
  });

  return {
    handler,
    store,
    exchange,
    verifier,
    stateMachine,
    planReader,
    devices,
    userRegistry,
    refreshDb
  };
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

describe('OAuthCallbackHandler.handle - happy path', () => {
  let h: Harness;
  beforeEach(async () => {
    h = await setUp();
  });

  it('resolves with accessToken and profile shaped per LoginCallbackResponse', async () => {
    const result = await h.handler.handle(BASE_INPUT);
    expect(typeof result.accessToken).toBe('string');
    expect(result.accessToken.length).toBeGreaterThan(20);
    expect(result.expiresInSeconds).toBe(900);
    expect(result.profile.email).toBe('user@example.com');
    expect(result.profile.userId).toBe('user-1');
    expect(result.profile.uiLocale).toBe('en');
    expect(result.fingerprint).toBe(BASE_INPUT.fingerprint);
    expect(typeof result.refreshToken).toBe('string');
    expect(result.refreshExpiresAt).toBeInstanceOf(Date);
  });

  it('takes the state exactly once and consumes the entry', async () => {
    await h.handler.handle(BASE_INPUT);
    // A second `take` of the same state must be empty: the handler
    // already consumed it.
    const second = await h.store.take(STATE);
    expect(second).toBeNull();
  });

  it('exchanges the code with the persisted code_verifier', async () => {
    await h.handler.handle(BASE_INPUT);
    expect(h.exchange.calls).toHaveLength(1);
    expect(h.exchange.calls[0]!).toEqual({
      code: BASE_INPUT.code,
      codeVerifier: CODE_VERIFIER,
      redirectUri: REDIRECT_URI,
      clientId: VALID_AUD
    });
  });

  it('verifies the ID token exactly once', async () => {
    await h.handler.handle(BASE_INPUT);
    expect(h.verifier.calls).toEqual([h.exchange.idToken]);
  });

  it('upserts the user and assigns Free_Plan when new', async () => {
    await h.handler.handle(BASE_INPUT);
    expect(h.userRegistry.calls).toEqual([
      { email: 'user@example.com', googleSub: 'google-sub-1' }
    ]);
    expect(h.stateMachine.assignCalls).toEqual(['user-1']);
  });

  it('does NOT call assignFreeOnSignup for an existing user (Req 1.6)', async () => {
    const existing = await setUp({ preExistingUserId: 'user-existing' });
    await existing.handler.handle(BASE_INPUT);
    expect(existing.stateMachine.assignCalls).toEqual([]);
    // The plan reader is consulted regardless so the device check has
    // an authoritative plan to gate against.
    expect(existing.planReader.calls).toEqual(['user-existing']);
  });

  it('enforces device constraints, then records the heartbeat', async () => {
    await h.handler.handle(BASE_INPUT);
    expect(h.devices.enforceCalls).toHaveLength(1);
    expect(h.devices.enforceCalls[0]!).toEqual({
      userId: 'user-1',
      fingerprint: BASE_INPUT.fingerprint,
      ip: BASE_INPUT.ip,
      plan: 'Free_Plan'
    });
    expect(h.devices.heartbeatCalls).toHaveLength(1);
    expect(h.devices.heartbeatCalls[0]!.userId).toBe('user-1');
  });

  it('issues tokens through TokenService with the resolved epoch', async () => {
    const harness = await setUp();
    harness.planReader.tokenEpoch = 5;
    await harness.handler.handle(BASE_INPUT);
    expect(harness.refreshDb.inserts).toHaveLength(1);
    const insert = harness.refreshDb.inserts[0]!;
    expect(insert.userId).toBe('user-1');
    expect(insert.deviceFingerprint).toBe(BASE_INPUT.fingerprint);
  });
});

describe('OAuthCallbackHandler.handle - claim failures', () => {
  it('rejects email_verified=false with google_email_unverified (Req 1.4)', async () => {
    const h = await setUp({ emailVerified: false });
    await expect(h.handler.handle(BASE_INPUT)).rejects.toMatchObject({
      name: 'OAuthCallbackError',
      code: 'google_email_unverified'
    });
    // No tokens were issued, no user upserted.
    expect(h.refreshDb.inserts).toHaveLength(0);
  });

  it('rejects nonce mismatch with nonce_mismatch', async () => {
    const h = await setUp({ nonce: 'something-else' });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('nonce_mismatch');
  });

  it('rejects an expired ID token with expired_id_token', async () => {
    const pastExp = Math.floor(FIXED_NOW_MS / 1000) - 60;
    const h = await setUp({ exp: pastExp });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('expired_id_token');
  });

  it('rejects iss not from Google with iss_mismatch', async () => {
    const h = await setUp({ iss: 'https://evil.example.com' });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('iss_mismatch');
  });

  it('accepts the bare-host issuer "accounts.google.com"', async () => {
    const h = await setUp({ iss: 'accounts.google.com' });
    await expect(h.handler.handle(BASE_INPUT)).resolves.toMatchObject({
      profile: { email: 'user@example.com' }
    });
  });

  it('rejects aud not equal to expectedClientId with aud_mismatch', async () => {
    const h = await setUp({ aud: 'someone-else.apps.googleusercontent.com' });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('aud_mismatch');
  });
});

describe('OAuthCallbackHandler.handle - state and device failures', () => {
  it('throws state_not_found when the state has no challenge', async () => {
    const h = await setUp({ storeChallenge: false });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('state_not_found');
    // Crucially, no exchange/verify ever happens once state is missing.
    expect(h.exchange.calls).toHaveLength(0);
    expect(h.verifier.calls).toHaveLength(0);
  });

  it('remaps DeviceServiceError(free_plan_device_already_used) to OAuthCallbackError(free_plan_device_already_used) (Req 2.4)', async () => {
    const h = await setUp({
      deviceError: new DeviceServiceError('free_plan_device_already_used')
    });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('free_plan_device_already_used');
    // Heartbeat was NOT recorded because constraint failed first.
    expect(h.devices.heartbeatCalls).toHaveLength(0);
  });

  it('remaps DeviceServiceError(device_limit_reached) to OAuthCallbackError(device_limit_reached)', async () => {
    const h = await setUp({
      deviceError: new DeviceServiceError('device_limit_reached')
    });
    const err = await h.handler.handle(BASE_INPUT).catch((e) => e);
    expect(err).toBeInstanceOf(OAuthCallbackError);
    expect((err as OAuthCallbackError).code).toBe('device_limit_reached');
  });
});
