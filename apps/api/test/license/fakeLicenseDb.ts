import type {
  FindPaidPlansToExpireArgs,
  LicenseDb,
  PlanHistoryInsert,
  RenewPaidArgs,
  RevokeOrExpireArgs,
  TxClient,
  UpgradeToPaidArgs
} from '../../src/license/db.js';
import type {
  PlanHistoryReason,
  PlanState,
  PlanStatus,
  PlanType
} from '../../src/license/types.js';

interface FakePlanRow {
  userId: string;
  plan: PlanType;
  status: PlanStatus;
  paidStartAt: Date | null;
  paidExpireAt: Date | null;
  paidCycleId: string | null;
  paidStoryQuotaUsed: number;
  paidVoiceQuotaUsed: number;
}

interface FakePlanHistoryEntry {
  userId: string;
  fromPlan: PlanType | null;
  toPlan: PlanType;
  reason: PlanHistoryReason;
  actorAdminId?: string;
}

/**
 * In-memory LicenseDb used by both stateMachine.test.ts and
 * expiryScanner.test.ts. Keeps the unit-test surface focused on
 * behaviour rather than SQL plumbing.
 *
 * The fake exposes a few extra observability fields (`history`,
 * `bumpTokenEpochCalls`, `tokenEpoch`) so tests can assert on
 * side-effects without parsing internals.
 */
export class FakeLicenseDb implements LicenseDb {
  public readonly plans = new Map<string, FakePlanRow>();
  public readonly history: FakePlanHistoryEntry[] = [];
  public readonly tokenEpoch = new Map<string, bigint>();
  public bumpTokenEpochCalls = 0;
  public withTransactionCalls = 0;

  /**
   * Toggle to make `findPaidPlansToExpire` throw on the next call. Used
   * by the scanner test to confirm errors are caught.
   */
  public failNextScan = false;

  /**
   * Toggle to make `expirePaid`-driven `revokeOrExpire` throw for a
   * specific user once. Used by the scanner test to confirm one bad
   * user does not block others.
   */
  public failRevokeForUser: string | null = null;

  /**
   * Synthesise an existing user with no plan row (so transitions that
   * require a pre-existing row can be exercised). Tests usually call
   * `assignFreeOnSignup` instead, which inserts the row organically.
   */
  public seedUser(userId: string): void {
    if (!this.tokenEpoch.has(userId)) {
      this.tokenEpoch.set(userId, 0n);
    }
  }

  public requirePlan(userId: string): FakePlanRow {
    const row = this.plans.get(userId);
    if (!row) throw new Error(`fake_db_no_plan: ${userId}`);
    return row;
  }

  public async withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T> {
    this.withTransactionCalls += 1;
    // The fake doesn't actually require a TxClient, so we hand the
    // callback an inert stub. Methods on `this` already operate on the
    // in-memory state directly.
    const tx: TxClient = {
      query: async () => ({ rows: [] })
    };
    return fn(tx);
  }

  public async getPlanState(
    userId: string,
    _tx: TxClient | null
  ): Promise<PlanState | null> {
    const row = this.plans.get(userId);
    if (!row) return null;
    const state: PlanState = {
      userId: row.userId,
      plan: row.plan,
      status: row.status
    };
    if (row.paidStartAt) state.paidStartAt = row.paidStartAt.toISOString();
    if (row.paidExpireAt) state.paidExpireAt = row.paidExpireAt.toISOString();
    if (row.paidCycleId) state.paidCycleId = row.paidCycleId;
    return state;
  }

  public async bumpTokenEpoch(userId: string, _tx: TxClient): Promise<bigint> {
    this.bumpTokenEpochCalls += 1;
    const cur = this.tokenEpoch.get(userId) ?? 0n;
    const next = cur + 1n;
    this.tokenEpoch.set(userId, next);
    return next;
  }

  public async recordPlanHistory(
    insert: PlanHistoryInsert,
    _tx: TxClient
  ): Promise<void> {
    const entry: FakePlanHistoryEntry = {
      userId: insert.userId,
      fromPlan: insert.fromPlan,
      toPlan: insert.toPlan,
      reason: insert.reason
    };
    if (insert.actorAdminId !== undefined) {
      entry.actorAdminId = insert.actorAdminId;
    }
    this.history.push(entry);
  }

  public async upsertFreePlan(userId: string, _tx: TxClient): Promise<void> {
    if (this.plans.has(userId)) return;
    this.plans.set(userId, {
      userId,
      plan: 'Free_Plan',
      status: 'active',
      paidStartAt: null,
      paidExpireAt: null,
      paidCycleId: null,
      paidStoryQuotaUsed: 0,
      paidVoiceQuotaUsed: 0
    });
    this.seedUser(userId);
  }

  public async upgradeToPaid(args: UpgradeToPaidArgs): Promise<void> {
    const row = this.plans.get(args.userId);
    if (!row) throw new Error(`fake_db_no_plan: ${args.userId}`);
    row.plan = 'Paid_Plan';
    row.status = 'active';
    row.paidStartAt = args.paidStartAt;
    row.paidExpireAt = args.paidExpireAt;
    row.paidCycleId = args.paidCycleId;
    row.paidStoryQuotaUsed = 0;
    row.paidVoiceQuotaUsed = 0;
  }

  public async revokeOrExpire(args: RevokeOrExpireArgs): Promise<void> {
    if (this.failRevokeForUser === args.userId) {
      this.failRevokeForUser = null;
      throw new Error('synthetic_revoke_failure');
    }
    const row = this.plans.get(args.userId);
    if (!row) throw new Error(`fake_db_no_plan: ${args.userId}`);
    row.plan = 'Free_Plan';
    row.status = args.status;
    row.paidStartAt = null;
    row.paidExpireAt = null;
    row.paidCycleId = null;
    row.paidStoryQuotaUsed = 0;
    row.paidVoiceQuotaUsed = 0;
  }

  public async renewPaid(args: RenewPaidArgs): Promise<void> {
    const row = this.plans.get(args.userId);
    if (!row) throw new Error(`fake_db_no_plan: ${args.userId}`);
    row.plan = 'Paid_Plan';
    row.status = 'active';
    row.paidStartAt = args.paidStartAt;
    row.paidExpireAt = args.paidExpireAt;
    row.paidCycleId = args.paidCycleId;
    row.paidStoryQuotaUsed = 0;
    row.paidVoiceQuotaUsed = 0;
  }

  public async findPaidPlansToExpire(
    args: FindPaidPlansToExpireArgs
  ): Promise<{ userId: string }[]> {
    if (this.failNextScan) {
      this.failNextScan = false;
      throw new Error('synthetic_find_failure');
    }
    const due: { userId: string }[] = [];
    for (const row of this.plans.values()) {
      if (
        row.plan === 'Paid_Plan' &&
        row.status === 'active' &&
        row.paidExpireAt &&
        row.paidExpireAt.getTime() <= args.now.getTime()
      ) {
        due.push({ userId: row.userId });
      }
    }
    return due;
  }
}
