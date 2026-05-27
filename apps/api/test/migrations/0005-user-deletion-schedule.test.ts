import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadMigrations, type LoadedMigration } from '../../src/db/migrations.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', '..', 'migrations');

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
 * Find the first `;`-terminated statement that contains every keyword
 * in order. Returns the trimmed statement, or `undefined`.
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

describe('migration 0005 — user_deletion_schedule', () => {
  let migration: LoadedMigration;
  let up: string;
  let down: string;

  beforeAll(async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const found = all.find((m) => m.id === '0005');
    expect(found, 'migration 0005 must be loadable').toBeDefined();
    migration = found!;
    up = migration.up;
    down = migration.down;
  });

  it('uses the expected slug', () => {
    expect(migration.name).toBe('user_deletion_schedule');
  });

  describe('up.sql', () => {
    it('creates the user_deletion_schedule table', () => {
      const stmt = findStatement(up, 'CREATE', 'TABLE', 'user_deletion_schedule');
      expect(stmt, 'CREATE TABLE user_deletion_schedule').toBeDefined();
    });

    it('has user_id as the primary key with FK to users(id) ON DELETE CASCADE', () => {
      const stripped = stripSqlComments(up);
      // user_id is the primary key.
      expect(stripped).toMatch(
        /user_id\s+uuid\s+PRIMARY KEY\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i
      );
    });

    it('declares scheduled_at as timestamptz NOT NULL', () => {
      const stripped = stripSqlComments(up);
      expect(stripped).toMatch(/scheduled_at\s+timestamptz\s+NOT NULL/i);
    });

    it('declares due_at as a STORED generated column equal to scheduled_at + 30 days', () => {
      const stripped = stripSqlComments(up).toLowerCase();
      // due_at must be timestamptz NOT NULL.
      expect(stripped).toMatch(/due_at\s+timestamptz\s+not\s+null/);
      // It must be GENERATED ALWAYS AS (scheduled_at + INTERVAL '30 days') STORED.
      expect(stripped).toMatch(
        /due_at[\s\S]*?generated\s+always\s+as\s*\(\s*scheduled_at\s*\+\s*interval\s*'30 days'\s*\)\s+stored/
      );
    });

    it('creates user_deletion_schedule_due_at_idx on (due_at)', () => {
      const stmt = findStatement(
        up,
        'CREATE',
        'INDEX',
        'user_deletion_schedule_due_at_idx',
        'ON',
        'user_deletion_schedule'
      );
      expect(stmt, 'CREATE INDEX user_deletion_schedule_due_at_idx').toBeDefined();
      expect(stmt!.toLowerCase()).toMatch(/\(\s*due_at\s*\)/);
    });
  });

  describe('down.sql', () => {
    it('drops the index before the table', () => {
      const stripped = stripSqlComments(down);
      const idxIdx = stripped.search(
        /DROP\s+INDEX\s+IF\s+EXISTS\s+user_deletion_schedule_due_at_idx/i
      );
      const tableIdx = stripped.search(
        /DROP\s+TABLE\s+IF\s+EXISTS\s+user_deletion_schedule/i
      );
      expect(idxIdx, 'down.sql must DROP INDEX user_deletion_schedule_due_at_idx').toBeGreaterThanOrEqual(0);
      expect(tableIdx, 'down.sql must DROP TABLE user_deletion_schedule').toBeGreaterThanOrEqual(0);
      expect(idxIdx).toBeLessThan(tableIdx);
    });

    it('does not drop the users table', () => {
      expect(down).not.toMatch(/DROP\s+TABLE[^;]*\busers\b/i);
    });
  });
});
