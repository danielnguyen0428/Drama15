import { describe, it, expect, beforeAll } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadMigrations, type LoadedMigration } from '../../src/db/migrations.js';

// __dirname equivalent for ESM.
const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(HERE, '..', '..', 'migrations');

/**
 * 0003 introduces the long-running generation pipelines:
 * story_jobs, chapters, voice_jobs, automation_jobs.
 *
 * These tests inspect the raw SQL — they do not connect to Postgres.
 * That makes them fast, deterministic, and safe to run in CI without a
 * database container.
 */
describe('migration 0003 — story / voice / automation jobs and chapters', () => {
  let migration: LoadedMigration;
  let up: string;
  let down: string;

  beforeAll(async () => {
    const all = await loadMigrations(MIGRATIONS_DIR);
    const found = all.find((m) => m.id === '0003');
    expect(found, 'migration 0003 must be loadable').toBeDefined();
    migration = found!;
    up = migration.up;
    down = migration.down;
  });

  it('uses the expected slug', () => {
    expect(migration.name).toBe('jobs_chapters');
  });

  describe('status enums', () => {
    it('creates story_job_status with all five states', () => {
      expect(up).toMatch(
        /CREATE TYPE\s+story_job_status\s+AS ENUM\s*\(\s*'running'\s*,\s*'paused'\s*,\s*'completed'\s*,\s*'failed'\s*,\s*'partial'\s*\)/i
      );
    });

    it('creates chapter_status with the four chapter states', () => {
      expect(up).toMatch(
        /CREATE TYPE\s+chapter_status\s+AS ENUM\s*\(\s*'pending'\s*,\s*'streaming'\s*,\s*'done'\s*,\s*'failed'\s*\)/i
      );
    });

    it('creates voice_job_status with all five states', () => {
      expect(up).toMatch(
        /CREATE TYPE\s+voice_job_status\s+AS ENUM\s*\(\s*'running'\s*,\s*'paused'\s*,\s*'completed'\s*,\s*'failed'\s*,\s*'partial'\s*\)/i
      );
    });

    it('creates automation_status without a `partial` state', () => {
      expect(up).toMatch(
        /CREATE TYPE\s+automation_status\s+AS ENUM\s*\(\s*'running'\s*,\s*'paused'\s*,\s*'completed'\s*,\s*'failed'\s*\)/i
      );
      // automation_jobs is binary success/failure — no partial bucket.
      const autoEnum = up.match(/CREATE TYPE\s+automation_status\s+AS ENUM[^;]+;/i)?.[0] ?? '';
      expect(autoEnum).not.toMatch(/'partial'/);
    });
  });

  describe('chapters table', () => {
    it('has primary key (story_id, index)', () => {
      // Match either inline PRIMARY KEY in a multi-column form.
      expect(up).toMatch(/PRIMARY KEY\s*\(\s*story_id\s*,\s*index\s*\)/i);
    });

    it('enforces 1..10 chapter index range via CHECK', () => {
      expect(up).toMatch(/CHECK\s*\(\s*index\s+BETWEEN\s+1\s+AND\s+10\s*\)/i);
    });

    it('references story_jobs with ON DELETE CASCADE', () => {
      // The FK is on `story_id`.
      expect(up).toMatch(
        /story_id\s+uuid\s+NOT NULL\s+REFERENCES\s+story_jobs\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i
      );
    });
  });

  describe('automation_jobs table', () => {
    it('CHECK-bounds target_count to 1..2 (Requirement 8.3)', () => {
      expect(up).toMatch(/CHECK\s*\(\s*target_count\s+BETWEEN\s+1\s+AND\s+2\s*\)/i);
    });

    it('has a version column for optimistic FSM transitions', () => {
      const block = automationJobsBlock(up);
      expect(block).toMatch(/\bversion\s+integer\s+NOT NULL\s+DEFAULT\s+0/i);
    });
  });

  describe('story_jobs.automation_job_id FK', () => {
    it('is a nullable FK with ON DELETE SET NULL', () => {
      expect(up).toMatch(
        /automation_job_id\s+uuid[^,\n]*REFERENCES\s+automation_jobs\s*\(\s*id\s*\)\s+ON\s+DELETE\s+SET\s+NULL/i
      );
      // No NOT NULL on automation_job_id.
      expect(up).not.toMatch(/automation_job_id\s+uuid\s+NOT NULL/i);
    });

    it('story_jobs has a version and quota_charged column', () => {
      const block = storyJobsBlock(up);
      expect(block).toMatch(/\bversion\s+integer\s+NOT NULL\s+DEFAULT\s+0/i);
      expect(block).toMatch(/\bquota_charged\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i);
    });
  });

  describe('voice_jobs', () => {
    it('has version, quota_charged and chapters_completed columns', () => {
      const block = voiceJobsBlock(up);
      expect(block).toMatch(/\bversion\s+integer\s+NOT NULL\s+DEFAULT\s+0/i);
      expect(block).toMatch(/\bquota_charged\s+boolean\s+NOT NULL\s+DEFAULT\s+false/i);
      expect(block).toMatch(/\bchapters_completed\s+smallint\s+NOT NULL\s+DEFAULT\s+0/i);
    });

    it('CHECK-bounds chapters_completed to 0..10', () => {
      expect(up).toMatch(/CHECK\s*\(\s*chapters_completed\s+BETWEEN\s+0\s+AND\s+10\s*\)/i);
    });
  });

  describe('chapters / automation_jobs do not carry quota_charged', () => {
    it('chapters has no quota_charged column', () => {
      expect(chaptersBlock(up)).not.toMatch(/\bquota_charged\b/i);
    });

    it('automation_jobs has no quota_charged column', () => {
      expect(automationJobsBlock(up)).not.toMatch(/\bquota_charged\b/i);
    });
  });

  describe('history-sort indexes (Requirement 10.1)', () => {
    it('creates (user_id, created_at DESC) indexes for story / voice / automation', () => {
      expect(up).toMatch(/CREATE INDEX\s+story_jobs_user_created_idx[\s\S]*?\(\s*user_id\s*,\s*created_at\s+DESC\s*\)/i);
      expect(up).toMatch(/CREATE INDEX\s+voice_jobs_user_created_idx[\s\S]*?\(\s*user_id\s*,\s*created_at\s+DESC\s*\)/i);
      expect(up).toMatch(/CREATE INDEX\s+automation_jobs_user_created_idx[\s\S]*?\(\s*user_id\s*,\s*created_at\s+DESC\s*\)/i);
    });
  });

  describe('down.sql drops in correct reverse order', () => {
    it('drops chapters before story_jobs (chapters depends on story_jobs)', () => {
      const chaptersIdx   = down.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+chapters\b/i);
      const storyJobsIdx  = down.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+story_jobs\b/i);
      expect(chaptersIdx).toBeGreaterThan(-1);
      expect(storyJobsIdx).toBeGreaterThan(-1);
      expect(chaptersIdx).toBeLessThan(storyJobsIdx);
    });

    it('drops voice_jobs before story_jobs (voice_jobs.story_id FK)', () => {
      const voiceJobsIdx = down.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+voice_jobs\b/i);
      const storyJobsIdx = down.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+story_jobs\b/i);
      expect(voiceJobsIdx).toBeGreaterThan(-1);
      expect(storyJobsIdx).toBeGreaterThan(-1);
      expect(voiceJobsIdx).toBeLessThan(storyJobsIdx);
    });

    it('drops story_jobs before automation_jobs (story_jobs.automation_job_id FK)', () => {
      const storyJobsIdx       = down.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+story_jobs\b/i);
      const automationJobsIdx  = down.search(/DROP\s+TABLE\s+IF\s+EXISTS\s+automation_jobs\b/i);
      expect(storyJobsIdx).toBeGreaterThan(-1);
      expect(automationJobsIdx).toBeGreaterThan(-1);
      expect(storyJobsIdx).toBeLessThan(automationJobsIdx);
    });

    it('drops enums in reverse declaration order', () => {
      const automationStatusIdx = down.search(/DROP\s+TYPE\s+IF\s+EXISTS\s+automation_status\b/i);
      const voiceJobStatusIdx   = down.search(/DROP\s+TYPE\s+IF\s+EXISTS\s+voice_job_status\b/i);
      const chapterStatusIdx    = down.search(/DROP\s+TYPE\s+IF\s+EXISTS\s+chapter_status\b/i);
      const storyJobStatusIdx   = down.search(/DROP\s+TYPE\s+IF\s+EXISTS\s+story_job_status\b/i);

      expect(automationStatusIdx).toBeGreaterThan(-1);
      expect(voiceJobStatusIdx).toBeGreaterThan(-1);
      expect(chapterStatusIdx).toBeGreaterThan(-1);
      expect(storyJobStatusIdx).toBeGreaterThan(-1);

      // Reverse of the up declaration order:
      //   story_job_status, chapter_status, voice_job_status, automation_status
      // -> automation_status, voice_job_status, chapter_status, story_job_status
      expect(automationStatusIdx).toBeLessThan(voiceJobStatusIdx);
      expect(voiceJobStatusIdx).toBeLessThan(chapterStatusIdx);
      expect(chapterStatusIdx).toBeLessThan(storyJobStatusIdx);
    });

    it('drops all four type enums', () => {
      for (const enumName of ['story_job_status', 'chapter_status', 'voice_job_status', 'automation_status']) {
        expect(down).toMatch(new RegExp(`DROP\\s+TYPE\\s+IF\\s+EXISTS\\s+${enumName}\\b`, 'i'));
      }
    });
  });
});

// ------------------------------------------------------------------
// Helpers: extract the body of a CREATE TABLE block by name.
// We deliberately do *not* depend on a SQL parser — the migration is
// authored by hand and has a predictable shape.
// ------------------------------------------------------------------
function tableBlock(sql: string, table: string): string {
  const re = new RegExp(`CREATE TABLE\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\)\\s*;`, 'i');
  const m = re.exec(sql);
  if (!m) {
    throw new Error(`Could not locate CREATE TABLE ${table} in migration up.sql`);
  }
  return m[1]!;
}

function automationJobsBlock(sql: string): string {
  return tableBlock(sql, 'automation_jobs');
}

function storyJobsBlock(sql: string): string {
  return tableBlock(sql, 'story_jobs');
}

function voiceJobsBlock(sql: string): string {
  return tableBlock(sql, 'voice_jobs');
}

function chaptersBlock(sql: string): string {
  return tableBlock(sql, 'chapters');
}
