import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq, sql } from 'drizzle-orm';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import type { Environment } from '#config/environment.config.js';
import { creditAccount, creditReservation, creditTransaction } from '#database/schema.js';
import { Span } from '#telemetry/tracer.service.js';
import type { CreditCategory } from '#api/billing/billing.constants.js';
import { creditsRedisKey, creditsReservationRedisKey, reservationTtl } from '#api/billing/billing.constants.js';
import { CreditLedgerOutbox } from '#api/billing/credit-ledger-outbox.service.js';
import {
  creditCommitLua,
  creditDebitLua,
  creditRehydrateLua,
  creditReleaseLua,
  creditReserveLua,
  missingAccountSentinel,
} from '#api/billing/credit-ledger.lua.js';

/**
 * The ioredis client narrowed to the ledger's registered Lua commands
 * (`defineCommand` sends EVALSHA and re-EVALs on NOSCRIPT automatically).
 */
type LedgerRedisClient = {
  creditReserve(
    accountKey: string,
    reservationKey: string,
    amount: string,
    reservationId: string,
    floor: string,
    expiresAt: string,
  ): Promise<number[]>;
  creditCommit(accountKey: string, reservationKey: string, reservationId: string, actual: string): Promise<number[]>;
  creditRelease(accountKey: string, reservationKey: string, reservationId: string): Promise<number[]>;
  creditDebit(accountKey: string, reservationKey: string, amount: string): Promise<number[]>;
  creditRehydrate(accountKey: string, reservationKey: string, grant: string, topup: string): Promise<number>;
};

type GrantMonthlyInput = {
  userId: string;
  monthlyGrantMicro: bigint;
  rolloverCeilingMicro: bigint;
  /** Stripe event id (or synthetic `free:{userId}:{yyyymm}` id) — idempotency key. */
  stripeEventId: string;
};

type TopupInput = {
  userId: string;
  amountMicro: bigint;
  stripeEventId: string;
};

type RefundTopupInput = {
  userId: string;
  amountMicro: bigint;
  stripeEventId: string;
  note: string;
};

/**
 * Pre-flight hold for one model call (hot path, AD3).
 */
export type ReserveInput = {
  userId: string;
  amountMicro: bigint;
  /** Q36 abort/error floor captured at reserve time. */
  inputFloorMicro: bigint;
  chatId?: string;
  turnId: string;
  modelId: string;
  category: CreditCategory;
};

export type ReserveResult = { ok: true; reservationId: string } | { ok: false; balanceMicro: bigint };

export type CommitInput = {
  reservationId: string;
  userId: string;
  actualMicro: bigint;
  chatId?: string;
  modelId: string;
  category: CreditCategory;
  note?: string;
  /** `sweep_floor` when the maintenance sweeper settles an expired hold. */
  reason?: 'commit' | 'sweep_floor';
};

export type DebitInput = {
  userId: string;
  amountMicro: bigint;
  category: CreditCategory;
  modelId: string;
  note: string;
};

/**
 * A user's durable credit balances. `balanceMicro` is the UI-facing single
 * number (`grant + topup`); it may be negative while the account is in debt (Q37).
 */
export type CreditAccountSnapshot = {
  grantBalanceMicro: bigint;
  topupBalanceMicro: bigint;
  reservedMicro: bigint;
  monthlyGrantMicro: bigint;
  rolloverCeilingMicro: bigint;
  balanceMicro: bigint;
};

export type CreditTransactionRecord = {
  id: string;
  deltaMicro: bigint;
  balanceAfterMicro: bigint;
  reason: string;
  category: string | undefined;
  modelId: string | undefined;
  note: string | undefined;
  createdAt: Date;
};

/**
 * Post-mutation balance targets applied inside the row-locked transaction.
 * @public
 */
export type BalanceMutation = {
  grantBalanceMicro: bigint;
  topupBalanceMicro: bigint;
  monthlyGrantMicro?: bigint;
  rolloverCeilingMicro?: bigint;
  lastGrantedAt?: Date;
};

const minBigint = (a: bigint, b: bigint): bigint => (a < b ? a : b);
const maxBigint = (a: bigint, b: bigint): bigint => (a > b ? a : b);

/**
 * The balance fields ledger mutations operate over.
 * @public
 */
export type AccountBalances = {
  grantBalanceMicro: bigint;
  topupBalanceMicro: bigint;
  reservedMicro: bigint;
  monthlyGrantMicro: bigint;
  rolloverCeilingMicro: bigint;
};

/** Transaction handle passed to `database.transaction` callbacks. */
type Tx = Parameters<Parameters<DatabaseService['database']['transaction']>[0]>[0];

const zeroAccount: AccountBalances = {
  grantBalanceMicro: 0n,
  topupBalanceMicro: 0n,
  reservedMicro: 0n,
  monthlyGrantMicro: 0n,
  rolloverCeilingMicro: 0n,
};

/**
 * Monthly-grant balance math (AD10 + plan deviation 9): accrual is capped at
 * the rollover ceiling, but an existing balance is never confiscated when a
 * plan change lowers the ceiling below it. Pure — unit-tested directly.
 * @public
 */
export const applyMonthlyGrant = (
  account: AccountBalances,
  input: { monthlyGrantMicro: bigint; rolloverCeilingMicro: bigint },
): BalanceMutation => {
  const target = minBigint(account.grantBalanceMicro + input.monthlyGrantMicro, input.rolloverCeilingMicro);
  return {
    grantBalanceMicro: maxBigint(account.grantBalanceMicro, target),
    topupBalanceMicro: account.topupBalanceMicro,
    monthlyGrantMicro: input.monthlyGrantMicro,
    rolloverCeilingMicro: input.rolloverCeilingMicro,
    lastGrantedAt: new Date(),
  };
};

/**
 * Top-up credit math (AD7): unbounded, never clipped by the rollover ceiling.
 * @public
 */
export const applyTopupCredit = (account: AccountBalances, amountMicro: bigint): BalanceMutation => {
  return {
    grantBalanceMicro: account.grantBalanceMicro,
    topupBalanceMicro: account.topupBalanceMicro + amountMicro,
  };
};

/**
 * Refund clawback math (Q37): drawn from the top-up balance first, remainder
 * from the grant balance — the account may go negative (debt).
 * @public
 */
export const applyRefundClawback = (account: AccountBalances, amountMicro: bigint): BalanceMutation => {
  const topupDraw = minBigint(account.topupBalanceMicro, amountMicro);
  return {
    grantBalanceMicro: account.grantBalanceMicro - (amountMicro - topupDraw),
    topupBalanceMicro: account.topupBalanceMicro - topupDraw,
  };
};

/**
 * Walks an error's cause chain looking for the Postgres unique-violation code —
 * the idempotency signal for replayed Stripe events (Q11): the journal insert
 * hits `credit_tx_stripe_event_idx`, the transaction rolls back, and the whole
 * operation is a no-op.
 */
const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
    if (typeof current === 'object' && 'code' in current && (current as { code?: unknown }).code === '23505') {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
};

/**
 * Durable credit-ledger paths (money-in): monthly grants, top-ups, and refund
 * clawbacks. Postgres-first inside a row-locked transaction — money must be
 * durable before it is spendable — then the Redis hot hash is invalidated so
 * the B2 Lua ledger rehydrates with the new balances on its next operation.
 */
@Injectable()
export class CreditLedgerService implements OnModuleInit {
  private readonly logger = new Logger(this.constructor.name);

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService<Environment, true>,
    private readonly outbox: CreditLedgerOutbox,
  ) {}

  public onModuleInit(): void {
    const { client } = this.redisService;
    client.defineCommand('creditReserve', { numberOfKeys: 2, lua: creditReserveLua });
    client.defineCommand('creditCommit', { numberOfKeys: 2, lua: creditCommitLua });
    client.defineCommand('creditRelease', { numberOfKeys: 2, lua: creditReleaseLua });
    client.defineCommand('creditDebit', { numberOfKeys: 2, lua: creditDebitLua });
    client.defineCommand('creditRehydrate', { numberOfKeys: 2, lua: creditRehydrateLua });
  }

  private get ledgerClient(): LedgerRedisClient {
    // oxlint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- defineCommand (onModuleInit) registers exactly these commands on the shared client
    return this.redisService.client as unknown as LedgerRedisClient;
  }

  private isPgFallback(): boolean {
    return this.configService.get('TAU_CREDIT_LEDGER_PG_FALLBACK', { infer: true });
  }

  /**
   * Applies a monthly grant with the AD10 rollover ceiling. The formula is
   * `max(current, min(current + monthly, ceiling))` — accrual is capped at the
   * ceiling but an existing balance is never confiscated by a plan change
   * (plan deviation 9). Idempotent per `stripeEventId`.
   */
  @Span()
  public async grantMonthly(input: GrantMonthlyInput): Promise<boolean> {
    return this.applyBalanceTransaction({
      userId: input.userId,
      reason: 'monthly_grant',
      stripeEventId: input.stripeEventId,
      mutate: (account) => applyMonthlyGrant(account, input),
    });
  }

  /**
   * Credits a one-time credit-pack purchase. Top-up balance is unbounded (AD7 —
   * never expires, never clipped by the rollover ceiling). Idempotent per
   * `stripeEventId`.
   */
  @Span()
  public async topup(input: TopupInput): Promise<boolean> {
    return this.applyBalanceTransaction({
      userId: input.userId,
      reason: 'topup',
      stripeEventId: input.stripeEventId,
      mutate: (account) => applyTopupCredit(account, input.amountMicro),
    });
  }

  /**
   * Claws back a refunded top-up (Q37): drawn from the top-up balance first,
   * then the grant balance — the account may go negative (debt), which blocks
   * all subsequent spend until topped up. Idempotent per `stripeEventId`.
   */
  @Span()
  public async refundTopup(input: RefundTopupInput): Promise<boolean> {
    return this.applyBalanceTransaction({
      userId: input.userId,
      reason: 'adjustment',
      stripeEventId: input.stripeEventId,
      note: input.note,
      mutate: (account) => applyRefundClawback(account, input.amountMicro),
    });
  }

  /**
   * Reads the durable account snapshot (zeros when the user has no ledger yet).
   */
  @Span()
  public async getAccount(userId: string): Promise<CreditAccountSnapshot> {
    const row = await this.databaseService.database.query.creditAccount.findFirst({
      where: eq(creditAccount.userId, userId),
    });
    const account = row ?? zeroAccount;
    return {
      grantBalanceMicro: account.grantBalanceMicro,
      topupBalanceMicro: account.topupBalanceMicro,
      reservedMicro: account.reservedMicro,
      monthlyGrantMicro: account.monthlyGrantMicro,
      rolloverCeilingMicro: account.rolloverCeilingMicro,
      balanceMicro: account.grantBalanceMicro + account.topupBalanceMicro,
    };
  }

  /**
   * Recent journal lines, newest first, for the credits endpoint.
   */
  @Span()
  public async getRecentTransactions(userId: string, limit = 20): Promise<CreditTransactionRecord[]> {
    const rows = await this.databaseService.database.query.creditTransaction.findMany({
      where: eq(creditTransaction.userId, userId),
      orderBy: desc(creditTransaction.createdAt),
      limit,
    });
    return rows.map((row) => ({
      id: row.id,
      deltaMicro: row.deltaMicro,
      balanceAfterMicro: row.balanceAfterMicro,
      reason: row.reason,
      category: row.category ?? undefined,
      modelId: row.modelId ?? undefined,
      note: row.note ?? undefined,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Atomically holds `amountMicro` against the available balance (AD3 hot
   * path). Fails while the balance is non-positive (debt blocks all spend,
   * Q37) or when available minus existing holds is insufficient.
   */
  @Span()
  public async reserve(input: ReserveInput): Promise<ReserveResult> {
    if (this.isPgFallback()) {
      return this.reservePg(input);
    }
    const reservationId = generatePrefixedId(idPrefix.creditRes);
    const expiresAt = new Date(Date.now() + reservationTtl);
    const result = await this.runHotPath(input.userId, async () =>
      this.ledgerClient.creditReserve(
        creditsRedisKey(input.userId),
        creditsReservationRedisKey(input.userId),
        input.amountMicro.toString(),
        reservationId,
        input.inputFloorMicro.toString(),
        String(expiresAt.getTime()),
      ),
    );
    if (result[0] !== 1) {
      return { ok: false, balanceMicro: BigInt(result[1] ?? 0) };
    }
    // Durable mirror of the hold so the sweeper can settle crash orphans.
    this.outbox.enqueue({
      userId: input.userId,
      reservationInsert: {
        id: reservationId,
        reservedMicro: input.amountMicro,
        inputFloorMicro: input.inputFloorMicro,
        ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
        turnId: input.turnId,
        modelId: input.modelId,
        category: input.category,
        expiresAt,
      },
    });
    return { ok: true, reservationId };
  }

  /**
   * Settles a hold at the actual charged cost: the hold drops, top-up balance
   * is consumed first, and the remainder draws from (possibly into negative)
   * grant balance. Idempotent — a second commit of the same reservation is a
   * no-op, which makes compaction retries and sweeper races safe.
   */
  @Span()
  public async commit(input: CommitInput): Promise<{ committed: boolean; balanceMicro: bigint }> {
    if (this.isPgFallback()) {
      return this.commitPg(input);
    }
    const result = await this.runHotPath(input.userId, async () =>
      this.ledgerClient.creditCommit(
        creditsRedisKey(input.userId),
        creditsReservationRedisKey(input.userId),
        input.reservationId,
        input.actualMicro.toString(),
      ),
    );
    if (result[0] !== 1) {
      return { committed: false, balanceMicro: 0n };
    }
    const grantBalanceMicro = BigInt(result[1] ?? 0);
    const topupBalanceMicro = BigInt(result[2] ?? 0);
    const version = BigInt(result[5] ?? 0);
    this.outbox.enqueue({
      userId: input.userId,
      journalRow: {
        id: generatePrefixedId(idPrefix.creditTx),
        deltaMicro: -input.actualMicro,
        balanceAfterMicro: grantBalanceMicro + topupBalanceMicro,
        reason: input.reason ?? 'commit',
        category: input.category,
        ...(input.chatId === undefined ? {} : { chatId: input.chatId }),
        modelId: input.modelId,
        ...(input.note === undefined ? {} : { note: input.note }),
      },
      accountSnapshot: { grantBalanceMicro, topupBalanceMicro, version },
      reservationDeleteId: input.reservationId,
    });
    return { committed: true, balanceMicro: grantBalanceMicro + topupBalanceMicro };
  }

  /**
   * Fully releases a hold — Q36's only free path, reserved for calls the
   * provider rejected before any generation. Idempotent.
   */
  @Span()
  public async release(input: { reservationId: string; userId: string; reason: string }): Promise<void> {
    if (this.isPgFallback()) {
      await this.releasePg(input);
      return;
    }
    const result = await this.runHotPath(input.userId, async () =>
      this.ledgerClient.creditRelease(
        creditsRedisKey(input.userId),
        creditsReservationRedisKey(input.userId),
        input.reservationId,
      ),
    );
    if (result[0] === 1) {
      this.outbox.enqueue({ userId: input.userId, reservationDeleteId: input.reservationId });
    }
  }

  /**
   * Reservation-less debit for bounded secondary surfaces (AD14): the amount
   * is orders of magnitude below one chat model call, so the hold machinery
   * would cost more than the exposure. May drive the balance negative (Q37).
   */
  @Span()
  public async debit(input: DebitInput): Promise<{ balanceMicro: bigint }> {
    if (this.isPgFallback()) {
      return this.debitPg(input);
    }
    const result = await this.runHotPath(input.userId, async () =>
      this.ledgerClient.creditDebit(
        creditsRedisKey(input.userId),
        creditsReservationRedisKey(input.userId),
        input.amountMicro.toString(),
      ),
    );
    const grantBalanceMicro = BigInt(result[1] ?? 0);
    const topupBalanceMicro = BigInt(result[2] ?? 0);
    const version = BigInt(result[5] ?? 0);
    this.outbox.enqueue({
      userId: input.userId,
      journalRow: {
        id: generatePrefixedId(idPrefix.creditTx),
        deltaMicro: -input.amountMicro,
        balanceAfterMicro: grantBalanceMicro + topupBalanceMicro,
        reason: 'commit',
        category: input.category,
        modelId: input.modelId,
        note: input.note,
      },
      accountSnapshot: { grantBalanceMicro, topupBalanceMicro, version },
    });
    return { balanceMicro: grantBalanceMicro + topupBalanceMicro };
  }

  /**
   * Runs a hot-path Lua op, rehydrating the account hash from Postgres once
   * on the missing-hash sentinel (Redis restart/eviction, money-in DEL).
   */
  private async runHotPath(userId: string, op: () => Promise<number[]>): Promise<number[]> {
    const first = await op();
    if (first[0] !== missingAccountSentinel) {
      return first;
    }
    await this.rehydrate(userId);
    const second = await op();
    if (second[0] === missingAccountSentinel) {
      throw new Error(`Credit account for ${userId} unavailable after rehydration`);
    }
    return second;
  }

  /**
   * Rebuilds the hot hash from the durable account under the outbox's
   * per-user lock (pending write-behinds drain first — replaying a stale
   * snapshot would resurrect spent credits, review Finding 7). `reserved` is
   * recomputed inside Lua from surviving reservation entries; holds lost with
   * a full Redis flush are settled by the sweeper's Postgres-orphan pass.
   */
  private async rehydrate(userId: string): Promise<void> {
    await this.outbox.runExclusive(userId, async () => {
      const row = await this.databaseService.database.query.creditAccount.findFirst({
        where: eq(creditAccount.userId, userId),
      });
      await this.ledgerClient.creditRehydrate(
        creditsRedisKey(userId),
        creditsReservationRedisKey(userId),
        (row?.grantBalanceMicro ?? 0n).toString(),
        (row?.topupBalanceMicro ?? 0n).toString(),
      );
    });
  }

  /** Drops the hot keys so the next Redis-path operation rehydrates fresh. */
  private async dropHotKeys(userId: string): Promise<void> {
    try {
      await this.redisService.client.del(creditsRedisKey(userId), creditsReservationRedisKey(userId));
    } catch (error) {
      this.logger.warn(`Failed to drop hot keys for ${userId}: ${String(error)}`);
    }
  }

  /**
   * Locks the user's account row, creating a zero-balance row first when none
   * exists. `FOR UPDATE` on zero rows locks nothing, so without the insert two
   * first-write transactions both read zero and the conflict-update loser
   * overwrites the winner with stale absolute values. The journal's unique
   * index only defends same-key writers; this serialises different-key ones.
   */
  private async lockAccount(tx: Tx, userId: string): Promise<typeof creditAccount.$inferSelect> {
    await tx.insert(creditAccount).values({ userId }).onConflictDoNothing();
    const [row] = await tx.select().from(creditAccount).where(eq(creditAccount.userId, userId)).for('update');
    if (row === undefined) {
      // Unreachable: the insert above guarantees the row exists and commits or
      // blocks until a concurrent creator's does.
      throw new Error(`credit_account row missing for ${userId} after ensure-insert`);
    }
    return row;
  }

  private async reservePg(input: ReserveInput): Promise<ReserveResult> {
    const reservationId = generatePrefixedId(idPrefix.creditRes);
    const expiresAt = new Date(Date.now() + reservationTtl);
    const outcome = await this.databaseService.database.transaction(async (tx) => {
      const account = await this.lockAccount(tx, input.userId);
      const balance = account.grantBalanceMicro + account.topupBalanceMicro;
      if (balance <= 0n || balance - account.reservedMicro < input.amountMicro) {
        return { ok: false, balanceMicro: balance } as const;
      }
      const reservedMicro = account.reservedMicro + input.amountMicro;
      await tx
        .update(creditAccount)
        .set({ reservedMicro, version: sql`${creditAccount.version} + 1` })
        .where(eq(creditAccount.userId, input.userId));
      await tx.insert(creditReservation).values({
        id: reservationId,
        userId: input.userId,
        reservedMicro: input.amountMicro,
        inputFloorMicro: input.inputFloorMicro,
        chatId: input.chatId,
        turnId: input.turnId,
        modelId: input.modelId,
        category: input.category,
        expiresAt,
      });
      return { ok: true, reservationId } as const;
    });
    await this.dropHotKeys(input.userId);
    return outcome;
  }

  private async commitPg(input: CommitInput): Promise<{ committed: boolean; balanceMicro: bigint }> {
    const outcome = await this.databaseService.database.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.id, input.reservationId))
        .for('update');
      if (!reservation) {
        return { committed: false, balanceMicro: 0n };
      }
      await tx.delete(creditReservation).where(eq(creditReservation.id, input.reservationId));
      const account = await this.lockAccount(tx, input.userId);
      const reservedMicro = maxBigint(account.reservedMicro - reservation.reservedMicro, 0n);
      const topupDraw = minBigint(account.topupBalanceMicro, input.actualMicro);
      const grantBalanceMicro = account.grantBalanceMicro - (input.actualMicro - topupDraw);
      const topupBalanceMicro = account.topupBalanceMicro - topupDraw;
      await tx
        .update(creditAccount)
        .set({ grantBalanceMicro, topupBalanceMicro, reservedMicro, version: sql`${creditAccount.version} + 1` })
        .where(eq(creditAccount.userId, input.userId));
      await tx.insert(creditTransaction).values({
        id: generatePrefixedId(idPrefix.creditTx),
        userId: input.userId,
        deltaMicro: -input.actualMicro,
        balanceAfterMicro: grantBalanceMicro + topupBalanceMicro,
        reason: input.reason ?? 'commit',
        category: input.category,
        chatId: input.chatId,
        modelId: input.modelId,
        note: input.note,
      });
      return { committed: true, balanceMicro: grantBalanceMicro + topupBalanceMicro };
    });
    await this.dropHotKeys(input.userId);
    return outcome;
  }

  private async releasePg(input: { reservationId: string; userId: string }): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(creditReservation)
        .where(eq(creditReservation.id, input.reservationId))
        .for('update');
      if (!reservation) {
        return;
      }
      await tx.delete(creditReservation).where(eq(creditReservation.id, input.reservationId));
      const account = await this.lockAccount(tx, input.userId);
      const reservedMicro = maxBigint(account.reservedMicro - reservation.reservedMicro, 0n);
      await tx
        .update(creditAccount)
        .set({ reservedMicro, version: sql`${creditAccount.version} + 1` })
        .where(eq(creditAccount.userId, input.userId));
    });
    await this.dropHotKeys(input.userId);
  }

  private async debitPg(input: DebitInput): Promise<{ balanceMicro: bigint }> {
    const outcome = await this.databaseService.database.transaction(async (tx) => {
      const account = await this.lockAccount(tx, input.userId);
      const topupDraw = minBigint(account.topupBalanceMicro, input.amountMicro);
      const grantBalanceMicro = account.grantBalanceMicro - (input.amountMicro - topupDraw);
      const topupBalanceMicro = account.topupBalanceMicro - topupDraw;
      await tx
        .update(creditAccount)
        .set({ grantBalanceMicro, topupBalanceMicro, version: sql`${creditAccount.version} + 1` })
        .where(eq(creditAccount.userId, input.userId));
      await tx.insert(creditTransaction).values({
        id: generatePrefixedId(idPrefix.creditTx),
        userId: input.userId,
        deltaMicro: -input.amountMicro,
        balanceAfterMicro: grantBalanceMicro + topupBalanceMicro,
        reason: 'commit',
        category: input.category,
        modelId: input.modelId,
        note: input.note,
      });
      return { balanceMicro: grantBalanceMicro + topupBalanceMicro };
    });
    await this.dropHotKeys(input.userId);
    return outcome;
  }

  /**
   * Row-locked money-in transaction: lock (or create) the account, apply the
   * mutation, journal the delta, bump the write-ordering version — then drop
   * the Redis hot hash so the next hot-path operation rehydrates. Returns
   * `false` (no-op) when the `stripeEventId` was already journaled.
   */
  private async applyBalanceTransaction(input: {
    userId: string;
    reason: 'monthly_grant' | 'topup' | 'adjustment';
    stripeEventId: string;
    note?: string;
    mutate: (account: AccountBalances) => BalanceMutation;
  }): Promise<boolean> {
    try {
      await this.databaseService.database.transaction(async (tx) => {
        const current = await this.lockAccount(tx, input.userId);
        const next = input.mutate(current);
        const deltaMicro =
          next.grantBalanceMicro - current.grantBalanceMicro + (next.topupBalanceMicro - current.topupBalanceMicro);

        const accountValues = {
          grantBalanceMicro: next.grantBalanceMicro,
          topupBalanceMicro: next.topupBalanceMicro,
          ...(next.monthlyGrantMicro === undefined ? {} : { monthlyGrantMicro: next.monthlyGrantMicro }),
          ...(next.rolloverCeilingMicro === undefined ? {} : { rolloverCeilingMicro: next.rolloverCeilingMicro }),
          ...(next.lastGrantedAt === undefined ? {} : { lastGrantedAt: next.lastGrantedAt }),
          // A fresh grant opens a new notification cycle for the 80%/95% toasts (Q26).
          ...(input.reason === 'monthly_grant' ? { notified80At: null, notified95At: null } : {}),
        };
        await tx
          .update(creditAccount)
          .set({ ...accountValues, version: sql`${creditAccount.version} + 1` })
          .where(eq(creditAccount.userId, input.userId));

        // This insert MUST stay inside the transaction with the account upsert
        // above. It is what makes concurrent same-key writers safe: the loser's
        // unique violation rolls the balance change back with it. Two writers
        // race here for real — the top-up endpoint credits inline while the
        // `payment_intent.succeeded` webhook settles the same `pi:{id}` key.
        await tx.insert(creditTransaction).values({
          id: generatePrefixedId(idPrefix.creditTx),
          userId: input.userId,
          deltaMicro,
          balanceAfterMicro: next.grantBalanceMicro + next.topupBalanceMicro,
          reason: input.reason,
          stripeEventId: input.stripeEventId,
          note: input.note,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        this.logger.log(`Ledger no-op: stripeEventId ${input.stripeEventId} already journaled (${input.reason})`);
        return false;
      }
      throw error;
    }

    // Money-in is durable; drop the hot hash so the B2 Lua ledger rehydrates.
    try {
      await this.redisService.client.del(creditsRedisKey(input.userId));
    } catch (error) {
      // The hot hash self-heals via rehydration + drift audit; never fail the grant.
      this.logger.warn(`Failed to invalidate credit hot hash for ${input.userId}: ${String(error)}`);
    }
    return true;
  }
}
