/**
 * Audit reporter for the DevTools detector.
 *
 * Validates: Requirement 13.9 (record event via Audit_Logger).
 *
 * Posts a `devtools_detected` audit event to the API_Gateway via the
 * shared `httpFetch` so the request automatically carries
 * `X-Client-Integrity` and `X-Device-Fingerprint`. The endpoint is
 * mocked at this stage; the contract is intentionally minimal so the
 * real handler (added in task 8.x) can accept the same body without
 * changes:
 *
 *   POST /audit/devtools-detected
 *   Body: { detectedAt: string (ISO-8601 UTC) }
 *
 * Network failures are intentionally swallowed: the banner is the
 * user-visible signal and must show even if the audit POST fails. The
 * same fire-and-forget pattern is used by `i18n/localeStore.ts`.
 */

import { httpFetch } from '../api/httpClient';

export const DEVTOOLS_AUDIT_ENDPOINT = '/audit/devtools-detected';

export async function reportDevtoolsDetected(now: Date = new Date()): Promise<void> {
  if (typeof fetch !== 'function') {
    return;
  }
  try {
    await httpFetch(DEVTOOLS_AUDIT_ENDPOINT, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detectedAt: now.toISOString() }),
    });
  } catch {
    // Audit emission must not break the SPA. The banner has already
    // rendered; the next request will surface the issue to the
    // backend through other audit channels.
  }
}
