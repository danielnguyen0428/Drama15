-- Reverse of 0001_users_plans_plan_history.up.sql.
--
-- We only drop objects that were created by the up migration. The
-- pgcrypto and citext extensions are intentionally left in place
-- because later migrations (devices, refresh_tokens, jobs, ...) share
-- them.

-- Triggers (drop before functions / tables that own them).
DROP TRIGGER IF EXISTS plans_set_updated_at ON plans;
DROP TRIGGER IF EXISTS users_set_updated_at ON users;

-- RLS policies on plan_history (dropped implicitly with the table, but
-- listed explicitly so partial rollback works on older Postgres).
DROP POLICY IF EXISTS plan_history_no_delete ON plan_history;
DROP POLICY IF EXISTS plan_history_no_update ON plan_history;
DROP POLICY IF EXISTS plan_history_select    ON plan_history;
DROP POLICY IF EXISTS plan_history_insert    ON plan_history;

-- Tables in dependency order (plan_history -> plans -> users).
DROP TABLE IF EXISTS plan_history;
DROP TABLE IF EXISTS plans;
DROP TABLE IF EXISTS users;

-- Helper function.
DROP FUNCTION IF EXISTS set_updated_at();

-- Enums in reverse creation order.
DROP TYPE IF EXISTS plan_history_reason;
DROP TYPE IF EXISTS ui_locale;
DROP TYPE IF EXISTS user_status;
DROP TYPE IF EXISTS plan_status;
DROP TYPE IF EXISTS plan_type;
