import { Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import { DatabaseService } from '#database/database.service.js';
import { RedisService } from '#redis/redis.service.js';
import { MetricsService } from '#telemetry/metrics.js';
import { creditAccount, creditReservation, creditTransaction } from '#database/schema.js';
import { CreditLedgerService } from '#api/billing/credit-ledger.service.js';
import { CreditLedgerOutbox } from '#api/billing/credit-ledger-outbox.service.js';
import type { CreditCategory } from '#api/billing/billing.constants.js';
import { creditCategories, creditsReservationRedisKey } from '#api/billing/billing.constants.js';

const asCreditCategory = (value: string): CreditCategory => {
  return (creditCategories as readonly string[]).includes(value) ? (value as CreditCategory) : 'llm';
};

/** Milliseconds. */
const sweepInterval = 60_000;
/** Milliseconds. */
const driftAuditInterval = 15 * 60_000;
/** Grace (milliseconds) beyond expiry before the Postgres-orphan pass settles a hold whose Redis entry vanished. */
const orphanGrace = 10 * 60_000;

/**
 * Periodic ledger maintenance (no scheduler dependency — unref'd intervals per
 * repo idiom):
 * - **Sweeper** (C9/Q9/Q36): expired reservation holds are settled at their
 *   captured input floor — never free-released ("start expensive turn, crash,
 *   repeat" must cost the input component).
 * - **Drift audit** (C12, launch-blocking): asserts
 *   `SUM(credit_transaction.delta) == grant + topup` per account and emits
 *   alerting gauges; accounts with in-flight outbox entries are skipped.
 */
@Injectable()
export class CreditMaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(this.constructor.name);
  private sweepTimer: NodeJS.Timeout | undefined;
  private driftTimer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly databaseService: DatabaseService,
    private readonly redisService: RedisService,
    private readonly creditLedgerService: CreditLedgerService,
    private readonly outbox: CreditLedgerOutbox,
    private readonly metricsService: MetricsService,
  ) {}

  public onModuleInit(): void {
    this.sweepTimer = setInterval(() => {
      void this.runSweepSafely();
    }, sweepInterval);
    this.sweepTimer.unref();

    this.driftTimer = setInterval(() => {
      void this.runDriftAuditSafely();
    }, driftAuditInterval);
    this.driftTimer.unref();
  }

  private async runSweepSafely(): Promise<void> {
    try {
      await this.sweepExpiredReservations();
    } catch (error) {
      this.logger.error(`Reservation sweep failed: ${String(error)}`);
    }
  }

  private async runDriftAuditSafely(): Promise<void> {
    try {
      await this.auditLedgerDrift();
    } catch (error) {
      this.logger.error(`Ledger drift audit failed: ${String(error)}`);
    }
  }

  public onModuleDestroy(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
    }
    if (this.driftTimer) {
      clearInterval(this.driftTimer);
    }
  }

  /**
   * Settles expired holds at their input floor. Two passes: live Redis
   * entries past their embedded expiry (normal crash recovery), then durable
   * reservation rows whose Redis entry vanished entirely (Redis flush) —
   * both routes go through the idempotent `commit`, so racing sweepers on
   * multiple instances are safe.
   */
  public async sweepExpiredReservations(): Promise<number> {
    const now = Date.now();
    let swept = 0;

    const expiredRows = await this.databaseService.database
      .select()
      .from(creditReservation)
      .where(lt(creditReservation.expiresAt, new Date(now)));

    for (const reservation of expiredRows) {
      // Redis-first: if the live entry still exists, commit settles both sides.
      // oxlint-disable-next-line no-await-in-loop -- sequential settlement keeps per-user ordering
      const entry = await this.redisService.client.hget(creditsReservationRedisKey(reservation.userId), reservation.id);
      const isOrphan = entry === null;
      if (isOrphan && reservation.expiresAt.getTime() > now - orphanGrace) {
        // Recently expired with no Redis entry — likely an in-flight settle; give it grace.
        continue;
      }
      if (isOrphan) {
        // Redis lost the hold (flush/restart): settle the durable row directly.
        // oxlint-disable-next-line no-await-in-loop -- sequential settlement keeps per-user ordering
        await this.settleOrphanReservation(reservation.id, reservation.userId, reservation.inputFloorMicro, {
          modelId: reservation.modelId,
          category: reservation.category,
        });
      } else {
        // oxlint-disable-next-line no-await-in-loop -- sequential settlement keeps per-user ordering
        await this.creditLedgerService.commit({
          reservationId: reservation.id,
          userId: reservation.userId,
          actualMicro: reservation.inputFloorMicro,
          modelId: reservation.modelId,
          category: asCreditCategory(reservation.category),
          note: 'sweep-expired-floor',
          reason: 'sweep_floor',
        });
      }
      swept += 1;
    }

    if (swept > 0) {
      this.metricsService.billingReservationSweeps.add(swept);
      this.logger.warn(`Swept ${swept} expired credit reservation(s) at their input floor`);
    }
    return swept;
  }

  /**
   * C12 invariant audit with alerting gauges. Non-zero drift means the
   * accepted crash window actually fired (or a bug) — the runbook treats it
   * as a page, not a log line.
   */
  public async auditLedgerDrift(): Promise<{ maxDriftMicro: bigint; driftedAccounts: number }> {
    const rows = await this.databaseService.database
      .select({
        userId: creditAccount.userId,
        grantBalanceMicro: creditAccount.grantBalanceMicro,
        topupBalanceMicro: creditAccount.topupBalanceMicro,
        journalSum: sql<string>`coalesce((select sum(${creditTransaction.deltaMicro}) from ${creditTransaction} where ${creditTransaction.userId} = ${creditAccount.userId}), 0)`,
      })
      .from(creditAccount);

    let maxDriftMicro = 0n;
    let driftedAccounts = 0;
    let negativeAccounts = 0;
    for (const row of rows) {
      if (this.outbox.pendingCount(row.userId) > 0) {
        continue;
      }
      const balance = row.grantBalanceMicro + row.topupBalanceMicro;
      if (balance < 0n) {
        negativeAccounts += 1;
      }
      const drift = BigInt(row.journalSum) - balance;
      const absoluteDrift = drift < 0n ? -drift : drift;
      if (absoluteDrift > 0n) {
        driftedAccounts += 1;
        this.logger.error(`Ledger drift for ${row.userId}: journal-balance delta ${drift} µ$`);
        if (absoluteDrift > maxDriftMicro) {
          maxDriftMicro = absoluteDrift;
        }
      }
    }

    this.metricsService.billingLedgerDrift.record(Number(maxDriftMicro));
    this.metricsService.billingDriftedAccounts.record(driftedAccounts);
    this.metricsService.billingNegativeBalanceAccounts.record(negativeAccounts);
    return { maxDriftMicro, driftedAccounts };
  }

  /**
   * Settles a durable reservation row whose Redis-side hold no longer exists:
   * journals the floor as a sweep and releases the held amount from the
   * materialised account in one transaction.
   */
  private async settleOrphanReservation(
    reservationId: string,
    userId: string,
    floorMicro: bigint,
    context: { modelId: string; category: string },
  ): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(creditReservation)
        .where(and(eq(creditReservation.id, reservationId), eq(creditReservation.userId, userId)))
        .for('update');
      if (!reservation) {
        return;
      }
      await tx.delete(creditReservation).where(eq(creditReservation.id, reservationId));
      const [account] = await tx.select().from(creditAccount).where(eq(creditAccount.userId, userId)).for('update');
      const current = account ?? {
        grantBalanceMicro: 0n,
        topupBalanceMicro: 0n,
        reservedMicro: 0n,
      };
      const topupDraw = current.topupBalanceMicro < floorMicro ? current.topupBalanceMicro : floorMicro;
      const grantBalanceMicro = current.grantBalanceMicro - (floorMicro - topupDraw);
      const topupBalanceMicro = current.topupBalanceMicro - topupDraw;
      const heldRelease = current.reservedMicro - reservation.reservedMicro;
      const reservedMicro = heldRelease < 0n ? 0n : heldRelease;
      await tx
        .insert(creditAccount)
        .values({ userId, grantBalanceMicro, topupBalanceMicro, reservedMicro, version: 1n })
        .onConflictDoUpdate({
          target: creditAccount.userId,
          set: { grantBalanceMicro, topupBalanceMicro, reservedMicro, version: sql`${creditAccount.version} + 1` },
        });
      await tx.insert(creditTransaction).values({
        id: generatePrefixedId(idPrefix.creditTx),
        userId,
        deltaMicro: -floorMicro,
        balanceAfterMicro: grantBalanceMicro + topupBalanceMicro,
        reason: 'sweep_floor',
        category: context.category,
        modelId: context.modelId,
        note: 'sweep-orphan-floor',
      });
    });
  }
}
