/**
 * Admin Console contracts (Requirement 16).
 *
 * Admin Console is reachable only by accounts with role `admin` and an active
 * TOTP factor (Requirement 16.1). Every admin write is recorded in the audit
 * log with `actor_admin_id` (Requirement 16.7).
 */

import type { PlanState } from './plan.js';
import type { DeviceRecord } from './devices.js';

/** Lookup key used by `POST /admin/users/lookup` (Requirement 16.2). */
export type AdminLookupKey = 'email' | 'id' | 'fingerprint';

export interface AdminLookupRequest {
  by: AdminLookupKey;
  value: string;
}

export interface AdminUserSummary {
  id: string;
  email: string;
  displayName?: string;
  status: 'active' | 'pending_deletion' | 'deleted';
  flaggedForReview: boolean;
  /** ISO-8601 UTC. */
  createdAt: string;
}

export interface AdminLookupResponse {
  user: AdminUserSummary;
  plan: PlanState;
  devices: DeviceRecord[];
}

export interface AdminUpgradeRequest {
  userId: string;
  /** Optional cycle override; defaults to 30 days from now (Requirement 16.3). */
  paidStartAt?: string;
  paidExpireAt?: string;
  /** Free-form note recorded in the audit row. */
  note?: string;
}

export interface AdminRevokeRequest {
  userId: string;
  /** Free-form note recorded in the audit row. */
  note?: string;
}

export type AdminFlagReason = 'client_integrity_failed_threshold';

export interface AdminFlagRecord {
  userId: string;
  reason: AdminFlagReason;
  /** ISO-8601 UTC. */
  createdAt: string;
  /** ISO-8601 UTC. Null while the flag is open. */
  clearedAt?: string;
  actorAdminId?: string;
}

/**
 * Filter for the admin audit-log view (Requirement 16.6).
 * The server enforces additional invariants — payload here is purely the
 * caller's intent.
 */
export interface AdminAuditQuery {
  userId?: string;
  /** Free-form event-type filter, e.g. `login_failed`. */
  eventType?: string;
  /** ISO-8601 UTC. */
  fromTs?: string;
  /** ISO-8601 UTC. */
  toTs?: string;
  /** 1..200; defaults to 50. */
  limit?: number;
  /** Opaque cursor token returned by previous responses. */
  cursor?: string;
}

export interface AdminAuditEvent {
  id: string;
  /** ISO-8601 UTC. */
  ts: string;
  userId?: string;
  fingerprint?: string;
  ip?: string;
  browserLocale?: string;
  eventType: string;
  /** Sanitised metadata; never contains tokens or OAuth codes (Req 15.4). */
  details?: Record<string, unknown>;
  actorAdminId?: string;
}

export interface AdminAuditResponse {
  events: AdminAuditEvent[];
  nextCursor?: string;
}
