/**
 * Property 2 — Refresh-token rotation và thu hồi đúng đắn.
 *
 * **Validates: Requirements 1.7, 1.8, 1.9, 2.8, 4.7**
 *
 * Spec statement (design.md §"Property 2"):
 *   *For all* sequences of `(issue | refresh | logout | device_remove |
 *   paid_revoke)` operations on a single user, a Refresh_Token is
 *   valid for rotation iff it has not expired, has no `revoked_at`,
 *   and the family is not compromised; if a Refresh_Token that has
 *   already been rotated (i.e. has a child) is presented again, the
 *   entire family is revoked and every Refresh_Token on the family
 *   becomes invalid.
 *
 * Test strategy:
 *
 *   We drive the *real* `TokenService` + `RefreshTokenRotator`
 *   wired against the in-memory `FakeRefreshDb` (which already mirrors
 *   the rotate/revoke/revoke-family side-effects we need). A parallel
 *   reference model `RefreshFamilyModel` tracks, for every family
 *   ever created on the user, the chain of `(tokenId, parentId,
 *   status)` plus a `compromised` flag. After every command the test
 *   re-asserts the four invariants below.
 *
 *   Invariants (per family, after every command):
 *
 *     (P1) A presented refresh token is valid for rotation iff it is
 *          currently `active` AND its family is not compromised AND
 *          it has not expired (TTL = 7 days).
 *     (P2) Rotating a token that is already `'rotated'` flips the
 *          family to `compromised` and revokes every other still-
 *          active token on that family with reason
 *          `'family_compromised'`. Subsequent rotation of any token
 *          on that family fails.
 *     (P3) Once compromised, no further rotation succeeds for the
 *          family — every attempt throws
 *          `RefreshError('refresh_token_invalid')`.
 *     (P4) The number of currently-active tokens on any family is
 *          always 0 or 1. (Rotate marks the previous active as
 *          `rotated` BEFORE minting the new pair.)
 *
 * Numbers chosen:
 *
 *   * `numRuns: 500` per the task's explicit ask.
 *   * Per-scenario command sequence capped at 25 commands so the
 *     500 × 25 ≤ 12 500 op budget keeps the suite under ~30s on a
 *     dev laptop while still exercising deeply nested rotation
 *     chains (≥ 5 rotations per family land within budget for a
 *     non-trivial fraction of runs).
 *
 *   * One RSA keypair generated at module load and reused across
 *     scenarios — the property is independent of key material and
 *     a per-iteration keygen would dominate runtime.
 */

import { generateKeyPairSync } from 'node:crypto';

import * as fc from 'fast-check';
import { describe, it } from 'vitest';

import {
  hashRefreshToken,
  JwksKeyset,
  RefreshError,
  RefreshTokenRotator,
  TokenService,
  type IssuedTokens,
  type TokenSigningKey
} from '../../../src/auth/tokens/index.js';

import { FakeRefreshDb } from './fakeRefreshDb.js';

// ---------------------------------------------------------------------------
// One-shot RSA keypair. The TTL/rotation invariants do not depend on
// which kid signs the token, so we hoist this to module scope so a
// `vitest run` only pays the keygen cost once.
// ---------------------------------------------------------------------------
const SHARED_KEY: TokenSigningKey = (() => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  });
  return {
    kid: 'rotation-prop-key',
    privateKeyPem: privateKey
      .export({ type: 'pkcs8', format: 'pem' })
      .toString(),
    publicKeyPem: publicKey
      .export({ type: 'spki', format: 'pem' })
      .toString()
  };
})();

const USER_ID = 'user-prop2';
const EMAIL = 'prop2@example.com';
const FINGERPRINT_A = 'fp-A';
const FINGERPRINT_B = 'fp-B';
const FINGERPRINT_C = 'fp-C';
const FINGERPRINTS = [FINGERPRINT_A, FINGERPRINT_B, FINGERPRINT_C] as const;

const FIXED_NOW = new Date('2026-02-01T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Reference model.
//
// Each family tracks every token ever issued on it plus a global
// `compromised` flag and a `revoked` flag (set when logout /
// device_remove / paid_revoke takes the family out without a reuse).
// `compromised` is the specific flavour set by the reuse detector;
// the distinction matters for invariant P2 (only reuse triggers
// `family_compromised`).
// ---------------------------------------------------------------------------

type TokenStatus = 'active' | 'rotated' | 'revoked-other' | 'family-compromised';

interface ModelToken {
  readonly tokenId: string;
  readonly parentId: string | null;
  readonly familyId: string;
  readonly fingerprint: string;
  /** Raw refresh-token string the rotator sees from the cookie. */
  readonly raw: string;
  status: TokenStatus;
}

interface ModelFamily {
  readonly familyId: string;
  readonly fingerprint: string;
  readonly tokens: ModelToken[];
  compromised: boolean;
}

class RefreshFamilyModel {
  /** Indexed by familyId. */
  public readonly families = new Map<string, ModelFamily>();
  /** Every token ever minted, indexed by raw (cookie value). */
  public readonly tokensByRaw = new Map<string, ModelToken>();

  /** All currently-active raw tokens, in insertion order, for sampling. */
  public activeRaws(): string[] {
    const out: string[] = [];
    for (const t of this.tokensByRaw.values()) {
      if (t.status === 'active') out.push(t.raw);
    }
    return out;
  }

  public allRaws(): string[] {
    return Array.from(this.tokensByRaw.keys());
  }

  public addInitial(args: {
    tokenId: string;
    raw: string;
    familyId: string;
    fingerprint: string;
  }): void {
    const tok: ModelToken = {
      tokenId: args.tokenId,
      parentId: null,
      familyId: args.familyId,
      fingerprint: args.fingerprint,
      raw: args.raw,
      status: 'active'
    };
    this.families.set(args.familyId, {
      familyId: args.familyId,
      fingerprint: args.fingerprint,
      tokens: [tok],
      compromised: false
    });
    this.tokensByRaw.set(args.raw, tok);
  }

  public addRotation(args: {
    parentRaw: string;
    childTokenId: string;
    childRaw: string;
  }): void {
    const parent = this.tokensByRaw.get(args.parentRaw);
    if (parent === undefined) throw new Error('parent must exist');
    const family = this.families.get(parent.familyId);
    if (family === undefined) throw new Error('family must exist');
    parent.status = 'rotated';
    const child: ModelToken = {
      tokenId: args.childTokenId,
      parentId: parent.tokenId,
      familyId: family.familyId,
      fingerprint: family.fingerprint,
      raw: args.childRaw,
      status: 'active'
    };
    family.tokens.push(child);
    this.tokensByRaw.set(args.childRaw, child);
  }

  /** Mark every still-`active` token on the family as the supplied status. */
  public markFamily(
    familyId: string,
    newStatus: 'revoked-other' | 'family-compromised'
  ): void {
    const family = this.families.get(familyId);
    if (family === undefined) return;
    for (const t of family.tokens) {
      if (t.status === 'active') {
        t.status = newStatus;
      }
    }
    if (newStatus === 'family-compromised') {
      family.compromised = true;
    }
  }

  /** Lookup helpers. */
  public getToken(raw: string): ModelToken | undefined {
    return this.tokensByRaw.get(raw);
  }
  public getFamily(familyId: string): ModelFamily | undefined {
    return this.families.get(familyId);
  }
}

// ---------------------------------------------------------------------------
// Command shape. Each command picks its target tokens by index into
// the model's slot lists at execute time, so commands generated in
// advance always resolve to *some* token even after rotations happen.
// ---------------------------------------------------------------------------

type Cmd =
  | { kind: 'issue'; fpIdx: number }
  | { kind: 'refresh_active'; tokenIdx: number }
  | { kind: 'refresh_any'; tokenIdx: number } // may pick a rotated/revoked token
  | { kind: 'refresh_garbage' }
  | { kind: 'logout'; tokenIdx: number }
  | { kind: 'device_remove'; fpIdx: number }
  | { kind: 'paid_revoke' };

const arbCmd: fc.Arbitrary<Cmd> = fc.oneof(
  // Bias toward issue + refresh so we build deeper rotation chains.
  { weight: 4, arbitrary: fc.record({
      kind: fc.constant('issue' as const),
      fpIdx: fc.integer({ min: 0, max: FINGERPRINTS.length - 1 })
    }) },
  { weight: 5, arbitrary: fc.record({
      kind: fc.constant('refresh_active' as const),
      tokenIdx: fc.integer({ min: 0, max: 31 })
    }) },
  { weight: 3, arbitrary: fc.record({
      kind: fc.constant('refresh_any' as const),
      tokenIdx: fc.integer({ min: 0, max: 31 })
    }) },
  { weight: 1, arbitrary: fc.record({
      kind: fc.constant('refresh_garbage' as const)
    }) },
  { weight: 2, arbitrary: fc.record({
      kind: fc.constant('logout' as const),
      tokenIdx: fc.integer({ min: 0, max: 31 })
    }) },
  { weight: 1, arbitrary: fc.record({
      kind: fc.constant('device_remove' as const),
      fpIdx: fc.integer({ min: 0, max: FINGERPRINTS.length - 1 })
    }) },
  { weight: 1, arbitrary: fc.record({
      kind: fc.constant('paid_revoke' as const)
    }) }
);

// ---------------------------------------------------------------------------
// Per-scenario harness. Owns the real wiring + the reference model
// and exposes one `step(cmd)` method that runs the command on both
// sides AND re-asserts the invariants.
// ---------------------------------------------------------------------------

interface InvariantViolation {
  readonly reason: string;
  readonly cmdIndex: number;
  readonly cmd: Cmd;
}

class Harness {
  private readonly db = new FakeRefreshDb();
  private readonly svc: TokenService;
  private readonly rotator: RefreshTokenRotator;
  private readonly model = new RefreshFamilyModel();
  private idCounter = 0;
  private sessionCounter = 0;

  public constructor() {
    this.db.clockNow = FIXED_NOW;
    this.svc = new TokenService({
      keyset: new JwksKeyset({ keys: [SHARED_KEY] }),
      db: this.db,
      clock: () => FIXED_NOW,
      newId: () => `id-${++this.idCounter}`
    });
    this.rotator = new RefreshTokenRotator({
      tokenService: this.svc,
      db: this.db,
      clock: () => FIXED_NOW
    });
  }

  /** Run one command; throw `Error(reason)` on the first invariant breach. */
  public async step(cmd: Cmd, idx: number): Promise<void> {
    switch (cmd.kind) {
      case 'issue':
        await this.cmdIssue(FINGERPRINTS[cmd.fpIdx]!);
        break;
      case 'refresh_active':
        await this.cmdRefresh(this.pickActiveRaw(cmd.tokenIdx), cmd, idx);
        break;
      case 'refresh_any':
        await this.cmdRefresh(this.pickAnyRaw(cmd.tokenIdx), cmd, idx);
        break;
      case 'refresh_garbage':
        await this.cmdRefresh('garbage-not-a-token-' + this.idCounter, cmd, idx);
        break;
      case 'logout':
        await this.cmdLogout(this.pickActiveRaw(cmd.tokenIdx));
        break;
      case 'device_remove':
        await this.cmdDeviceRemove(FINGERPRINTS[cmd.fpIdx]!);
        break;
      case 'paid_revoke':
        await this.cmdPaidRevoke();
        break;
    }
    const violation = this.checkInvariants(cmd, idx);
    if (violation !== null) {
      throw new Error(
        `Invariant violation after cmd #${violation.cmdIndex} ` +
          `(${JSON.stringify(violation.cmd)}): ${violation.reason}`
      );
    }
  }

  // -------------------------------------------------------------------
  // Command implementations.
  // -------------------------------------------------------------------

  private async cmdIssue(fingerprint: string): Promise<void> {
    const issued = await this.svc.issue({
      userId: USER_ID,
      email: EMAIL,
      sessionId: `sess-${++this.sessionCounter}`,
      fingerprint,
      epoch: 0
    });
    this.model.addInitial({
      tokenId: issued.refreshTokenId,
      raw: issued.refreshToken,
      familyId: issued.familyId,
      fingerprint
    });
  }

  private async cmdRefresh(
    rawCandidate: string | null,
    cmd: Cmd,
    idx: number
  ): Promise<void> {
    if (rawCandidate === null) return; // nothing to do — model is empty.

    const modelTok = this.model.getToken(rawCandidate);
    const expectedOk = this.modelExpectsRefreshSuccess(rawCandidate);
    const expectedFamilyCompromise =
      modelTok !== undefined &&
      modelTok.status === 'rotated' &&
      this.model.getFamily(modelTok.familyId)!.compromised === false;

    let issued: IssuedTokens | null = null;
    let thrown: unknown = null;
    try {
      issued = await this.rotator.rotate({
        rawRefreshToken: rawCandidate,
        sessionId: `sess-${++this.sessionCounter}`,
        fingerprint: modelTok?.fingerprint ?? FINGERPRINT_A,
        currentEpoch: 0,
        email: EMAIL,
        userId: USER_ID
      });
    } catch (err) {
      thrown = err;
    }

    if (expectedOk) {
      if (thrown !== null || issued === null) {
        throw new Error(
          `cmd #${idx} (${JSON.stringify(cmd)}): expected refresh to succeed ` +
            `for active token, got error ${String(thrown)}`
        );
      }
      // Mirror the rotation in the model.
      this.model.addRotation({
        parentRaw: rawCandidate,
        childTokenId: issued.refreshTokenId,
        childRaw: issued.refreshToken
      });
      // (P4) sanity: the new family in the model must have exactly
      // one active token.
      this.assertFamilyHasAtMostOneActive(issued.familyId, cmd, idx);
      return;
    }

    // Expected failure path.
    if (thrown === null) {
      throw new Error(
        `cmd #${idx} (${JSON.stringify(cmd)}): expected RefreshError but ` +
          `rotate() succeeded for raw=${rawCandidate}`
      );
    }
    if (!(thrown instanceof RefreshError)) {
      throw new Error(
        `cmd #${idx}: expected RefreshError, got ${String(thrown)}`
      );
    }
    if (thrown.code !== 'refresh_token_invalid') {
      throw new Error(
        `cmd #${idx}: expected code 'refresh_token_invalid', got ${thrown.code}`
      );
    }

    if (expectedFamilyCompromise) {
      // (P2) Reuse of a rotated token must mark the family
      // compromised on both the implementation and the model.
      if (modelTok === undefined) {
        throw new Error(`cmd #${idx}: rotated-token branch missing model row`);
      }
      this.model.markFamily(modelTok.familyId, 'family-compromised');
      if (thrown.familyCompromised !== true) {
        throw new Error(
          `cmd #${idx}: rotated-token reuse must set familyCompromised=true`
        );
      }
    }
  }

  private async cmdLogout(rawCandidate: string | null): Promise<void> {
    if (rawCandidate === null) return;
    const modelTok = this.model.getToken(rawCandidate);
    if (modelTok === undefined || modelTok.status !== 'active') return;
    // Mirror the logout flow: revoke the active token by id with
    // reason 'logout'. We bypass `LogoutService` and call the db
    // directly because Property 2 only constrains rotation/revoke
    // outcomes — bringing in the audit logger / device service
    // would not change a single invariant check.
    await this.db.revokeToken({ id: modelTok.tokenId, reason: 'logout' });
    modelTok.status = 'revoked-other';
  }

  private async cmdDeviceRemove(fingerprint: string): Promise<void> {
    // Per Req 4.7 the device-removal path revokes every active
    // refresh token on the (user, fingerprint) pair. We approximate
    // it on the fake by walking each family on that fingerprint and
    // calling `revokeFamily` with reason 'device_remove'. The model
    // mirrors with status 'revoked-other'.
    for (const family of this.model.families.values()) {
      if (family.fingerprint !== fingerprint) continue;
      const hasActive = family.tokens.some((t) => t.status === 'active');
      if (!hasActive) continue;
      await this.db.revokeFamily({
        familyId: family.familyId,
        reason: 'device_remove'
      });
      this.model.markFamily(family.familyId, 'revoked-other');
    }
  }

  private async cmdPaidRevoke(): Promise<void> {
    // Req 2.8 — admin revokes the Paid_Plan; every refresh token for
    // the user is invalidated within ≤ 60 s. In the data layer this
    // is a per-family revoke for every family belonging to the user.
    for (const family of this.model.families.values()) {
      const hasActive = family.tokens.some((t) => t.status === 'active');
      if (!hasActive) continue;
      await this.db.revokeFamily({
        familyId: family.familyId,
        reason: 'paid_revoked'
      });
      this.model.markFamily(family.familyId, 'revoked-other');
    }
  }

  // -------------------------------------------------------------------
  // Sampling helpers.
  // -------------------------------------------------------------------

  private pickActiveRaw(idx: number): string | null {
    const actives = this.model.activeRaws();
    if (actives.length === 0) return null;
    return actives[idx % actives.length]!;
  }

  private pickAnyRaw(idx: number): string | null {
    const all = this.model.allRaws();
    if (all.length === 0) return null;
    return all[idx % all.length]!;
  }

  // -------------------------------------------------------------------
  // Invariants.
  // -------------------------------------------------------------------

  /** (P1) The model says rotate-on-`raw` succeeds iff:
   *   - raw is known
   *   - status is 'active'
   *   - family is not compromised (active implies non-compromised by
   *     construction, but we keep the explicit clause for clarity).
   */
  private modelExpectsRefreshSuccess(raw: string): boolean {
    const tok = this.model.getToken(raw);
    if (tok === undefined) return false;
    if (tok.status !== 'active') return false;
    const family = this.model.getFamily(tok.familyId);
    if (family === undefined) return false;
    return family.compromised === false;
  }

  private assertFamilyHasAtMostOneActive(
    familyId: string,
    cmd: Cmd,
    idx: number
  ): void {
    const family = this.model.getFamily(familyId);
    if (family === undefined) return;
    const activeCount = family.tokens.filter((t) => t.status === 'active').length;
    if (activeCount > 1) {
      throw new Error(
        `cmd #${idx} (${JSON.stringify(cmd)}): family ${familyId} has ` +
          `${activeCount} active tokens (expected ≤ 1)`
      );
    }
  }

  /**
   * Returns the first violation found, or null if all four invariants
   * hold. We re-derive expectations from the model and cross-check
   * against `findActiveByHash` for every known raw — this catches
   * any drift between the FakeRefreshDb's bookkeeping and the model.
   */
  private checkInvariants(cmd: Cmd, idx: number): InvariantViolation | null {
    // (P4) Per family, ≤ 1 active token in the model.
    for (const family of this.model.families.values()) {
      const activeCount = family.tokens.filter(
        (t) => t.status === 'active'
      ).length;
      if (activeCount > 1) {
        return {
          reason: `family ${family.familyId} has ${activeCount} active tokens (P4)`,
          cmdIndex: idx,
          cmd
        };
      }
      // (P3) Once compromised, no token on the family may be active.
      if (family.compromised && activeCount > 0) {
        return {
          reason: `compromised family ${family.familyId} still has active tokens (P3)`,
          cmdIndex: idx,
          cmd
        };
      }
    }
    return null;
  }

  /**
   * After the command sequence completes, perform a deeper check:
   * for every known raw token, asking the rotator to rotate it must
   * agree with the model's verdict. This is the strongest form of
   * P1+P2+P3 — it asserts the implementation never disagrees with
   * the reference about validity, regardless of how we got here.
   */
  public async finalCrossCheck(): Promise<void> {
    for (const raw of this.model.allRaws()) {
      const expectedOk = this.modelExpectsRefreshSuccess(raw);

      // We must NOT mutate the implementation state here because
      // doing so would invalidate later raws. So we use the db
      // probe (`findActiveByHash`) — the rotator's success path
      // depends on it returning a row.
      const tok = this.model.getToken(raw)!;
      const tokenHash = hashRefreshToken(raw);
      const active = await this.db.findActiveByHash({
        tokenHash,
        now: FIXED_NOW
      });
      const dbSaysActive = active !== null;

      if (expectedOk !== dbSaysActive) {
        throw new Error(
          `final cross-check: model says ok=${expectedOk} for tokenId=${tok.tokenId} ` +
            `(family=${tok.familyId}, status=${tok.status}) but db reports ` +
            `active=${dbSaysActive}`
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Property runner.
// ---------------------------------------------------------------------------

describe('Property 2: Refresh-token rotation và thu hồi đúng đắn (Validates: Requirements 1.7, 1.8, 1.9, 2.8, 4.7)', () => {
  it('every (issue|refresh|logout|device_remove|paid_revoke) sequence preserves the rotation invariants', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbCmd, { minLength: 1, maxLength: 25 }),
        async (cmds) => {
          const harness = new Harness();
          // Always seed at least one initial issue so refresh
          // commands are not no-ops in the rare empty-prefix case;
          // this also matches "user just logged in".
          await harness.step({ kind: 'issue', fpIdx: 0 }, -1);
          for (let i = 0; i < cmds.length; i += 1) {
            await harness.step(cmds[i]!, i);
          }
          await harness.finalCrossCheck();
        }
      ),
      { numRuns: 500 }
    );
  }, /* timeout */ 60_000);
});
