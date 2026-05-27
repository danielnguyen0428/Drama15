import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  loadMigrations,
  type LoadedMigration
} from '../../src/db/migrations.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '../../migrations');

describe('migration 0002 — devices / refresh_tokens', () => {
  let m2: LoadedMigration;

  beforeAll(async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const found = all.find((m) => m.id === '0002');
    if (!found) {
      throw new Error('Migration 0002 not found in ' + MIGRATIONS_DIR);
    }
    m2 = found;
  });

  describe('up.sql', () => {
    it('creates the device_status enum with active and revoked', () => {
      expect(m2.up).toMatch(
        /CREATE TYPE device_status AS ENUM \('active', 'revoked'\)/
      );
    });

    it('creates the refresh_revoke_reason enum with all five reasons', () => {
      expect(m2.up).toMatch(/CREATE TYPE refresh_revoke_reason AS ENUM/);
      for (const reason of [
        'rotated',
        'logout',
        'device_remove',
        'paid_revoked',
        'family_compromised'
      ]) {
        expect(m2.up).toContain(`'${reason}'`);
      }
    });

    it('creates the devices table with the listed columns and composite PK', () => {
      expect(m2.up).toMatch(/CREATE TABLE devices\b/);
      const block = extractCreateTableBlock(m2.up, 'devices');
      // FK + ON DELETE CASCADE preserves Requirement 4.1 / 4.6 cleanup
      // semantics when a user is deleted.
      expect(block).toMatch(
        /user_id\s+uuid\s+NOT NULL\s+REFERENCES\s+users\(id\)\s+ON DELETE CASCADE/i
      );
      expect(block).toMatch(/fingerprint\s+text\s+NOT NULL/i);
      expect(block).toMatch(/first_seen\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
      expect(block).toMatch(/last_seen\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
      expect(block).toMatch(/last_ip\s+inet/i);
      expect(block).toMatch(/last_country\s+text/i);
      expect(block).toMatch(
        /status\s+device_status\s+NOT NULL\s+DEFAULT\s+'active'/i
      );
      expect(block).toMatch(/PRIMARY KEY\s*\(\s*user_id\s*,\s*fingerprint\s*\)/i);
    });

    it('creates the refresh_tokens table with the listed columns', () => {
      expect(m2.up).toMatch(/CREATE TABLE refresh_tokens\b/);
      const block = extractCreateTableBlock(m2.up, 'refresh_tokens');
      expect(block).toMatch(/id\s+uuid\s+PRIMARY KEY\s+DEFAULT\s+gen_random_uuid\(\)/i);
      expect(block).toMatch(
        /user_id\s+uuid\s+NOT NULL\s+REFERENCES\s+users\(id\)\s+ON DELETE CASCADE/i
      );
      expect(block).toMatch(/family_id\s+uuid\s+NOT NULL/i);
      // parent_id is nullable (root of a family). It must still
      // reference refresh_tokens(id) so the chain stays well-formed.
      expect(block).toMatch(/parent_id\s+uuid\b/i);
      expect(block).toMatch(/REFERENCES\s+refresh_tokens\(id\)/i);
      expect(block).toMatch(/token_hash\s+text\s+NOT NULL\s+UNIQUE/i);
      expect(block).toMatch(/device_fingerprint\s+text\s+NOT NULL/i);
      expect(block).toMatch(
        /issued_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i
      );
      expect(block).toMatch(/expires_at\s+timestamptz\s+NOT NULL/i);
      expect(block).toMatch(/revoked_at\s+timestamptz/i);
      expect(block).toMatch(/revoke_reason\s+refresh_revoke_reason/i);
    });

    it('declares the expires_at_within_7d CHECK with millisecond truncation', () => {
      expect(m2.up).toMatch(/CONSTRAINT\s+expires_at_within_7d\s+CHECK/);
      // Both sides of the equality must be wrapped in
      // date_trunc('millisecond', ...) and the interval must be
      // exactly 7 days.
      expect(m2.up).toMatch(/date_trunc\('millisecond',\s*expires_at\)/);
      expect(m2.up).toMatch(
        /date_trunc\('millisecond',\s*issued_at\s*\+\s*INTERVAL\s+'7 days'\)/
      );
    });

    it('declares the revoke_consistency CHECK', () => {
      expect(m2.up).toMatch(/CONSTRAINT\s+revoke_consistency\s+CHECK/);
    });

    it('creates the active partial indexes on devices and refresh_tokens', () => {
      // Free_Plan single-fingerprint guard (Requirement 2.3).
      expect(m2.up).toMatch(
        /CREATE INDEX\s+devices_active_idx\s+ON\s+devices\s*\(fingerprint\)\s+WHERE\s+status\s*=\s*'active'/i
      );
      // Active refresh-token lookup per (user, device).
      expect(m2.up).toMatch(
        /CREATE INDEX\s+refresh_tokens_active_idx[\s\S]*ON\s+refresh_tokens\s*\(user_id,\s*device_fingerprint\)[\s\S]*WHERE\s+revoked_at\s+IS\s+NULL/i
      );
    });

    it('also creates the supporting non-partial indexes', () => {
      expect(m2.up).toMatch(/CREATE INDEX\s+devices_user_id_idx\b/);
      expect(m2.up).toMatch(/CREATE INDEX\s+devices_fingerprint_idx\b/);
      expect(m2.up).toMatch(/CREATE INDEX\s+refresh_tokens_user_id_idx\b/);
      expect(m2.up).toMatch(/CREATE INDEX\s+refresh_tokens_family_id_idx\b/);
      expect(m2.up).toMatch(
        /CREATE INDEX\s+refresh_tokens_expires_at_idx[\s\S]*WHERE\s+revoked_at\s+IS\s+NULL/i
      );
    });

    it('reuses the set_updated_at() trigger function from 0001', () => {
      // 0002 must NOT redeclare the helper function; it just attaches
      // a trigger to devices that calls it.
      expect(m2.up).not.toMatch(/CREATE\s+(OR REPLACE\s+)?FUNCTION\s+set_updated_at/);
      expect(m2.up).toMatch(
        /CREATE TRIGGER\s+devices_set_updated_at[\s\S]*BEFORE UPDATE ON\s+devices[\s\S]*EXECUTE FUNCTION\s+set_updated_at\(\)/i
      );
    });

    it('documents the requirement mapping in a header comment', () => {
      // Smoke-test the doc block so future edits do not silently lose
      // the requirement linkage.
      expect(m2.up).toMatch(/Requirement mapping:/);
      for (const req of ['1.7', '1.8', '2.3', '4.1', '4.2', '4.3', '4.6']) {
        expect(m2.up).toContain(req);
      }
    });
  });

  describe('down.sql', () => {
    it('drops refresh_tokens before devices (refresh_tokens has no FK to devices, but order is documented)', () => {
      const idxRefresh = m2.down.indexOf('DROP TABLE IF EXISTS refresh_tokens');
      const idxDevices = m2.down.indexOf('DROP TABLE IF EXISTS devices');
      expect(idxRefresh).toBeGreaterThanOrEqual(0);
      expect(idxDevices).toBeGreaterThanOrEqual(0);
      expect(idxRefresh).toBeLessThan(idxDevices);
    });

    it('drops both enums in reverse-creation order', () => {
      const idxReason = m2.down.indexOf('DROP TYPE IF EXISTS refresh_revoke_reason');
      const idxStatus = m2.down.indexOf('DROP TYPE IF EXISTS device_status');
      expect(idxReason).toBeGreaterThanOrEqual(0);
      expect(idxStatus).toBeGreaterThanOrEqual(0);
      // refresh_revoke_reason is created last in up.sql, so it must
      // be dropped first in down.sql.
      expect(idxReason).toBeLessThan(idxStatus);
    });

    it('does not drop the set_updated_at function or extensions owned by 0001', () => {
      expect(m2.down).not.toMatch(/DROP FUNCTION[^;]*set_updated_at/);
      expect(m2.down).not.toMatch(/DROP EXTENSION[^;]*pgcrypto/);
      expect(m2.down).not.toMatch(/DROP EXTENSION[^;]*citext/);
    });
  });
});

/**
 * Pull out the body of `CREATE TABLE <name> ( ... );` so column-level
 * regex assertions are not confused by sibling tables.
 */
function extractCreateTableBlock(sql: string, table: string): string {
  const start = sql.search(new RegExp(`CREATE TABLE ${table}\\b`));
  if (start < 0) {
    throw new Error(`CREATE TABLE ${table} not found`);
  }
  const open = sql.indexOf('(', start);
  if (open < 0) throw new Error(`No opening paren after CREATE TABLE ${table}`);
  let depth = 0;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return sql.slice(open, i + 1);
      }
    }
  }
  throw new Error(`Unbalanced parens in CREATE TABLE ${table}`);
}
