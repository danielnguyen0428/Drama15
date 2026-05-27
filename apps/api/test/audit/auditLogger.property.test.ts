/**
 * Property test for Audit_Logger schema, completeness, and append-only safety.
 *
 * **Property 21: Audit log completeness, schema, append-only và safety**
 * **Validates: Requirements 14.1, 14.2, 14.5, 15.4, 16.7**
 *
 * Requirement 14.1 (verbatim, abbreviated):
 *   "THE Audit_Logger SHALL ghi nhận các sự kiện đăng nhập qua Google,
 *    đăng xuất, ... và mọi yêu cầu bị từ chối do license hoặc quota."
 *   → Every accepted recordEvent call MUST produce exactly one persisted row.
 *
 * Requirement 14.2 (verbatim):
 *   "THE Audit_Logger SHALL gắn mỗi bản ghi với id tài khoản,
 *    Device_Fingerprint, địa chỉ IP, mã ngôn ngữ trình duyệt và thời điểm UTC."
 *   → Context fields supplied in `details` MUST be hoisted to dedicated
 *     columns; `ts` MUST be a Date.
 *
 * Requirement 14.5 (verbatim):
 *   "THE Audit_Logger SHALL giữ log tối thiểu 365 ngày và phải lưu ở dạng
 *    chỉ ghi thêm và phải không cho phép sửa đổi tại chỗ."
 *   → Append-only: no row is ever rewritten, and a payload that fails
 *     `redactDetails` MUST NOT cause an insert (the rejection path is the
 *     application-side mirror of the DB-level UPDATE/DELETE deny).
 *
 * Requirement 15.4 (verbatim):
 *   "THE Audit_Logger SHALL không ghi Access_Token nguyên dạng,
 *    Refresh_Token nguyên dạng, hoặc Google OAuth authorization code vào log."
 *   → For ANY input containing one of `FORBIDDEN_KEYS` at ANY nesting depth,
 *     `recordEvent` throws `AuditError('forbidden_field')`. For inputs free
 *     of those keys, the resulting row's `details` ALSO contains no raw
 *     `email`, `fingerprint`, or `access_token_jti` (default hashKeys hash
 *     them away into `*_hash` companions).
 *
 * Requirement 16.7 (verbatim):
 *   "THE Admin_Console SHALL ghi nhận hành động của quản trị viên vào
 *    Audit_Logger với id quản trị viên thực hiện."
 *   → When `details.actorAdminId` is supplied as a string, it is hoisted to
 *     `row.actorAdminId` and removed from `row.details`.
 *
 * Test shape:
 *   * Property A (safe inputs): random `eventType` + random nested `details`
 *     drawn from a SAFE_KEY_POOL that excludes every forbidden key, context
 *     field, and sensitive key. Top-level "context" and "sensitive" fields
 *     are added independently. After `recordEvent`:
 *       - exactly one row was inserted,
 *       - `row.eventType === eventType` and `row.ts instanceof Date`,
 *       - `row.details` contains no raw `email`, `fingerprint`,
 *         `access_token_jti`, or `FORBIDDEN_KEYS` at any depth,
 *       - context columns mirror the input for `userId`, `ip`,
 *         `browserLocale`, `actorAdminId` whenever the caller passed them
 *         as strings (the four context fields that survive default
 *         hashing — `fingerprint` is intentionally hashed away by the
 *         default hashKeys policy and so is asserted absent from `details`
 *         rather than present as a column).
 *
 *   * Property B (forbidden-key inputs): random `eventType` + random nested
 *     `details` with one of `FORBIDDEN_KEYS` injected at a randomly-chosen
 *     depth. Every such call MUST reject with `AuditError('forbidden_field')`
 *     and MUST NOT cause any insert (append-only safety on the failure path).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { AuditLogger } from '../../src/audit/auditLogger.js';
import { AuditError } from '../../src/audit/types.js';
import { FORBIDDEN_KEYS } from '../../src/audit/redaction.js';
import type {
  AuditDb,
  InsertAuditEventArgs,
  InsertAuditEventResult
} from '../../src/audit/db.js';

// ---------------------------------------------------------------------------
// In-memory `AuditDb` fake. Captures every insert verbatim so the property
// can inspect both the structured columns and the JSONB `details`. We do NOT
// import the fake from `auditLogger.test.ts` — keeping a private copy here
// preserves the two test files' independence.
// ---------------------------------------------------------------------------

class FakeDb implements AuditDb {
  public rows: InsertAuditEventArgs[] = [];
  private nextId = 1;
  async insertEvent(args: InsertAuditEventArgs): Promise<InsertAuditEventResult> {
    this.rows.push(args);
    return { id: String(this.nextId++) };
  }
}

const FIXED_NOW = new Date('2025-03-09T12:00:00.000Z');

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * "Safe" key names — chosen to avoid collisions with:
 *   * the four forbidden keys (Req 15.4),
 *   * the five context fields hoisted by `recordEvent`
 *     (`userId`, `fingerprint`, `ip`, `browserLocale`, `actorAdminId`),
 *   * the three default hashKeys (`email`, `fingerprint`, `access_token_jti`),
 *   * the `ts` reserved key.
 *
 * Restricting the recursive generator to this pool makes "input has no
 * forbidden key at any depth" trivially true and lets the property focus
 * on the redaction / hashing / hoisting pipeline rather than on key collisions.
 */
const SAFE_KEY_POOL = [
  'action',
  'reason',
  'count',
  'note',
  'flag',
  'plan',
  'meta',
  'ext',
  'value',
  'kind'
];

const arbSafeKey = fc.constantFrom(...SAFE_KEY_POOL);

/** Leaf scalars — never an object/array. */
const arbSafeLeaf: fc.Arbitrary<unknown> = fc.oneof(
  fc.string({ maxLength: 12 }),
  fc.integer({ min: -1_000, max: 1_000 }),
  fc.boolean(),
  fc.constant(null)
);

/** Up-to-three-level nesting is enough to exercise "at any depth" without
 *  making fast-check spend its budget on tree depth instead of key shape. */
const arbSafeLevel2: fc.Arbitrary<unknown> = fc.oneof(
  arbSafeLeaf,
  fc.array(arbSafeLeaf, { maxLength: 3 }),
  fc.dictionary(arbSafeKey, arbSafeLeaf, { maxKeys: 3 })
);

const arbSafeLevel1: fc.Arbitrary<unknown> = fc.oneof(
  arbSafeLeaf,
  fc.array(arbSafeLevel2, { maxLength: 3 }),
  fc.dictionary(arbSafeKey, arbSafeLevel2, { maxKeys: 3 })
);

const arbSafeNestedObj: fc.Arbitrary<Record<string, unknown>> = fc.dictionary(
  arbSafeKey,
  arbSafeLevel1,
  { maxKeys: 4 }
);

/** Optional top-level context fields. `fc.option(..., {nil: undefined})`
 *  ensures the value is either `undefined` (skipped on merge) or a non-empty
 *  string (eligible for hoisting). */
const arbCtxString = fc.option(fc.string({ minLength: 1, maxLength: 20 }), {
  nil: undefined
});

const arbContextOverrides = fc.record({
  userId: arbCtxString,
  fingerprint: arbCtxString,
  ip: arbCtxString,
  browserLocale: fc.option(fc.string({ minLength: 1, maxLength: 8 }), {
    nil: undefined
  }),
  actorAdminId: arbCtxString
});

/** Sensitive top-level overrides — these get hashed away by the default
 *  hashKeys policy. `email` and `access_token_jti` do NOT overlap with
 *  context fields so they always end up only in `details` (as `*_hash`). */
const arbSensitiveOverrides = fc.record({
  email: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined
  }),
  access_token_jti: fc.option(fc.string({ minLength: 1, maxLength: 30 }), {
    nil: undefined
  })
});

const arbEventType: fc.Arbitrary<string> = fc.string({
  minLength: 1,
  maxLength: 30
});

/** Compose a "safe" scenario: nested object + optional context + optional
 *  sensitive fields. The merge ordering is `base ← context ← sensitive` but
 *  none of the three sources share keys (by construction) so the order is
 *  cosmetic only. */
const arbSafeInput = fc
  .tuple(arbEventType, arbSafeNestedObj, arbContextOverrides, arbSensitiveOverrides)
  .map(([eventType, base, context, sensitive]) => {
    const details: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(context)) {
      if (v !== undefined) details[k] = v;
    }
    for (const [k, v] of Object.entries(sensitive)) {
      if (v !== undefined) details[k] = v;
    }
    return { eventType, details };
  });

/** "Unsafe" scenario: same nested base, plus a forbidden key planted at a
 *  randomly-chosen object path. The path is forced through pure-object
 *  segments (intermediate non-objects are replaced) so the planted key
 *  always lives under an Object key, which is exactly the JSONB-key shape
 *  `redactDetails` rejects. */
const arbForbiddenKey = fc.constantFrom(...FORBIDDEN_KEYS);

const arbUnsafeInput = fc
  .tuple(
    arbEventType,
    arbSafeNestedObj,
    arbForbiddenKey,
    fc.string({ maxLength: 16 }),
    fc.array(arbSafeKey, { maxLength: 3 })
  )
  .map(([eventType, base, fkey, fvalue, path]) => {
    // Deep-clone via JSON so each iteration / shrink starts from an
    // independent tree (fast-check may share generated values otherwise).
    const root: Record<string, unknown> = JSON.parse(JSON.stringify(base));
    let cursor: Record<string, unknown> = root;
    for (const seg of path) {
      const next = cursor[seg];
      if (next === null || typeof next !== 'object' || Array.isArray(next)) {
        cursor[seg] = {};
      }
      cursor = cursor[seg] as Record<string, unknown>;
    }
    cursor[fkey] = fvalue;
    return { eventType, details: root };
  });

// ---------------------------------------------------------------------------
// Helper: collect every object-key name in a nested value (objects + arrays).
// Mirrors the traversal that `redactDetails` walks, so an assertion of
// "key X is nowhere in details" is the dual of "redactDetails would have
// rejected the input had X been forbidden".
// ---------------------------------------------------------------------------

function collectAllKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectAllKeys(item, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      acc.push(k);
      collectAllKeys(v, acc);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('AuditLogger property test (Property 21)', () => {
  it('persists exactly one row, hoists context fields, and never leaks raw sensitive keys (Validates: Requirements 14.1, 14.2, 16.7, 15.4)', async () => {
    await fc.assert(
      fc.asyncProperty(arbSafeInput, async ({ eventType, details }) => {
        const db = new FakeDb();
        const logger = new AuditLogger({ db, clock: () => FIXED_NOW });

        await logger.recordEvent(eventType, details);

        // Req 14.1 — exactly one row inserted per accepted call.
        expect(db.rows).toHaveLength(1);
        const row = db.rows[0]!;

        // Req 14.2 — schema mandatories.
        expect(row.eventType).toBe(eventType);
        expect(row.ts).toBeInstanceOf(Date);
        expect(Number.isFinite(row.ts.getTime())).toBe(true);
        expect(row.ts.getTime()).toBe(FIXED_NOW.getTime());

        // Req 15.4 — no raw sensitive keys remain in `details` (those are
        // hashed) and no forbidden keys at any depth (defence-in-depth).
        const allKeys = collectAllKeys(row.details);
        expect(allKeys).not.toContain('email');
        expect(allKeys).not.toContain('fingerprint');
        expect(allKeys).not.toContain('access_token_jti');
        for (const fk of FORBIDDEN_KEYS) {
          expect(allKeys).not.toContain(fk);
        }

        // Req 14.2 — context-field hoisting for the four fields that
        // survive the default-hashKeys policy. `fingerprint` is hashed
        // into `fingerprint_hash` BEFORE the destructure runs, so there
        // is no raw fingerprint left for the column to receive — that
        // case is covered by the "no raw fingerprint key" assertion above.
        if (typeof details.userId === 'string') {
          expect(row.userId).toBe(details.userId);
          expect(row.details).not.toHaveProperty('userId');
        }
        if (typeof details.ip === 'string') {
          expect(row.ip).toBe(details.ip);
          expect(row.details).not.toHaveProperty('ip');
        }
        if (typeof details.browserLocale === 'string') {
          expect(row.browserLocale).toBe(details.browserLocale);
          expect(row.details).not.toHaveProperty('browserLocale');
        }

        // Req 16.7 — actorAdminId hoisted to its dedicated column when
        // present, and removed from `details` so the column is the
        // single source of truth for "which admin did this".
        if (typeof details.actorAdminId === 'string') {
          expect(row.actorAdminId).toBe(details.actorAdminId);
          expect(row.details).not.toHaveProperty('actorAdminId');
        } else {
          expect(row.actorAdminId).toBeUndefined();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects every payload containing a forbidden key at any depth and never inserts (Validates: Requirements 14.5, 15.4)', async () => {
    await fc.assert(
      fc.asyncProperty(arbUnsafeInput, async ({ eventType, details }) => {
        const db = new FakeDb();
        const logger = new AuditLogger({ db, clock: () => FIXED_NOW });

        let caught: unknown;
        try {
          await logger.recordEvent(eventType, details);
        } catch (e) {
          caught = e;
        }

        // Req 15.4 — must throw `forbidden_field` for any forbidden key
        // in the JSONB tree, regardless of depth.
        expect(caught).toBeInstanceOf(AuditError);
        expect((caught as AuditError).code).toBe('forbidden_field');

        // Req 14.5 — append-only safety on the rejection path: a failed
        // validation MUST NOT result in any persisted row. The DB-level
        // UPDATE/DELETE deny is the storage-side mirror of this rule;
        // here we verify the application-side never hands a bad row to
        // the DB in the first place.
        expect(db.rows).toHaveLength(0);
      }),
      { numRuns: 100 }
    );
  });
});
