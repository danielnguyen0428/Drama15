/**
 * Unit tests for `RefreshTokenRotator`.
 *
 * Validates: Requirements 1.7, 1.8, 2.8, 4.7.
 *
 * The fake `RefreshTokenDb` from `fakeRefreshDb.ts` already mirrors the
 * "rotation marks old as `rotated`" behaviour we need, so the tests can
 * thread real `TokenService.issue` calls through it without mocking.
 */

import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  hashRefreshToken,
  JwksKeyset,
  RefreshError,
  RefreshTokenRotator,
  TokenService,
  type IssuedTokens,
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

const FIXED_NOW = new Date('2026-02-01T00:00:00.000Z');

interface RecordedEvent {
  readonly eventType: string;
  readonly details: Readonly<Record<string, unknown>>;
}

class RecordingAuditLogger {
  public readonly events: RecordedEvent[] = [];
  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    this.events.push({ eventType, details });
  }
}

let svc: TokenService;
let db: FakeRefreshDb;
let audit: RecordingAuditLogger;
let rotator: RefreshTokenRotator;
let counter: number;

beforeEach(() => {
  const key = makeKey('auth-2026-02');
  db = new FakeRefreshDb();
  db.clockNow = FIXED_NOW;
  counter = 0;
  svc = new TokenService({
    keyset: new JwksKeyset({ keys: [key] }),
    db,
    clock: () => FIXED_NOW,
    newId: () => `id-${++counter}`
  });
  audit = new RecordingAuditLogger();
  rotator = new RefreshTokenRotator({
    tokenService: svc,
    db,
    auditLogger: audit,
    clock: () => FIXED_NOW
  });
});

async function issueInitial(): Promise<IssuedTokens> {
  return svc.issue({
    userId: 'user-1',
    email: 'user@example.com',
    sessionId: 'sess-1',
    fingerprint: 'fp-hash',
    epoch: 7
  });
}

describe('RefreshTokenRotator.rotate (happy path)', () => {
  it('mints a new token pair and reuses the family id', async () => {
    const initial = await issueInitial();
    const rotated = await rotator.rotate({
      rawRefreshToken: initial.refreshToken,
      sessionId: 'sess-1',
      fingerprint: 'fp-hash',
      currentEpoch: 7,
      email: 'user@example.com',
      userId: 'user-1'
    });

    expect(rotated.familyId).toBe(initial.familyId);
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);
    // `refreshTokenId` is freshly generated on every issue() call.
    expect(rotated.refreshTokenId).not.toBe(initial.refreshTokenId);
    // The Access_Token may or may not differ — under a fixed clock
    // the RS256 signature is deterministic for identical claims, and
    // we deliberately do not include any per-rotation nonce in the
    // claim set. The Refresh_Token is the rotated artefact; the
    // Access_Token's freshness comes from `iat`/`exp` on real clocks.
  });

  it('marks the old refresh row as `rotated`', async () => {
    const initial = await issueInitial();
    await rotator.rotate({
      rawRefreshToken: initial.refreshToken,
      sessionId: 'sess-1',
      fingerprint: 'fp-hash',
      currentEpoch: 7,
      email: 'user@example.com',
      userId: 'user-1'
    });

    expect(db.revokeTokens).toHaveLength(1);
    expect(db.revokeTokens[0]!).toEqual({
      id: initial.refreshTokenId,
      reason: 'rotated'
    });
    expect(db.revokeFamilies).toHaveLength(0);
  });

  it('persists the new refresh row with the inherited family id', async () => {
    const initial = await issueInitial();
    const rotated = await rotator.rotate({
      rawRefreshToken: initial.refreshToken,
      sessionId: 'sess-1',
      fingerprint: 'fp-hash',
      currentEpoch: 7,
      email: 'user@example.com',
      userId: 'user-1'
    });

    expect(db.inserts).toHaveLength(2);
    const second = db.inserts[1]!;
    expect(second.familyId).toBe(initial.familyId);
    expect(second.tokenHash).toBe(hashRefreshToken(rotated.refreshToken));
    expect(second.deviceFingerprint).toBe('fp-hash');
  });
});

describe('RefreshTokenRotator.rotate (rejection)', () => {
  it('throws RefreshError("refresh_token_invalid") for an unknown token', async () => {
    await expect(
      rotator.rotate({
        rawRefreshToken: 'totally-bogus',
        sessionId: 'sess-1',
        fingerprint: 'fp-hash',
        currentEpoch: 7,
        email: 'user@example.com',
        userId: 'user-1'
      })
    ).rejects.toMatchObject({
      name: 'RefreshError',
      code: 'refresh_token_invalid',
      familyCompromised: false
    });

    expect(db.revokeFamilies).toHaveLength(0);
    expect(audit.events).toHaveLength(0);
  });

  it('throws RefreshError("refresh_token_invalid") and revokes the family on reuse of a rotated token', async () => {
    const initial = await issueInitial();
    // Legitimate rotation #1 — old token now `rotated`.
    await rotator.rotate({
      rawRefreshToken: initial.refreshToken,
      sessionId: 'sess-1',
      fingerprint: 'fp-hash',
      currentEpoch: 7,
      email: 'user@example.com',
      userId: 'user-1'
    });

    // Attacker (or stale tab) presents the original Refresh_Token
    // again. This must trip the reuse detector.
    let captured: unknown = null;
    try {
      await rotator.rotate({
        rawRefreshToken: initial.refreshToken,
        sessionId: 'sess-1',
        fingerprint: 'fp-hash',
        currentEpoch: 7,
        email: 'user@example.com',
        userId: 'user-1',
        ip: '203.0.113.7',
        browserLocale: 'en-US'
      });
    } catch (err) {
      captured = err;
    }

    expect(captured).toBeInstanceOf(RefreshError);
    expect((captured as RefreshError).code).toBe('refresh_token_invalid');
    expect((captured as RefreshError).familyCompromised).toBe(true);

    // Family revocation MUST have been issued with the canonical
    // reason. This is the seam Requirements 1.7 / 2.8 / 4.7 protect:
    // every Refresh_Token in the family is dead from this moment on.
    expect(db.revokeFamilies).toHaveLength(1);
    expect(db.revokeFamilies[0]!).toEqual({
      familyId: initial.familyId,
      reason: 'family_compromised'
    });

    // Audit row must surface the reuse for forensics (Req 14.1).
    const reuseEvents = audit.events.filter(
      (e) => e.eventType === 'refresh_token_reuse_detected'
    );
    expect(reuseEvents).toHaveLength(1);
    expect(reuseEvents[0]!.details).toMatchObject({
      userId: 'user-1',
      family_id: initial.familyId
    });
  });

  it('cascades family revocation to tokens issued AFTER the original rotation', async () => {
    const initial = await issueInitial();

    const rotated = await rotator.rotate({
      rawRefreshToken: initial.refreshToken,
      sessionId: 'sess-1',
      fingerprint: 'fp-hash',
      currentEpoch: 7,
      email: 'user@example.com',
      userId: 'user-1'
    });

    // Reuse the original (now-rotated) Refresh_Token → family
    // compromised. The token minted by the legitimate rotation
    // (`rotated.refreshToken`) MUST also be revoked.
    await expect(
      rotator.rotate({
        rawRefreshToken: initial.refreshToken,
        sessionId: 'sess-1',
        fingerprint: 'fp-hash',
        currentEpoch: 7,
        email: 'user@example.com',
        userId: 'user-1'
      })
    ).rejects.toBeInstanceOf(RefreshError);

    // After the family compromise, even the freshly-minted token from
    // the legitimate rotation is now invalid: a subsequent rotation
    // attempt with it fails with `refresh_token_invalid`.
    await expect(
      rotator.rotate({
        rawRefreshToken: rotated.refreshToken,
        sessionId: 'sess-1',
        fingerprint: 'fp-hash',
        currentEpoch: 7,
        email: 'user@example.com',
        userId: 'user-1'
      })
    ).rejects.toMatchObject({
      code: 'refresh_token_invalid'
    });
  });
});
