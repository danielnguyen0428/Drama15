/**
 * Property test for Admin_Console TOTP gating.
 *
 * Property 32 (design.md → Properties): for every admin-login attempt
 * `(email, totpCode, clockTime, secret)`, the login resolves to the
 * admin profile *iff* the email is bound to a row with `role === 'admin'`
 * AND a TOTP secret is enrolled AND the supplied code matches
 * `computeTotp(secret, counter)` for `counter ∈ {center − 1, center,
 * center + 1}` where `center = currentCounter(clockTime)`. Every other
 * input shape rejects with a `TotpLoginError`, with the failure code
 * chosen by this precedence:
 *
 *   1. row missing, OR `row.role !== 'admin'`  →  `admin_required`
 *   2. row.role === 'admin' but `row.totp === null` →  `totp_not_enrolled`
 *   3. trim(code) === '' (incl. null / undefined) →  `totp_required`
 *   4. verification fails                         →  `totp_invalid`
 *   5. otherwise                                  →  resolves to AdminUser
 *
 * Each scenario type below is a tagged union variant whose generator
 * is constructed so that the desired branch (and only that branch)
 * fires. The single fast-check property runs all six tagged variants
 * uniformly, exercising the gating policy across the full input space.
 *
 * Validates: Requirements 16.1.
 */

import { describe, it } from 'vitest';
import * as fc from 'fast-check';
import {
  AdminTotpLoginService,
  TotpLoginError,
  TotpSecretVault,
  computeTotp,
  currentCounter,
  type AdminTotpDb,
  type AdminTotpRow,
  type EncryptedSecret
} from '../../../src/admin/totp/index.js';

// 32-byte AES-256 key. The bytes are not sensitive — this is a test-only
// vault; a real key comes from `Secret_Vault` in production.
const TEST_KEY = Buffer.alloc(32, 0x42);
const PERIOD_SECONDS = 30;
const WINDOW_PERIODS = 1;

/**
 * In-memory `AdminTotpDb` mirror. Lower-cases emails on both sides so
 * the test matches the casing policy that the real `PgAdminTotpDb`
 * will land in task 18.1.
 */
class FakeAdminTotpDb implements AdminTotpDb {
  private readonly byEmail = new Map<string, AdminTotpRow>();

  seed(email: string, row: AdminTotpRow): void {
    this.byEmail.set(email.toLowerCase(), row);
  }

  async findAdminByEmail(email: string): Promise<AdminTotpRow | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }

  async setAdminTotpSecret(
    _userId: string,
    _encrypted: EncryptedSecret
  ): Promise<void> {
    throw new Error('FakeAdminTotpDb.setAdminTotpSecret: unused in property test');
  }
}

// ---------------------------------------------------------------------------
// Primitive arbitraries — kept local so the test file is self-contained
// and the generator constraints are visible to anyone reviewing the
// property.
// ---------------------------------------------------------------------------

/** 20-byte HMAC-SHA1 shared secret per RFC 6238. */
const arbSecret = (): fc.Arbitrary<Buffer> =>
  fc.uint8Array({ minLength: 20, maxLength: 20 }).map((u) => Buffer.from(u));

/** Lowercase ASCII email of the form `local@domain.tld`. */
const arbEmail = (): fc.Arbitrary<string> =>
  fc
    .tuple(
      fc.stringMatching(/^[a-z0-9]{1,12}$/),
      fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/),
      fc.constantFrom('com', 'net', 'org', 'io')
    )
    .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/** Two emails guaranteed to differ after case-folding. */
const arbTwoDistinctEmails = (): fc.Arbitrary<readonly [string, string]> =>
  fc
    .tuple(arbEmail(), arbEmail())
    .filter(([a, b]) => a.toLowerCase() !== b.toLowerCase());

/**
 * UTC clock pinned in 2024–2030 so `currentCounter(now)` is deterministic
 * and well below `Number.MAX_SAFE_INTEGER` after multiplication by 1000.
 */
const arbNow = (): fc.Arbitrary<Date> =>
  fc
    .integer({ min: 1_704_067_200, max: 1_893_456_000 })
    .map((s) => new Date(s * 1000));

const arbUuid = (): fc.Arbitrary<string> => fc.uuid();

/**
 * Roles that are NOT `admin`. The login service collapses every value
 * here into `admin_required` so the API does not leak which emails
 * belong to admins.
 */
const arbNonAdminRole = (): fc.Arbitrary<string> =>
  fc.constantFrom('user', 'staff', 'guest', 'editor', 'owner', '');

/**
 * Codes whose `trim()` length is zero. The login service maps any
 * such input to `totp_required` regardless of the row state.
 */
const arbBlankCode = (): fc.Arbitrary<string | null | undefined> =>
  fc.oneof(
    fc.constant(null) as fc.Arbitrary<string | null | undefined>,
    fc.constant(undefined) as fc.Arbitrary<string | null | undefined>,
    fc.constant(''),
    fc.string({
      unit: fc.constantFrom(' ', '\t', '\n', '\r'),
      minLength: 1,
      maxLength: 6
    })
  );

/** A six-digit string padded with leading zeros (i.e., `'000000'..'999999'`). */
const arb6DigitString = (): fc.Arbitrary<string> =>
  fc.integer({ min: 0, max: 999_999 }).map((n) => String(n).padStart(6, '0'));

// ---------------------------------------------------------------------------
// Tagged scenarios. One scenario type per branch of the gating policy;
// each generator is built so that the corresponding branch is the only
// one that can fire.
// ---------------------------------------------------------------------------

type Scenario =
  | {
      tag: 'admin_required_no_row';
      now: Date;
      lookupEmail: string;
      // If non-null, seed an admin row at this *different* email so the
      // lookup misses. If null, seed nothing at all.
      seedEmail: string | null;
      code: string | null | undefined;
    }
  | {
      tag: 'admin_required_wrong_role';
      now: Date;
      lookupEmail: string;
      role: string;
      hasSecret: boolean;
      userId: string;
      secret: Buffer;
      code: string | null | undefined;
    }
  | {
      tag: 'totp_not_enrolled';
      now: Date;
      lookupEmail: string;
      userId: string;
      code: string | null | undefined;
    }
  | {
      tag: 'totp_required';
      now: Date;
      lookupEmail: string;
      userId: string;
      secret: Buffer;
      code: string | null | undefined;
    }
  | {
      tag: 'totp_invalid';
      now: Date;
      lookupEmail: string;
      userId: string;
      secret: Buffer;
      wrongCode: string;
    }
  | {
      tag: 'success';
      now: Date;
      lookupEmail: string;
      userId: string;
      secret: Buffer;
      offsetPeriods: -1 | 0 | 1;
    };

const arbAdminRequiredNoRow = (): fc.Arbitrary<Scenario> =>
  fc
    .record({
      now: arbNow(),
      // Either (lookup, null) → no seed at all, or (lookup, otherEmail) →
      // seed an admin row at a DIFFERENT email so the lookup misses.
      emails: fc.oneof(
        arbEmail().map(
          (e) => [e, null] as readonly [string, string | null]
        ) as fc.Arbitrary<readonly [string, string | null]>,
        arbTwoDistinctEmails() as fc.Arbitrary<readonly [string, string | null]>
      ),
      // Code shape is irrelevant for `admin_required` — exercise both.
      code: fc.oneof(arb6DigitString(), arbBlankCode())
    })
    .map(({ now, emails, code }) => ({
      tag: 'admin_required_no_row' as const,
      now,
      lookupEmail: emails[0],
      seedEmail: emails[1],
      code
    }));

const arbAdminRequiredWrongRole = (): fc.Arbitrary<Scenario> =>
  fc
    .record({
      now: arbNow(),
      lookupEmail: arbEmail(),
      role: arbNonAdminRole(),
      hasSecret: fc.boolean(),
      userId: arbUuid(),
      secret: arbSecret(),
      code: fc.oneof(arb6DigitString(), arbBlankCode())
    })
    .map((r) => ({ tag: 'admin_required_wrong_role' as const, ...r }));

const arbTotpNotEnrolled = (): fc.Arbitrary<Scenario> =>
  fc
    .record({
      now: arbNow(),
      lookupEmail: arbEmail(),
      userId: arbUuid(),
      code: fc.oneof(arb6DigitString(), arbBlankCode())
    })
    .map((r) => ({ tag: 'totp_not_enrolled' as const, ...r }));

const arbTotpRequired = (): fc.Arbitrary<Scenario> =>
  fc
    .record({
      now: arbNow(),
      lookupEmail: arbEmail(),
      userId: arbUuid(),
      secret: arbSecret(),
      code: arbBlankCode()
    })
    .map((r) => ({ tag: 'totp_required' as const, ...r }));

/**
 * `totp_invalid` requires a 6-digit candidate that does NOT match any
 * of the three valid codes around the current counter. Without the
 * filter, ~3 in 10^6 samples would accidentally land on a valid code
 * and falsify the `totp_invalid` branch.
 */
const arbTotpInvalid = (): fc.Arbitrary<Scenario> =>
  fc
    .record({
      now: arbNow(),
      lookupEmail: arbEmail(),
      userId: arbUuid(),
      secret: arbSecret(),
      candidate: arb6DigitString()
    })
    .filter(({ secret, now, candidate }) => {
      const center = currentCounter(now, PERIOD_SECONDS);
      for (let off = -WINDOW_PERIODS; off <= WINDOW_PERIODS; off += 1) {
        const counter = center + BigInt(off);
        if (counter < 0n) continue;
        const valid = computeTotp({ secret, counter });
        if (valid === candidate) return false;
      }
      return true;
    })
    .map(({ now, lookupEmail, userId, secret, candidate }) => ({
      tag: 'totp_invalid' as const,
      now,
      lookupEmail,
      userId,
      secret,
      wrongCode: candidate
    }));

const arbSuccess = (): fc.Arbitrary<Scenario> =>
  fc
    .record({
      now: arbNow(),
      lookupEmail: arbEmail(),
      userId: arbUuid(),
      secret: arbSecret(),
      // ±1 period straddles the entire accepted window; offset 0 covers
      // the current period, ±1 covers the drift-tolerance edges.
      offsetPeriods: fc.constantFrom<-1 | 0 | 1>(-1, 0, 1)
    })
    .map((r) => ({ tag: 'success' as const, ...r }));

const arbScenario = (): fc.Arbitrary<Scenario> =>
  fc.oneof(
    arbAdminRequiredNoRow(),
    arbAdminRequiredWrongRole(),
    arbTotpNotEnrolled(),
    arbTotpRequired(),
    arbTotpInvalid(),
    arbSuccess()
  );

// ---------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------

describe('AdminTotpLoginService.verifyAdminLogin (property)', () => {
  /**
   * **Validates: Requirements 16.1**
   *
   * Property 32 — Admin TOTP gating.
   */
  it('Property 32: admin login resolves iff row is admin + enrolled AND code matches current ±1 period; otherwise rejects with the precedence-ordered TotpLoginError', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario(), async (scenario) => {
        // Fresh service per iteration so seeded state never leaks between
        // runs — fast-check uses pseudo-random scenarios, but the harness
        // must remain stateless to make any counterexample reproducible.
        const db = new FakeAdminTotpDb();
        const vault = new TotpSecretVault({ encryptionKey: TEST_KEY });
        const service = new AdminTotpLoginService({
          db,
          vault,
          clock: () => scenario.now,
          period: PERIOD_SECONDS,
          window: WINDOW_PERIODS
        });

        // Seed the database to match the scenario tag.
        switch (scenario.tag) {
          case 'admin_required_no_row': {
            if (scenario.seedEmail !== null) {
              const otherSecret = vault.encryptSecret(Buffer.alloc(20, 0x55));
              db.seed(scenario.seedEmail, {
                userId: 'u-other-admin',
                role: 'admin',
                totp: otherSecret
              });
            }
            break;
          }
          case 'admin_required_wrong_role': {
            const totp = scenario.hasSecret
              ? vault.encryptSecret(scenario.secret)
              : null;
            db.seed(scenario.lookupEmail, {
              userId: scenario.userId,
              role: scenario.role,
              totp
            });
            break;
          }
          case 'totp_not_enrolled': {
            db.seed(scenario.lookupEmail, {
              userId: scenario.userId,
              role: 'admin',
              totp: null
            });
            break;
          }
          case 'totp_required':
          case 'totp_invalid':
          case 'success': {
            db.seed(scenario.lookupEmail, {
              userId: scenario.userId,
              role: 'admin',
              totp: vault.encryptSecret(scenario.secret)
            });
            break;
          }
        }

        // Success branch — generate a valid code at the chosen offset
        // within ±window and assert the resolved AdminUser shape.
        if (scenario.tag === 'success') {
          const counter =
            currentCounter(scenario.now, PERIOD_SECONDS) +
            BigInt(scenario.offsetPeriods);
          const code = computeTotp({ secret: scenario.secret, counter });
          const result = await service.verifyAdminLogin({
            email: scenario.lookupEmail,
            totpCode: code
          });
          return (
            result.userId === scenario.userId &&
            result.email === scenario.lookupEmail &&
            result.role === 'admin' &&
            result.totpEnrolled === true
          );
        }

        // Failure branches — pick the input the scenario calls for and
        // assert the precedence-ordered error code.
        let codeToSend: string | null | undefined;
        let expectedCode:
          | 'admin_required'
          | 'totp_not_enrolled'
          | 'totp_required'
          | 'totp_invalid';
        switch (scenario.tag) {
          case 'admin_required_no_row':
          case 'admin_required_wrong_role':
            codeToSend = scenario.code;
            expectedCode = 'admin_required';
            break;
          case 'totp_not_enrolled':
            codeToSend = scenario.code;
            expectedCode = 'totp_not_enrolled';
            break;
          case 'totp_required':
            codeToSend = scenario.code;
            expectedCode = 'totp_required';
            break;
          case 'totp_invalid':
            codeToSend = scenario.wrongCode;
            expectedCode = 'totp_invalid';
            break;
        }

        try {
          await service.verifyAdminLogin({
            email: scenario.lookupEmail,
            totpCode: codeToSend
          });
          return false; // should have thrown
        } catch (err) {
          return err instanceof TotpLoginError && err.code === expectedCode;
        }
      }),
      { numRuns: 100 }
    );
  });
});
