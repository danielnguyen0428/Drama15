import { getApiBaseUrl } from './apiBase';

const API_BASE_URL = getApiBaseUrl();

function resolveApiUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (API_BASE_URL && typeof input === 'string' && input.startsWith('/')) {
    return API_BASE_URL + input;
  }

  return input;
}

export function httpFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(resolveApiUrl(input), init);
}
