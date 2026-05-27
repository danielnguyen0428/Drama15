/**
 * Audit-emission tests for `TokenService.issue`.
 *
 * Verifies that a successful issuance emits exactly one
 * `access_token_issued` row with `{ userId, sessionId, fingerprint,
 * kid }` and that audit-side failures are swallowed so the caller
 * still receives the freshly-minted token pair.
 *
 * Validates: Requirement 14.1.
 */

import { generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  JwksKeyset,
  TokenService,
  type TokenIssuanceContext,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';
import type { AuditLoggerLike } from '../../../src/audit/types.js';

import { FakeRefreshDb } from './fakeRefreshDb.js';

interface RecordedEvent {
  eventType: string;
  details: Record<string, unknown>;
}

class RecordingAuditLogger implements AuditLoggerLike {
  public readonly events: RecordedEvent[] = [];
  public throwNext: Error | null = null;
  async recordEvent(
    eventType: string,
    details: Readonly<Record<string, unknown>>
  ): Promise<void> {
    if (this.throwNext) {
      const e = this.throwNext;
      this.throwNext = null;
      throw e;
    }
    this.events.push({ eventType, details: { ...details } });
  }
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

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
const KID = 'auth-2026-01';

const BASE_CTX: TokenIssuanceContext = {
  userId: 'user-1',
  email: 'user@example.com',
  sessionId: 'sess-1',
  fingerprint: 'fp-hash',
  epoch: 7
};

let svc: TokenService;
let db: FakeRefreshDb;
let audit: RecordingAuditLogger;

beforeEach(() => {
  const key = makeKey(KID);
  db = new FakeRefreshDb();
  audit = new RecordingAuditLogger();
  let counter = 0;
  svc = new TokenService({
    keyset: new JwksKeyset({ keys: [key] }),
    db,
    clock: () => FIXED_NOW,
    newId: () => `id-${++counter}`,
    auditLogger: audit
  });
});

describe('TokenService.issue audit emission', () => {
  it('emits access_token_issued with userId, sessionId, fingerprint, kid', async () => {
    await svc.issue(BASE_CTX);
    expect(audit.events).toHaveLength(1);
    expect(audit.events[0]!.eventType).toBe('access_token_issued');
    expect(audit.events[0]!.details).toEqual({
      userId: BASE_CTX.userId,
      sessionId: BASE_CTX.sessionId,
      fingerprint: BASE_CTX.fingerprint,
      kid: KID
    });
  });

  it('emits one row per successful issuance', async () => {
    await svc.issue(BASE_CTX);
    await svc.issue(BASE_CTX);
    expect(audit.events.filter((e) => e.eventType === 'access_token_issued'))
      .toHaveLength(2);
  });

  it('still returns the token pair when the audit logger throws', async () => {
    audit.throwNext = new Error('audit_db_down');
    const issued = await svc.issue(BASE_CTX);
    expect(typeof issued.accessToken).toBe('string');
    expect(typeof issued.refreshToken).toBe('string');
    expect(audit.events).toHaveLength(0);
  });

  it('does not emit access_token_issued when no audit logger is supplied', async () => {
    const key = makeKey(KID);
    const noAuditSvc = new TokenService({
      keyset: new JwksKeyset({ keys: [key] }),
      db: new FakeRefreshDb(),
      clock: () => FIXED_NOW
    });
    const issued = await noAuditSvc.issue(BASE_CTX);
    expect(typeof issued.accessToken).toBe('string');
  });
});
