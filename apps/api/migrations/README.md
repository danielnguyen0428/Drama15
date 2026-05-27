# Postgres migrations

This directory holds the SQL migrations for the commercial-web-saas
backend (`@drama15/api`). Each migration is a pair of plain SQL files.

## File layout

```
NNNN_description.up.sql
NNNN_description.down.sql
```

* `NNNN` is a zero-padded four-digit sequence number, starting at
  `0001`. The number is the sort key.
* `description` is a short snake-case slug describing what the
  migration does.
* `.up.sql` applies the change; `.down.sql` reverses it.

## Apply order

* Migrations are applied in **ascending numeric order** of the `NNNN`
  prefix.
* Rollback applies the matching `.down.sql` files in **descending**
  order.
* A migration runner is wired in a later wave; until then the files are
  loaded by `src/db/migrations.ts` for inspection and tests.

## Numbering rules

* Once a migration has been merged it is **immutable**. Do not edit or
  renumber it. New schema changes must be added as a new migration with
  a higher number.
* Sequential numbers MUST be claimed in agreement across waves to avoid
  collisions:
  * `0001` - users, plans, plan_history (this migration).
  * `0002` - devices, refresh_tokens.
  * `0003` - story_jobs, voice_jobs, automation_jobs, chapters.
  * `0004` - audit_events, admin_flags.
* Subsequent waves may claim `0005`+ in the same fashion, but should
  never alter or renumber `0001`.

## RLS note

`0001` enables row level security on `plan_history` to enforce the
append-only invariant. PostgreSQL bypasses RLS for superusers and the
table owner. The runtime application MUST connect with a dedicated,
non-superuser role that is NOT the table owner so the policies actually
apply.

## 0003 - story_jobs, chapters, voice_jobs, automation_jobs

`0003` adds the four long-running job tables plus the `chapters`
detail table:

* Status enums are isolated per table so each FSM evolves
  independently: `story_job_status`, `chapter_status`,
  `voice_job_status`, `automation_status`.
* `story_jobs.quota_charged` and `voice_jobs.quota_charged` record
  whether the Paid quota for that job has been committed. Combined
  with the `version` column they enable retry-without-recharge
  semantics (Requirements 6.9 / 9.7): a failed run can be re-driven
  without double-decrementing quota, because the application checks
  `quota_charged` before debiting.
* Every job table carries `version integer NOT NULL DEFAULT 0` for
  optimistic-concurrency FSM transitions
  (`UPDATE ... WHERE version = $expected`). See properties 10.4 / 10.7.
* `chapters` uses a composite primary key `(story_id, index)` and a
  CHECK that bounds `index` to 1..10 (per-story chapter cap).
* `automation_jobs.target_count` is CHECK-bounded to 1..2 to enforce
  Requirement 8.3 (an automation cycle schedules at most two stories).
* `story_jobs.automation_job_id` is a nullable FK with
  `ON DELETE SET NULL` so deleting an automation cycle does not
  cascade-delete the stories it kicked off (Requirement 8.6).
* History sort indexes (`(user_id, created_at DESC)`) on
  `story_jobs`, `voice_jobs`, and `automation_jobs` back the
  per-user history listings (Requirement 10.1).

## 0004 - audit_events, admin_flags

`0004` adds the append-only audit log and the admin flagging table:

* `audit_events` is append-only via Row Level Security. UPDATE and
  DELETE policies evaluate `false`, so any attempt to modify a row
  fails for non-superuser roles (Requirement 14.5). The migration
  also runs `ALTER TABLE audit_events FORCE ROW LEVEL SECURITY` so
  the policies apply to the table owner too. The runtime application
  MUST connect with a non-superuser role; the superuser bypass that
  PostgreSQL provides is reserved for one-off ops.
* `audit_events.details` is `jsonb` with a `details_no_token_keys`
  CHECK that rejects rows containing `access_token`, `refresh_token`,
  `oauth_code`, or `authorization_code` keys. This is defence in
  depth for Requirement 15.4. Truncated SHA-256 hashes recorded under
  other key names are still allowed.
* Retention for `audit_events` is at least 365 days (Requirement
  14.5). The retention scheduler that enforces this is added in a
  later wave; the migration only documents the contract.
* `admin_flags` uses a composite primary key
  `(user_id, reason, created_at)` so a user can be flagged repeatedly
  over time. A partial unique index, `admin_flags_one_open_idx`,
  ensures at most one OPEN flag per `(user_id, reason)` pair, which
  is what the Admin_Console flagged-users view consumes
  (Requirement 16.5).

## 0002 - devices, refresh_tokens

`0002` adds the device-binding and refresh-token tables that sit on
top of the identity schema established in `0001`:

* `devices` is keyed on `(user_id, fingerprint)` so the same physical
  device may be bound to several accounts. A partial index,
  `devices_active_idx ON devices(fingerprint) WHERE status = 'active'`,
  makes the License_Service check for "one active Free_Plan account
  per fingerprint" (Requirement 2.3) index-only. The actual
  single-Free-account-per-fingerprint rule is enforced at the
  application layer because it joins `devices` with `plans`.
* `devices` reuses the `set_updated_at()` trigger function declared
  in `0001`. `0002` therefore depends on `0001` and MUST be applied
  after it.
* `refresh_tokens` stores only `token_hash` (SHA-256 hex of the raw
  token); the raw token is never persisted. `family_id` groups every
  rotation of a single login and `parent_id` chains a token to the
  one it replaced (Requirement 1.7). The `expires_at_within_7d` CHECK
  uses `date_trunc('millisecond', ...)` on both sides of the equality
  to avoid sub-millisecond clock drift between the application and
  PostgreSQL while still enforcing the 7-day TTL (Requirement 1.8).
* The `refresh_tokens_active_idx` and `refresh_tokens_expires_at_idx`
  indexes are partial on `revoked_at IS NULL` so the most common
  lookups never scan revoked rows.
* `revoke_consistency` CHECK keeps `revoked_at` and `revoke_reason`
  set together or not at all, so the audit log of a revocation always
  carries a reason from the `refresh_revoke_reason` enum
  (`rotated`, `logout`, `device_remove`, `paid_revoked`,
  `family_compromised`).

## 0005 - user_deletion_schedule

`0005` adds the `user_deletion_schedule` table that tracks the start
of the 30-day PII purge window (Requirement 15.3):

* `user_id` is the primary key with `REFERENCES users(id) ON DELETE
  CASCADE`, so at most one schedule entry exists per user.
* `scheduled_at timestamptz NOT NULL` records exactly when the user
  was moved to `pending_deletion`. The application inserts via
  `INSERT ... ON CONFLICT DO NOTHING` so re-requests do not extend
  the window — the original timestamp wins.
* `due_at timestamptz NOT NULL GENERATED ALWAYS AS (scheduled_at +
  INTERVAL '30 days') STORED` materialises the 30-day SLA in the
  database. Pairing the STORED column with the
  `user_deletion_schedule_due_at_idx` index lets the daily purge
  scan run as a cheap range read.
* The application-side helper `computeDueAt(scheduledAt)` in
  `apps/api/src/lifecycle/types.ts` mirrors this expression so the
  TypeScript service and the SQL generated column cannot drift apart.
* `0005` does not change the `user_status` enum (defined in `0001`)
  or the `plans.status` enum: `pending_deletion` already exists in
  both. The lifecycle service flips both columns directly.

## 0006 - ip_block_list

`0006` adds the `ip_block_list` table that backs the IP block-list job
(`apps/api/src/audit/ipBlockList.ts`) introduced for Requirement 14.3:

* `block` is the primary key and stores the canonical `a.b.c.0/24`
  form produced by `audit/ipBlockList.ts → to24Block`. The application
  always pre-normalises the value, so the column receives a
  fully-canonical string and lookups can compare as `text`.
* `banned_until timestamptz NOT NULL` is the absolute UTC timestamp
  at which the ban expires. `IpBlockListJob.runTick` writes
  `now + 24h` by default, mirroring Requirement 14.3 ("trong 24
  giờ").
* `reason text NOT NULL DEFAULT 'login_failed_threshold'` records
  why the range was banned. The default matches the auto-ban path;
  future call sites (e.g. an admin manual ban) can override it.
* `created_at timestamptz NOT NULL DEFAULT now()` is observability
  metadata used by the Admin_Console block-list view; it is NOT
  used by `isBlocked` / GC.
* `ip_block_list_banned_until_idx ON ip_block_list(banned_until)`
  supports both the gateway-side `banned_until > now()` lookup
  performed by `IpBlockListChecker.assertNotBlocked` and the
  `removeExpiredBlocks` GC sweep run at the tail of every tick.
* The block-list is intentionally small (a few thousand rows even
  at peak abuse) and short-lived (24-hour TTL). It is NOT joined to
  `users`: the keying unit is a network range, not an account.
