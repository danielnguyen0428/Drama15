import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogger } from '../../src/audit/auditLogger.js';
import { AuditError } from '../../src/audit/types.js';
import type {
  AuditDb,
  InsertAuditEventArgs,
  InsertAuditEventResult
} from '../../src/audit/db.js';
import type { AuditEvent, AuditLoggerLike } from '../../src/audit/types.js';

/**
 * In-memory `AuditDb` used by every test below. Captures every insert
 * verbatim so assertions can inspect both the `details` payload and
 * the structured row columns.
 */
class FakeDb implements AuditDb {
  public rows: InsertAuditEventArgs[] = [];
  public failNext: Error | null = null;
  private nextId = 1;

  async insertEvent(args: InsertAuditEventArgs): Promise<InsertAuditEventResult> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    this.rows.push(args);
    return { id: String(this.nextId++) };
  }
}

const FIXED_NOW = new Date('2025-03-09T12:00:00Z');

describe('AuditLogger.recordEvent', () => {
  let db: FakeDb;
  let logger: AuditLogger;

  beforeEach(() => {
    db = new FakeDb();
    logger = new AuditLogger({
      db,
      clock: () => FIXED_NOW,
      hashKeys: ['email']
    });
  });

  it("hashes 'email' to 16 hex chars and removes the original before persistence", async () => {
    await logger.recordEvent('login_success', {
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      browserLocale: 'vi',
      email: 'a@b.com'
    });

    expect(db.rows).toHaveLength(1);
    const row = db.rows[0]!;
    expect(row.eventType).toBe('login_success');
    expect(row.userId).toBe('u-1');
    expect(row.fingerprint).toBe('fp-1');
    expect(row.ip).toBe('203.0.113.7');
    expect(row.browserLocale).toBe('vi');
    expect(row.ts).toEqual(FIXED_NOW);

    // The raw email MUST NOT be present anywhere on the row, neither
    // as a top-level column nor inside `details`.
    expect((row as unknown as Record<string, unknown>).email).toBeUndefined();
    expect(row.details).not.toHaveProperty('email');

    const detailsBag = row.details as Record<string, unknown>;
    expect(detailsBag.email_hash).toBeTypeOf('string');
    expect(detailsBag.email_hash as string).toHaveLength(16);
    expect(detailsBag.email_hash as string).toMatch(/^[0-9a-f]{16}$/);
  });

  it('throws AuditError(forbidden_field) when the caller passes a raw access_token', async () => {
    await expect(
      logger.recordEvent('access_token_issued', { access_token: 'eyJ...' })
    ).rejects.toMatchObject({ name: 'AuditError', code: 'forbidden_field' });
    expect(db.rows).toHaveLength(0);
  });

  it('throws AuditError(forbidden_field) for refresh_token, oauth_code, authorization_code', async () => {
    for (const key of ['refresh_token', 'oauth_code', 'authorization_code']) {
      await expect(
        logger.recordEvent('login_success', { [key]: 'secret' })
      ).rejects.toMatchObject({ name: 'AuditError', code: 'forbidden_field' });
    }
    expect(db.rows).toHaveLength(0);
  });

  it('rejects an empty event type with AuditError(invalid_event)', async () => {
    await expect(logger.recordEvent('', {})).rejects.toMatchObject({
      name: 'AuditError',
      code: 'invalid_event'
    });
  });

  it('stamps ts from the injected clock when caller does not supply one', async () => {
    await logger.recordEvent('logout', { userId: 'u-1' });
    expect(db.rows[0]!.ts).toEqual(FIXED_NOW);
  });

  it('wraps DB failures as AuditError(persistence_failed) with the original cause', async () => {
    const dbErr = new Error('connection refused');
    db.failNext = dbErr;
    try {
      await logger.recordEvent('login_failed', { userId: 'u-1' });
      expect.fail('expected AuditError to be thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(AuditError);
      expect((e as AuditError).code).toBe('persistence_failed');
      expect((e as AuditError).cause).toBe(dbErr);
    }
  });

  it('extracts actorAdminId for admin events (Requirement 16.7)', async () => {
    await logger.recordEvent('admin_action', {
      userId: 'u-target',
      actorAdminId: 'admin-1',
      action: 'paid_plan_upgraded'
    });
    const row = db.rows[0]!;
    expect(row.actorAdminId).toBe('admin-1');
    expect(row.userId).toBe('u-target');
    // actorAdminId is hoisted out of details into a dedicated column.
    expect(row.details).not.toHaveProperty('actorAdminId');
    expect(row.details).toMatchObject({ action: 'paid_plan_upgraded' });
  });
});

describe('AuditLogger.recordEventStrict', () => {
  let db: FakeDb;
  let logger: AuditLogger;

  beforeEach(() => {
    db = new FakeDb();
    logger = new AuditLogger({ db, clock: () => FIXED_NOW });
  });

  it('persists a fully-shaped event', async () => {
    const event: AuditEvent = {
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      browserLocale: 'vi',
      ts: FIXED_NOW,
      eventType: 'paid_plan_upgraded',
      details: { reason: 'admin_upgrade' },
      actorAdminId: 'admin-1'
    };
    await logger.recordEventStrict(event);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      userId: 'u-1',
      fingerprint: 'fp-1',
      ip: '203.0.113.7',
      browserLocale: 'vi',
      ts: FIXED_NOW,
      eventType: 'paid_plan_upgraded',
      actorAdminId: 'admin-1'
    });
    expect(db.rows[0]!.details).toEqual({ reason: 'admin_upgrade' });
  });

  it('throws AuditError(invalid_event) when ts is missing', async () => {
    // @ts-expect-error — exercising runtime guard
    const event: AuditEvent = { eventType: 'login_success' };
    await expect(logger.recordEventStrict(event)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'invalid_event'
    });
  });

  it('throws AuditError(invalid_event) when ts is not a Date', async () => {
    const event = {
      eventType: 'login_success',
      ts: '2025-03-09T12:00:00Z'
    } as unknown as AuditEvent;
    await expect(logger.recordEventStrict(event)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'invalid_event'
    });
  });

  it('throws AuditError(invalid_event) when eventType is empty', async () => {
    const event: AuditEvent = { eventType: '', ts: FIXED_NOW };
    await expect(logger.recordEventStrict(event)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'invalid_event'
    });
  });

  it('runs redactDetails on event.details and surfaces forbidden_field', async () => {
    const event: AuditEvent = {
      eventType: 'access_token_issued',
      ts: FIXED_NOW,
      details: { access_token: 'should-never-persist' }
    };
    await expect(logger.recordEventStrict(event)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'forbidden_field'
    });
    expect(db.rows).toHaveLength(0);
  });

  it('wraps DB failures as AuditError(persistence_failed)', async () => {
    db.failNext = new Error('disk full');
    const event: AuditEvent = { eventType: 'logout', ts: FIXED_NOW };
    await expect(logger.recordEventStrict(event)).rejects.toMatchObject({
      name: 'AuditError',
      code: 'persistence_failed'
    });
  });
});

describe('AuditLogger satisfies AuditLoggerLike (compile-time)', () => {
  it('is structurally assignable to the integrity flagger contract', () => {
    const db = new FakeDb();
    const logger = new AuditLogger({ db });
    // This is the shape sibling modules (e.g. `IntegrityFlagger`)
    // require. The assignment compiling is the assertion; the runtime
    // expect is just to make vitest happy.
    const asLike: AuditLoggerLike = logger;
    expect(typeof asLike.recordEvent).toBe('function');
  });
});

describe('AuditLogger constructor validation', () => {
  it('rejects missing db', () => {
    // @ts-expect-error — runtime guard
    expect(() => new AuditLogger({})).toThrow(TypeError);
  });

  it('rejects missing options', () => {
    // @ts-expect-error — runtime guard
    expect(() => new AuditLogger(undefined)).toThrow(TypeError);
  });
});
