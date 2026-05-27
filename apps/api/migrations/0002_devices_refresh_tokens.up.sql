-- Migration 0002: devices, refresh_tokens
--
-- Adds the device-binding and refresh-token tables that sit on top of
-- the identity schema established in 0001 (users, plans, plan_history).
-- This migration depends on 0001: it references users(id) via foreign
-- keys and reuses the set_updated_at() trigger function that 0001
-- declares.
--
-- Requirement mapping:
--   * 1.7  -> refresh_tokens.parent_id chains rotated tokens to their
--            predecessor; family_id groups every rotation together so
--            an entire family can be revoked when reuse is detected.
--   * 1.8  -> refresh_tokens.expires_at, revoked_at, and revoke_reason
--            let the gateway reject expired or revoked refresh tokens
--            with `refresh_token_invalid`. expires_at_within_7d CHECK
--            keeps the 7-day TTL invariant.
--   * 2.3  -> the partial index `devices_active_idx` lets the
--            License_Service application code enforce "one active
--            Free_Plan account per fingerprint" cheaply. The actual
--            single-Free-account-per-fingerprint check is performed at
--            the application layer because it requires joining devices
--            with plans; the index just makes that query index-only.
--   * 4.1  -> devices(user_id, fingerprint) is the binding produced
--            when a user signs in; first_seen / last_seen / last_ip /
--            last_country populate the device-list view.
--   * 4.2  -> at most one active fingerprint per Free_Plan account
--            (enforced by the License_Service against this table).
--   * 4.3  -> at most three active fingerprints per Paid_Plan account
--            (enforced by the License_Service against this table).
--   * 4.6  -> devices.last_seen powers the "device list" page in the
--            account settings UI.
--
-- The application MUST connect with a non-superuser, non-owner role so
-- that any future RLS additions on these tables are enforced.

-- ------------------------------------------------------------------
-- Enum types
-- ------------------------------------------------------------------
CREATE TYPE device_status AS ENUM ('active', 'revoked');

CREATE TYPE refresh_revoke_reason AS ENUM (
    'rotated',
    'logout',
    'device_remove',
    'paid_revoked',
    'family_compromised'
);

-- ------------------------------------------------------------------
-- devices
-- ------------------------------------------------------------------
-- The composite primary key (user_id, fingerprint) lets the same
-- physical device be bound to multiple accounts (e.g. a shared
-- workstation with two Paid_Plan users) while still uniquely
-- identifying each row. Whether a fingerprint may be bound to more
-- than one ACTIVE Free_Plan account is enforced by the License_Service
-- (Requirement 2.3); the partial index below makes that check cheap.
CREATE TABLE devices (
    user_id        uuid          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    fingerprint    text          NOT NULL,
    first_seen     timestamptz   NOT NULL DEFAULT now(),
    last_seen      timestamptz   NOT NULL DEFAULT now(),
    last_ip        inet,
    last_country   text,                          -- ISO-3166 alpha-2
    status         device_status NOT NULL DEFAULT 'active',
    created_at     timestamptz   NOT NULL DEFAULT now(),
    updated_at     timestamptz   NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, fingerprint)
);

CREATE INDEX devices_user_id_idx     ON devices (user_id);
CREATE INDEX devices_fingerprint_idx ON devices (fingerprint);

-- Partial index used by the License_Service to enforce
-- "one active Free_Plan account per fingerprint" (Requirement 2.3).
-- The Free_Plan check is application-layer because it joins devices
-- with plans, but this index keeps the lookup index-only.
CREATE INDEX devices_active_idx ON devices (fingerprint) WHERE status = 'active';

-- Reuse the set_updated_at() helper declared in 0001.
CREATE TRIGGER devices_set_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------------
-- refresh_tokens
-- ------------------------------------------------------------------
-- token_hash is the SHA-256 (hex) of the raw refresh token. The raw
-- token is NEVER persisted, so even a database compromise does not
-- leak usable refresh material.
--
-- family_id groups every rotation of a single login. parent_id chains
-- the new token to the one it replaces. On reuse detection (a token
-- presented after it has already been rotated) the Auth_Service
-- revokes the entire family with revoke_reason='family_compromised'
-- (Requirement 1.7).
CREATE TABLE refresh_tokens (
    id                  uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid                   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id           uuid                   NOT NULL,
    parent_id           uuid                   REFERENCES refresh_tokens(id) ON DELETE SET NULL,
    token_hash          text                   NOT NULL UNIQUE,
    device_fingerprint  text                   NOT NULL,
    issued_at           timestamptz            NOT NULL DEFAULT now(),
    expires_at          timestamptz            NOT NULL,
    revoked_at          timestamptz,
    revoke_reason       refresh_revoke_reason,

    -- Requirement 1.8: every refresh token lives exactly 7 days from
    -- issuance. Truncate to milliseconds when comparing because clock
    -- arithmetic can introduce sub-millisecond drift between the
    -- application and PostgreSQL.
    CONSTRAINT expires_at_within_7d CHECK (
        date_trunc('millisecond', expires_at)
            = date_trunc('millisecond', issued_at + INTERVAL '7 days')
    ),

    -- revoked_at and revoke_reason are set together or not at all.
    CONSTRAINT revoke_consistency CHECK (
        (revoked_at IS NULL AND revoke_reason IS NULL)
        OR
        (revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
    )
);

-- Lookup the active refresh token for a (user, device) pair without
-- scanning revoked rows.
CREATE INDEX refresh_tokens_user_id_idx     ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_id_idx   ON refresh_tokens (family_id);
CREATE INDEX refresh_tokens_active_idx
    ON refresh_tokens (user_id, device_fingerprint)
    WHERE revoked_at IS NULL;

-- Used by the background job that purges expired but never-rotated
-- tokens.
CREATE INDEX refresh_tokens_expires_at_idx
    ON refresh_tokens (expires_at)
    WHERE revoked_at IS NULL;
