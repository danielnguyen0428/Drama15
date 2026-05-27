-- Migration 0004: audit_events, admin_flags
--
-- Establishes append-only audit logging plus the admin flagging table
-- consumed by Admin_Console.
--
-- Requirement mapping:
--   * 14.1  -> audit_events covers every security-relevant event type;
--             event_type is `text` so new events can be appended without
--             schema churn (design.md "extensible" note).
--   * 14.2  -> audit_events captures `user_id`, `fingerprint`, `ip`,
--             `browser_locale`, and a UTC `ts`.
--   * 14.5  -> audit_events is append-only via Row Level Security:
--             UPDATE and DELETE policies evaluate `false`. Retention is
--             at least 365 days; an enforcing scheduler is added in a
--             later wave (see comment below).
--   * 15.4  -> details_no_token_keys CHECK rejects rows that try to
--             persist raw access tokens, refresh tokens, or OAuth /
--             authorization codes. Truncated SHA-256 hashes are still
--             permitted under other key names.
--   * 16.5  -> admin_flags backs the Admin_Console flagged-user view.
--             A composite primary key plus a partial unique index keep
--             at most one OPEN flag per `(user_id, reason)` while
--             preserving full historical lineage of flagged/cleared
--             cycles.
--
-- Retention: rows in audit_events MUST be retained for >= 365 days
-- (Requirement 14.5). The actual scheduler that enforces retention is
-- added in a later wave; this migration documents the contract.
--
-- The application MUST connect with a non-superuser role that does NOT
-- own audit_events so RLS actually applies (PostgreSQL bypasses RLS
-- for superusers and the table owner). `FORCE ROW LEVEL SECURITY`
-- below also forces RLS for the table owner role, except superuser.

-- ------------------------------------------------------------------
-- Enum types
-- ------------------------------------------------------------------
-- `admin_flag_reason` is intentionally an ENUM so the set of reasons
-- is closed and reviewable. Future migrations may extend it via
-- `ALTER TYPE admin_flag_reason ADD VALUE`.
CREATE TYPE admin_flag_reason AS ENUM ('client_integrity_failed_threshold');

-- Note: `event_type` on audit_events is deliberately `text` (not an
-- enum) because the Audit_Logger event taxonomy is extensible per
-- design.md and Requirement 14.1.

-- ------------------------------------------------------------------
-- audit_events (append-only)
-- ------------------------------------------------------------------
CREATE TABLE audit_events (
    id              bigserial   PRIMARY KEY,
    ts              timestamptz NOT NULL DEFAULT now(),
    user_id         uuid,
    fingerprint     text,
    ip              inet,
    browser_locale  text,
    event_type      text        NOT NULL,
    details         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    actor_admin_id  uuid        REFERENCES users(id) ON DELETE SET NULL,

    -- Requirement 14.1: every audit row identifies the kind of event.
    CONSTRAINT event_type_not_empty CHECK (length(event_type) > 0),

    -- Requirement 15.4: defence in depth against accidentally
    -- persisting raw secrets in `details`. Truncated SHA-256 hashes
    -- (e.g. `token_hash_sha256_trunc`) are still permitted because
    -- only the literal raw-secret keys are forbidden here.
    CONSTRAINT details_no_token_keys CHECK (
        NOT (
            details ? 'access_token'
            OR details ? 'refresh_token'
            OR details ? 'oauth_code'
            OR details ? 'authorization_code'
        )
    )
);

CREATE INDEX audit_events_user_ts_idx
    ON audit_events (user_id, ts DESC);

CREATE INDEX audit_events_event_type_ts_idx
    ON audit_events (event_type, ts DESC);

-- Supports the IP block-list aggregation (Requirement 14.3 / design 8.4).
CREATE INDEX audit_events_ip_ts_idx
    ON audit_events (ip, ts DESC)
    WHERE ip IS NOT NULL;

-- Append-only enforcement via Row Level Security (Requirement 14.5).
-- Application connects via a non-superuser role; superuser DDL is
-- reserved for ops. FORCE RLS makes the policies apply to the table
-- owner too (still bypassed by superuser, by Postgres design).
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY audit_events_insert ON audit_events
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY audit_events_select ON audit_events
    FOR SELECT
    USING (true);

CREATE POLICY audit_events_no_update ON audit_events
    FOR UPDATE
    USING (false)
    WITH CHECK (false);

CREATE POLICY audit_events_no_delete ON audit_events
    FOR DELETE
    USING (false);

-- audit_events intentionally has NO updated_at trigger: rows are
-- immutable and RLS rejects UPDATE entirely.

-- ------------------------------------------------------------------
-- admin_flags
-- ------------------------------------------------------------------
-- A user may be flagged repeatedly over time. Composite PK preserves
-- the full history of flagged/cleared cycles; a partial unique index
-- ensures only one OPEN flag exists per (user_id, reason).
CREATE TABLE admin_flags (
    user_id         uuid                NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          admin_flag_reason   NOT NULL,
    created_at      timestamptz         NOT NULL DEFAULT now(),
    cleared_at      timestamptz,
    actor_admin_id  uuid                REFERENCES users(id) ON DELETE SET NULL,
    updated_at      timestamptz         NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, reason, created_at),

    CONSTRAINT cleared_after_created CHECK (
        cleared_at IS NULL OR cleared_at >= created_at
    )
);

-- At most one open flag per (user_id, reason) (Requirement 16.5).
CREATE UNIQUE INDEX admin_flags_one_open_idx
    ON admin_flags (user_id, reason)
    WHERE cleared_at IS NULL;

-- Supports the Admin_Console "currently flagged" listing.
CREATE INDEX admin_flags_open_idx
    ON admin_flags (reason, created_at DESC)
    WHERE cleared_at IS NULL;

CREATE TRIGGER admin_flags_set_updated_at
    BEFORE UPDATE ON admin_flags
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();
