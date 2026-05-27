/**
 * Canonical error code union shared by API_Gateway, Web_Client, and Admin_Console.
 *
 * Each code maps to a specific Requirement in requirements.md.
 */
export type ErrorCode =
  // Auth (Requirements 1, 3)
  | 'unauthenticated'
  | 'refresh_token_invalid'
  | 'google_email_unverified'
  | 'reauth_required'
  // Authorization (Requirements 2, 3, 4, 10, 13)
  | 'forbidden'
  | 'license_not_active'
  | 'device_limit_reached'
  | 'free_plan_device_already_used'
  | 'automation_requires_paid'
  | 'voice_requires_paid'
  | 'client_integrity_failed'
  // Quota / rate limit (Requirements 5, 7, 8, 9)
  | 'free_chapter_quota_exhausted'
  | 'paid_story_quota_exhausted'
  | 'paid_voice_quota_exhausted'
  | 'rewrite_quota_exhausted'
  | 'rate_limited'
  // Upstream / browser (Requirements 12, 17, 18)
  | 'upstream_timeout'
  | 'upstream_error'
  | 'unsupported_browser'
  // Catch-all
  | 'internal_error';

/**
 * Standard error envelope returned by API_Gateway for every non-2xx response.
 *
 * - `retryAfterSeconds` is set on `rate_limited` responses (Requirement 5.9).
 * - `resetAt` is set on quota-exhausted responses (Requirement 5.3, 5.5, 5.7, 7.6).
 * - `requestId` allows correlation against internal audit logs without leaking
 *   upstream details (Requirement 12.5).
 */
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    retryAfterSeconds?: number;
    /** ISO-8601 UTC timestamp at which the relevant counter resets. */
    resetAt?: string;
    requestId?: string;
  };
}
