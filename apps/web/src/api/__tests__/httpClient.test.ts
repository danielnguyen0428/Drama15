import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CLIENT_INTEGRITY,
  CLIENT_INTEGRITY_HEADER,
} from '../../security/clientIntegrityHeader';
import {
  DEVICE_FINGERPRINT_HEADER,
  __resetDeviceFingerprintCacheForTests,
  httpFetch,
} from '../httpClient';

describe('httpFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    __resetDeviceFingerprintCacheForTests();
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
    __resetDeviceFingerprintCacheForTests();
  });

  function lastCallHeaders(): Headers {
    expect(fetchMock).toHaveBeenCalled();
    const args = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    expect(args).toBeDefined();
    const init = args![1] as RequestInit;
    const headers = init.headers;
    expect(headers).toBeInstanceOf(Headers);
    return headers as Headers;
  }

  it('attaches X-Client-Integrity and X-Device-Fingerprint on every call', async () => {
    await httpFetch('https://api.example/v1/me');
    const headers1 = lastCallHeaders();
    expect(headers1.get(CLIENT_INTEGRITY_HEADER)).toBe(CLIENT_INTEGRITY);
    expect(headers1.get(DEVICE_FINGERPRINT_HEADER)).toMatch(/^[A-Za-z0-9_-]+$/);

    await httpFetch('https://api.example/v1/stories', { method: 'POST' });
    const headers2 = lastCallHeaders();
    expect(headers2.get(CLIENT_INTEGRITY_HEADER)).toBe(CLIENT_INTEGRITY);
    expect(headers2.get(DEVICE_FINGERPRINT_HEADER)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('preserves caller-supplied headers when adding integrity headers', async () => {
    await httpFetch('https://api.example/v1/me', {
      headers: { Authorization: 'Bearer abc', 'X-Custom': '1' },
    });
    const headers = lastCallHeaders();
    expect(headers.get('Authorization')).toBe('Bearer abc');
    expect(headers.get('X-Custom')).toBe('1');
    expect(headers.get(CLIENT_INTEGRITY_HEADER)).toBe(CLIENT_INTEGRITY);
    expect(headers.get(DEVICE_FINGERPRINT_HEADER)).not.toBeNull();
  });

  it('reuses the same fingerprint across calls', async () => {
    await httpFetch('https://api.example/a');
    const fpA = lastCallHeaders().get(DEVICE_FINGERPRINT_HEADER);

    await httpFetch('https://api.example/b');
    const fpB = lastCallHeaders().get(DEVICE_FINGERPRINT_HEADER);

    expect(fpA).not.toBeNull();
    expect(fpA).toBe(fpB);
  });

  it('accepts a Headers instance as init.headers', async () => {
    const incoming = new Headers({ 'X-Existing': 'yes' });
    await httpFetch('https://api.example/me', { headers: incoming });
    const headers = lastCallHeaders();
    expect(headers.get('X-Existing')).toBe('yes');
    expect(headers.get(CLIENT_INTEGRITY_HEADER)).toBe(CLIENT_INTEGRITY);
    expect(headers.get(DEVICE_FINGERPRINT_HEADER)).not.toBeNull();
  });
});
