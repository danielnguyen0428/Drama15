import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  loadMigrations,
  type LoadedMigration
} from '../../src/db/migrations.js';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '../../migrations');

/**
 * Strip SQL comments so we can assert on actual statements rather than
 * documentation. Handles both line comments (`-- ...`) and block
 * comments (`/* ... *\/`).
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

/**
 * Find the first statement (terminated by `;`) that contains every
 * keyword, in order, ignoring SQL comments. Returns the trimmed
 * statement string, or `undefined` if no statement matches.
 */
function findStatement(sql: string, ...keywords: string[]): string | undefined {
  const stripped = stripSqlComments(sql);
  const statements = stripped.split(';');
  for (const raw of statements) {
    const stmt = raw.trim();
    if (stmt.length === 0) continue;
    const upper = stmt.toUpperCase();
    let cursor = 0;
    let matchedAll = true;
    for (const k of keywords) {
      const idx = upper.indexOf(k.toUpperCase(), cursor);
      if (idx === -1) {
        matchedAll = false;
        break;
      }
      cursor = idx + k.length;
    }
    if (matchedAll) return stmt;
  }
  return undefined;
}

describe('migration 0004_audit_events_admin_flags', () => {
  let migration: LoadedMigration;

  beforeAll(async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const found = all.find((m) => m.id === '0004');
    if (!found) {
      throw new Error('Migration 0004 not found');
    }
    migration = found;
  });

  it('is named audit_events_admin_flags', () => {
    expect(migration.name).toBe('audit_events_admin_flags');
  });

  describe('up.sql', () => {
    it('creates the admin_flag_reason enum', () => {
      const stmt = findStatement(
        migration.up,
        'CREATE',
        'TYPE',
        'admin_flag_reason',
        'AS',
        'ENUM'
      );
      expect(stmt, 'CREATE TYPE admin_flag_reason ... AS ENUM').toBeDefined();
      expect(stmt!.toLowerCase()).toContain('client_integrity_failed_threshold');
    });

    it('enables row level security on audit_events', () => {
      const enableStmt = findStatement(
        migration.up,
        'ALTER',
        'TABLE',
        'audit_events',
        'ENABLE',
        'ROW',
        'LEVEL',
        'SECURITY'
      );
      expect(enableStmt, 'ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY').toBeDefined();
    });

    it('creates a no-update RLS policy with a false predicate', () => {
      const stmt = findStatement(
        migration.up,
        'CREATE',
        'POLICY',
        'audit_events_no_update',
        'ON',
        'audit_events',
        'FOR',
        'UPDATE'
      );
      expect(stmt, 'CREATE POLICY audit_events_no_update').toBeDefined();
      const lower = stmt!.toLowerCase();
      expect(lower).toMatch(/using\s*\(\s*false\s*\)/);
      expect(lower).toMatch(/with\s+check\s*\(\s*false\s*\)/);
    });

    it('creates a no-delete RLS policy with a false predicate', () => {
      const stmt = findStatement(
        migration.up,
        'CREATE',
        'POLICY',
        'audit_events_no_delete',
        'ON',
        'audit_events',
        'FOR',
        'DELETE'
      );
      expect(stmt, 'CREATE POLICY audit_events_no_delete').toBeDefined();
      expect(stmt!.toLowerCase()).toMatch(/using\s*\(\s*false\s*\)/);
    });

    it('forbids raw token / oauth code keys in details via a CHECK constraint', () => {
      const stripped = stripSqlComments(migration.up).toLowerCase();
      // The CHECK should be named, and it must reject every raw-secret key.
      expect(stripped).toContain('details_no_token_keys');
      expect(stripped).toContain("details ? 'access_token'");
      expect(stripped).toContain("details ? 'refresh_token'");
      expect(stripped).toContain("details ? 'oauth_code'");
      expect(stripped).toContain("details ? 'authorization_code'");
    });

    it('creates a partial unique index ensuring one open flag per (user_id, reason)', () => {
      const stmt = findStatement(
        migration.up,
        'CREATE',
        'UNIQUE',
        'INDEX',
        'admin_flags_one_open_idx',
        'ON',
        'admin_flags'
      );
      expect(stmt, 'CREATE UNIQUE INDEX admin_flags_one_open_idx').toBeDefined();
      const lower = stmt!.toLowerCase();
      expect(lower).toMatch(/\(\s*user_id\s*,\s*reason\s*\)/);
      expect(lower).toMatch(/where\s+cleared_at\s+is\s+null/);
    });

    it('declares admin_flags.reason as the admin_flag_reason enum', () => {
      const stripped = stripSqlComments(migration.up).toLowerCase();
      // The CREATE TABLE admin_flags block should reference admin_flag_reason.
      expect(stripped).toMatch(/reason\s+admin_flag_reason\s+not\s+null/);
    });
  });

  describe('down.sql', () => {
    it('drops admin_flags, audit_events, and the enum in reverse order', () => {
      const stripped = stripSqlComments(migration.down);
      const adminFlagsIdx = stripped.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+admin_flags/i);
      const auditEventsIdx = stripped.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+audit_events/i);
      const enumIdx = stripped.search(/DROP\s+TYPE\s+IF\s+EXISTS\s+admin_flag_reason/i);

      expect(adminFlagsIdx, 'down.sql must DROP TABLE admin_flags').toBeGreaterThanOrEqual(0);
      expect(auditEventsIdx, 'down.sql must DROP TABLE audit_events').toBeGreaterThanOrEqual(0);
      expect(enumIdx, 'down.sql must DROP TYPE admin_flag_reason').toBeGreaterThanOrEqual(0);

      // Reverse of creation order (up.sql creates: enum -> audit_events -> admin_flags).
      expect(adminFlagsIdx).toBeLessThan(auditEventsIdx);
      expect(auditEventsIdx).toBeLessThan(enumIdx);
    });
  });
});
