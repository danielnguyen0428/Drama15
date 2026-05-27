-- Reverse of 0003_jobs_chapters.up.sql.
--
-- Drops triggers, then tables (respecting FK direction), then enums.
-- The set_updated_at() helper function is owned by 0001 and is left in
-- place.

-- Triggers (drop before owning tables for clarity).
DROP TRIGGER IF EXISTS voice_jobs_set_updated_at      ON voice_jobs;
DROP TRIGGER IF EXISTS chapters_set_updated_at        ON chapters;
DROP TRIGGER IF EXISTS story_jobs_set_updated_at      ON story_jobs;
DROP TRIGGER IF EXISTS automation_jobs_set_updated_at ON automation_jobs;

-- Tables in reverse FK dependency order:
--   chapters     -> story_jobs
--   voice_jobs   -> story_jobs (and users)
--   story_jobs   -> automation_jobs (nullable, ON DELETE SET NULL)
DROP TABLE IF EXISTS chapters;
DROP TABLE IF EXISTS voice_jobs;
DROP TABLE IF EXISTS story_jobs;
DROP TABLE IF EXISTS automation_jobs;

-- Enums in reverse declaration order.
DROP TYPE IF EXISTS automation_status;
DROP TYPE IF EXISTS voice_job_status;
DROP TYPE IF EXISTS chapter_status;
DROP TYPE IF EXISTS story_job_status;
