import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  loadMigrations,
  type LoadedMigration
} from '../../src/db/migrations.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '../../migrations');

describe('migration 0001 — users / plans / plan_history', () => {
  let m1: LoadedMigration;

  beforeAll(async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const first = all.find((m) => m.id === '0001');
    if (!first) {
      throw new Error('Migration 0001 not found in ' + MIGRATIONS_DIR);
    }
    m1 = first;
  });

  describe('up.sql', () => {
    it('enables the pgcrypto and citext extensions', () => {
      expect(m1.up).toMatch(/CREATE EXTENSION IF NOT EXISTS pgcrypto/);
      expect(m1.up).toMatch(/CREATE EXTENSION IF NOT EXISTS citext/);
    });

    it('creates all five enum types', () => {
      expect(m1.up).toMatch(
        /CREATE TYPE plan_type AS ENUM \('Free_Plan', 'Paid_Plan'\)/
      );
      expect(m1.up).toMatch(
        /CREATE TYPE plan_status AS ENUM \('active', 'expired', 'revoked', 'pending_deletion'\)/
      );
      expect(m1.up).toMatch(
        /CREATE TYPE user_status AS ENUM \('active', 'pending_deletion', 'deleted'\)/
      );
      expect(m1.up).toMatch(/CREATE TYPE ui_locale AS ENUM \('vi', 'en'\)/);
      expect(m1.up).toMatch(/CREATE TYPE plan_history_reason AS ENUM/);
      // All five plan_history reasons must be present.
      for (const reason of [
        'auto_assign',
        'admin_upgrade',
        'admin_revoke',
        'expired',
        'renewed'
      ]) {
        expect(m1.up).toContain(`'${reason}'`);
      }
    });

    it('creates the users, plans, and plan_history tables', () => {
      expect(m1.up).toMatch(/CREATE TABLE users\b/);
      expect(m1.up).toMatch(/CREATE TABLE plans\b/);
      expect(m1.up).toMatch(/CREATE TABLE plan_history\b/);
    });

    it('users table has token_epoch bigint and ui_locale columns', () => {
      // Column declarations live inside the users CREATE TABLE block.
      const usersBlock = extractCreateTableBlock(m1.up, 'users');
      expect(usersBlock).toMatch(/token_epoch\s+bigint\s+NOT NULL\s+DEFAULT\s+0/i);
      expect(usersBlock).toMatch(/ui_locale\s+ui_locale\s+NOT NULL\s+DEFAULT\s+'vi'/i);
      expect(usersBlock).toMatch(/email\s+citext\s+UNIQUE\s+NOT NULL/i);
    });

    it('declares the three named CHECK constraints on plans', () => {
      expect(m1.up).toMatch(/CONSTRAINT\s+plan_paid_fields_consistent\s+CHECK/);
      expect(m1.up).toMatch(/CONSTRAINT\s+plan_paid_30d_window\s+CHECK/);
      expect(m1.up).toMatch(/CONSTRAINT\s+quota_counters_nonneg\s+CHECK/);
      // 30-day window must reference the exact interval.
      expect(m1.up).toMatch(/INTERVAL\s+'30 days'/);
    });

    it('enables RLS on plan_history with no-update and no-delete policies', () => {
      expect(m1.up).toMatch(
        /ALTER TABLE plan_history ENABLE ROW LEVEL SECURITY/
      );
      expect(m1.up).toMatch(
        /CREATE POLICY plan_history_no_update ON plan_history[\s\S]*FOR UPDATE[\s\S]*USING \(false\)/
      );
      expect(m1.up).toMatch(
        /CREATE POLICY plan_history_no_delete ON plan_history[\s\S]*FOR DELETE[\s\S]*USING \(false\)/
      );
    });
  });

  describe('down.sql', () => {
    it('drops plan_history before plans before users (FK order)', () => {
      const idxHistory = m1.down.indexOf('DROP TABLE IF EXISTS plan_history');
      const idxPlans = m1.down.indexOf('DROP TABLE IF EXISTS plans');
      const idxUsers = m1.down.indexOf('DROP TABLE IF EXISTS users');

      expect(idxHistory).toBeGreaterThanOrEqual(0);
      expect(idxPlans).toBeGreaterThanOrEqual(0);
      expect(idxUsers).toBeGreaterThanOrEqual(0);
      expect(idxHistory).toBeLessThan(idxPlans);
      expect(idxPlans).toBeLessThan(idxUsers);
    });

    it('drops every enum the up migration created, in reverse order', () => {
      const expectedOrder = [
        'plan_history_reason',
        'ui_locale',
        'user_status',
        'plan_status',
        'plan_type'
      ];
      const positions = expectedOrder.map((t) =>
        m1.down.indexOf(`DROP TYPE IF EXISTS ${t}`)
      );
      for (const [i, p] of positions.entries()) {
        expect(p, `missing DROP TYPE for ${expectedOrder[i]}`).toBeGreaterThanOrEqual(0);
      }
      const sorted = [...positions].sort((a, b) => a - b);
      expect(positions).toEqual(sorted);
    });

    it('does not drop pgcrypto or citext extensions (shared with later migrations)', () => {
      expect(m1.down).not.toMatch(/DROP EXTENSION[^;]*pgcrypto/);
      expect(m1.down).not.toMatch(/DROP EXTENSION[^;]*citext/);
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
  // Walk forward and balance parentheses.
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
