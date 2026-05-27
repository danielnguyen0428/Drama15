/**
 * Property test for the in-memory Access_Token store.
 *
 * **Property 16: Token storage tách biệt**
 *
 * **Validates: Requirements 13.6, 13.7, 13.8**
 *
 * Requirement 13.6 (verbatim):
 *   "THE Web_Client SHALL không lưu Refresh_Token trong localStorage
 *    hoặc sessionStorage."
 *
 * Requirement 13.7 (verbatim):
 *   "THE Web_Client SHALL lưu Refresh_Token duy nhất trong cookie có
 *    thuộc tính HttpOnly, Secure và SameSite=Strict."
 *
 * Requirement 13.8 (verbatim):
 *   "THE Web_Client SHALL lưu Access_Token chỉ trong bộ nhớ runtime và
 *    phải không lưu xuống storage bền vững."
 *
 * Property under test
 * --------------------
 * For every randomly generated finite sequence of operations
 *
 *     op ::= setAccessToken(token) | clearAccessToken() | getAccessToken()
 *
 * the following three invariants must hold once the sequence has been
 * replayed against a freshly reset store:
 *
 *   (a) `window.localStorage.setItem`   was NEVER invoked.
 *   (b) `window.sessionStorage.setItem` was NEVER invoked.
 *   (c) `getAccessToken()` returned at every read point exactly the
 *       token written by the most recent preceding `setAccessToken`,
 *       or `undefined` if the most recent mutation was `clearAccessToken`
 *       (or there has been no mutation yet on this run).
 *
 * Together (a) + (b) prove the store never persists tokens to web
 * storage (covers 13.6 for refresh tokens and 13.8 for access tokens),
 * and (c) proves the store actually behaves as a memory slot — values
 * are not silently dropped, swapped, or cached across operations.
 *
 * Requirement 13.7 is covered indirectly: the store has no API surface
 * for handling the Refresh_Token at all (it lives only in an HttpOnly
 * cookie that the browser attaches automatically), so any sequence of
 * store calls leaves the cookie machinery untouched. The "no setItem
 * ever" assertion is the strongest mechanical guard we can express
 * here against an accidental future regression that would tip a token
 * into web storage.
 *
 * Runs at `numRuns: 100` to match the codebase default for non-state
 * properties (see `apps/web/src/security/__tests__/csp.property.test.ts`
 * and `apps/web/src/boot/__tests__/es2022Guard.property.test.tsx`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';

import {
  __resetTokenStoreForTests,
  clearAccessToken,
  getAccessToken,
  setAccessToken,
} from '../tokenStore';

// ---------------------------------------------------------------------------
// Operation model
// ---------------------------------------------------------------------------

/**
 * A single store operation. `set` carries the token to write; `clear`
 * and `get` carry no payload. We model `get` explicitly (rather than
 * only checking the final value) so the property holds at every
 * intermediate read point, not just at the end of the sequence.
 */
type Op =
  | { readonly kind: 'set'; readonly token: string }
  | { readonly kind: 'clear' }
  | { readonly kind: 'get' };

/**
 * Token payloads include realistic JWT-shaped strings as well as edge
 * cases (empty string, whitespace, non-ASCII) so the property is
 * exercised against tokens that might tempt a buggy implementation
 * into "smart" persistence behaviour.
 */
const arbToken: fc.Arbitrary<string> = fc.oneof(
  // Realistic JWT-ish payloads: three base64-url-ish segments.
  fc
    .tuple(
      fc.stringMatching(/^[A-Za-z0-9_-]{4,16}$/),
      fc.stringMatching(/^[A-Za-z0-9_-]{4,32}$/),
      fc.stringMatching(/^[A-Za-z0-9_-]{4,32}$/),
    )
    .map(([h, p, s]) => `${h}.${p}.${s}`),
  // Edge-case strings: empty, whitespace, unicode.
  fc.constantFrom('', ' ', '\t', 'null', 'undefined', 'токен', '🔐'),
  // Plain ASCII payloads of varying length.
  fc.string({ minLength: 0, maxLength: 64 }),
);

const arbOp: fc.Arbitrary<Op> = fc.oneof(
  fc.record({
    kind: fc.constant<'set'>('set'),
    token: arbToken,
  }),
  fc.record({ kind: fc.constant<'clear'>('clear') }),
  fc.record({ kind: fc.constant<'get'>('get') }),
);

const arbOpSequence: fc.Arbitrary<readonly Op[]> = fc.array(arbOp, {
  minLength: 0,
  maxLength: 30,
});

// ---------------------------------------------------------------------------
// Storage spies
// ---------------------------------------------------------------------------

/**
 * Replace `setItem` on both browser storages with vi spies. Returns
 * the spy handles so the property body can assert call counts and
 * inspect arguments if the assertion ever fails.
 *
 * jsdom provides real `Storage` instances; we only shadow `setItem`
 * so anything else (e.g. testing-library helpers) keeps working.
 */
function spyStorageSetters(): {
  local: ReturnType<typeof vi.fn>;
  session: ReturnType<typeof vi.fn>;
} {
  const local = vi.fn();
  const session = vi.fn();
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(local);
  vi.spyOn(window.sessionStorage, 'setItem').mockImplementation(session);
  return { local, session };
}

beforeEach(() => {
  __resetTokenStoreForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('Property 16: Token storage tách biệt', () => {
  it(
    'never writes to localStorage/sessionStorage and always reflects the latest set/clear',
    () => {
      fc.assert(
        fc.property(arbOpSequence, (ops) => {
          // Reset BOTH the store and the spies so this run is fully
          // isolated from any neighbouring sample. `vi.restoreAllMocks`
          // happens in `afterEach`, but fc samples within one `it`
          // share the same hook, so we re-prep on every iteration.
          __resetTokenStoreForTests();
          vi.restoreAllMocks();
          const { local, session } = spyStorageSetters();

          // Reference oracle: what the in-memory token *should* be at
          // each point in the sequence, derived purely from the op
          // history.
          let expected: string | undefined;

          for (const op of ops) {
            switch (op.kind) {
              case 'set':
                setAccessToken(op.token);
                expected = op.token;
                break;
              case 'clear':
                clearAccessToken();
                expected = undefined;
                break;
              case 'get': {
                // (c) Memory slot must reflect the latest mutation.
                const actual = getAccessToken();
                expect(actual).toBe(expected);
                break;
              }
            }

            // (a) + (b) Spies stay at zero calls FOREVER. We assert
            // after every op so a regression that writes only on the
            // first set, or only after a clear, cannot hide.
            expect(local).not.toHaveBeenCalled();
            expect(session).not.toHaveBeenCalled();
          }

          // Final-state assertion: a closing `getAccessToken()` must
          // also agree with the oracle, even if the last op was not
          // a `get`. This catches "writes are dropped silently" bugs
          // that a `set`-only sequence would miss.
          expect(getAccessToken()).toBe(expected);
          expect(local).not.toHaveBeenCalled();
          expect(session).not.toHaveBeenCalled();
        }),
        { numRuns: 100 },
      );
    },
  );
});
