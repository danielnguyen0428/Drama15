/**
 * Device-fingerprint contracts (Requirement 4).
 *
 * Free_Plan: ≤ 1 active fingerprint per account; Paid_Plan: ≤ 3 (Req 4.2, 4.3).
 * A fingerprint already bound to an active Free_Plan cannot be reused by
 * another Free_Plan account (Req 2.3, 2.4).
 */

/** Hash of `(UA, platform, screen, timezone, hardwareConcurrency, …)`. */
export type DeviceFingerprint = string;

export type DeviceStatus = 'active' | 'revoked';

/**
 * User-facing device record returned by `GET /me/devices` (Requirement 4.6).
 * IP and country are surfaced for awareness; PII is kept server-side.
 */
export interface DeviceRecord {
  fingerprint: DeviceFingerprint;
  /** ISO-8601 UTC. */
  firstSeen: string;
  /** ISO-8601 UTC. */
  lastSeen: string;
  /** Last observed source IP (string form, may be IPv4 or IPv6). */
  lastIp: string;
  /** ISO-3166 alpha-2, used for geographic re-auth (Requirement 4.5). */
  lastCountry?: string;
  status: DeviceStatus;
  /** True when this entry corresponds to the caller's current session. */
  isCurrent?: boolean;
}

export interface ListDevicesResponse {
  devices: DeviceRecord[];
}

export interface RemoveDeviceRequest {
  fingerprint: DeviceFingerprint;
}
