import { describe, expect, it } from 'vitest';
import {
  computeCodeChallenge,
  GOOGLE_AUTHORIZE_URL,
  InMemoryChallengeStore,
  OAuthStartService,
  type OAuthStartInput
} from '../../../src/auth/oauth/index.js';

const BASE_INPUT: OAuthStartInput = {
  clientId: '1234567890.apps.googleusercontent.com',
  redirectUri: 'https://app.example.com/auth/google/callback',
  scope: 'openid email profile'
};

function makeService(): { service: OAuthStartService; store: InMemoryChallengeStore } {
  const store = new InMemoryChallengeStore();
  const service = new OAuthStartService({ store });
  return { service, store };
}

describe('OAuthStartService.start', () => {
  it('returns an authorize URL with the OAuth + PKCE parameters', async () => {
    const { service } = makeService();
    const result = await service.start(BASE_INPUT);

    const url = new URL(result.authorizeUrl);
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZE_URL);

    const params = Object.fromEntries(url.searchParams);
    expect(params.response_type).toBe('code');
    expect(params.client_id).toBe(BASE_INPUT.clientId);
    expect(params.redirect_uri).toBe(BASE_INPUT.redirectUri);
    expect(params.scope).toContain('openid');
    expect(params.scope).toContain('email');
    expect(params.scope).toContain('profile');
    expect(params.state).toBe(result.state);
    expect(params.nonce).toBe(result.nonce);
    expect(params.code_challenge_method).toBe('S256');
    expect(typeof params.code_challenge).toBe('string');
    expect((params.code_challenge ?? '').length).toBeGreaterThan(0);
    expect(params.prompt).toBe('select_account');
  });

  it('does NOT return the codeVerifier to the caller', async () => {
    const { service } = makeService();
    const result = await service.start(BASE_INPUT);
    // The result type itself does not declare codeVerifier; assert at
    // runtime as well in case a future refactor leaks it.
    expect((result as Record<string, unknown>).codeVerifier).toBeUndefined();
    // And it must not appear in the authorize URL either (PKCE rule).
    const params = new URL(result.authorizeUrl).searchParams;
    expect(params.get('code_verifier')).toBeNull();
  });

  it('persists the challenge under the returned state with a fresh codeVerifier and matching nonce', async () => {
    const { service, store } = makeService();
    const result = await service.start(BASE_INPUT);

    const stored = await store.take(result.state);
    expect(stored).not.toBeNull();
    expect(stored?.nonce).toBe(result.nonce);
    expect(stored?.codeVerifier).toBeDefined();
    expect((stored?.codeVerifier ?? '').length).toBeGreaterThanOrEqual(43);

    // The stored entry is single-use: a second take returns null.
    expect(await store.take(result.state)).toBeNull();
  });

  it('writes a code_challenge that is consistent with the stored codeVerifier', async () => {
    const { service, store } = makeService();
    const result = await service.start(BASE_INPUT);

    const stored = await store.take(result.state);
    expect(stored).not.toBeNull();

    const urlChallenge = new URL(result.authorizeUrl).searchParams.get(
      'code_challenge'
    );
    expect(urlChallenge).not.toBeNull();
    expect(urlChallenge).toBe(computeCodeChallenge(stored!.codeVerifier));
  });

  it('produces different state and nonce values across invocations', async () => {
    const { service } = makeService();
    const results = await Promise.all(
      Array.from({ length: 16 }, () => service.start(BASE_INPUT))
    );

    const states = new Set(results.map((r) => r.state));
    const nonces = new Set(results.map((r) => r.nonce));
    expect(states.size).toBe(results.length);
    expect(nonces.size).toBe(results.length);
  });

  it('forces openid/email/profile scopes even if the caller requests something narrower', async () => {
    const { service } = makeService();
    const result = await service.start({ ...BASE_INPUT, scope: 'profile' });

    const scope = new URL(result.authorizeUrl).searchParams.get('scope') ?? '';
    const tokens = scope.split(' ');
    expect(tokens).toContain('openid');
    expect(tokens).toContain('email');
    expect(tokens).toContain('profile');
  });

  it('honours custom googleAuthorizeUrl, ttlSeconds, and clock options', async () => {
    const store = new InMemoryChallengeStore();
    let nowMs = 1_700_000_000_000;
    const service = new OAuthStartService({
      store,
      clock: () => nowMs,
      ttlSeconds: 60,
      googleAuthorizeUrl: 'https://example-idp.test/authorize'
    });

    const result = await service.start(BASE_INPUT);
    expect(result.authorizeUrl.startsWith('https://example-idp.test/authorize?')).toBe(true);

    const stored = await store.take(result.state);
    expect(stored?.createdAt).toBe(nowMs);
    expect(stored?.expiresAt).toBe(nowMs + 60_000);
  });

  it('includes login_hint only when provided and non-empty', async () => {
    const { service } = makeService();

    const without = await service.start(BASE_INPUT);
    expect(new URL(without.authorizeUrl).searchParams.has('login_hint')).toBe(false);

    const empty = await service.start({ ...BASE_INPUT, loginHint: '' });
    expect(new URL(empty.authorizeUrl).searchParams.has('login_hint')).toBe(false);

    const withHint = await service.start({
      ...BASE_INPUT,
      loginHint: 'user@example.com'
    });
    expect(new URL(withHint.authorizeUrl).searchParams.get('login_hint')).toBe(
      'user@example.com'
    );
  });

  it('records the fingerprint on the stored challenge when provided', async () => {
    const { service, store } = makeService();
    const fingerprint = 'a'.repeat(64);
    const result = await service.start({ ...BASE_INPUT, fingerprint });
    const stored = await store.take(result.state);
    expect(stored?.fingerprint).toBe(fingerprint);
  });
});
