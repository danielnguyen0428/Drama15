-- Migration 0001: users, plans, plan_history
--
-- Establishes the foundational identity and license schema for the
-- commercial-web-saas backend.
--
-- Requirement mapping:
--   * 2.1  -> plan_type enum (`Free_Plan`, `Paid_Plan`); plan_status enum.
--   * 2.2  -> plans.plan default flow + plan_history `auto_assign` reason.
--   * 2.5  -> plan_paid_30d_window CHECK keeps `paid_expire_at = paid_start_at + 30 days`.
--   * 2.7  -> plan_status `expired` + plan_history `expired` reason.
--   * 2.8  -> users.token_epoch bigint (used by gateway claim check).
--   * 19.1 -> users.ui_locale ENUM('vi','en') with default 'vi'.
--
-- The application MUST connect with a non-superuser role so the
-- plan_history Row Level Security policies are enforced (PostgreSQL
-- bypasses RLS for superusers and table owners).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ------------------------------------------------------------------
-- Enum types
-- ------------------------------------------------------------------
CREATE TYPE plan_type AS ENUM ('Free_Plan', 'Paid_Plan');
CREATE TYPE plan_status AS ENUM ('active', 'expired', 'revoked', 'pending_deletion');
CREATE TYPE user_status AS ENUM ('active', 'pending_deletion', 'deleted');
CREATE TYPE ui_locale AS ENUM ('vi', 'en');
CREATE TYPE plan_history_reason AS ENUM (
    'auto_assign',
    'admin_upgrade',
    'admin_revoke',
    'expired',
    'renewed'
);

-- ------------------------------------------------------------------
-- updated_at trigger helper
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------
-- users
-- ------------------------------------------------------------------
CREATE TABLE users (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    email           citext      UNIQUE NOT NULL,
    google_sub      text        UNIQUE NOT NULL,
    display_name    text,
    status          user_status NOT NULL DEFAULT 'active',
    ui_locale       ui_locale   NOT NULL DEFAULT 'vi',
    token_epoch     bigint      NOT NULL DEFAULT 0,
    flagged_for_review boolean  NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_email_idx       ON users (email);
CREATE INDEX users_google_sub_idx  ON users (google_sub);

CREATE TRIGGER users_set_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- plans (current plan per user)
-- ------------------------------------------------------------------
CREATE TABLE plans (
    user_id                  uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    plan                     plan_type   NOT NULL,
    status                   plan_status NOT NULL,
    paid_start_at            timestamptz,
    paid_expire_at           timestamptz,
    paid_cycle_id            uuid,
    free_chapter_quota_used  smallint    NOT NULL DEFAULT 0,
    paid_story_quota_used    smallint    NOT NULL DEFAULT 0,
    paid_voice_quota_used    smallint    NOT NULL DEFAULT 0,
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),

    -- Requirement 2.1 / 2.2: Free_Plan must have paid_* NULL; Paid_Plan must have all three set.
    CONSTRAINT plan_paid_fields_consistent CHECK (
        (plan = 'Paid_Plan'
            AND paid_start_at IS NOT NULL
            AND paid_expire_at IS NOT NULL
            AND paid_cycle_id IS NOT NULL)
        OR
        (plan = 'Free_Plan'
            AND paid_start_at IS NULL
            AND paid_expire_at IS NULL
            AND paid_cycle_id IS NULL)
    ),

    -- Requirement 2.5: Paid_Plan window is exactly 30 days.
    CONSTRAINT plan_paid_30d_window CHECK (
        plan = 'Free_Plan'
        OR paid_expire_at = paid_start_at + INTERVAL '30 days'
    ),

    -- Requirement 5.x: Paid quotas are bounded 0..20; Free chapter counter is non-negative.
    CONSTRAINT quota_counters_nonneg CHECK (
        free_chapter_quota_used >= 0
        AND paid_story_quota_used BETWEEN 0 AND 20
        AND paid_voice_quota_used BETWEEN 0 AND 20
    )
);

CREATE TRIGGER plans_set_updated_at
    BEFORE UPDATE ON plans
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- plan_history (append-only)
-- ------------------------------------------------------------------
CREATE TABLE plan_history (
    id              uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid                 NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    from_plan       plan_type,
    to_plan         plan_type            NOT NULL,
    reason          plan_history_reason  NOT NULL,
    at              timestamptz          NOT NULL DEFAULT now(),
    actor_admin_id  uuid                 REFERENCES users(id)
);

CREATE INDEX plan_history_user_at_idx ON plan_history (user_id, at DESC);

-- Append-only enforcement via Row Level Security.
-- The application connects with a non-superuser role; superusers and
-- the table owner bypass RLS, so the deployment role MUST NOT be a
-- superuser or the owner of plan_history.
ALTER TABLE plan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY plan_history_insert ON plan_history
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY plan_history_select ON plan_history
    FOR SELECT
    USING (true);

CREATE POLICY plan_history_no_update ON plan_history
    FOR UPDATE
    USING (false)
    WITH CHECK (false);

CREATE POLICY plan_history_no_delete ON plan_history
    FOR DELETE
    USING (false);
