-- Reverse of 0004_audit_events_admin_flags.up.sql.
--
-- Drops in reverse creation order. The `set_updated_at()` helper and
-- the `users` table belong to migration 0001 and are intentionally
-- left in place.

-- Triggers (drop before owning tables for clean partial rollback).
DROP TRIGGER IF EXISTS admin_flags_set_updated_at ON admin_flags;

-- Indexes on admin_flags (dropped implicitly with the table, but
-- listed explicitly so partial rollback works on older Postgres).
DROP INDEX IF EXISTS admin_flags_open_idx;
DROP INDEX IF EXISTS admin_flags_one_open_idx;

-- RLS policies on audit_events (dropped implicitly with the table,
-- but listed explicitly for partial-rollback safety).
DROP POLICY IF EXISTS audit_events_no_delete ON audit_events;
DROP POLICY IF EXISTS audit_events_no_update ON audit_events;
DROP POLICY IF EXISTS audit_events_select    ON audit_events;
DROP POLICY IF EXISTS audit_events_insert    ON audit_events;

DROP INDEX IF EXISTS audit_events_ip_ts_idx;
DROP INDEX IF EXISTS audit_events_event_type_ts_idx;
DROP INDEX IF EXISTS audit_events_user_ts_idx;

-- Tables in dependency order (admin_flags references users; audit_events
-- has only an optional FK to users).
DROP TABLE IF EXISTS admin_flags;
DROP TABLE IF EXISTS audit_events;

-- Enum in reverse creation order.
DROP TYPE IF EXISTS admin_flag_reason;
