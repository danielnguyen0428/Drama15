-- Migration 0005: user_deletion_schedule
--
-- Tracks the start of the 30-day PII purge window (Requirement 15.3).
-- When a user requests account deletion, License_Service moves them to
-- `pending_deletion` (see migrations 0001 `user_status` enum and
-- `plans.status` enum) and writes a row here recording exactly when the
-- 30-day countdown began. A daily purge tick (`DailyPurgeScheduler`)
-- consumes this table to find users whose `due_at` has elapsed and
-- physically purges their PII and story data.
--
-- Requirement mapping:
--   * 15.3 -> The 30-day purge SLA from `pending_deletion` to permanent
--             erasure. `due_at` is a STORED generated column equal to
--             `scheduled_at + INTERVAL '30 days'` so the SLA cannot
--             drift even if application code changes; an index on
--             `due_at` makes the daily scan cheap.
--
-- Why a separate table rather than a `users.pending_deletion_at`
-- column?
--   * Keeps the lifecycle module self-contained: the purge worker only
--     needs to scan this table.
--   * Lets us record at most one schedule entry per user via the PK on
--     `user_id` while preserving the original timestamp across
--     idempotent re-requests (the application uses
--     `INSERT ... ON CONFLICT DO NOTHING`, which is the
--     "schedule once" behaviour Requirement 15.3 implies).
--   * The row is removed by the cascade in `users.id ON DELETE CASCADE`
--     if a user is ever hard-deleted; for the normal lifecycle the row
--     is left in place after purge as an audit anchor.

-- ------------------------------------------------------------------
-- user_deletion_schedule
-- ------------------------------------------------------------------
CREATE TABLE user_deletion_schedule (
    user_id        uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    scheduled_at   timestamptz NOT NULL,
    -- Requirement 15.3: due_at = scheduled_at + 30 days. STORED so the
    -- value is materialised once and indexable.
    due_at         timestamptz NOT NULL
                   GENERATED ALWAYS AS (scheduled_at + INTERVAL '30 days') STORED
);

-- Supports the daily "find users due for purge" scan (Requirement 15.3).
CREATE INDEX user_deletion_schedule_due_at_idx
    ON user_deletion_schedule (due_at);
