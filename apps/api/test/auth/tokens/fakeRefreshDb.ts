/**
 * Hand-rolled fake `RefreshTokenDb` used by the unit tests. Keeps the
 * tests free of `vitest.mock` and lets us assert against the captured
 * insert payload directly.
 */

import type {
  ActiveRefreshTokenRow,
  FindActiveByHashArgs,
  InsertRefreshTokenArgs,
  InsertRefreshTokenResult,
  RefreshRevokeReason,
  RefreshTokenDb,
  RefreshTokenLookupRow,
  RevokeFamilyArgs,
  RevokeTokenArgs
} from '../../../src/auth/tokens/index.js';

interface StoredRow {
  readonly tokenHash: string;
  row: ActiveRefreshTokenRow;
  revokeReason?: RefreshRevokeReason;
}

export class FakeRefreshDb implements RefreshTokenDb {
  public readonly inserts: InsertRefreshTokenArgs[] = [];
  public readonly revokeTokens: RevokeTokenArgs[] = [];
  public readonly revokeFamilies: RevokeFamilyArgs[] = [];
  /** Default `now` used when the fake needs one outside `findActiveByHash`. */
  public clockNow: Date = new Date(0);
  /** Stored rows keyed by token_hash. Mirrors the unique index in the schema. */
  private readonly rows = new Map<string, StoredRow>();

  async insertRefreshToken(
    args: InsertRefreshTokenArgs
  ): Promise<InsertRefreshTokenResult> {
    this.inserts.push(args);
    const id = args.id ?? `gen-${this.inserts.length}`;
    const row: ActiveRefreshTokenRow = {
      id,
      userId: args.userId,
      familyId: args.familyId,
      ...(args.parentId !== undefined ? { parentId: args.parentId } : {}),
      deviceFingerprint: args.deviceFingerprint,
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt
    };
    this.rows.set(args.tokenHash, { tokenHash: args.tokenHash, row });
    return { id };
  }

  async findActiveByHash(
    args: FindActiveByHashArgs
  ): Promise<ActiveRefreshTokenRow | null> {
    const stored = this.rows.get(args.tokenHash);
    if (stored === undefined) return null;
    if (stored.row.expiresAt.getTime() <= args.now.getTime()) return null;
    if (stored.row.revokedAt !== undefined) return null;
    return stored.row;
  }

  async findByHashIgnoringActive(
    tokenHash: string
  ): Promise<RefreshTokenLookupRow | null> {
    const stored = this.rows.get(tokenHash);
    if (stored === undefined) return null;
    return {
      id: stored.row.id,
      userId: stored.row.userId,
      familyId: stored.row.familyId,
      ...(stored.row.revokedAt !== undefined ? { revokedAt: stored.row.revokedAt } : {}),
      ...(stored.revokeReason !== undefined ? { revokeReason: stored.revokeReason } : {})
    };
  }

  async revokeToken(args: RevokeTokenArgs): Promise<void> {
    this.revokeTokens.push(args);
    for (const stored of this.rows.values()) {
      if (stored.row.id === args.id && stored.row.revokedAt === undefined) {
        stored.row = { ...stored.row, revokedAt: this.clockNow };
        stored.revokeReason = args.reason;
      }
    }
  }

  async revokeFamily(args: RevokeFamilyArgs): Promise<void> {
    this.revokeFamilies.push(args);
    for (const stored of this.rows.values()) {
      if (stored.row.familyId === args.familyId && stored.row.revokedAt === undefined) {
        stored.row = { ...stored.row, revokedAt: this.clockNow };
        stored.revokeReason = args.reason;
      }
    }
  }
}
