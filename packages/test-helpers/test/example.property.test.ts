import { describe, it } from 'vitest';
import { arbPlanState, runProperty } from '../src/_helpers.js';

const PAID_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Smoke test for the shared property harness.
 *
 * Validates: design.md Plan invariant — a Paid_Plan with `status === 'active'`
 * always has `paidExpireAt - paidStartAt === 30 days` (Requirement 2.5).
 *
 * Beyond exercising the invariant itself, this test confirms that:
 *   1. `arbPlanState` returns shapes that satisfy `PlanState` from
 *      `@drama15/contracts`,
 *   2. The `runProperty` helper wires up `fc.assert` correctly, and
 *   3. The `property` vitest project is picking up `*.property.test.ts`.
 */
describe('arbPlanState', () => {
  it('Paid_Plan + active ⇒ paidExpireAt - paidStartAt === 30 days', () => {
    runProperty(arbPlanState(), (state) => {
      if (state.plan === 'Paid_Plan' && state.status === 'active') {
        if (state.paidStartAt === undefined || state.paidExpireAt === undefined) {
          return false;
        }
        const start = Date.parse(state.paidStartAt);
        const expire = Date.parse(state.paidExpireAt);
        return expire - start === PAID_CYCLE_MS;
      }
      return true;
    });
  });
});
