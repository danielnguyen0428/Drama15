/**
 * Unit tests for the audit-wiring helpers.
 *
 * Each helper is a thin wrapper over `AuditLoggerLike.recordEvent`:
 * we verify that the right `eventType` and the right `details` keys
 * are forwarded, and that audit-side failures are swallowed so the
 * caller never sees them.
 *
 * Validates: Requirements 14.1, 16.7.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  auditAccessTokenRejected,
  auditAdminAction,
  auditClientIntegrityFailed,
  auditDevtoolsDetected,
  auditLicenseOrQuotaDenied
} from '../../src/audit/wiring.js';
import type { AuditLoggerLike } from '../../src/audit/types.js';

interface RecordedEvent {
  eventType: string;
  details: Record<string, unknown>;
}

class RecordingLogger implements AuditLoggerLike {
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

let logger: RecordingLogger;
beforeEach(() => {
  logger = new RecordingLogger();
});

describe('auditAccessTokenRejected', () => {
  it('emits access_token_rejected with code only when other fields are omitted', async () => {
    await auditAccessTokenRejected({ logger, code: 'expired' });
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]!.eventType).toBe('access_token_rejected');
    expect(logger.events[0]!.details).toEqual({ code: 'expired' });
  });

  it('emits access_token_rejected with the full optional payload', async () => {
    await auditAccessTokenRejected({
      logger,
      code: 'epoch_mismatch',
      sessionId: 'sess-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7'
    });
    expect(logger.events[0]!.details).toEqual({
      code: 'epoch_mismatch',
      sessionId: 'sess-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7'
    });
  });

  it('swallows audit-side errors so the caller is unaffected', async () => {
    logger.throwNext = new Error('audit_db_down');
    await expect(
      auditAccessTokenRejected({ logger, code: 'expired' })
    ).resolves.toBeUndefined();
    expect(logger.events).toHaveLength(0);
  });
});

describe('auditLicenseOrQuotaDenied', () => {
  it('emits license_or_quota_denied with userId, errorCode, fingerprint, ip', async () => {
    await auditLicenseOrQuotaDenied({
      logger,
      userId: 'u-1',
      errorCode: 'voice_requires_paid',
      fingerprint: 'fp-1',
      ip: '203.0.113.7'
    });
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]!.eventType).toBe('license_or_quota_denied');
    expect(logger.events[0]!.details).toEqual({
      userId: 'u-1',
      errorCode: 'voice_requires_paid',
      fingerprint: 'fp-1',
      ip: '203.0.113.7'
    });
  });

  it('swallows audit-side errors', async () => {
    logger.throwNext = new Error('audit_db_down');
    await expect(
      auditLicenseOrQuotaDenied({
        logger,
        userId: 'u-1',
        errorCode: 'free_chapter_quota_exhausted',
        fingerprint: 'fp-1',
        ip: '203.0.113.7'
      })
    ).resolves.toBeUndefined();
  });
});

describe('auditClientIntegrityFailed', () => {
  it('emits client_integrity_failed with userId, fingerprint, ip, headerHashHash', async () => {
    await auditClientIntegrityFailed({
      logger,
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      headerHashHash: 'abcd1234abcd1234'
    });
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]!.eventType).toBe('client_integrity_failed');
    expect(logger.events[0]!.details).toEqual({
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      headerHashHash: 'abcd1234abcd1234'
    });
  });
});

describe('auditDevtoolsDetected', () => {
  it('emits devtools_detected with userId, fingerprint, ip and optional locale', async () => {
    await auditDevtoolsDetected({
      logger,
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      browserLocale: 'vi-VN'
    });
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]!.eventType).toBe('devtools_detected');
    expect(logger.events[0]!.details).toEqual({
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      browserLocale: 'vi-VN'
    });
  });

  it('omits browserLocale from the payload when not supplied', async () => {
    await auditDevtoolsDetected({
      logger,
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7'
    });
    expect(logger.events[0]!.details).toEqual({
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7'
    });
  });
});

describe('auditAdminAction', () => {
  it('emits admin_action with actorAdminId, action and optional targetUserId (Req 16.7)', async () => {
    await auditAdminAction({
      logger,
      actorAdminId: 'admin-1',
      action: 'paid_plan_upgraded',
      targetUserId: 'u-target'
    });
    expect(logger.events).toHaveLength(1);
    expect(logger.events[0]!.eventType).toBe('admin_action');
    expect(logger.events[0]!.details).toEqual({
      actorAdminId: 'admin-1',
      userId: 'u-target',
      action: 'paid_plan_upgraded'
    });
  });

  it('merges caller-supplied details into the audit row', async () => {
    await auditAdminAction({
      logger,
      actorAdminId: 'admin-1',
      action: 'paid_plan_revoked',
      targetUserId: 'u-target',
      details: { reason: 'support_request', ticketId: 'OPS-42' }
    });
    expect(logger.events[0]!.details).toEqual({
      actorAdminId: 'admin-1',
      userId: 'u-target',
      action: 'paid_plan_revoked',
      reason: 'support_request',
      ticketId: 'OPS-42'
    });
  });

  it('omits userId when no targetUserId was supplied', async () => {
    await auditAdminAction({
      logger,
      actorAdminId: 'admin-1',
      action: 'flag_cleared'
    });
    expect(logger.events[0]!.details).toEqual({
      actorAdminId: 'admin-1',
      action: 'flag_cleared'
    });
  });

  it('swallows audit-side errors', async () => {
    logger.throwNext = new Error('audit_db_down');
    await expect(
      auditAdminAction({
        logger,
        actorAdminId: 'admin-1',
        action: 'paid_plan_upgraded'
      })
    ).resolves.toBeUndefined();
  });
});
