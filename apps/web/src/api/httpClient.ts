import { getApiBaseUrl } from './apiBase';
import { getAccessToken } from './supabaseClient';

const API_BASE_URL = getApiBaseUrl();

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (API_BASE_URL && typeof input === 'string' && input.startsWith('/')) {
    return API_BASE_URL + input;
  }

  return input;
}

export async function httpFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(resolveApiUrl(input), { ...init, headers });
}
