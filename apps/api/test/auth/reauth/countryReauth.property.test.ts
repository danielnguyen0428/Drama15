// Feature: commercial-web-saas, Property 9: Reauth khi đổi quốc gia IP
// Validates: Requirements 4.5
import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  CountryReauthDetector,
  DEFAULT_REAUTH_WINDOW_MS,
  InMemorySessionCountryStore
} from '../../../src/auth/reauth/index.js';

/**
 * Property 9 — Reauth khi đổi quốc gia IP.
 *
 * Validates: Requirements 4.5
 *
 * Statement (paraphrased from design.md):
 *   For all active sessions, if an Access_Token is used from an IP
 *   whose country code differs from the session's last country within
 *   ≤ 10 minutes of the previous verify, the gateway MUST reject the
 *   request with `reauth_required`. After 10 minutes the change is
 *   silently rebased.
 *
 * Test strategy:
 *   - Seed a fresh detector + in-memory store per iteration.
 *   - Generate `(initialCountry, secondCountry, gapMs)` where the
 *     gap straddles the 10-minute threshold (we explore [0, 30 min])
 *     so both "within window" and "after window" branches fire, and
 *     same/different country pairings exercise the third branch.
 *   - First `evaluate` seeds the snapshot and must always succeed.
 *   - Second `evaluate` at `T0 + gapMs` must satisfy the matrix:
 *       a) same country         → ok:true (any gap)
 *       b) different, gap ≤ 10m → reauth_required, snapshot unchanged
 *       c) different, gap > 10m → ok:true, snapshot rebased to the
 *                                   new country and timestamp
 */

// A small fixed alphabet of ISO-3166-1 alpha-2 codes. Five values is
// large enough that fast-check shrinks toward both same-country and
// different-country pairings, but small enough that collisions are
// frequent (~20%) so the "same country" branch is covered without
// special-casing the generator.
const COUNTRY_CODES = ['VN', 'US', 'JP', 'DE', 'BR'] as const;

const arbCountry = fc.constantFrom(...COUNTRY_CODES);

// Gap range straddles the 10-minute threshold (600_000 ms) by a wide
// margin in both directions so the "boundary inclusive" rule and the
// "after window" rebase branch each get plenty of samples.
const arbGapMs = fc.integer({ min: 0, max: 30 * 60 * 1000 });

const SESSION_ID = 'sess-prop9';
const T0 = new Date('2025-01-01T00:00:00.000Z');

describe('CountryReauthDetector — Property 9: reauth on IP-country change', () => {
  it('respects the 10-minute reauth window across arbitrary (initial, second, gap) inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbCountry,
        arbCountry,
        arbGapMs,
        async (initialCountry, secondCountry, gapMs) => {
          // Fresh store + detector per iteration so state never leaks
          // between fast-check shrinks. The default 10-minute window
          // is what Requirement 4.5 mandates.
          const store = new InMemorySessionCountryStore();
          const detector = new CountryReauthDetector({ store });

          // First evaluate seeds the snapshot. By construction (no
          // prior snapshot) this must always be allowed.
          const seedDecision = await detector.evaluate({
            sessionId: SESSION_ID,
            currentCountry: initialCountry,
            currentIp: '203.0.113.1',
            now: T0
          });
          if (seedDecision.ok !== true) {
            throw new Error(
              `seed evaluate must return ok:true, got ${JSON.stringify(seedDecision)}`
            );
          }

          const seededSnapshot = await store.get(SESSION_ID);
          if (
            seededSnapshot === null ||
            seededSnapshot.lastCountry !== initialCountry ||
            seededSnapshot.lastVerifiedAt.getTime() !== T0.getTime()
          ) {
            throw new Error(
              `seed snapshot mismatch: ${JSON.stringify(seededSnapshot)}`
            );
          }

          // Second evaluate after `gapMs` from the new country.
          const secondNow = new Date(T0.getTime() + gapMs);
          const decision = await detector.evaluate({
            sessionId: SESSION_ID,
            currentCountry: secondCountry,
            currentIp: '198.51.100.7',
            now: secondNow
          });

          const snapshotAfter = await store.get(SESSION_ID);
          if (snapshotAfter === null) {
            throw new Error('snapshot disappeared after second evaluate');
          }

          if (secondCountry === initialCountry) {
            // Branch (a): same country, any gap → allow and the
            // snapshot stays on `initialCountry` with refreshed time.
            if (decision.ok !== true) {
              throw new Error(
                `same-country must be ok:true, got ${JSON.stringify(decision)} (gap=${gapMs})`
              );
            }
            if (snapshotAfter.lastCountry !== initialCountry) {
              throw new Error(
                `same-country snapshot drifted to ${snapshotAfter.lastCountry}`
              );
            }
            if (snapshotAfter.lastVerifiedAt.getTime() !== secondNow.getTime()) {
              throw new Error(
                `same-country snapshot timestamp must refresh to secondNow`
              );
            }
            return;
          }

          // Different country from here on.
          if (gapMs <= DEFAULT_REAUTH_WINDOW_MS) {
            // Branch (b): inside the window → reauth_required and
            // the snapshot MUST stay on the original country/time
            // (otherwise an attacker could win by retrying).
            if (decision.ok !== false || decision.reason !== 'reauth_required') {
              throw new Error(
                `within-window change must reject with reauth_required, got ${JSON.stringify(decision)} (gap=${gapMs})`
              );
            }
            if (snapshotAfter.lastCountry !== initialCountry) {
              throw new Error(
                `blocked snapshot drifted to ${snapshotAfter.lastCountry}`
              );
            }
            if (snapshotAfter.lastVerifiedAt.getTime() !== T0.getTime()) {
              throw new Error(
                `blocked snapshot timestamp drifted to ${snapshotAfter.lastVerifiedAt.toISOString()}`
              );
            }
            return;
          }

          // Branch (c): outside the window → allow and rebase.
          if (decision.ok !== true) {
            throw new Error(
              `after-window change must be ok:true, got ${JSON.stringify(decision)} (gap=${gapMs})`
            );
          }
          if (snapshotAfter.lastCountry !== secondCountry) {
            throw new Error(
              `after-window snapshot must rebase to ${secondCountry}, got ${snapshotAfter.lastCountry}`
            );
          }
          if (snapshotAfter.lastVerifiedAt.getTime() !== secondNow.getTime()) {
            throw new Error(
              `after-window snapshot timestamp must rebase to secondNow`
            );
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
