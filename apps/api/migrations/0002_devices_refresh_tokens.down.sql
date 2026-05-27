-- Reverse of 0002_devices_refresh_tokens.up.sql.
--
-- Drops are ordered so the dependency graph from the up migration is
-- unwound cleanly:
--   indexes / triggers -> refresh_tokens -> devices -> enums.
-- The set_updated_at() helper and the pgcrypto / citext extensions are
-- left in place because they are owned by 0001 and are still needed by
-- later migrations.

-- Triggers on devices (drop before the table that owns them).
DROP TRIGGER IF EXISTS devices_set_updated_at ON devices;

-- Indexes are dropped implicitly with their tables, but listing them
-- here makes partial rollbacks on older Postgres robust.
DROP INDEX IF EXISTS refresh_tokens_expires_at_idx;
DROP INDEX IF EXISTS refresh_tokens_active_idx;
DROP INDEX IF EXISTS refresh_tokens_family_id_idx;
DROP INDEX IF EXISTS refresh_tokens_user_id_idx;
DROP INDEX IF EXISTS devices_active_idx;
DROP INDEX IF EXISTS devices_fingerprint_idx;
DROP INDEX IF EXISTS devices_user_id_idx;

-- Tables in reverse-creation order. refresh_tokens has a self-FK on
-- parent_id, but DROP TABLE handles that automatically.
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS devices;

-- Enums in reverse-creation order.
DROP TYPE IF EXISTS refresh_revoke_reason;
DROP TYPE IF EXISTS device_status;
