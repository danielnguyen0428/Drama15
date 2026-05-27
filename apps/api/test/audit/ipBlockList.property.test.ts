/**
 * Property test for the IP block-list job's threshold + window contract.
 *
 * **Property 22: IP block sau 100 login fail/giờ**
 * **Validates: Requirements 14.3**
 *
 * Requirement 14.3 (verbatim):
 *   "WHEN số lần đăng nhập thất bại từ một dải IP vượt 100 lần trong
 *    một giờ, THE API_Gateway SHALL thêm dải IP đó vào danh sách chặn
 *    tạm thời trong 24 giờ."
 *
 *   English: "When the number of login failures from an IP range
 *   exceeds 100 within one hour, the API_Gateway SHALL add that range
 *   to a temporary block list for 24 hours."
 *
 * Property under test
 * --------------------
 * For an arbitrary set of `{ block, count }` rows produced by the
 * audit aggregation (counts uniformly drawn from [0, 500] which spans
 * both sides of the threshold), after a single `IpBlockListJob.runTick(now)`:
 *
 *   1. Threshold (strict greater-than): every block with `count > 100`
 *      is on the active block list at `now + 1 hour`, and every block
 *      with `count <= 100` is NOT — this exercises the boundary
 *      (count = 100 must NOT be banned, per "vượt 100" / "exceeds 100").
 *
 *   2. Return value: `bannedRanges` contains exactly the set of blocks
 *      whose count crossed the threshold (no extras, no omissions).
 *
 *   3. Window: the `bannedUntil` written for every banned range is
 *      exactly `now + 24h`. We assert this on the captured
 *      `addBlockedRange` calls so the per-row arithmetic is checked
 *      directly rather than only via the resulting `isBlocked` lookup.
 *
 * Generators
 * -----------
 * Each entry is built from three octet integers `(a, b, c)` so the
 * resulting `block` string is a syntactically valid `/24` form
 * (`a.b.c.0/24`) AND we can derive a sample IP (`a.b.c.1`) that
 * `IpBlockListDb.isBlocked` reduces back to the same `/24` via
 * `to24Block`. The array is deduplicated on `block` via
 * `fc.uniqueArray` so repeated upserts on the same key (which the
 * job's idempotency guarantees but which would muddle the
 * "set equality" assertion on `bannedRanges`) cannot occur.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  IpBlockListJob,
  to24Block,
  type AddBlockedRangeArgs,
  type BlockCountRow,
  type CountLoginFailedArgs,
  type IpBlockListDb
} from '../../src/audit/ipBlockList.js';

const NOW = new Date('2025-04-01T12:00:00Z');
const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * ONE_HOUR_MS;
const THRESHOLD = 100;

/**
 * In-memory `IpBlockListDb` mirror of the upsert/lookup contract.
 * Kept private to this file so the property test does not couple to
 * the fake in `ipBlockList.test.ts`. Only the methods exercised by
 * this property are implemented in detail; `removeExpiredBlocks` is a
 * no-op because the property runs a single tick at a fixed `now` and
 * never advances time past `bannedUntil`.
 */
class FakeDb implements IpBlockListDb {
  public aggregations: BlockCountRow[] = [];
  public addCalls: AddBlockedRangeArgs[] = [];
  public store = new Map<string, Date>();

  async countLoginFailedPer24Block(
    args: CountLoginFailedArgs
  ): Promise<readonly BlockCountRow[]> {
    void args;
    return this.aggregations.slice();
  }

  async addBlockedRange(args: AddBlockedRangeArgs): Promise<void> {
    this.addCalls.push(args);
    const existing = this.store.get(args.block);
    if (!existing || args.bannedUntil > existing) {
      this.store.set(args.block, args.bannedUntil);
    }
  }

  async removeExpiredBlocks(now: Date): Promise<number> {
    void now;
    return 0;
  }

  async isBlocked(ip: string, now: Date): Promise<boolean> {
    const block = to24Block(ip);
    const bannedUntil = this.store.get(block);
    return bannedUntil !== undefined && bannedUntil.getTime() > now.getTime();
  }
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * One generated entry: a `/24` block paired with a representative
 * IPv4 inside it (`a.b.c.1`) and an aggregation count.
 *
 * Counts are drawn from [0, 500] so each iteration explores both sides
 * of the strict-greater-than-100 threshold — including the boundary
 * value 100 itself, which is the off-by-one trap the property is
 * designed to catch.
 */
const arbEntry = fc
  .tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 500 })
  )
  .map(([a, b, c, count]) => ({
    block: `${a}.${b}.${c}.0/24`,
    ip: `${a}.${b}.${c}.1`,
    count
  }));

/**
 * Array of distinct entries (deduplicated by `block`). Two rows with
 * the same `/24` would never appear in a real aggregation result —
 * `countLoginFailedPer24Block` groups by block — so generating
 * duplicates would be exercising a state the production query does
 * not produce. `maxLength: 20` keeps each iteration cheap while still
 * exercising the multi-block path.
 */
const arbEntries = fc.uniqueArray(arbEntry, {
  selector: (e) => e.block,
  maxLength: 20
});

// ---------------------------------------------------------------------------
// Property
// ---------------------------------------------------------------------------

describe('IpBlockListJob property test (Property 22)', () => {
  it('bans exactly the blocks with count > 100, for exactly 24 hours (Validates: Requirements 14.3)', async () => {
    await fc.assert(
      fc.asyncProperty(arbEntries, async (entries) => {
        const db = new FakeDb();
        db.aggregations = entries.map(({ block, count }) => ({ block, count }));

        const job = new IpBlockListJob({
          db,
          threshold: THRESHOLD,
          banDurationMs: TWENTY_FOUR_HOURS_MS,
          clock: () => NOW
        });

        const result = await job.runTick(NOW);

        // The set of blocks the job claims to have banned must equal
        // the set we expect from the strict-greater-than threshold.
        const expectedBanned = entries
          .filter((e) => e.count > THRESHOLD)
          .map((e) => e.block);

        // `result.scanned` is just `entries.length` since every input
        // row is considered (the job's filter is on `count`, not on
        // input cardinality).
        expect(result.scanned).toBe(entries.length);

        // Order of `bannedRanges` is the order the job iterated the
        // aggregation, which matches the order of the input entries
        // for entries that crossed the threshold. Compare as sets so
        // the property does not over-specify the iteration order.
        expect(new Set(result.bannedRanges)).toEqual(new Set(expectedBanned));
        expect(result.bannedRanges).toHaveLength(expectedBanned.length);

        // One `addBlockedRange` call per banned range, no duplicates,
        // no calls for sub-threshold blocks.
        expect(db.addCalls).toHaveLength(expectedBanned.length);
        const calledBlocks = db.addCalls.map((c) => c.block);
        expect(new Set(calledBlocks)).toEqual(new Set(expectedBanned));

        // Every captured call writes a 24-hour ban relative to `now`.
        // This is the "trong 24 giờ" half of Requirement 14.3 checked
        // at the per-row arithmetic level, not just via `isBlocked`.
        for (const call of db.addCalls) {
          expect(call.bannedUntil.getTime() - NOW.getTime()).toBe(
            TWENTY_FOUR_HOURS_MS
          );
        }

        // End-to-end check via `isBlocked`: at `now + 1h` (well inside
        // the 24-hour window) every above-threshold range is banned and
        // every at-or-below-threshold range is NOT. The boundary case
        // count === 100 is folded into the second branch and so is
        // exercised every time fast-check happens to pick that count.
        const checkAt = new Date(NOW.getTime() + ONE_HOUR_MS);
        for (const entry of entries) {
          const blocked = await db.isBlocked(entry.ip, checkAt);
          if (entry.count > THRESHOLD) {
            expect(blocked).toBe(true);
          } else {
            expect(blocked).toBe(false);
          }
        }
      }),
      { numRuns: 100 }
    );
  });
});
