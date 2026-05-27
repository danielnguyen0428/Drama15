import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadMigrations, type LoadedMigration } from '../../src/db/migrations.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', '..', 'migrations');

/**
 * Strip SQL comments so we can assert on actual statements rather
 * than documentation. Mirrors the helper in
 * `0005-user-deletion-schedule.test.ts`.
 */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');
}

/**
 * Find the first `;`-terminated statement in `sql` that contains
 * every keyword in order. Returns the trimmed statement, or
 * `undefined`.
 */
function findStatement(sql: string, ...keywords: string[]): string | undefined {
  const stripped = stripSqlComments(sql);
  for (const raw of stripped.split(';')) {
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

describe('migration 0006 — ip_block_list', () => {
  let migration: LoadedMigration;
  let up: string;
  let down: string;

  beforeAll(async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const found = all.find((m) => m.id === '0006');
    expect(found, 'migration 0006 must be loadable').toBeDefined();
    migration = found!;
    up = migration.up;
    down = migration.down;
  });

  it('uses the expected slug', () => {
    expect(migration.name).toBe('ip_block_list');
  });

  describe('up.sql', () => {
    it('creates the ip_block_list table', () => {
      const stmt = findStatement(up, 'CREATE', 'TABLE', 'ip_block_list');
      expect(stmt, 'CREATE TABLE ip_block_list').toBeDefined();
    });

    it('declares block as text PRIMARY KEY', () => {
      const stripped = stripSqlComments(up);
      // Allow either inline `block text PRIMARY KEY` or a column with
      // separate constraint clause.
      expect(stripped).toMatch(/block\s+text\s+PRIMARY KEY/i);
    });

    it('declares banned_until as timestamptz NOT NULL', () => {
      const stripped = stripSqlComments(up);
      expect(stripped).toMatch(/banned_until\s+timestamptz\s+NOT NULL/i);
    });

    it('declares reason as text NOT NULL with the expected default', () => {
      const stripped = stripSqlComments(up);
      expect(stripped).toMatch(
        /reason\s+text\s+NOT NULL\s+DEFAULT\s+'login_failed_threshold'/i
      );
    });

    it('declares created_at as timestamptz NOT NULL DEFAULT now()', () => {
      const stripped = stripSqlComments(up);
      expect(stripped).toMatch(/created_at\s+timestamptz\s+NOT NULL\s+DEFAULT\s+now\(\)/i);
    });

    it('creates ip_block_list_banned_until_idx on (banned_until)', () => {
      const stmt = findStatement(
        up,
        'CREATE',
        'INDEX',
        'ip_block_list_banned_until_idx',
        'ON',
        'ip_block_list'
      );
      expect(stmt, 'CREATE INDEX ip_block_list_banned_until_idx').toBeDefined();
      expect(stmt!.toLowerCase()).toMatch(/\(\s*banned_until\s*\)/);
    });

    it('does not introduce a foreign key to users — keying unit is a network range', () => {
      const stripped = stripSqlComments(up).toLowerCase();
      // Within the ip_block_list CREATE TABLE block, there should be
      // no `references users` clause.
      const tableMatch = /create\s+table\s+ip_block_list\s*\(([\s\S]*?)\)\s*;/.exec(
        stripped
      );
      expect(tableMatch, 'CREATE TABLE block').toBeTruthy();
      expect(tableMatch![1]).not.toMatch(/references\s+users/);
    });
  });

  describe('down.sql', () => {
    it('drops the index before the table', () => {
      const stripped = stripSqlComments(down);
      const idxIdx = stripped.search(
        /DROP\s+INDEX\s+IF\s+EXISTS\s+ip_block_list_banned_until_idx/i
      );
      const tableIdx = stripped.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+ip_block_list/i);
      expect(
        idxIdx,
        'down.sql must DROP INDEX ip_block_list_banned_until_idx'
      ).toBeGreaterThanOrEqual(0);
      expect(tableIdx, 'down.sql must DROP TABLE ip_block_list').toBeGreaterThanOrEqual(0);
      expect(idxIdx).toBeLessThan(tableIdx);
    });

    it('does not drop the audit_events table from migration 0004', () => {
      expect(down).not.toMatch(/DROP\s+TABLE[^;]*\baudit_events\b/i);
    });

    it('does not drop the users table from migration 0001', () => {
      expect(down).not.toMatch(/DROP\s+TABLE[^;]*\busers\b/i);
    });
  });
});
