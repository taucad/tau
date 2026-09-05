import { Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DatabaseService } from '#database/database.service.js';
import { creditAccount, creditReservation, creditTransaction } from '#database/schema.js';

/**
 * Post-operation account snapshot from Redis (the source of truth while
 * healthy). `version` is the Lua-issued monotonic counter — the flush only
 * applies snapshots newer than the stored row (last-writer-wins by version).
 */
export type AccountSnapshot = {
  grantBalanceMicro: bigint;
  topupBalanceMicro: bigint;
  version: bigint;
};

export type OutboxEntry = {
  userId: string;
  journalRow?: {
    id: string;
    deltaMicro: bigint;
    balanceAfterMicro: bigint;
    reason: 'commit' | 'sweep_floor' | 'adjustment';
    category?: string;
    chatId?: string;
    modelId?: string;
    note?: string;
  };
  accountSnapshot?: AccountSnapshot;
  reservationInsert?: {
    id: string;
    reservedMicro: bigint;
    inputFloorMicro: bigint;
    chatId?: string;
    turnId: string;
    modelId: string;
    category: string;
    expiresAt: Date;
  };
  reservationDeleteId?: string;
};

const maxFlushAttempts = 5;
/** Milliseconds. */
const retryBackoff = 250;

/**
 * In-process, at-least-once write-behind journal for the Redis hot path
 * (credits doc Finding 5 reconciliation protocol). Entries chain per user —
 * the same chain serialises rehydration against in-flight flushes, excluding
 * the replay/flush double-count race. A crash loses at most the un-flushed
 * tail of one user's in-flight turn (reservation-TTL bounded, favours the
 * user); the drift audit is the alarm for that accepted window.
 */
@Injectable()
export class CreditLedgerOutbox {
  private readonly logger = new Logger(this.constructor.name);
  private readonly chains = new Map<string, Promise<void>>();
  private readonly pendingCounts = new Map<string, number>();

  public constructor(private readonly databaseService: DatabaseService) {}

  /** Number of enqueued-but-unflushed entries for a user (drift-audit skip signal). */
  public pendingCount(userId: string): number {
    return this.pendingCounts.get(userId) ?? 0;
  }

  /**
   * Enqueues an entry onto the user's flush chain. Fire-and-forget for the
   * hot path — retries with backoff inside the chain; a permanently failing
   * entry is logged loudly and surfaced via the drift audit.
   */
  public enqueue(entry: OutboxEntry): void {
    this.pendingCounts.set(entry.userId, this.pendingCount(entry.userId) + 1);
    const previous = this.chains.get(entry.userId) ?? Promise.resolve();
    this.chains.set(entry.userId, this.runAfter(previous, entry));
  }

  /** Chain link: waits for the predecessor, then flushes; never rejects. */
  private async runAfter(previous: Promise<void>, entry: OutboxEntry): Promise<void> {
    await previous;
    try {
      await this.flushWithRetry(entry);
    } catch (error) {
      this.logger.error(`Outbox entry permanently failed for ${entry.userId}: ${String(error)}`);
    } finally {
      this.pendingCounts.set(entry.userId, Math.max(this.pendingCount(entry.userId) - 1, 0));
    }
  }

  /**
   * Runs `task` after the user's pending entries have drained, blocking new
   * flushes until it settles — the rehydration lock.
   */
  public async runExclusive<T>(userId: string, task: () => Promise<T>): Promise<T> {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chains.get(userId) ?? Promise.resolve();
    this.chains.set(userId, this.sequence(previous, gate));
    try {
      await previous;
      return await task();
    } finally {
      release();
    }
  }

  /** Neither promise ever rejects (see the chain construction sites). */
  private async sequence(previous: Promise<void>, gate: Promise<void>): Promise<void> {
    await previous;
    await gate;
  }

  private async flushWithRetry(entry: OutboxEntry): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- retry attempts are inherently sequential
        await this.flush(entry);
        return;
      } catch (error) {
        if (attempt >= maxFlushAttempts) {
          throw error;
        }
        this.logger.warn(`Outbox flush attempt ${attempt} failed for ${entry.userId}: ${String(error)}`);
        // oxlint-disable-next-line no-await-in-loop -- sequential backoff between retries
        await new Promise((resolve) => {
          setTimeout(resolve, retryBackoff * attempt);
        });
      }
    }
  }

  private async flush(entry: OutboxEntry): Promise<void> {
    await this.databaseService.database.transaction(async (tx) => {
      if (entry.journalRow) {
        await tx
          .insert(creditTransaction)
          .values({ userId: entry.userId, ...entry.journalRow })
          .onConflictDoNothing({ target: creditTransaction.id });
      }
      if (entry.accountSnapshot) {
        const snapshot = entry.accountSnapshot;
        await tx
          .insert(creditAccount)
          .values({
            userId: entry.userId,
            grantBalanceMicro: snapshot.grantBalanceMicro,
            topupBalanceMicro: snapshot.topupBalanceMicro,
            version: snapshot.version,
          })
          .onConflictDoUpdate({
            target: creditAccount.userId,
            set: {
              grantBalanceMicro: snapshot.grantBalanceMicro,
              topupBalanceMicro: snapshot.topupBalanceMicro,
              version: snapshot.version,
            },
            setWhere: sql`${creditAccount.version} < ${snapshot.version}`,
          });
      }
      if (entry.reservationInsert) {
        await tx
          .insert(creditReservation)
          .values({ userId: entry.userId, ...entry.reservationInsert })
          .onConflictDoNothing({ target: creditReservation.id });
      }
      if (entry.reservationDeleteId !== undefined) {
        await tx.delete(creditReservation).where(eq(creditReservation.id, entry.reservationDeleteId));
      }
    });
  }
}
