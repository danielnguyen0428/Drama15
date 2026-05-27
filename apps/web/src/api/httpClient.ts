/**
 * `httpClient` - Web_Client wrapper around `fetch()` that always
 * attaches the `X-Client-Integrity` and `X-Device-Fingerprint`
 * headers required by the gateway.
 */

import { computeDeviceFingerprint } from '../security/deviceFingerprint';
import {
  CLIENT_INTEGRITY,
  CLIENT_INTEGRITY_HEADER,
} from '../security/clientIntegrityHeader';
import { getAccessToken, clearAccessToken, refreshAccessToken } from '../auth/tokenStore';
import { getApiBaseUrl } from './apiBase';

/** Header name carrying the Device_Fingerprint on every API call. */
export const DEVICE_FINGERPRINT_HEADER = 'X-Device-Fingerprint';

let cachedFingerprint: Promise<string> | undefined;

function getDeviceFingerprint(): Promise<string> {
  if (!cachedFingerprint) {
    cachedFingerprint = computeDeviceFingerprint();
  }
  return cachedFingerprint;
}

export function __resetDeviceFingerprintCacheForTests(): void {
  cachedFingerprint = undefined;
}

function toHeaders(init: HeadersInit | undefined): Headers {
  if (init instanceof Headers) return init;
  return new Headers(init);
}

const API_BASE_URL = getApiBaseUrl();

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (API_BASE_URL && typeof input === 'string' && input.startsWith('/')) {
    return API_BASE_URL + input;
  }
  return input;
}

function isAuthUrl(input: RequestInfo | URL): boolean {
  const s = typeof input === 'string' ? input : input.toString();
  return s.includes('/auth/');
}

function getRefreshEndpoint(): string {
  return API_BASE_URL ? API_BASE_URL + '/auth/refresh' : '/auth/refresh';
}

/**
 * `fetch()` replacement that always carries `X-Client-Integrity`
 * and `X-Device-Fingerprint`. Handles 401 by attempting a silent
 * token refresh once before redirecting to login.
 */
export async function httpFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = toHeaders(init.headers);
  headers.set(CLIENT_INTEGRITY_HEADER, CLIENT_INTEGRITY);

  const fingerprint = await getDeviceFingerprint();
  headers.set(DEVICE_FINGERPRINT_HEADER, fingerprint);

  // Attach Authorization header when an access token is available
  const token = getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', 'Bearer ' + token);
  }

  const url = resolveApiUrl(input);
  let response = await fetch(url, { ...init, headers });

  // 401: try silent token refresh once, then retry original request.
  if (response.status === 401 && !isAuthUrl(url)) {
    try {
      const newToken = await refreshAccessToken({ endpoint: getRefreshEndpoint() });
      const retryHeaders = new Headers(headers);
      retryHeaders.set('Authorization', 'Bearer ' + newToken);
      response = await fetch(url, { ...init, headers: retryHeaders });
    } catch {
      clearAccessToken();
    }
  }

  // Still 401 after retry: clear token and redirect to login
  if (response.status === 401 && !isAuthUrl(url)) {
    clearAccessToken();
    if (typeof window !== 'undefined' && window.location.pathname !== '/' && window.location.pathname !== '/auth/google/callback') {
      window.location.href = '/';
    }
  }

  return response;
}

/** Re-exports for callers that want to introspect / set headers manually. */
export { CLIENT_INTEGRITY, CLIENT_INTEGRITY_HEADER };
