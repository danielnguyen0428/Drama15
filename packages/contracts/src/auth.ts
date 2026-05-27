/**
 * Authentication contracts — Google OAuth 2.0 + PKCE (Requirements 1, 3, 4).
 */

/**
 * Claims carried by an Access_Token (JWT, RS256).
 *
 * Note: per Requirement 3.4 the token MUST NOT contain `plan`, `quota`, or
 * `role`. Authorization decisions always go through License_Service.
 *
 * `epoch` corresponds to `users.token_epoch` and is bumped to invalidate every
 * outstanding Access_Token within ≤ 60 s (Requirement 2.8, 4.7).
 */
export interface AccessTokenClaims {
  /** Issuer, e.g. `https://api.drama15.example`. */
  iss?: string;
  /** User id (uuid). */
  sub: string;
  /** Primary identifier — Google email with `email_verified=true`. */
  email: string;
  /** Hashed Device_Fingerprint bound to this session. */
  fp: string;
  /** Session id. */
  sid: string;
  /** Bumped on revoke (paid revoke / device remove) to force re-auth. */
  epoch: number;
  /** Issued-at, seconds since epoch. */
  iat: number;
  /** Expiry, seconds since epoch. MUST satisfy `exp - iat ≤ 900` (Req 3.5). */
  exp: number;
  /** Signing key id. */
  kid: string;
}

/**
 * Cookie attributes for the Refresh_Token (Requirement 13.7).
 */
export interface RefreshCookieFlags {
  httpOnly: true;
  secure: true;
  sameSite: 'Strict';
  /** `/auth` */
  path: string;
  /** Lifetime in seconds; equals 7 days. */
  maxAge: number;
}

export interface LoginCallbackRequest {
  /** Authorization code from Google_Identity_Provider. */
  code: string;
  /** PKCE verifier corresponding to the original `code_challenge`. */
  codeVerifier: string;
  /** State value originally sent to Google for CSRF protection. */
  state: string;
  /** Nonce originally sent to Google for replay protection. */
  nonce: string;
  /** Hashed Device_Fingerprint (Requirement 4.1). */
  fingerprint: string;
}

export interface LoginCallbackResponse {
  /** Access_Token issued in body; client MUST NOT persist (Requirement 13.8). */
  accessToken: string;
  /** Seconds until `accessToken` expires (≤ 900). */
  expiresInSeconds: number;
  /** Hashed Device_Fingerprint of the active session. */
  fingerprint: string;
  /** Convenience subset of profile information; not authoritative. */
  profile: {
    userId: string;
    email: string;
    displayName?: string;
    uiLocale: 'vi' | 'en';
  };
}

export interface RefreshRequest {
  /** Hashed Device_Fingerprint must match the cookie's bound session. */
  fingerprint: string;
}

export interface RefreshResponse {
  accessToken: string;
  expiresInSeconds: number;
}

export interface LogoutRequest {
  /** When true, revoke every active session for this user. */
  allDevices?: boolean;
}
