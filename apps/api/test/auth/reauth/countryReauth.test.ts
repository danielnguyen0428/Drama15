import { describe, expect, it } from 'vitest';
import {
  CountryReauthDetector,
  DEFAULT_REAUTH_WINDOW_MS,
  InMemorySessionCountryStore,
  ReauthError,
  type SessionCountrySnapshot
} from '../../../src/auth/reauth/index.js';

/**
 * Build a detector wired to a fresh in-memory store. Returns both so
 * tests can assert on persisted snapshots without going through the
 * detector's API.
 */
function makeDetector(threshold = DEFAULT_REAUTH_WINDOW_MS): {
  detector: CountryReauthDetector;
  store: InMemorySessionCountryStore;
} {
  const store = new InMemorySessionCountryStore();
  const detector = new CountryReauthDetector({ store, threshold });
  return { detector, store };
}

const SESSION_ID = 'sess-1';
const T0 = new Date('2025-01-01T00:00:00.000Z');

function plus(base: Date, ms: number): Date {
  return new Date(base.getTime() + ms);
}

describe('CountryReauthDetector.evaluate', () => {
  it('records a fresh snapshot and allows the first request from any country', async () => {
    const { detector, store } = makeDetector();

    const decision = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });

    expect(decision).toEqual({ ok: true });

    const snapshot = await store.get(SESSION_ID);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.lastCountry).toBe('VN');
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(T0.getTime());
  });

  it('refreshes lastVerifiedAt when the country is unchanged within the window', async () => {
    const { detector, store } = makeDetector();

    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });

    const later = plus(T0, 5 * 60 * 1000);
    const decision = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.6',
      now: later
    });

    expect(decision).toEqual({ ok: true });

    const snapshot = await store.get(SESSION_ID);
    expect(snapshot?.lastCountry).toBe('VN');
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(later.getTime());
  });

  it('blocks with reauth_required when the country changes within the window and does NOT update the snapshot', async () => {
    const { detector, store } = makeDetector();

    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });

    // 9 minutes later — comfortably inside the 10-minute window.
    const within = plus(T0, 9 * 60 * 1000);
    const decision = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'US',
      currentIp: '198.51.100.7',
      now: within
    });

    expect(decision).toEqual({ ok: false, reason: 'reauth_required' });

    // The snapshot must remain on the original country/timestamp so an
    // attacker cannot win by retrying after the window elapsed.
    const snapshot = await store.get(SESSION_ID);
    expect(snapshot?.lastCountry).toBe('VN');
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(T0.getTime());
  });

  it('also blocks when the country changes exactly at the window boundary', async () => {
    const { detector } = makeDetector();

    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });

    // Exactly 10 minutes — boundary is inclusive ("≤ 10 minutes").
    const boundary = plus(T0, DEFAULT_REAUTH_WINDOW_MS);
    const decision = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'US',
      currentIp: '198.51.100.7',
      now: boundary
    });

    expect(decision).toEqual({ ok: false, reason: 'reauth_required' });
  });

  it('accepts the new country and rebases the snapshot when the change happens after the window', async () => {
    const { detector, store } = makeDetector();

    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });

    // 11 minutes later — outside the 10-minute window.
    const later = plus(T0, DEFAULT_REAUTH_WINDOW_MS + 60 * 1000);
    const decision = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'US',
      currentIp: '198.51.100.7',
      now: later
    });

    expect(decision).toEqual({ ok: true });

    const snapshot = await store.get(SESSION_ID);
    expect(snapshot?.lastCountry).toBe('US');
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(later.getTime());
  });

  it('uses the injected clock when no explicit `now` is supplied', async () => {
    const store = new InMemorySessionCountryStore();
    let current = T0;
    const detector = new CountryReauthDetector({
      store,
      clock: () => current
    });

    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5'
    });

    current = plus(T0, 60 * 1000);
    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.6'
    });

    const snapshot = await store.get(SESSION_ID);
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(current.getTime());
  });

  it('isolates snapshots across distinct sessions', async () => {
    const { detector } = makeDetector();

    await detector.evaluate({
      sessionId: 'sess-A',
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });
    await detector.evaluate({
      sessionId: 'sess-B',
      currentCountry: 'JP',
      currentIp: '198.51.100.7',
      now: T0
    });

    // Country mismatch on sess-A is independent of sess-B's snapshot.
    const decisionA = await detector.evaluate({
      sessionId: 'sess-A',
      currentCountry: 'JP',
      currentIp: '198.51.100.7',
      now: plus(T0, 60 * 1000)
    });
    expect(decisionA).toEqual({ ok: false, reason: 'reauth_required' });

    // sess-B is still happily on JP, so it is allowed.
    const decisionB = await detector.evaluate({
      sessionId: 'sess-B',
      currentCountry: 'JP',
      currentIp: '198.51.100.8',
      now: plus(T0, 60 * 1000)
    });
    expect(decisionB).toEqual({ ok: true });
  });
});

describe('CountryReauthDetector.recordReauthSuccess', () => {
  it('overwrites the snapshot so a previously-blocked country is accepted on the next call', async () => {
    const { detector, store } = makeDetector();

    await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'VN',
      currentIp: '203.0.113.5',
      now: T0
    });

    const within = plus(T0, 60 * 1000);
    const blocked = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'US',
      currentIp: '198.51.100.7',
      now: within
    });
    expect(blocked).toEqual({ ok: false, reason: 'reauth_required' });

    // User completes a fresh Google reauth from the new country.
    const reauthAt = plus(within, 30 * 1000);
    await detector.recordReauthSuccess({
      sessionId: SESSION_ID,
      country: 'US',
      now: reauthAt
    });

    const snapshot = await store.get(SESSION_ID);
    expect(snapshot?.lastCountry).toBe('US');
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(reauthAt.getTime());

    // The next request from the new country is allowed immediately,
    // even though we are still well within the original 10-minute
    // window relative to the first verify.
    const decision = await detector.evaluate({
      sessionId: SESSION_ID,
      currentCountry: 'US',
      currentIp: '198.51.100.7',
      now: plus(reauthAt, 1_000)
    });
    expect(decision).toEqual({ ok: true });
  });

  it('uses the injected clock when no explicit `now` is supplied', async () => {
    const store = new InMemorySessionCountryStore();
    let current = T0;
    const detector = new CountryReauthDetector({
      store,
      clock: () => current
    });

    current = plus(T0, 5 * 60 * 1000);
    await detector.recordReauthSuccess({
      sessionId: SESSION_ID,
      country: 'US'
    });

    const snapshot = await store.get(SESSION_ID);
    expect(snapshot?.lastCountry).toBe('US');
    expect(snapshot?.lastVerifiedAt.getTime()).toBe(current.getTime());
  });
});

describe('InMemorySessionCountryStore', () => {
  it('returns null for unknown sessions and round-trips put/get/delete', async () => {
    const store = new InMemorySessionCountryStore();
    expect(await store.get('missing')).toBeNull();

    const snap: SessionCountrySnapshot = {
      sessionId: SESSION_ID,
      lastCountry: 'VN',
      lastVerifiedAt: T0
    };
    await store.put(snap);
    expect(await store.get(SESSION_ID)).toEqual(snap);
    expect(store.size()).toBe(1);

    await store.delete(SESSION_ID);
    expect(await store.get(SESSION_ID)).toBeNull();
    expect(store.size()).toBe(0);
  });

  it('overwrites an existing snapshot on put', async () => {
    const store = new InMemorySessionCountryStore();
    await store.put({
      sessionId: SESSION_ID,
      lastCountry: 'VN',
      lastVerifiedAt: T0
    });
    await store.put({
      sessionId: SESSION_ID,
      lastCountry: 'US',
      lastVerifiedAt: plus(T0, 60 * 1000)
    });

    const snap = await store.get(SESSION_ID);
    expect(snap?.lastCountry).toBe('US');
    expect(snap?.lastVerifiedAt.getTime()).toBe(T0.getTime() + 60 * 1000);
    expect(store.size()).toBe(1);
  });
});

describe('ReauthError', () => {
  it('exposes the `reauth_required` code and is identifiable via instanceof', () => {
    const err = new ReauthError();
    expect(err.code).toBe('reauth_required');
    expect(err).toBeInstanceOf(ReauthError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ReauthError');
  });

  it('accepts a custom message', () => {
    const err = new ReauthError('country changed: VN -> US');
    expect(err.message).toBe('country changed: VN -> US');
  });
});
