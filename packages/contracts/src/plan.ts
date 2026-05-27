/**
 * License plan domain — Free_Plan and Paid_Plan only (Requirement 2.1).
 */

export type PlanType = 'Free_Plan' | 'Paid_Plan';

export type PlanStatus = 'active' | 'expired' | 'revoked' | 'pending_deletion';

/**
 * Server-authoritative plan state retrieved by API_Gateway from License_Service
 * for every privileged request (Requirement 3.2, 3.4).
 *
 * `paidStartAt` and `paidExpireAt` are set IFF `plan === 'Paid_Plan'` and obey
 * `paidExpireAt = paidStartAt + 30 days` (Requirement 2.5, 16.3).
 */
export interface PlanState {
  userId: string;
  plan: PlanType;
  status: PlanStatus;
  /** ISO-8601 UTC. Null for Free_Plan. */
  paidStartAt?: string;
  /** ISO-8601 UTC. Null for Free_Plan. */
  paidExpireAt?: string;
  /** Identifier of the current Paid cycle. Changes on renewal (Requirement 5.10). */
  paidCycleId?: string;
}

/**
 * Reason recorded in plan_history for every transition (append-only).
 */
export type PlanHistoryReason =
  | 'auto_assign'
  | 'admin_upgrade'
  | 'admin_revoke'
  | 'expired'
  | 'renewed';
