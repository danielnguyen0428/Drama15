/**
 * Shared fast-check generators (`arb*`) and helpers used by every
 * property-test file in the Drama15 commercial web SaaS workspace.
 *
 * Each generator constrains its input space intelligently to the shapes the
 * design.md properties operate on. Generators are biased toward producing
 * realistic, schema-correct values so most shrinking effort is spent
 * exploring genuinely interesting edge cases rather than format errors.
 *
 * Validates: testing strategy (commercial-web-saas tasks 1.5).
 */

import * as fc from 'fast-check';
import type {
  AccessTokenClaims,
  PlanState,
  PlanType,
  PlanStatus,
  QuotaAction,
  UiLocale
} from '@drama15/contracts';

// ---------------------------------------------------------------------------
// Primitive arbitraries
// ---------------------------------------------------------------------------

/**
 * Lowercase ASCII email of the form `<local>@<domain>.<tld>` with sane lengths.
 */
export const arbEmail = (): fc.Arbitrary<string> =>
  fc.tuple(
    fc.stringMatching(/^[a-z0-9]{1,16}$/),
    fc.stringMatching(/^[a-z][a-z0-9-]{1,15}$/),
    fc.constantFrom('com', 'net', 'org', 'io', 'co', 'app')
  ).map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * Hashed Device_Fingerprint as a hex string (32–64 chars), matching the format
 * stored in `devices.fingerprint` (Requirement 4.1).
 */
export const arbDeviceFingerprint = (): fc.Arbitrary<string> =>
  fc.string({
    unit: fc.constantFrom(
      '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
      'a', 'b', 'c', 'd', 'e', 'f'
    ),
    minLength: 32,
    maxLength: 64
  });

/**
 * UTC timestamp clamped to 2024–2030 to avoid Date overflow during arithmetic.
 * Used as the "current time" for state machines and the basis for
 * `paidStartAt` / `paidExpireAt`.
 */
export const arbClock = (): fc.Arbitrary<Date> =>
  fc.date({
    min: new Date('2024-01-01T00:00:00.000Z'),
    max: new Date('2030-12-31T23:59:59.000Z'),
    noInvalidDate: true
  });

/** UUID v4-shaped string suitable for `paidCycleId`, story id, etc. */
export const arbUuid = (): fc.Arbitrary<string> => fc.uuid();

/** ISO-3166 alpha-2 country code, used for geographic re-auth (Req 4.5). */
export const arbCountry = (): fc.Arbitrary<string> =>
  fc.stringMatching(/^[A-Z]{2}$/);

/** IPv4 address string. */
export const arbIp = (): fc.Arbitrary<string> => fc.ipV4();

const arbUiLocale = (): fc.Arbitrary<UiLocale> => fc.constantFrom('vi', 'en');

// ---------------------------------------------------------------------------
// Domain arbitraries
// ---------------------------------------------------------------------------

/**
 * Server-side User shape. Aligns with `users` table columns
 * (id, email, ui_locale, status, token_epoch, created_at). `displayName` is
 * optional because Google profiles may omit it.
 */
export interface UserSample {
  id: string;
  email: string;
  displayName?: string;
  status: 'active' | 'pending_deletion' | 'deleted';
  uiLocale: UiLocale;
  tokenEpoch: number;
  createdAt: Date;
}

export const arbUser = (): fc.Arbitrary<UserSample> =>
  fc
    .tuple(
      arbUuid(),
      arbEmail(),
      fc.option(fc.string({ minLength: 1, maxLength: 32 }), { nil: undefined }),
      fc.constantFrom<UserSample['status']>('active', 'pending_deletion', 'deleted'),
      arbUiLocale(),
      fc.integer({ min: 0, max: 1_000_000 }),
      arbClock()
    )
    .map(([id, email, displayName, status, uiLocale, tokenEpoch, createdAt]) => {
      const base = { id, email, status, uiLocale, tokenEpoch, createdAt };
      return displayName === undefined
        ? (base satisfies UserSample)
        : ({ ...base, displayName } satisfies UserSample);
    });

const PAID_CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Paid_Plan invariants (Requirement 2.5, 16.3): both `paidStartAt` and
 * `paidExpireAt` set, with `paidExpireAt = paidStartAt + 30 days`, and
 * `paidCycleId` populated.
 *
 * Free_Plan invariants: none of those fields are set.
 *
 * Status is correlated with plan/cycle:
 *   - Paid_Plan + active     → start ≤ clock < expire
 *   - Paid_Plan + expired    → expire ≤ clock
 *   - Paid_Plan + revoked    → start ≤ clock < expire (revocation is admin)
 *   - Free_Plan + active|pending_deletion
 */
export const arbPlanState = (): fc.Arbitrary<PlanState> =>
  fc.oneof(
    // Free_Plan
    fc
      .record({
        userId: arbUuid(),
        plan: fc.constant<PlanType>('Free_Plan'),
        status: fc.constantFrom<PlanStatus>('active', 'pending_deletion')
      })
      .map((p) => p satisfies PlanState),

    // Paid_Plan
    fc
      .tuple(
        arbUuid(),
        arbUuid(),
        arbClock(),
        fc.constantFrom<PlanStatus>('active', 'expired', 'revoked')
      )
      .map(([userId, paidCycleId, start, status]) => {
        const expire = new Date(start.getTime() + PAID_CYCLE_MS);
        return {
          userId,
          plan: 'Paid_Plan' as const,
          status,
          paidStartAt: start.toISOString(),
          paidExpireAt: expire.toISOString(),
          paidCycleId
        } satisfies PlanState;
      })
  );

// ---------------------------------------------------------------------------
// LicenseAction discriminated union
// ---------------------------------------------------------------------------

/**
 * Domain action applied to a License_Service state machine. Each variant
 * carries enough context for a state-machine property test to evaluate
 * preconditions (user, fingerprint, timestamp).
 *
 * Mirrors the Plan / Quota state transitions described in design.md:
 *   - signup           → assigns Free_Plan
 *   - admin_upgrade    → Free_Plan → Paid_Plan (Req 16.2)
 *   - admin_revoke     → Paid_Plan → Free_Plan + bump token_epoch (Req 16.4)
 *   - paid_expire      → background scanner expires Paid_Plan (Req 2.5)
 *   - paid_renew       → resets cycle counters and rotates paid_cycle_id (Req 5.10)
 *   - login / logout   → session lifecycle
 *   - device_remove    → Req 4.6 / 4.7
 *   - refresh_use      → Req 4.* refresh-token rotation
 *   - quota_action     → consumes a quota counter (Req 5.*, 7.*)
 *   - integrity_fail   → client integrity violation (Req 13.*)
 */
export type LicenseAction =
  | { kind: 'signup'; userId: string; fingerprint: string; at: Date }
  | { kind: 'admin_upgrade'; userId: string; adminId: string; at: Date }
  | { kind: 'admin_revoke'; userId: string; adminId: string; at: Date }
  | { kind: 'paid_expire'; userId: string; at: Date }
  | { kind: 'paid_renew'; userId: string; at: Date }
  | { kind: 'login'; userId: string; fingerprint: string; at: Date }
  | { kind: 'logout'; userId: string; fingerprint: string; allDevices: boolean; at: Date }
  | { kind: 'device_remove'; userId: string; fingerprint: string; at: Date }
  | { kind: 'refresh_use'; userId: string; fingerprint: string; familyId: string; at: Date }
  | { kind: 'quota_action'; userId: string; action: QuotaAction; at: Date }
  | { kind: 'integrity_fail'; userId: string; fingerprint: string; at: Date };

const arbQuotaAction = (): fc.Arbitrary<QuotaAction> =>
  fc.constantFrom<QuotaAction>(
    'free_chapter',
    'paid_full_story',
    'paid_voice',
    'rewrite',
    'story_request_rpm'
  );

export const arbAction = (): fc.Arbitrary<LicenseAction> =>
  fc.oneof(
    fc
      .tuple(arbUuid(), arbDeviceFingerprint(), arbClock())
      .map(([userId, fingerprint, at]) => ({ kind: 'signup', userId, fingerprint, at }) as const),
    fc
      .tuple(arbUuid(), arbUuid(), arbClock())
      .map(([userId, adminId, at]) => ({ kind: 'admin_upgrade', userId, adminId, at }) as const),
    fc
      .tuple(arbUuid(), arbUuid(), arbClock())
      .map(([userId, adminId, at]) => ({ kind: 'admin_revoke', userId, adminId, at }) as const),
    fc.tuple(arbUuid(), arbClock()).map(([userId, at]) => ({ kind: 'paid_expire', userId, at }) as const),
    fc.tuple(arbUuid(), arbClock()).map(([userId, at]) => ({ kind: 'paid_renew', userId, at }) as const),
    fc
      .tuple(arbUuid(), arbDeviceFingerprint(), arbClock())
      .map(([userId, fingerprint, at]) => ({ kind: 'login', userId, fingerprint, at }) as const),
    fc
      .tuple(arbUuid(), arbDeviceFingerprint(), fc.boolean(), arbClock())
      .map(([userId, fingerprint, allDevices, at]) =>
        ({ kind: 'logout', userId, fingerprint, allDevices, at }) as const
      ),
    fc
      .tuple(arbUuid(), arbDeviceFingerprint(), arbClock())
      .map(([userId, fingerprint, at]) => ({ kind: 'device_remove', userId, fingerprint, at }) as const),
    fc
      .tuple(arbUuid(), arbDeviceFingerprint(), arbUuid(), arbClock())
      .map(([userId, fingerprint, familyId, at]) =>
        ({ kind: 'refresh_use', userId, fingerprint, familyId, at }) as const
      ),
    fc
      .tuple(arbUuid(), arbQuotaAction(), arbClock())
      .map(([userId, action, at]) => ({ kind: 'quota_action', userId, action, at }) as const),
    fc
      .tuple(arbUuid(), arbDeviceFingerprint(), arbClock())
      .map(([userId, fingerprint, at]) => ({ kind: 'integrity_fail', userId, fingerprint, at }) as const)
  );

// ---------------------------------------------------------------------------
// HTTP request / upstream response generators
// ---------------------------------------------------------------------------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequestSample {
  method: HttpMethod;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  ip: string;
  /** ISO-3166 alpha-2 (Req 4.5). */
  country: string;
  /** Bearer Access_Token, if the request is authenticated. */
  accessToken?: string;
}

const arbHttpHeaders = (): fc.Arbitrary<Record<string, string>> =>
  fc.dictionary(
    fc.stringMatching(/^[a-z][a-z0-9-]{1,24}$/),
    fc.stringMatching(/^[\x20-\x7e]{0,64}$/),
    { maxKeys: 8 }
  );

const arbHttpBody = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.constant(undefined),
    fc.string({ maxLength: 64 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 16 }), fc.jsonValue(), { maxKeys: 4 })
  );

export const arbHttpRequest = (): fc.Arbitrary<HttpRequestSample> =>
  fc
    .record(
      {
        method: fc.constantFrom<HttpMethod>('GET', 'POST', 'PUT', 'PATCH', 'DELETE'),
        path: fc.stringMatching(/^\/[a-zA-Z0-9_\-\/]{0,64}$/),
        headers: arbHttpHeaders(),
        body: arbHttpBody(),
        ip: arbIp(),
        country: arbCountry(),
        accessToken: fc.option(
          fc.stringMatching(/^[A-Za-z0-9._-]{16,128}$/),
          { nil: undefined }
        )
      },
      { requiredKeys: ['method', 'path', 'headers', 'ip', 'country'] }
    )
    .map((req) => {
      const out = { ...req } as HttpRequestSample;
      if (out.body === undefined) delete (out as { body?: unknown }).body;
      if (out.accessToken === undefined) delete (out as { accessToken?: string }).accessToken;
      return out;
    });

/**
 * Upstream response shape used by sanitisation properties (Req 12.5):
 * may include `server`, `via`, `x-powered-by`, `x-router-internal` headers
 * and a body that may leak hostnames or filesystem paths. Sanitiser
 * properties verify the gateway scrubs these before responding to clients.
 */
export interface UpstreamResponseSample {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const SENSITIVE_HEADER_KEYS = ['server', 'via', 'x-powered-by', 'x-router-internal'] as const;

const arbUpstreamHeaders = (): fc.Arbitrary<Record<string, string>> =>
  fc
    .record({
      base: arbHttpHeaders(),
      server: fc.option(fc.constantFrom('drama15-router/1.0', 'nginx/1.25', 'envoy'), { nil: undefined }),
      via: fc.option(fc.constantFrom('1.1 internal-proxy', '2.0 edge.upstream.local'), { nil: undefined }),
      poweredBy: fc.option(fc.constantFrom('Express', 'Fastify', 'Drama15-Internal'), { nil: undefined }),
      routerInternal: fc.option(fc.stringMatching(/^[a-z0-9.-]{4,64}$/), { nil: undefined })
    })
    .map(({ base, server, via, poweredBy, routerInternal }) => {
      const out: Record<string, string> = { ...base };
      if (server !== undefined) out['server'] = server;
      if (via !== undefined) out['via'] = via;
      if (poweredBy !== undefined) out['x-powered-by'] = poweredBy;
      if (routerInternal !== undefined) out['x-router-internal'] = routerInternal;
      return out;
    });

const arbUpstreamBody = (): fc.Arbitrary<unknown> =>
  fc.oneof(
    fc.constant({ ok: true }),
    fc.constant({ error: 'connect ECONNREFUSED internal.upstream.local:5432' }),
    fc.constant({ stack: 'Error\n    at /var/log/drama15/upstream/router.js:42' }),
    fc.constant({ message: 'unable to read /etc/drama15/secrets.json' }),
    fc.constant({ host: 'internal.upstream.local', token: 'sk-fake-internal-1234' }),
    fc.string({ maxLength: 128 }),
    fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), fc.jsonValue(), { maxKeys: 4 })
  );

export const arbUpstreamResponse = (): fc.Arbitrary<UpstreamResponseSample> =>
  fc.record({
    status: fc.integer({ min: 100, max: 599 }),
    headers: arbUpstreamHeaders(),
    body: arbUpstreamBody()
  });

/** Header keys whose values must never reach the client. Exposed for tests. */
export const sensitiveUpstreamHeaderKeys: readonly string[] = [...SENSITIVE_HEADER_KEYS];

// ---------------------------------------------------------------------------
// ID-Token generator (Property 4 — Google id_token verification)
// ---------------------------------------------------------------------------

export interface IdTokenSample {
  sub: string;
  email: string;
  email_verified: boolean;
  aud: string;
  iss: string;
  /** Seconds since epoch. */
  exp: number;
  /** Seconds since epoch. */
  iat: number;
  nonce: string;
  /** True when the RSA signature would verify against Google's JWKS. */
  signatureValid: boolean;
}

export const arbIDToken = (): fc.Arbitrary<IdTokenSample> =>
  fc
    .tuple(
      arbUuid(),
      arbEmail(),
      fc.boolean(),
      fc.constantFrom(
        'https://accounts.google.com',
        'accounts.google.com',
        'https://accounts.evil.example'
      ),
      fc.stringMatching(/^[0-9]{12}-[a-z0-9]{32}\.apps\.googleusercontent\.com$/),
      arbClock(),
      fc.integer({ min: -3600, max: 3600 }),
      fc.stringMatching(/^[A-Za-z0-9_-]{16,64}$/),
      fc.boolean()
    )
    .map(
      ([sub, email, emailVerified, iss, aud, iatDate, lifetimeOffset, nonce, signatureValid]) => {
        const iat = Math.floor(iatDate.getTime() / 1000);
        const exp = iat + 3600 + lifetimeOffset;
        return {
          sub,
          email,
          email_verified: emailVerified,
          aud,
          iss,
          exp,
          iat,
          nonce,
          signatureValid
        } satisfies IdTokenSample;
      }
    );

// ---------------------------------------------------------------------------
// Access_Token claims generator (handy for gateway tests)
// ---------------------------------------------------------------------------

export const arbAccessTokenClaims = (): fc.Arbitrary<AccessTokenClaims> =>
  fc
    .tuple(
      arbUuid(),
      arbEmail(),
      arbDeviceFingerprint(),
      arbUuid(),
      fc.integer({ min: 0, max: 1_000_000 }),
      arbClock(),
      fc.integer({ min: 60, max: 900 }),
      fc.stringMatching(/^[a-z0-9-]{4,32}$/)
    )
    .map(([sub, email, fp, sid, epoch, iatDate, lifetime, kid]) => {
      const iat = Math.floor(iatDate.getTime() / 1000);
      const exp = iat + lifetime;
      return {
        iss: 'https://api.drama15.example',
        sub,
        email,
        fp,
        sid,
        epoch,
        iat,
        exp,
        kid
      } satisfies AccessTokenClaims;
    });

// ---------------------------------------------------------------------------
// Test runner helper
// ---------------------------------------------------------------------------

export interface RunPropertyOptions {
  /** Default 100; bump to 500 for state-machine tests (rotation, quota). */
  numRuns?: number;
  seed?: number;
  verbose?: boolean | fc.VerbosityLevel;
}

/**
 * Thin wrapper around `fc.assert(fc.property(...))` that locks in our defaults
 * and threads through the `numRuns` / `seed` knobs the design.md properties
 * call out (e.g. `{ numRuns: 500 }` for refresh-rotation and quota
 * state-machine tests).
 *
 * Returning the fast-check `RunDetails` from `fc.assert` is intentionally
 * avoided — `fc.assert` throws on counterexamples, which is what vitest /
 * the test runner expects.
 */
export const runProperty = <T>(
  arb: fc.Arbitrary<T>,
  predicate: (value: T) => void | boolean,
  opts: RunPropertyOptions = {}
): void => {
  const { numRuns = 100, seed, verbose } = opts;
  const params: fc.Parameters<[T]> = { numRuns };
  if (seed !== undefined) params.seed = seed;
  if (verbose !== undefined) params.verbose = verbose;
  fc.assert(fc.property(arb, predicate), params);
};

export { fc };
