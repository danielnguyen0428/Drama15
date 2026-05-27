/**
 * Quota decision returned by License_Service / Rate_Limiter to API_Gateway
 * before any privileged upstream call.
 *
 * See Requirements 5.1 – 5.10, 7.4 – 7.6.
 */

export type QuotaErrorCode =
  | 'free_chapter_quota_exhausted'
  | 'paid_story_quota_exhausted'
  | 'paid_voice_quota_exhausted'
  | 'rewrite_quota_exhausted'
  | 'rate_limited';

export type QuotaAction =
  | 'free_chapter'
  | 'paid_full_story'
  | 'paid_voice'
  | 'rewrite'
  | 'story_request_rpm';

export interface QuotaDecision {
  allowed: boolean;
  errorCode?: QuotaErrorCode;
  /** Header `Retry-After` value when applicable (Requirement 5.9, 7.6). */
  retryAfterSeconds?: number;
  /** ISO-8601 UTC. 00:00 UTC next day for daily counters; paidExpireAt for cycle counters. */
  resetAt?: string;
  /** Remaining count in the current window after this reservation. */
  remaining?: number;
}
