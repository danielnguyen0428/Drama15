# @drama15/test-helpers

Shared [fast-check](https://github.com/dubzzz/fast-check) generators and
[vitest](https://vitest.dev) project configuration for the Drama15 commercial
web SaaS workspace.

This package exists so every property test in `apps/api`, `apps/web`, and
`apps/admin` can pull from the same generators and split into matching
`unit` / `property` vitest projects without duplicating boilerplate.

## What's inside

`src/_helpers.ts` exports:

- Primitive arbitraries: `arbEmail`, `arbDeviceFingerprint`, `arbClock`,
  `arbUuid`, `arbCountry`, `arbIp`.
- Domain arbitraries: `arbUser`, `arbPlanState`, `arbAction`,
  `arbHttpRequest`, `arbUpstreamResponse`, `arbIDToken`,
  `arbAccessTokenClaims`.
- The `LicenseAction` discriminated union used by License_Service state-machine
  property tests.
- `runProperty(arb, predicate, opts?)` — a thin wrapper around
  `fc.assert(fc.property(...))` that defaults to `numRuns: 100` and accepts
  `{ numRuns: 500 }` for rotation / quota state-machine tests.
- The re-exported `fc` namespace for cases where a test wants to compose
  generators directly.

`src/vitestProjectsConfig.ts` exports `vitestProjects`, an array describing
two vitest projects:

| project    | include                                | excludes                              |
| ---------- | -------------------------------------- | ------------------------------------- |
| `unit`     | `**/*.test.ts`, `**/*.test.tsx`        | `**/*.property.test.ts`               |
| `property` | `**/*.property.test.ts`                | —                                     |

## Wiring it into a downstream package

```ts
// apps/api/vitest.config.ts
import { defineConfig } from 'vitest/config';
import { vitestProjects } from '@drama15/test-helpers';

export default defineConfig({
  test: {
    projects: vitestProjects.map((p) => ({ test: { ...p.test } }))
  }
});
```

Then write property tests with the `*.property.test.ts` suffix:

```ts
// apps/api/test/license.property.test.ts
import { describe, it } from 'vitest';
import { arbPlanState, runProperty } from '@drama15/test-helpers';

describe('Plan invariants', () => {
  it('Paid_Plan ⇒ paidExpireAt = paidStartAt + 30 days', () => {
    runProperty(arbPlanState(), (state) => {
      // ...
    });
  });
});
```

Run them with:

```bash
npm run test                       # both projects
npm run test -- --project property # only property tests
npm run test -- --project unit     # only unit tests
```

## Scripts

| script              | what it does                              |
| ------------------- | ----------------------------------------- |
| `npm run build`     | Compiles to `dist/` via `tsc -b`.         |
| `npm run test`      | Runs both `unit` and `property` projects. |
| `npm run test:property` | Property project only.                |
| `npm run test:unit` | Unit project only.                        |
| `npm run typecheck` | `tsc --noEmit` on the package.            |
