# Implementation Plan: Commercial Web SaaS

## Overview

Convert the feature design into a series of prompts for a code-generation LLM that will implement each step with incremental progress. Each prompt builds on the previous prompts and ends with wiring things together. There is no hanging or orphaned code that isn't integrated into a previous step.

This plan implements the Drama15 Lite Studio web SaaS in TypeScript across three apps:

- A Fastify backend hosting `API_Gateway`, `Auth_Service`, `License_Service`, `Rate_Limiter`, `Audit_Logger`, and `Export_Service`.
- A React + Vite Web_Client SPA.
- A React + Vite Admin_Console SPA.

Tasks are sequenced bottom-up: shared types and DB schema first, core services next, then gateway middleware and proxy, then feature endpoints (story / rewrite / automation / voice / export), then Web_Client UI, then Admin_Console, ending with end-to-end wiring. Each correctness property in `design.md` maps to exactly one optional property-based test sub-task using `fast-check`.

## Tasks

- [x] 1. Set up monorepo structure and shared contracts
  - [x] 1.1 Initialize backend service (Fastify + TypeScript)
    - Create `apps/api/` with TypeScript, Fastify, ESM, tsx, vitest
    - Wire HTTPS-only server boot, request id middleware, structured JSON logger
    - Reject plain HTTP at the listener level
    - _Requirements: 12.7, 17.4_

  - [x] 1.2 Initialize Web_Client SPA (React + Vite + TypeScript)
    - Create `apps/web/` with React, Vite, TypeScript, vitest
    - Configure production build to emit minified and obfuscated bundle (`javascript-obfuscator` Vite plugin)
    - _Requirements: 13.1_

  - [x] 1.3 Initialize Admin_Console SPA (React + Vite + TypeScript)
    - Create `apps/admin/` on a separate origin with TOTP login route shell
    - _Requirements: 16.1_

  - [x] 1.4 Define shared contracts package
    - Create `packages/contracts/` exporting `AccessTokenClaims`, `PlanState`, `QuotaDecision`, the canonical error code union, and request/response DTOs for stories, rewrite, automation, voice, export, devices, and admin
    - _Requirements: 3.4, 3.5, 5.9, 6.12, 19.3_

  - [x] 1.5 Set up fast-check + vitest property test harness
    - Add `fast-check` to dev deps; configure vitest projects `unit` and `property`
    - Add `tests/property/_helpers.ts` with shared generators (`arbUser`, `arbPlanState`, `arbDeviceFingerprint`, `arbClock`, `arbAction`, `arbHttpRequest`, `arbUpstreamResponse`, `arbIDToken`)
    - _Requirements: testing strategy_

- [x] 2. Implement persistence and infrastructure layer
  - [x] 2.1 Author Postgres migration for users, plans, plan_history
    - Tables `users`, `plans` with constraints (Free → `paid_*` null; Paid → both not null and `paid_expire_at = paid_start_at + 30d`)
    - Append-only `plan_history` with `reason` enum (`auto_assign`, `admin_upgrade`, `admin_revoke`, `expired`, `renewed`)
    - Add `users.token_epoch bigint` and `users.ui_locale enum('vi','en')`
    - _Requirements: 2.1, 2.2, 2.5, 2.7, 2.8, 19.1_

  - [x] 2.2 Author Postgres migration for devices and refresh_tokens
    - `devices(user_id, fingerprint, first_seen, last_seen, last_ip, last_country, status)` with PK (user_id, fingerprint)
    - `refresh_tokens(id, user_id, family_id, parent_id, token_hash, device_fingerprint, issued_at, expires_at, revoked_at, revoke_reason)`
    - _Requirements: 1.7, 1.8, 2.3, 4.1, 4.2, 4.3, 4.6_

  - [x] 2.3 Author Postgres migration for story / voice / automation jobs and chapters
    - `story_jobs`, `chapters` (PK `(story_id, index)`), `voice_jobs`, `automation_jobs`, FK `story_jobs.automation_job_id`
    - Status enums and `quota_charged` flags
    - _Requirements: 6.4, 6.9, 8.3, 8.6, 9.4, 9.7, 10.1_

  - [x] 2.4 Author Postgres migration for audit_events and admin_flags
    - `audit_events` with row-level policies that reject UPDATE and DELETE
    - `admin_flags(user_id, reason, created_at, cleared_at, actor_admin_id)`
    - _Requirements: 14.1, 14.2, 14.5, 16.5_

  - [x] 2.5 Implement Redis client with quota key conventions
    - Key builders: `quota:free:chapter:{userId}:{utcDate}`, `quota:paid:story:{userId}:{cycleId}`, `quota:paid:voice:{userId}:{cycleId}`, `quota:rewrite:{userId}:{utcDate}`, `rate:rpm:{userId}`, `concurrency:story:{userId}`
    - TTL helpers (UTC end-of-day, end-of-cycle)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 5.8, 5.10, 7.4_

  - [x] 2.6 Implement Secret_Vault adapter and S3 storage adapter
    - Vault interface returning upstream credentials only into in-memory closures
    - S3-compatible client with SSE-KMS AES-256 and signed URL helper (TTL ≤ 60 minutes)
    - _Requirements: 9.8, 11.2, 12.3, 15.1_

- [x] 3. Implement License_Service
  - [x] 3.1 Implement plan state machine
    - `assignFreeOnSignup`, `upgradeToPaid`, `revokePaid`, `expirePaid`, `renewPaid`
    - On revoke, bump `users.token_epoch`; on renew, reset `paid_story_quota_used` and `paid_voice_quota_used` to 0 and rotate `paid_cycle_id`
    - Background scanner runs every minute to expire Paid plans
    - _Requirements: 2.1, 2.2, 2.5, 2.7, 2.8, 5.10, 16.3, 16.4_

  - [x] 3.2 Property test for plan state machine
    - **Property 1: Plan state-machine luôn hợp lệ**
    - **Validates: Requirements 2.1, 2.2, 2.5, 2.7, 2.8, 5.10, 16.3, 16.4**

  - [x] 3.3 Implement device fingerprint constraint
    - Enforce single active Free per fingerprint, active session caps (Free 1, Paid 3), and per-device `last_seen` tracking
    - Errors: `free_plan_device_already_used`, `device_limit_reached`
    - _Requirements: 2.3, 2.4, 4.2, 4.3, 4.4, 4.6_

  - [x] 3.4 Property test for device fingerprint constraints
    - **Property 8: Device-fingerprint constraints theo plan**
    - **Validates: Requirements 2.3, 2.4, 4.2, 4.3, 4.4**

  - [x] 3.5 Implement PII deletion lifecycle
    - Move user to `pending_deletion`, hide content from API, schedule purge of PII and story data within 30 days
    - _Requirements: 15.3_

  - [x] 3.6 Property test for PII deletion timeline
    - **Property 24: PII deletion timeline**
    - **Validates: Requirements 15.3**

  - [x] 3.7 Implement email notifications
    - Send Paid pre-expiry notice when ≤ 72h remaining
    - Send PII breach notice within 72h with retry/backoff
    - _Requirements: 2.6, 15.5_

  - [x] 3.8 Property test for breach notification timeline
    - **Property 25: PII breach notification timeline**
    - **Validates: Requirements 15.5**

  - [x] 3.9 Implement integrity-failure flagger
    - Increment per-user counter on `client_integrity_failed`; when > 50 in 24h set `flagged_for_review = true`
    - _Requirements: 14.4_

  - [x] 3.10 Property test for integrity flag threshold
    - **Property 23: Flag user vượt ngưỡng integrity**
    - **Validates: Requirements 14.4**

- [x] 4. Implement Rate_Limiter
  - [x] 4.1 Implement 60 rpm sliding window
    - Sorted-set sliding window keyed `rate:rpm:{userId}` for create/rewrite endpoints; emits `Retry-After` on overflow
    - _Requirements: 5.1, 5.9_

  - [x] 4.2 Property test for 60 rpm rate limit
    - **Property 7: Rate limit 60 req/phút**
    - **Validates: Requirements 5.1, 5.9**

  - [x] 4.3 Implement Free-chapter and rewrite daily UTC counters
    - 3-chapter cap per UTC day for Free; 30-rewrite cap per UTC day per user; reset at 00:00 UTC; rewrite must not affect chapter or story counters
    - _Requirements: 5.2, 5.3, 7.4, 7.5, 7.6_

  - [x] 4.4 Implement Paid 30-day cycle counters
    - 20 full stories and 20 voice jobs per cycle; reservation-then-commit pattern guarded by `quota_charged` flag for idempotent retry; rollback on failure
    - _Requirements: 5.4, 5.5, 5.6, 5.7, 6.5, 8.5, 9.5_

  - [x] 4.5 Property test for quota counters
    - **Property 5: Quota counters tôn trọng cap, window và idempotence**
    - **Validates: Requirements 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.3, 6.5, 6.9, 7.4, 7.5, 7.6, 8.4, 8.5, 8.7, 9.5, 9.9**

  - [x] 4.6 Implement concurrent Story_Job cap
    - 1 Free / 10 Paid; Redis set with TTL fallback; emits `rate_limited` on overflow
    - _Requirements: 5.8, 5.9_

  - [x] 4.7 Property test for Story_Job concurrency cap
    - **Property 6: Concurrency cap cho Story_Job**
    - **Validates: Requirements 5.8, 5.9**

- [x] 5. Implement Auth_Service
  - [x] 5.1 Implement Google OAuth PKCE start endpoint
    - Generate `state`, `nonce`, `code_verifier`/`code_challenge` server-side; bind to short-lived KV entry; return redirect URL
    - _Requirements: 1.1, 1.2_

  - [x] 5.2 Implement Google OAuth callback with ID token verification
    - Exchange authorization code with PKCE; verify signature, `iss`, `aud`, `exp`, `nonce`, `email_verified`; ensure user exists; gate via License_Service device constraint
    - Errors: `google_email_unverified`, `free_plan_device_already_used`
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 4.1, 2.4_

  - [x] 5.3 Property test for ID token verification
    - **Property 4: ID token verification**
    - **Validates: Requirements 1.3, 1.4**

  - [x] 5.4 Implement token issuance (Access 15m + Refresh 7d) with token_epoch
    - JWT RS256 signer with `kid`; `epoch` claim mirrors `users.token_epoch`; refresh stored hashed with `family_id`
    - Refresh cookie set `HttpOnly; Secure; SameSite=Strict; Path=/auth; Max-Age=7d`
    - _Requirements: 1.5, 1.6, 3.5, 3.6, 13.6, 13.7, 13.8_

  - [x] 5.5 Property test for token TTL bounds
    - **Property 3: Token TTL bounds**
    - **Validates: Requirements 1.5, 1.6, 3.5, 3.6**

  - [x] 5.6 Implement refresh-token rotation and family compromise detection
    - Rotate on every refresh; reject reuse; on reuse, mark whole family compromised and revoke all members; emit audit `refresh_token_reuse_detected`
    - Error: `refresh_token_invalid`
    - _Requirements: 1.7, 1.8, 2.8, 4.7_

  - [x] 5.7 Property test for refresh-token rotation
    - **Property 2: Refresh-token rotation và thu hồi đúng đắn**
    - **Validates: Requirements 1.7, 1.8, 1.9, 2.8, 4.7**

  - [x] 5.8 Implement logout and per-device removal
    - Logout revokes the current refresh token and clears the cookie
    - Per-device logout revokes the matching refresh and bumps `users.token_epoch` so all access tokens expire within 60s
    - _Requirements: 1.9, 4.6, 4.7_

  - [x] 5.9 Implement IP-country reauth detection
    - Track session country; if access token is used from a different country within 10 minutes of the last verify, trigger `reauth_required`
    - _Requirements: 4.5_

  - [x] 5.10 Property test for IP-country reauth
    - **Property 9: Reauth khi đổi quốc gia IP**
    - **Validates: Requirements 4.5**

  - [x] 5.11 Implement Admin TOTP login flow
    - Admin login route requires a valid current TOTP code; TOTP secret stored encrypted; reject missing or wrong codes
    - _Requirements: 16.1_

  - [x] 5.12 Property test for admin TOTP gating
    - **Property 32: Admin TOTP gating**
    - **Validates: Requirements 16.1**

- [x] 6. Checkpoint - Auth, License, and Rate tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement API_Gateway middleware and proxy
  - [x] 7.1 Implement JWT validation middleware
    - Verify signature, `exp`, `kid`, fingerprint binding, and `epoch == users.token_epoch` (cached 30s)
    - Reject with `unauthenticated`
    - _Requirements: 3.1, 2.8_

  - [x] 7.2 Property test for unauthenticated rejection
    - **Property 11: Reject request thiếu hoặc không hợp lệ Access_Token**
    - **Validates: Requirements 3.1, 2.8**

  - [x] 7.3 Implement server-authoritative authorization middleware
    - Always read plan/role/quota from `License_Service.getPlanState`; ignore client-supplied plan/role/quota in body or header
    - Enforce ownership for resource routes; non-owner → `forbidden`
    - _Requirements: 3.2, 3.3, 3.4, 10.4, 15.2_

  - [x] 7.4 Property test for server-authoritative authorization
    - **Property 10: Server-authoritative authorization**
    - **Validates: Requirements 3.2, 3.3, 3.4, 10.4, 15.2**

  - [x] 7.5 Implement CORS allowlist middleware
    - Reflect `Access-Control-Allow-Origin` only when origin is in allowlist; preflight returns 403 otherwise
    - _Requirements: 12.6_

  - [x] 7.6 Property test for CORS allowlist
    - **Property 13: CORS allowlist**
    - **Validates: Requirements 12.6**

  - [x] 7.7 Implement X-Client-Integrity middleware
    - Validate header against build-hash allowlist; on mismatch reject with `client_integrity_failed` and increment per-user counter
    - _Requirements: 13.3, 13.4_

  - [x] 7.8 Property test for X-Client-Integrity check
    - **Property 15: X-Client-Integrity check**
    - **Validates: Requirements 13.3, 13.4**

  - [x] 7.9 Implement upstream proxy with header sanitisation
    - Pull credentials from Vault per-request and only into in-memory variables
    - Strip `server`, `via`, `x-powered-by`, and any `x-router-*` headers
    - Rewrite upstream errors that contain hostnames or internal paths into `{ code: 'upstream_error', requestId }`
    - _Requirements: 6.6, 9.6, 9.10, 12.1, 12.2, 12.3, 12.4, 12.5_

  - [x] 7.10 Property test for upstream sanitisation
    - **Property 12: Sanitisation upstream → response client**
    - **Validates: Requirements 6.6, 9.6, 9.10, 12.2, 12.4, 12.5**

  - [x] 7.11 Implement upstream timeout enforcement
    - Cancel upstream after 60s and respond `upstream_timeout`
    - _Requirements: 17.5_

  - [x] 7.12 Property test for upstream timeout
    - **Property 27: Upstream timeout**
    - **Validates: Requirements 17.5**

  - [x] 7.13 Standardize error response shape and Retry-After
    - Map every error code to `{ error: { code, message, retryAfterSeconds?, resetAt? } }` with HTTP status; ensure 429 always sets `Retry-After`
    - Set `Cache-Control: no-store` on auth/license routes; `X-Accel-Buffering: no` on SSE
    - _Requirements: 5.9, 7.6_

- [x] 8. Implement Audit_Logger
  - [x] 8.1 Implement audit_events insertion API
    - Required fields: `userId`, `fingerprint`, `ip`, `browser_locale`, `ts` (UTC); JSON `details` MUST NOT contain raw access tokens, refresh tokens, or OAuth codes; sensitive identifiers logged as truncated SHA-256
    - _Requirements: 14.1, 14.2, 15.4, 16.7_

  - [x] 8.2 Wire audit calls into Auth, License, Gateway, and Admin paths
    - Cover: `login_success`, `login_failed`, `logout`, `free_plan_granted`, `paid_plan_upgraded`, `paid_plan_expired`, `paid_plan_revoked`, `access_token_issued`, `access_token_rejected`, `license_or_quota_denied`, `client_integrity_failed`, `devtools_detected`, `admin_action`
    - _Requirements: 14.1, 16.7_

  - [x] 8.3 Property test for audit completeness, schema, and append-only safety
    - **Property 21: Audit log completeness, schema, append-only và safety**
    - **Validates: Requirements 14.1, 14.2, 14.5, 15.4, 16.7**

  - [x] 8.4 Implement IP block-list job
    - Aggregate `login_failed` per /24 IP block per hour; ban for 24h when count > 100; gateway middleware consults block list and rejects banned ranges
    - _Requirements: 14.3_

  - [x] 8.5 Property test for IP block window
    - **Property 22: IP block sau 100 login fail/giờ**
    - **Validates: Requirements 14.3**

- [x] 9. Checkpoint - API_Gateway and audit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement story creation, history, and resume
  - [x] 10.1 Implement POST /story/setup-suggest proxy
    - Forward to upstream `/story/setup-suggest` and return suggestions
    - _Requirements: 6.2_

  - [x] 10.2 Implement POST /stories endpoint with single-chapter and full modes
    - Free path: per-chapter creation counted into 3-per-day quota
    - Paid path: full Story_Job init that consumes one full-story quota unit on completion
    - Pass `outputLanguage` through to upstream regardless of `ui_locale`
    - _Requirements: 6.3, 6.4, 6.5, 6.10, 6.11, 6.12_

  - [x] 10.3 Implement SSE streaming for full Story_Job
    - Begin first chapter within 10s; emit per-stage progress (overview, plan, chapters)
    - On error, emit `event: error` with sanitized payload and close
    - _Requirements: 6.7, 6.8, 17.3_

  - [x] 10.4 Implement Story_Job FSM with persistence
    - States `running, paused, completed, failed, partial` with transitions for `start, pause, resume, stop, fail, complete, retry`
    - Concurrent transitions guarded by version column
    - _Requirements: 6.4, 6.9_

  - [x] 10.5 Implement resume-from-missing endpoint
    - `POST /stories/:id/resume` generates only chapters with status `!= done`; quota is not incremented during resume
    - _Requirements: 6.9, 7.7_

  - [x] 10.6 Property test for resume-only-missing
    - **Property 20: Resume chỉ sinh chương còn thiếu**
    - **Validates: Requirements 6.9, 7.7**

  - [x] 10.7 Property test for job FSM transitions
    - **Property 30: Job FSM hợp lệ (Story / Voice / Automation)**
    - **Validates: Requirements 8.6, 9.7**

  - [x] 10.8 Implement history endpoints
    - `GET /stories` returns user-scoped list ordered by `created_at` desc
    - `GET /stories/:id` returns owner-scoped detail (overview, plan, chapters)
    - _Requirements: 10.1, 10.2, 10.4_

  - [x] 10.9 Implement DELETE /stories/:id
    - Delete content and any related voice files within 24h; non-owner → `forbidden`
    - _Requirements: 10.3, 10.4_

  - [x] 10.10 Property test for history list ordering and ownership scope
    - **Property 19: History list ordering và scope**
    - **Validates: Requirements 10.1, 10.4**

- [x] 11. Implement rewrite endpoint
  - [x] 11.1 Implement POST /stories/:id/rewrite
    - Modes: full chapter, opening hook, closing beat, dialogue tone, class humiliation, retaliation sharpness
    - Counts into rewrite quota only; emits `rewrite_quota_exhausted` with `Retry-After` on overflow
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 12. Implement automation jobs
  - [x] 12.1 Implement POST /automation
    - Free → `automation_requires_paid`
    - Cap `target_count <= 2`; pre-flight quota check (`paid_story_quota_used + target_count > 20` → `paid_story_quota_exhausted`)
    - _Requirements: 2.10, 8.1, 8.2, 8.3, 8.4_

  - [x] 12.2 Implement automation orchestrator with sub-story retry
    - Each completed sub-story commits one full-story quota unit; failed sub-story can be retried without re-init or extra quota
    - _Requirements: 8.5, 8.7_

  - [x] 12.3 Implement automation pause / resume / stop endpoints
    - Per-job control plane; per-sub-story progress events
    - _Requirements: 8.6_

  - [x] 12.4 Property test for automation cap and prerequisites
    - **Property 28: Automation cap và prerequisites**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 9.2, 2.10**

- [x] 13. Implement voice generation
  - [x] 13.1 Implement GET /voices proxy
    - Fetch list from upstream OmniVoice using credentials from vault; sanitize headers
    - _Requirements: 9.3_

  - [x] 13.2 Implement POST /stories/:id/voice with preconditions
    - Free → `voice_requires_paid`; require story has 10 `done` chapters; otherwise return precondition error
    - _Requirements: 9.1, 9.2, 9.4_

  - [x] 13.3 Property test for voice precondition
    - **Property 29: Voice precondition**
    - **Validates: Requirements 9.2, 9.4, 2.10**

  - [x] 13.4 Implement Voice_Job per-chapter pipeline with retry
    - Pause / Stop / Resume / Retry control plane; commit one voice quota unit on full job completion; retry of a chapter does not consume extra quota
    - _Requirements: 9.5, 9.7, 9.9_

  - [x] 13.5 Implement Object_Storage write and signed URL issuance
    - Encrypted-at-rest object per chapter; signed URL TTL ≤ 60 minutes; owner-scoped path
    - _Requirements: 9.8, 15.1, 15.2_

  - [x] 13.6 Property test for signed URL TTL and ownership
    - **Property 17: Signed URL TTL**
    - **Validates: Requirements 9.8, 11.2**

- [x] 14. Implement export pipeline
  - [x] 14.1 Implement Markdown ZIP export
    - One `.md` per chapter; each file ends with hidden comment `<!-- Drama15Lite SaaS export | account: <email> | storyId: <id> -->`
    - _Requirements: 11.1, 11.4_

  - [x] 14.2 Implement PDF export with watermark
    - Footer on every page contains both `<email>` and `<storyId>`
    - _Requirements: 11.2, 11.3_

  - [x] 14.3 Wire export through signed-URL issuer
    - Reuse the 60-minute signed URL helper for ZIP and PDF
    - _Requirements: 11.2_

  - [x] 14.4 Property test for export watermark
    - **Property 18: Watermark trong export**
    - **Validates: Requirements 11.3, 11.4**

- [x] 15. Checkpoint - Generation, voice, and export tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Implement Web_Client core security and infrastructure
  - [x] 16.1 Implement i18n catalog and locale switcher
    - vi/en catalogs with identical key sets; persist `ui_locale` per user; render labels from selected locale on next load
    - _Requirements: 19.1, 19.2_

  - [x] 16.2 Implement output language pass-through
    - `outputLanguage` is set per request and never derived from UI locale; UI locale and output language are stored independently
    - _Requirements: 6.12, 19.3_

  - [x] 16.3 Property test for output language vs UI locale
    - **Property 26: Output language pass-through và độc lập với UI locale**
    - **Validates: Requirements 6.12, 19.2, 19.3**

  - [x] 16.4 Implement ES2022 capability guard
    - On boot, feature-detect ES2022; if missing, render upgrade notice and abort SPA init
    - _Requirements: 18.2_

  - [x] 16.5 Property test for ES2022 guard
    - **Property 31: ES2022 guard**
    - **Validates: Requirements 18.2**

  - [x] 16.6 Implement PKCE flow and in-memory token store
    - Generate `code_verifier`, `state`, `nonce` client-side; store Access_Token only in memory; never write tokens to localStorage or sessionStorage; refresh via cookie-only flow
    - _Requirements: 1.2, 13.6, 13.7, 13.8_

  - [x] 16.7 Property test for token storage separation
    - **Property 16: Token storage tách biệt**
    - **Validates: Requirements 13.6, 13.7, 13.8**

  - [x] 16.8 Implement Device_Fingerprint computation and X-Client-Integrity injection
    - Compose stable hash from UA, platform, screen, timezone, hardwareConcurrency
    - Attach `X-Client-Integrity: sha256(buildArtifact)` to every API call
    - _Requirements: 4.1, 13.3_

  - [x] 16.9 Configure CSP headers and SRI on third-party assets
    - CSP allows only self, API_Gateway origin, and Google IDP for `script-src` and `style-src`
    - Every cross-origin `<script>` and `<link rel=stylesheet>` carries an `integrity` attribute (sha256/384/512)
    - _Requirements: 13.2, 13.5_

  - [x] 16.10 Property test for SRI and CSP enforcement
    - **Property 14: SRI và CSP**
    - **Validates: Requirements 13.2, 13.5**

  - [x] 16.11 Implement DevTools detection and audit hook
    - Heuristic detection emits `devtools_detected` audit event and shows a warning banner
    - _Requirements: 13.9_

- [x] 17. Implement Web_Client feature panels
  - [x] 17.1 Implement story setup form
    - Niches parity: tỷ phú, sỉ nhục lật kèo, che giấu thân phận, gia đình độc hại, ngoại tình, mẹ đơn thân, bất công xã hội; plus custom-niche input
    - "Tự tạo" calls suggest endpoint and fills the form
    - _Requirements: 6.1, 6.2, 6.10, 6.11_

  - [x] 17.2 Implement story full streaming UI with three tabs
    - Tabs `Tổng Quan`, `Kế Hoạch`, `Chương`; SSE-driven progress bar and caption
    - _Requirements: 6.4, 6.7, 6.8_

  - [x] 17.3 Implement single-chapter creation for Free_Plan
    - "Tạo Chương" button; per-call decrement of Free quota with reset-time hint on 429
    - _Requirements: 6.3_

  - [x] 17.4 Implement resume button "Tiếp tục từ chương còn thiếu"
    - Visible after partial failure; calls resume endpoint
    - _Requirements: 6.9, 7.7_

  - [x] 17.5 Implement rewrite panel
    - Mode picker, target chapter selector, custom instructions; renders new chapter on response
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 17.6 Implement automation panel
    - Configure target stories (≤ 2), per-story progress, Pause / Resume / Stop, retry single sub-story
    - _Requirements: 8.1, 8.6, 8.7_

  - [x] 17.7 Implement voice panel
    - Voice ID dropdown, speed, pitch; Pause / Stop / Resume / Retry; per-chapter progress; never display upstream host
    - _Requirements: 9.1, 9.3, 9.4, 9.7, 9.10_

  - [x] 17.8 Implement history list, view, and delete UI
    - Sorted desc; reopen restores tabs; delete confirms then triggers backend
    - _Requirements: 10.1, 10.2, 10.3_

  - [x] 17.9 Implement export buttons
    - "Lưu Từng Chương .md" downloads ZIP; "Xuất PDF Cả Truyện" opens signed URL
    - _Requirements: 11.1, 11.2_

  - [x] 17.10 Implement account page (devices and language)
    - List devices with `last_seen`; remove device button; UI language selector
    - _Requirements: 4.6, 4.7, 19.2_

  - [x] 17.11 Implement responsive layout for screens < 768px
    - Compact layout retains full create-story and gen-voice flows
    - _Requirements: 18.3_

- [x] 18. Implement Admin_Console
  - [x] 18.1 Implement admin login UI with TOTP
    - Admin role required; TOTP code field on login form
    - _Requirements: 16.1_

  - [x] 18.2 Implement admin user looko,kup
    - Search by email, id, or fingerprint
    - _Requirements: 16.2_

  - [x] 18.3 Implement admin upgrade / revoke Paid_Plan
    - Calls License_Service; shows resulting plan state and audit trail
    - _Requirements: 16.3, 16.4_

  - [x] 18.4 Implement flagged-users dashboard
    - Show users with `client_integrity_failed` flag; clear flag or lock account
    - _Requirements: 16.5_

  - [x] 18.5 Implement audit log viewer with filters
    - Filter by user, event type, time range
    - _Requirements: 16.6_

- [x] 19. Final integration
  - [x] 19.1 Wire end-to-end routing in API_Gateway
    - Register all routes (auth, license, stories, rewrite, automation, voice, export, admin) behind the middleware stack (CORS → JWT → integrity → server-authoritative auth → rate limit → audit)
    - _Requirements: 12.1, 17.4_

  - [x] 19.2 Write integration test for full auth → story → voice → export flow
    - Cover happy path and revoked-license rejection across the full stack with in-memory upstream double
    - _Requirements: 1.5, 6.4, 9.4, 11.2_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP.
- Each correctness property in `design.md` (Properties 1–32) maps to exactly one property test sub-task in this plan; no property is duplicated and none is missing.
- Property tests use `fast-check` with `numRuns >= 100`; rotation- and quota-state-machine tests run with `numRuns = 500`.
- Checkpoints (tasks 6, 9, 15, 20) provide synchronization points where the user can verify progress and surface questions before continuing.
- Performance, TLS handshake, AES-256 storage encryption, browserslist matrix, and bundle static-scan checks are validated through integration / smoke tests described in the design (Testing Strategy → Integration / smoke); they are not standalone tasks here because they are infrastructure or load-test configuration rather than feature code.
- Each implementation task can assume the contracts package, persistence layer, and the dependencies declared in earlier waves are in place.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "1.5"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6"] },
    { "id": 2, "tasks": ["3.1", "3.3", "3.5", "3.7", "3.9", "4.1", "4.3", "4.4", "4.6", "5.1", "5.11", "8.1"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.6", "3.8", "3.10", "4.2", "4.5", "4.7", "5.4", "5.9", "5.12", "8.3", "8.4"] },
    { "id": 4, "tasks": ["5.2", "5.5", "5.6", "5.8", "5.10", "8.5"] },
    { "id": 5, "tasks": ["5.3", "5.7", "8.2"] },
    { "id": 6, "tasks": ["7.1", "7.3", "7.5", "7.7", "7.9", "7.11", "7.13"] },
    { "id": 7, "tasks": ["7.2", "7.4", "7.6", "7.8", "7.10", "7.12"] },
    { "id": 8, "tasks": ["10.1", "10.2", "10.4", "10.8", "11.1", "13.1", "13.5"] },
    { "id": 9, "tasks": ["10.3", "10.5", "10.9", "12.1", "13.2", "14.1", "14.2"] },
    { "id": 10, "tasks": ["12.2", "12.3", "13.4", "14.3"] },
    { "id": 11, "tasks": ["10.6", "10.7", "10.10", "12.4", "13.3", "13.6", "14.4"] },
    { "id": 12, "tasks": ["16.1", "16.2", "16.4", "16.6", "16.8", "16.9", "16.11"] },
    { "id": 13, "tasks": ["16.3", "16.5", "16.7", "16.10"] },
    { "id": 14, "tasks": ["17.1", "17.2", "17.3", "17.4", "17.5", "17.6", "17.7", "17.8", "17.9", "17.10", "17.11"] },
    { "id": 15, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5"] },
    { "id": 16, "tasks": ["19.1"] },
    { "id": 17, "tasks": ["19.2"] }
  ]
}
```
