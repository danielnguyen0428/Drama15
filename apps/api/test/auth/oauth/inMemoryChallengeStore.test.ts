import { describe, expect, it } from 'vitest';
import {
  InMemoryChallengeStore,
  type OAuthChallenge
} from '../../../src/auth/oauth/index.js';

function makeChallenge(
  state: string,
  expiresAt: number,
  createdAt = expiresAt - 5_000
): OAuthChallenge {
  return {
    state,
    nonce: `nonce-${state}`,
    codeVerifier: `verifier-${state}`,
    redirectUri: 'https://example.com/cb',
    createdAt,
    expiresAt,
    fingerprint: null
  };
}

describe('InMemoryChallengeStore', () => {
  it('round-trips put/take and consumes the entry on take', async () => {
    const store = new InMemoryChallengeStore();
    const ch = makeChallenge('state-A', 1_000);

    await store.put(ch.state, ch);
    expect(store.size()).toBe(1);

    const taken = await store.take('state-A');
    expect(taken).toEqual(ch);
    expect(store.size()).toBe(0);

    // Single-use: a second take returns null.
    expect(await store.take('state-A')).toBeNull();
  });

  it('returns null for an unknown state without throwing', async () => {
    const store = new InMemoryChallengeStore();
    expect(await store.take('does-not-exist')).toBeNull();
  });

  it('gc removes only entries whose expiresAt is at or before now', async () => {
    const store = new InMemoryChallengeStore();
    await store.put('past', makeChallenge('past', 100));
    await store.put('exact', makeChallenge('exact', 200));
    await store.put('future', makeChallenge('future', 300));

    const removed = await store.gc(200);
    expect(removed).toBe(2);
    expect(store.size()).toBe(1);

    // The future entry is still present and recoverable.
    const taken = await store.take('future');
    expect(taken).not.toBeNull();
    expect(taken?.state).toBe('future');
  });

  it('gc on an empty / all-fresh store removes nothing', async () => {
    const store = new InMemoryChallengeStore();
    expect(await store.gc(0)).toBe(0);

    await store.put('fresh', makeChallenge('fresh', 10_000));
    expect(await store.gc(5_000)).toBe(0);
    expect(store.size()).toBe(1);
  });
});
