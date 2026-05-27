-- Reverse of 0005_user_deletion_schedule.up.sql.
--
-- Drops in reverse creation order. The `users` table belongs to
-- migration 0001 and is intentionally left in place.

-- Index on user_deletion_schedule (dropped implicitly with the table,
-- but listed explicitly so partial rollback works on older Postgres).
DROP INDEX IF EXISTS user_deletion_schedule_due_at_idx;

DROP TABLE IF EXISTS user_deletion_schedule;
