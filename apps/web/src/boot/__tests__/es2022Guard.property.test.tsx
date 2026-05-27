/**
 * Property test for the ES2022 capability guard.
 *
 * **Property 31: ES2022 guard**
 *
 * **Validates: Requirements 18.2**
 *
 * Requirement 18.2 ("THE Web_Client SHALL chặn truy cập từ trình duyệt
 * không hỗ trợ ECMAScript 2022 và phải hiển thị thông báo nâng cấp
 * trình duyệt") drives a defensive feature-detect on boot. The detector
 * — implemented in `../es2022Guard.ts` — probes a fixed set of ES2022
 * capabilities and reports `{ supported, missing }`. The boot path then
 * renders a localized upgrade notice iff at least one capability is
 * missing.
 *
 * The property exercised here:
 *
 *     ∀ S ⊆ CAPABILITIES.
 *         after stubbing every capability in S away,
 *           detectEs2022() reports
 *             supported  === (|S| === 0)
 *             missing    === S        (set equality, order-insensitive)
 *         and the call site renders the upgrade notice
 *           iff |S| > 0.
 *
 * The capability set under test mirrors the static probe order in
 * `detectEs2022`:
 *
 *   - `Object.hasOwn`
 *   - `Array.prototype.at`
 *   - `Array.prototype.findLast`
 *   - `String.prototype.replaceAll`
 *   - `Error.cause`
 *
 * For each generated subset we stub out only those capabilities (using
 * the same `value = undefined` trick the unit tests rely on for
 * static methods, and a `Object.defineProperty` swap for the
 * non-writable `Error` constructor), invoke `detectEs2022`, then
 * confirm the boot helper renders the upgrade notice exactly when at
 * least one capability is missing. Originals are restored after every
 * iteration so a failure in one sample cannot pollute later samples.
 *
 * Runs at `numRuns: 100` to match the codebase default for non-state
 * properties (see `apps/api/src/gateway/jwtAuth.property.test.ts`).
 */

import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import { detectEs2022, requireEs2022OrAbort } from '../es2022Guard';

// ---------------------------------------------------------------------------
// Capability registry
// ---------------------------------------------------------------------------

/**
 * The five ES2022 capability probes performed by `detectEs2022`. Each
 * entry knows how to stub the capability away (returning a restore
 * thunk) so the property iteration code does not have to special-case
 * every probe inline.
 *
 * `name` matches the human-readable string `detectEs2022` pushes into
 * `result.missing`, which lets us assert set equality against the
 * generated subset directly.
 */
interface Capability {
  readonly name: string;
  /**
   * Stub this capability away and return a thunk that restores the
   * original. Stub functions are intentionally tolerant of being
   * called more than once — restoring a never-stubbed capability is a
   * no-op so the bookkeeping in the property body stays simple.
   */
  stub(): () => void;
}

const CAPABILITIES: readonly Capability[] = [
  {
    name: 'Object.hasOwn',
    stub() {
      const target = Object as unknown as { hasOwn: unknown };
      const original = target.hasOwn;
      target.hasOwn = undefined;
      return () => {
        target.hasOwn = original;
      };
    },
  },
  {
    name: 'Array.prototype.at',
    stub() {
      const target = Array.prototype as unknown as { at?: unknown };
      const original = target.at;
      target.at = undefined;
      return () => {
        target.at = original;
      };
    },
  },
  {
    name: 'Array.prototype.findLast',
    stub() {
      const target = Array.prototype as unknown as { findLast?: unknown };
      const original = target.findLast;
      target.findLast = undefined;
      return () => {
        target.findLast = original;
      };
    },
  },
  {
    name: 'String.prototype.replaceAll',
    stub() {
      const target = String.prototype as unknown as { replaceAll?: unknown };
      const original = target.replaceAll;
      target.replaceAll = undefined;
      return () => {
        target.replaceAll = original;
      };
    },
  },
  {
    name: 'Error.cause',
    /**
     * `Error.cause` is special: the detector probes it via
     * `new Error(msg, { cause }).cause`, so stubbing the capability
     * means making the constructor IGNORE the `options` bag the way
     * a pre-ES2022 engine would. We do that by swapping `globalThis.
     * Error` for a subclass whose constructor accepts only the
     * message argument, then restoring the original `Error`.
     */
    stub() {
      const originalError = globalThis.Error;
      class LegacyError extends originalError {
        constructor(message?: string) {
          super(message);
          this.name = 'Error';
        }
      }
      // Cast through `unknown` because TS knows `Error` has a richer
      // signature than our drop-in. This is the same swap pattern
      // used elsewhere in the codebase to simulate stale engines.
      (globalThis as unknown as { Error: ErrorConstructor }).Error =
        LegacyError as unknown as ErrorConstructor;
      return () => {
        (globalThis as unknown as { Error: ErrorConstructor }).Error =
          originalError;
      };
    },
  },
] as const;

const CAPABILITY_NAMES: readonly string[] = CAPABILITIES.map((c) => c.name);

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

/**
 * Generate a random subset of {@link CAPABILITIES}. Implemented as
 * five independent boolean choices (one per capability) which gives
 * uniform coverage over the full 2^5 = 32 element power set,
 * including the empty subset (the "supported" case) and the full
 * subset (the "every capability missing" case). Both extremes are
 * material to Property 31.
 */
const arbCapabilitySubset: fc.Arbitrary<readonly Capability[]> = fc
  .tuple(
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
    fc.boolean(),
  )
  .map((flags) =>
    CAPABILITIES.filter((_, idx) => flags[idx] === true),
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a fresh `#root`-style container detached after each test. */
function createContainer(): HTMLDivElement {
  const el = document.createElement('div');
  el.id = 'root';
  document.body.appendChild(el);
  return el;
}

/**
 * Apply every capability stub in `subset` and run `body`, restoring
 * originals in reverse order in a `finally` block so a thrown
 * assertion leaves the global namespace pristine.
 */
function withStubbed<T>(
  subset: readonly Capability[],
  body: () => T,
): T {
  const restorers: Array<() => void> = [];
  try {
    for (const cap of subset) {
      restorers.push(cap.stub());
    }
    return body();
  } finally {
    // Restore in reverse to mirror nested-resource semantics: the
    // last stub installed is the first one rolled back.
    for (let i = restorers.length - 1; i >= 0; i -= 1) {
      restorers[i]!();
    }
  }
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 31: ES2022 guard', () => {
  it('reports supported = (subset is empty), missing = subset, and renders notice iff missing', () => {
    fc.assert(
      fc.property(arbCapabilitySubset, (subset) => {
        const expectedNames = subset.map((c) => c.name);

        withStubbed(subset, () => {
          // ---- detectEs2022 contract ----
          const result = detectEs2022();
          expect(result.supported).toBe(subset.length === 0);
          // Set equality: same length AND same membership, order-
          // insensitive. We deliberately do not assert order because
          // the detector orders by static probe order in source,
          // which is a stronger guarantee than Property 31 demands.
          expect(result.missing).toHaveLength(expectedNames.length);
          expect([...result.missing].sort()).toEqual(
            [...expectedNames].sort(),
          );
          // Sanity: every reported name belongs to the registered
          // capability set — the detector must not invent labels.
          for (const name of result.missing) {
            expect(CAPABILITY_NAMES).toContain(name);
          }

          // ---- requireEs2022OrAbort rendering contract ----
          const root = createContainer();
          const ok = requireEs2022OrAbort(root, 'vi');
          const notice = root.querySelector(
            '[data-testid="es2022-upgrade-notice"]',
          );

          if (subset.length === 0) {
            // Supported: guard returns true and leaves the root
            // untouched so the SPA can mount.
            expect(ok).toBe(true);
            expect(notice).toBeNull();
          } else {
            // Unsupported: guard returns false and renders the
            // upgrade notice listing the missing capabilities.
            expect(ok).toBe(false);
            expect(notice).not.toBeNull();
            const missingList = root.querySelector(
              '[data-testid="es2022-missing-list"]',
            );
            expect(missingList).not.toBeNull();
            const missingText = missingList?.textContent ?? '';
            for (const name of expectedNames) {
              expect(missingText).toContain(name);
            }
          }

          // Detach the container so the next iteration starts fresh.
          root.remove();
        });
      }),
      { numRuns: 100 },
    );
  });
});
