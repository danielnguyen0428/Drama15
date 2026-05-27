import { describe, it, expect } from 'vitest';
import { fc } from '@drama15/test-helpers';
import {
  DeviceConstraintService,
  DeviceServiceError,
  type DeviceDb,
  type UpsertDeviceArgs,
  type MarkDeviceRevokedArgs,
  type DeviceContext
} from '../../src/devices/index.js';
import type { DeviceRecord, PlanType } from '@drama15/contracts';

/*
 * Feature: commercial-web-saas, Property 8: Device-fingerprint constraints theo plan
 * Validates: Requirements 2.3, 2.4, 4.2, 4.3, 4.4
 *
 * For every user and every legal sequence of (`login`, `logout`,
 * `device_remove`) actions over a small, fixed population (3 users,
 * 5 fingerprints), at every step:
 *
 *   - a Free_Plan user has at most 1 active session at a time; an
 *     additional login is rejected with `device_limit_reached`
 *     (Requirement 4.2 / 4.4);
 *   - a Paid_Plan user has at most 3 active sessions at a time;
 *     additional logins are rejected with `device_limit_reached`
 *     (Requirement 4.3 / 4.4);
 *   - a fingerprint currently bound to an active Free_Plan user
 *     cannot be reused by a different Free_Plan user — the second
 *     Free login is rejected with `free_plan_device_already_used`
 *     (Requirements 2.3 / 2.4).
 *
 * Reference model:
 *   - `sessionCount: Map<userId, number>` — number of currently active
 *     refresh tokens (= active sessions) per user.
 *   - `freeBinding: Map<fingerprint, userId>` — for every fingerprint
 *     that is currently bound to an *active* Free_Plan device row,
 *     which Free user owns it. Mirrors the
 *     `findActiveFreeFingerprintOwner` server-side query.
 *
 * State transitions in the model:
 *   - login(u, f) — only mutates state on success. Free users add the
 *     fingerprint to `freeBinding`; every plan increments
 *     `sessionCount`.
 *   - logout(u, f) — decrements `sessionCount` by 1 (a logout revokes
 *     one refresh token). It does NOT clear `freeBinding`, because
 *     logout leaves the device row intact (only `markDeviceRevoked`
 *     clears it; see `PgDeviceDb.markDeviceRevoked`).
 *   - device_remove(u, f) — decrements `sessionCount` by 1 (the
 *     bundled token revocation) AND clears `freeBinding[f]` when the
 *     remover is the current Free owner.
 */

// --------------------------------------------------------------------------
// FakeDeviceDb — copied from `service.test.ts` so the property test is
// self-contained and not coupled to the sibling unit test file. We keep
// only the surface that `enforceLoginConstraints` actually exercises;
// the rest of the `DeviceDb` contract is stubbed out because the
// property only calls `enforceLoginConstraints`.
// --------------------------------------------------------------------------
class FakeDeviceDb implements DeviceDb {
  public freeOwners = new Map<string, string>();
  public activeSessions = new Map<string, number>();

  async findActiveFreeFingerprintOwner(
    fingerprint: string
  ): Promise<{ userId: string } | null> {
    const owner = this.freeOwners.get(fingerprint);
    return owner ? { userId: owner } : null;
  }

  async countActiveSessions(userId: string): Promise<number> {
    return this.activeSessions.get(userId) ?? 0;
  }

  // Unused by the property; stubbed to keep the interface satisfied.
  async upsertDevice(_args: UpsertDeviceArgs): Promise<void> {
    /* no-op */
  }
  async listDevices(_userId: string): Promise<DeviceRecord[]> {
    return [];
  }
  async markDeviceRevoked(_args: MarkDeviceRevokedArgs): Promise<boolean> {
    return false;
  }
}

// --------------------------------------------------------------------------
// Population & action arbitraries
// --------------------------------------------------------------------------
const USERS = ['u-1', 'u-2', 'u-3'] as const;
const FPS = ['fp-A', 'fp-B', 'fp-C', 'fp-D', 'fp-E'] as const;
type UserId = (typeof USERS)[number];
type Fp = (typeof FPS)[number];

const USER_INDEX = fc.integer({ min: 0, max: USERS.length - 1 });
const FP_INDEX = fc.integer({ min: 0, max: FPS.length - 1 });

type Action =
  | { kind: 'login'; userIdx: number; fpIdx: number }
  | { kind: 'logout'; userIdx: number; fpIdx: number }
  | { kind: 'device_remove'; userIdx: number; fpIdx: number };

const arbAction = (): fc.Arbitrary<Action> =>
  fc.oneof(
    fc
      .tuple(USER_INDEX, FP_INDEX)
      .map(
        ([userIdx, fpIdx]) =>
          ({ kind: 'login', userIdx, fpIdx }) as const
      ),
    fc
      .tuple(USER_INDEX, FP_INDEX)
      .map(
        ([userIdx, fpIdx]) =>
          ({ kind: 'logout', userIdx, fpIdx }) as const
      ),
    fc
      .tuple(USER_INDEX, FP_INDEX)
      .map(
        ([userIdx, fpIdx]) =>
          ({ kind: 'device_remove', userIdx, fpIdx }) as const
      )
  );

const arbPlanAssignment = (): fc.Arbitrary<PlanType[]> =>
  fc.array(fc.constantFrom<PlanType>('Free_Plan', 'Paid_Plan'), {
    minLength: USERS.length,
    maxLength: USERS.length
  });

interface Scenario {
  plans: PlanType[];
  actions: Action[];
}

const arbScenario = (): fc.Arbitrary<Scenario> =>
  fc.record({
    plans: arbPlanAssignment(),
    actions: fc.array(arbAction(), { minLength: 1, maxLength: 30 })
  });

// --------------------------------------------------------------------------
// Property
// --------------------------------------------------------------------------
describe('DeviceConstraintService — Property 8: Device-fingerprint constraints theo plan', () => {
  it(
    'enforceLoginConstraints upholds Free=1 / Paid=3 session caps and Free fingerprint exclusivity',
    async () => {
      // Validates: Requirements 2.3, 2.4, 4.2, 4.3, 4.4
      await fc.assert(
        fc.asyncProperty(arbScenario(), async ({ plans, actions }) => {
          const db = new FakeDeviceDb();
          const svc = new DeviceConstraintService({ db });

          // Reference model.
          const sessionCount = new Map<UserId, number>(
            USERS.map((u) => [u, 0])
          );
          const freeBinding = new Map<Fp, UserId>();

          for (const action of actions) {
            const userId = USERS[action.userIdx]!;
            const fp = FPS[action.fpIdx]!;
            const plan = plans[action.userIdx]!;

            // Sync the fake db to the model BEFORE asking the service
            // to evaluate. enforceLoginConstraints reads two views:
            //   1. countActiveSessions(userId)        ← sessionCount
            //   2. findActiveFreeFingerprintOwner(fp) ← freeBinding
            db.activeSessions.clear();
            for (const [u, n] of sessionCount) {
              db.activeSessions.set(u, n);
            }
            db.freeOwners.clear();
            for (const [f, u] of freeBinding) {
              db.freeOwners.set(f, u);
            }

            if (action.kind === 'login') {
              const ctx: DeviceContext = {
                userId,
                fingerprint: fp,
                ip: '198.51.100.1',
                plan
              };

              const owner = freeBinding.get(fp);
              const blockedByFree =
                plan === 'Free_Plan' &&
                owner !== undefined &&
                owner !== userId;
              const cap = plan === 'Free_Plan' ? 1 : 3;
              const sessions = sessionCount.get(userId) ?? 0;
              const blockedByCap = sessions >= cap;

              let caught: unknown;
              try {
                await svc.enforceLoginConstraints(ctx);
              } catch (e) {
                caught = e;
              }

              if (blockedByFree) {
                // free_plan_device_already_used takes priority over
                // the cap check in production order.
                expect(caught).toBeInstanceOf(DeviceServiceError);
                expect((caught as DeviceServiceError).code).toBe(
                  'free_plan_device_already_used'
                );
              } else if (blockedByCap) {
                expect(caught).toBeInstanceOf(DeviceServiceError);
                expect((caught as DeviceServiceError).code).toBe(
                  'device_limit_reached'
                );
              } else {
                expect(caught).toBeUndefined();
                // Successful login increases the active-session count
                // by exactly 1 and, for Free_Plan, binds the
                // fingerprint to this user.
                sessionCount.set(userId, sessions + 1);
                if (plan === 'Free_Plan') {
                  freeBinding.set(fp, userId);
                }
              }
            } else if (action.kind === 'logout') {
              // Logout revokes the current refresh token (one session)
              // but does NOT clear the device row, so the Free
              // fingerprint binding survives until device_remove.
              const cur = sessionCount.get(userId) ?? 0;
              if (cur > 0) sessionCount.set(userId, cur - 1);
            } else {
              // device_remove: revokes the device row AND its bundled
              // refresh token (Req 4.7). One session goes away; if the
              // remover is the current Free owner of fp, the binding
              // is cleared too.
              const cur = sessionCount.get(userId) ?? 0;
              if (cur > 0) sessionCount.set(userId, cur - 1);
              if (
                plan === 'Free_Plan' &&
                freeBinding.get(fp) === userId
              ) {
                freeBinding.delete(fp);
              }
            }

            // Step-wise invariants. These ARE the formal property
            // statement: at every step, no user exceeds their plan's
            // session cap, and at most one Free user owns any given
            // fingerprint.
            for (let i = 0; i < USERS.length; i++) {
              const u = USERS[i]!;
              const p = plans[i]!;
              const cap = p === 'Free_Plan' ? 1 : 3;
              const n = sessionCount.get(u) ?? 0;
              if (n > cap) {
                return false;
              }
            }

            // freeBinding is a Map<fp, user>, which by construction is
            // a function fp → user. We additionally assert the owner
            // is a Free_Plan user — only Free users participate in
            // the fp-exclusivity rule (Req 2.3).
            for (const [, owner] of freeBinding) {
              const ownerIdx = USERS.indexOf(owner);
              if (ownerIdx < 0) return false;
              if (plans[ownerIdx] !== 'Free_Plan') return false;
            }
          }

          return true;
        }),
        { numRuns: 100 }
      );
    }
  );
});
