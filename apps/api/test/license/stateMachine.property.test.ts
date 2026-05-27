import { describe, it, expect } from 'vitest';
import { fc } from '@drama15/test-helpers';
import {
  LicenseStateMachine,
  PAID_PLAN_DURATION_MS
} from '../../src/license/stateMachine.js';
import { LicenseError } from '../../src/license/types.js';
import { FakeLicenseDb } from './fakeLicenseDb.js';

/*
 * Feature: commercial-web-saas, Property 1: Plan state-machine luôn hợp lệ
 * Validates: Requirements 2.1, 2.2, 2.5, 2.7, 2.8, 5.10, 16.3, 16.4
 *
 * For every user and every legal sequence of (`signup`, `admin_upgrade`,
 * `admin_revoke`, `paid_expire`, `paid_renew`), at all times:
 *   - `plan ∈ {Free_Plan, Paid_Plan}` and status is `active` after each
 *     transition (Requirement 2.1, 2.2).
 *   - `Paid_Plan` rows have `paid_expire_at = paid_start_at + 30 days` exactly
 *     (Requirement 2.5, 16.3).
 *   - `paid_*` fields are null on Free_Plan rows (Requirement 2.1).
 *   - `revokePaid` downgrades to Free_Plan/active and bumps `token_epoch`
 *     by exactly 1 (Requirement 2.8, 16.4).
 *   - `expirePaid` downgrades to Free_Plan/active without touching
 *     `token_epoch` (Requirement 2.7).
 *   - `renewPaid` keeps the user on Paid_Plan/active, rotates `paidCycleId`
 *     to a fresh value, and resets paid story / paid voice quota counters
 *     to 0 (Requirement 5.10).
 *   - `assignFreeOnSignup` is idempotent: repeated calls leave `tokenEpoch`
 *     and the plan row unchanged (Requirement 2.2).
 *   - Every transition that does not satisfy its precondition rejects with
 *     `LicenseError('plan_invalid_transition')`.
 */

const SEEDED_USER_ID = '00000000-0000-4000-8000-000000000001';
const ADMIN_ID = '00000000-0000-4000-8000-0000000000aa';

type LicenseActionKind =
  | 'signup'
  | 'admin_upgrade'
  | 'admin_revoke'
  | 'paid_expire'
  | 'paid_renew';

interface ScenarioAction {
  kind: LicenseActionKind;
  /** Forward-only clock delta in ms applied before the action runs. */
  deltaMs: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Custom action generator — we deliberately do not reuse `arbAction()` from
 * `@drama15/test-helpers` here because:
 *
 *   1. Property 1 only exercises the five license transitions, so the wider
 *      `LicenseAction` union (login, refresh, quota, integrity_fail …) would
 *      filter to a tiny minority of useful samples and waste shrink budget.
 *   2. `arbAction` carries a random `at: Date` field that can move the clock
 *      backwards from one action to the next, which is unrealistic and would
 *      starve the `paid_expire` precondition. We instead generate a forward
 *      clock delta in `[0, 60d]` so the clock can both stay inside and
 *      cross the 30-day Paid window.
 */
const arbScenarioAction = (): fc.Arbitrary<ScenarioAction> =>
  fc
    .tuple(
      fc.constantFrom<LicenseActionKind>(
        'signup',
        'admin_upgrade',
        'admin_revoke',
        'paid_expire',
        'paid_renew'
      ),
      fc.integer({ min: 0, max: 60 * DAY_MS })
    )
    .map(([kind, deltaMs]) => ({ kind, deltaMs }));

interface RefState {
  plan: 'Free_Plan' | 'Paid_Plan';
  paidStartAt: number | null;
  paidExpireAt: number | null;
  paidCycleId: string | null;
  tokenEpoch: number;
}

function freshFree(): RefState {
  return {
    plan: 'Free_Plan',
    paidStartAt: null,
    paidExpireAt: null,
    paidCycleId: null,
    tokenEpoch: 0
  };
}

describe('LicenseStateMachine — Property 1: Plan state-machine luôn hợp lệ', () => {
  it(
    'plan invariants and transition pre/post-conditions hold for arbitrary action sequences',
    async () => {
      // Validates: Requirements 2.1, 2.2, 2.5, 2.7, 2.8, 5.10, 16.3, 16.4
      await fc.assert(
        fc.asyncProperty(
          fc.array(arbScenarioAction(), { minLength: 1, maxLength: 30 }),
          async (actions) => {
            // Each scenario gets its own in-memory db + machine. State
            // does not leak between fast-check shrinks.
            const db = new FakeLicenseDb();
            let nowMs = Date.UTC(2025, 0, 1, 0, 0, 0, 0);
            let cycleCounter = 0;

            const machine = new LicenseStateMachine({
              db,
              clock: () => new Date(nowMs),
              newCycleId: () => `cycle-${++cycleCounter}`
            });

            // Seed: every user starts on Free_Plan/active (Requirement 2.2).
            await machine.assignFreeOnSignup(SEEDED_USER_ID);
            let ref: RefState = freshFree();

            // Sanity-check the seeded state.
            const seeded = await db.getPlanState(SEEDED_USER_ID, null);
            expect(seeded).not.toBeNull();
            expect(seeded!.plan).toBe('Free_Plan');
            expect(seeded!.status).toBe('active');
            expect(seeded!.paidStartAt).toBeUndefined();
            expect(seeded!.paidExpireAt).toBeUndefined();
            expect(seeded!.paidCycleId).toBeUndefined();
            expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(0n);

            for (const action of actions) {
              // Forward-only clock progression.
              nowMs += action.deltaMs;

              const preTokenEpoch = db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n;
              const preBumpCount = db.bumpTokenEpochCalls;

              // Decide whether the precondition for this transition holds
              // given the reference model. We then drive the real machine
              // and assert the matching outcome.
              if (action.kind === 'signup') {
                // assignFreeOnSignup is always allowed and is fully
                // idempotent — Requirement 2.2.
                const refSnapshot = { ...ref };
                await machine.assignFreeOnSignup(SEEDED_USER_ID);
                // Idempotence: ref is unchanged, no token_epoch bump.
                expect(ref).toEqual(refSnapshot);
                expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
              } else if (action.kind === 'admin_upgrade') {
                const valid = ref.plan === 'Free_Plan';
                if (!valid) {
                  await expect(
                    machine.upgradeToPaid({
                      userId: SEEDED_USER_ID,
                      actorAdminId: ADMIN_ID
                    })
                  ).rejects.toBeInstanceOf(LicenseError);
                  await expect(
                    machine.upgradeToPaid({
                      userId: SEEDED_USER_ID,
                      actorAdminId: ADMIN_ID
                    })
                  ).rejects.toMatchObject({ code: 'plan_invalid_transition' });
                  // Failed transitions never bump token_epoch.
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                } else {
                  await machine.upgradeToPaid({
                    userId: SEEDED_USER_ID,
                    actorAdminId: ADMIN_ID
                  });
                  ref = {
                    plan: 'Paid_Plan',
                    paidStartAt: nowMs,
                    paidExpireAt: nowMs + PAID_PLAN_DURATION_MS,
                    paidCycleId: `cycle-${cycleCounter}`,
                    tokenEpoch: ref.tokenEpoch
                  };
                  // Upgrade does not bump token_epoch.
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                }
              } else if (action.kind === 'admin_revoke') {
                const valid = ref.plan === 'Paid_Plan';
                if (!valid) {
                  await expect(
                    machine.revokePaid({
                      userId: SEEDED_USER_ID,
                      actorAdminId: ADMIN_ID
                    })
                  ).rejects.toMatchObject({ code: 'plan_invalid_transition' });
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                } else {
                  await machine.revokePaid({
                    userId: SEEDED_USER_ID,
                    actorAdminId: ADMIN_ID
                  });
                  ref = {
                    plan: 'Free_Plan',
                    paidStartAt: null,
                    paidExpireAt: null,
                    paidCycleId: null,
                    tokenEpoch: ref.tokenEpoch + 1
                  };
                  // Requirement 2.8 / 16.4: token_epoch increases by exactly 1.
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(
                    preTokenEpoch + 1n
                  );
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount + 1);
                }
              } else if (action.kind === 'paid_expire') {
                const valid =
                  ref.plan === 'Paid_Plan' &&
                  ref.paidExpireAt !== null &&
                  nowMs >= ref.paidExpireAt;
                if (!valid) {
                  await expect(
                    machine.expirePaid(SEEDED_USER_ID)
                  ).rejects.toMatchObject({ code: 'plan_invalid_transition' });
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                } else {
                  await machine.expirePaid(SEEDED_USER_ID);
                  ref = {
                    plan: 'Free_Plan',
                    paidStartAt: null,
                    paidExpireAt: null,
                    paidCycleId: null,
                    tokenEpoch: ref.tokenEpoch
                  };
                  // Requirement 2.7: expirePaid does NOT bump token_epoch.
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                }
              } else {
                // paid_renew
                const valid = ref.plan === 'Paid_Plan';
                if (!valid) {
                  await expect(
                    machine.renewPaid(SEEDED_USER_ID)
                  ).rejects.toMatchObject({ code: 'plan_invalid_transition' });
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                } else {
                  const oldCycleId = ref.paidCycleId;
                  await machine.renewPaid(SEEDED_USER_ID);
                  const newStart = Math.max(nowMs, ref.paidExpireAt!);
                  ref = {
                    plan: 'Paid_Plan',
                    paidStartAt: newStart,
                    paidExpireAt: newStart + PAID_PLAN_DURATION_MS,
                    paidCycleId: `cycle-${cycleCounter}`,
                    tokenEpoch: ref.tokenEpoch
                  };
                  // Renew does not bump token_epoch.
                  expect(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n).toBe(preTokenEpoch);
                  expect(db.bumpTokenEpochCalls).toBe(preBumpCount);
                  // Requirement 5.10: cycle id rotates to a new value.
                  expect(ref.paidCycleId).not.toBe(oldCycleId);
                  // Requirement 5.10: paid quota counters reset to 0.
                  const row = db.requirePlan(SEEDED_USER_ID);
                  expect(row.paidStoryQuotaUsed).toBe(0);
                  expect(row.paidVoiceQuotaUsed).toBe(0);
                }
              }

              // ---- Universal post-action invariants ----
              const observed = await db.getPlanState(SEEDED_USER_ID, null);
              expect(observed).not.toBeNull();

              // Plan ∈ {Free_Plan, Paid_Plan} (Requirement 2.1).
              expect(['Free_Plan', 'Paid_Plan']).toContain(observed!.plan);
              // After every modelled transition, status remains 'active'
              // (Requirements 2.2, 2.7, 2.8, 5.10).
              expect(observed!.status).toBe('active');

              if (observed!.plan === 'Free_Plan') {
                // Free_Plan rows must have all paid_* fields cleared.
                expect(observed!.paidStartAt).toBeUndefined();
                expect(observed!.paidExpireAt).toBeUndefined();
                expect(observed!.paidCycleId).toBeUndefined();
              } else {
                expect(observed!.paidStartAt).toBeDefined();
                expect(observed!.paidExpireAt).toBeDefined();
                expect(observed!.paidCycleId).toBeDefined();
                // Requirement 2.5 / 16.3: window is exactly 30 days.
                const startMs = new Date(observed!.paidStartAt!).getTime();
                const expireMs = new Date(observed!.paidExpireAt!).getTime();
                expect(expireMs - startMs).toBe(PAID_PLAN_DURATION_MS);
              }

              // Cross-check observable state with the reference model.
              expect(observed!.plan).toBe(ref.plan);
              if (ref.plan === 'Paid_Plan') {
                expect(new Date(observed!.paidStartAt!).getTime()).toBe(
                  ref.paidStartAt
                );
                expect(new Date(observed!.paidExpireAt!).getTime()).toBe(
                  ref.paidExpireAt
                );
                expect(observed!.paidCycleId).toBe(ref.paidCycleId);
              }
              expect(Number(db.tokenEpoch.get(SEEDED_USER_ID) ?? 0n)).toBe(
                ref.tokenEpoch
              );
            }
          }
        ),
        { numRuns: 500 }
      );
    },
    /* timeout (ms) — 500 runs × ≤30 async steps */ 60_000
  );
});
