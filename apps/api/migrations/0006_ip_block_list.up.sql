-- Migration 0006: ip_block_list
--
-- Backs the IP block-list job introduced in design.md → "Audit_Logger"
-- (Requirement 14.3): once a /24 IPv4 range produces more than 100
-- `login_failed` events in any rolling one-hour window, the range is
-- banned for 24 hours. Gateway middleware consults this table on every
-- inbound request and rejects banned ranges before any auth or
-- rate-limit work runs.
--
-- Requirement mapping:
--   * 14.3 -> The temporary 24-hour ban store. `block` is the canonical
--             `a.b.c.0/24` form produced by `audit/ipBlockList.ts →
--             to24Block`. `banned_until` is an absolute UTC timestamp;
--             the GC step in `IpBlockListJob.runTick` deletes rows
--             whose `banned_until < now()` so the table does not grow
--             unbounded.
--
-- Why a `text` PK (not `cidr`)?
--   * The application's `to24Block` already normalises the value
--     ("203.0.113.42" -> "203.0.113.0/24") so the column receives a
--     fully-canonical string. Comparing as text keeps lookups simple
--     for the gateway middleware which has the address pre-normalised.
--   * The block-list contains at most a few thousand entries even at
--     peak abuse; a text PK is plenty.
--
-- Why no `users` FK?
--   * The block-list is keyed on network ranges, not accounts. The
--     `audit_events` rows that drive aggregation already carry the
--     user / fingerprint context if it exists.

-- ------------------------------------------------------------------
-- ip_block_list
-- ------------------------------------------------------------------
CREATE TABLE ip_block_list (
    block         text         PRIMARY KEY,
    banned_until  timestamptz  NOT NULL,
    reason        text         NOT NULL DEFAULT 'login_failed_threshold',
    created_at    timestamptz  NOT NULL DEFAULT now(),

    -- Defence in depth: a row whose ban window already ended at
    -- insertion time would never be hit and would just slow down GC.
    CONSTRAINT ip_block_list_block_not_empty   CHECK (length(block) > 0),
    CONSTRAINT ip_block_list_reason_not_empty  CHECK (length(reason) > 0)
);

-- Supports both the gateway-side "is this /24 banned right now?"
-- check (`banned_until > now()`) and the GC sweep
-- (`banned_until < now()`).
CREATE INDEX ip_block_list_banned_until_idx
    ON ip_block_list (banned_until);
