-- Migration 0003: story_jobs, chapters, voice_jobs, automation_jobs
--
-- Schema for the long-running generation pipelines: full-story / per-chapter
-- text generation, voice (TTS) batch jobs, and the automated multi-story
-- runner. Builds on 0001 (users, plans).
--
-- Requirement mapping:
--   * 6.4  -> story_jobs.status enum + quota_charged flag (Paid full-story
--            quota commit point).
--   * 6.9  -> story_jobs `version` column powers idempotent retry-without-
--            recharge: re-running a failed job does not re-decrement quota
--            because `quota_charged` already records the commit.
--   * 8.3  -> automation_jobs.target_count CHECK BETWEEN 1 AND 2 caps the
--            scheduled story count.
--   * 8.6  -> story_jobs.automation_job_id FK + ON DELETE SET NULL keeps a
--            paused/aborted automation cycle from cascading into its child
--            stories' history.
--   * 9.4  -> voice_jobs.status enum + chapters_completed counter (0..10)
--            tracks per-chapter TTS progress for resume / partial failure.
--   * 9.7  -> voice_jobs.quota_charged + version: same retry-without-
--            recharge semantics as story_jobs.
--   * 10.1 -> Per-user history sort indexes on (user_id, created_at DESC)
--            for story / voice / automation history listings.
--
-- All four job tables carry a monotonic `version integer` column; FSM
-- transitions in the application use optimistic concurrency
-- (UPDATE ... WHERE version = $expected). See properties 10.4 / 10.7.

-- ------------------------------------------------------------------
-- Enum types
-- ------------------------------------------------------------------
CREATE TYPE story_job_status   AS ENUM ('running', 'paused', 'completed', 'failed', 'partial');
CREATE TYPE chapter_status     AS ENUM ('pending', 'streaming', 'done', 'failed');
CREATE TYPE voice_job_status   AS ENUM ('running', 'paused', 'completed', 'failed', 'partial');
CREATE TYPE automation_status  AS ENUM ('running', 'paused', 'completed', 'failed');

-- ------------------------------------------------------------------
-- automation_jobs (created first; story_jobs.automation_job_id refs it)
-- ------------------------------------------------------------------
CREATE TABLE automation_jobs (
    id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_count    smallint          NOT NULL,
    status          automation_status NOT NULL DEFAULT 'running',
    version         integer           NOT NULL DEFAULT 0,
    created_at      timestamptz       NOT NULL DEFAULT now(),
    updated_at      timestamptz       NOT NULL DEFAULT now(),

    -- Requirement 8.3: an automation cycle schedules at most 2 stories.
    CONSTRAINT automation_jobs_target_count_check
        CHECK (target_count BETWEEN 1 AND 2)
);

CREATE INDEX automation_jobs_user_created_idx
    ON automation_jobs (user_id, created_at DESC);

CREATE TRIGGER automation_jobs_set_updated_at
    BEFORE UPDATE ON automation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- story_jobs
-- ------------------------------------------------------------------
CREATE TABLE story_jobs (
    id                  uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    automation_job_id   uuid                       REFERENCES automation_jobs(id) ON DELETE SET NULL,
    status              story_job_status  NOT NULL DEFAULT 'running',
    version             integer           NOT NULL DEFAULT 0,
    -- Requirement 6.10 / 6.11: niche may be a curated key or a custom
    -- free-form user string.
    niche               text,
    -- Requirement 6.12: output language selected by the user (BCP 47).
    language            text              NOT NULL,
    -- Generation knobs (model, temperature, prompt overrides, ...).
    config              jsonb             NOT NULL DEFAULT '{}'::jsonb,
    quota_charged       boolean           NOT NULL DEFAULT false,
    -- Requirement 6.3 / 6.4: distinguishes Free per-chapter runs from
    -- Paid full-story runs. Free users are constrained to 'single_chapter';
    -- the application layer enforces the plan-coupling rules.
    mode                text              NOT NULL,
    created_at          timestamptz       NOT NULL DEFAULT now(),
    updated_at          timestamptz       NOT NULL DEFAULT now(),
    completed_at        timestamptz,

    CONSTRAINT story_jobs_mode_check
        CHECK (mode IN ('single_chapter', 'full'))
);

CREATE INDEX story_jobs_user_created_idx
    ON story_jobs (user_id, created_at DESC);

CREATE INDEX story_jobs_automation_idx
    ON story_jobs (automation_job_id)
    WHERE automation_job_id IS NOT NULL;

CREATE TRIGGER story_jobs_set_updated_at
    BEFORE UPDATE ON story_jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- chapters
-- ------------------------------------------------------------------
CREATE TABLE chapters (
    story_id        uuid            NOT NULL REFERENCES story_jobs(id) ON DELETE CASCADE,
    index           smallint        NOT NULL,
    status          chapter_status  NOT NULL DEFAULT 'pending',
    -- Object key in storage; null until first stream chunk lands.
    content_ref     text,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now(),

    CONSTRAINT chapters_index_range_check
        CHECK (index BETWEEN 1 AND 10),

    PRIMARY KEY (story_id, index)
);

CREATE INDEX chapters_status_idx
    ON chapters (story_id, status);

CREATE TRIGGER chapters_set_updated_at
    BEFORE UPDATE ON chapters
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- voice_jobs
-- ------------------------------------------------------------------
CREATE TABLE voice_jobs (
    id                      uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 uuid              NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    story_id                uuid              NOT NULL REFERENCES story_jobs(id) ON DELETE CASCADE,
    voice_id                text              NOT NULL,
    speed                   numeric(4,2)      NOT NULL DEFAULT 1.00,
    pitch                   numeric(5,2)      NOT NULL DEFAULT 0.00,
    status                  voice_job_status  NOT NULL DEFAULT 'running',
    version                 integer           NOT NULL DEFAULT 0,
    chapters_completed      smallint          NOT NULL DEFAULT 0,
    quota_charged           boolean           NOT NULL DEFAULT false,
    created_at              timestamptz       NOT NULL DEFAULT now(),
    updated_at              timestamptz       NOT NULL DEFAULT now(),
    completed_at            timestamptz,

    CONSTRAINT voice_jobs_speed_range_check
        CHECK (speed BETWEEN 0.5 AND 2.0),
    CONSTRAINT voice_jobs_pitch_range_check
        CHECK (pitch BETWEEN -12 AND 12),
    CONSTRAINT voice_jobs_chapters_completed_range_check
        CHECK (chapters_completed BETWEEN 0 AND 10)
);

CREATE INDEX voice_jobs_user_created_idx
    ON voice_jobs (user_id, created_at DESC);

CREATE INDEX voice_jobs_story_idx
    ON voice_jobs (story_id);

CREATE TRIGGER voice_jobs_set_updated_at
    BEFORE UPDATE ON voice_jobs
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
