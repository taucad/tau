import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { agentEvidenceOutbox, agentEvidenceReceipt } from '#database/schema.js';
import { stricterProtection } from '#api/agent-observability/evidence-admission.js';
import type { SourceProtection } from '#api/agent-observability/evidence-admission.js';

/** A backlog row leased to one worker, with the receipt facts delivery needs. */
export type LeasedDelivery = Readonly<
  Pick<
    typeof agentEvidenceOutbox.$inferSelect,
    'receiptId' | 'payload' | 'attempts' | 'traceId' | 'observedAt' | 'sentAt' | 'expiresAt'
  > &
    Pick<typeof agentEvidenceReceipt.$inferSelect, 'principalId' | 'projectId' | 'plane'> & {
      /** The strictest server-recorded protection across the receipt's lineage. */
      protection: SourceProtection;
    }
>;

/** The lease one settlement is fenced on. */
export type DeliveryLease = Readonly<{ receiptId: string; owner: string }>;

/**
 * How a leased row settles. `sent` drops the payload: an accepted or uncertain
 * send is never resent (T02 attempts 2–4), so nothing needs the bytes again,
 * and only a read of the identity {@link prepareSend} recorded can settle it.
 */
export type DeliverySettlement =
  | Readonly<{ kind: 'sent'; reason: string }>
  | Readonly<{ kind: 'retry'; reason: string; notBefore: Date }>
  | Readonly<{ kind: 'confirmed' }>
  | Readonly<{ kind: 'recheck'; notBefore: Date }>
  | Readonly<{ kind: 'rejected' | 'expired'; reason: string }>;

type LeaseInput = Readonly<{ owner: string; leaseMilliseconds: number; limit: number; now: Date }>;

const strictest = (lineage: typeof agentEvidenceReceipt.$inferSelect.lineage): SourceProtection => {
  let protection: SourceProtection = 'free';
  for (const item of lineage) {
    protection = stricterProtection(protection, item.protection);
  }
  return protection;
};

const lease = async (
  database: Database,
  state: 'pending' | 'uncertain',
  { owner, leaseMilliseconds, limit, now }: LeaseInput,
): Promise<LeasedDelivery[]> =>
  database.transaction(async (transaction) => {
    const due = await transaction
      .select({ receiptId: agentEvidenceOutbox.receiptId })
      .from(agentEvidenceOutbox)
      .where(
        and(
          eq(agentEvidenceOutbox.state, state),
          gt(agentEvidenceOutbox.expiresAt, now),
          or(isNull(agentEvidenceOutbox.leaseExpiresAt), lte(agentEvidenceOutbox.leaseExpiresAt, now)),
        ),
      )
      .orderBy(asc(agentEvidenceOutbox.leaseExpiresAt), asc(agentEvidenceOutbox.createdAt))
      .limit(limit)
      .for('update', { skipLocked: true });
    if (due.length === 0) {
      return [];
    }
    const leased = await transaction
      .update(agentEvidenceOutbox)
      .set({
        ...(state === 'pending'
          ? { state: 'sending', attempts: sql`${agentEvidenceOutbox.attempts} + 1`, sentAt: now }
          : {}),
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      })
      .where(
        inArray(
          agentEvidenceOutbox.receiptId,
          due.map((row) => row.receiptId),
        ),
      )
      .returning();
    const receipts = await transaction
      .select()
      .from(agentEvidenceReceipt)
      .where(
        inArray(
          agentEvidenceReceipt.id,
          leased.map((row) => row.receiptId),
        ),
      );
    const byId = new Map(receipts.map((receipt) => [receipt.id, receipt]));
    return leased.flatMap((row) => {
      const receipt = byId.get(row.receiptId);
      return receipt === undefined
        ? []
        : [
            {
              receiptId: row.receiptId,
              principalId: receipt.principalId,
              projectId: receipt.projectId,
              plane: receipt.plane,
              protection: strictest(receipt.lineage),
              payload: row.payload,
              attempts: row.attempts,
              traceId: row.traceId,
              observedAt: row.observedAt,
              sentAt: row.sentAt,
              expiresAt: row.expiresAt,
            },
          ];
    });
  });

/**
 * Lease pending rows for sending. The lease is committed before any vendor
 * call, so no transaction is held open across the network.
 *
 * @param database - The API database.
 * @param input - The lease owner, duration, batch size and clock.
 * @returns The leased rows, oldest due first.
 */
export const leasePending = async (database: Database, input: LeaseInput): Promise<LeasedDelivery[]> =>
  lease(database, 'pending', input);

/**
 * Lease uncertain rows that are due a reconciliation read.
 *
 * @param database - The API database.
 * @param input - The lease owner, duration, batch size and clock.
 * @returns The leased rows.
 */
export const leaseUncertain = async (database: Database, input: LeaseInput): Promise<LeasedDelivery[]> =>
  lease(database, 'uncertain', input);

/**
 * Record the observation's identity before its send begins, so a worker that
 * dies mid-send leaves a row the reconciler can still read for.
 *
 * @param database - The API database.
 * @param lease - The leased row and its owner.
 * @param identity - The trace id and the observation's start time.
 * @returns Whether this worker still holds the lease; send nothing otherwise.
 */
export const prepareSend = async (
  database: Database,
  { receiptId, owner }: DeliveryLease,
  identity: Readonly<{ traceId: string; observedAt: Date }>,
): Promise<boolean> => {
  const rows = await database
    .update(agentEvidenceOutbox)
    .set(identity)
    .where(
      and(
        eq(agentEvidenceOutbox.receiptId, receiptId),
        eq(agentEvidenceOutbox.leaseOwner, owner),
        eq(agentEvidenceOutbox.state, 'sending'),
      ),
    )
    .returning({ receiptId: agentEvidenceOutbox.receiptId });
  return rows.length > 0;
};

/**
 * Settle a leased row. The update is fenced on the lease owner, so a worker
 * whose lease was recovered by another cannot overwrite the newer outcome.
 *
 * @param database - The API database.
 * @param lease - The row and the owner that claimed it.
 * @param settlement - What the attempt established.
 * @returns Whether this worker still held the lease.
 */
export const settleDelivery = async (
  database: Database,
  { receiptId, owner }: DeliveryLease,
  settlement: DeliverySettlement,
): Promise<boolean> => {
  const released = { leaseOwner: null };
  const values = ((): Partial<typeof agentEvidenceOutbox.$inferInsert> => {
    switch (settlement.kind) {
      case 'sent': {
        return {
          ...released,
          state: 'uncertain',
          payload: null,
          reason: settlement.reason,
          leaseExpiresAt: null,
        };
      }
      case 'retry': {
        /* Nothing reached ingestion, so the recorded identity names no send. */
        return {
          ...released,
          state: 'pending',
          traceId: null,
          observedAt: null,
          reason: settlement.reason,
          leaseExpiresAt: settlement.notBefore,
        };
      }
      case 'confirmed': {
        return { ...released, state: 'confirmed', payload: null, reason: null, leaseExpiresAt: null };
      }
      case 'recheck': {
        return { ...released, leaseExpiresAt: settlement.notBefore };
      }
      case 'rejected':
      case 'expired': {
        return { ...released, state: settlement.kind, payload: null, reason: settlement.reason, leaseExpiresAt: null };
      }
    }
  })();
  const rows = await database
    .update(agentEvidenceOutbox)
    .set(values)
    .where(
      and(
        eq(agentEvidenceOutbox.receiptId, receiptId),
        eq(agentEvidenceOutbox.leaseOwner, owner),
        inArray(agentEvidenceOutbox.state, ['sending', 'uncertain']),
      ),
    )
    .returning({ receiptId: agentEvidenceOutbox.receiptId });
  return rows.length > 0;
};

/**
 * Purge every unsettled row past its retention. Delivery and the lifecycle
 * pass both run it, so retention holds while delivery is switched off (T13).
 *
 * @param database - The API database.
 * @param now - The clock.
 * @returns How many rows expired.
 */
export const expireBacklog = async (database: Database, now: Date): Promise<number> => {
  const expired = await database
    .update(agentEvidenceOutbox)
    .set({ state: 'expired', payload: null, reason: 'retention', leaseOwner: null, leaseExpiresAt: null })
    .where(
      and(
        inArray(agentEvidenceOutbox.state, ['pending', 'sending', 'uncertain']),
        lte(agentEvidenceOutbox.expiresAt, now),
      ),
    )
    .returning({ receiptId: agentEvidenceOutbox.receiptId });
  return expired.length;
};

/**
 * Sweep the backlog: purge every row past its retention, and settle a send
 * whose lease ran out. A worker that died after recording the identity may
 * have been applied, so that row is reconciled, never resent; one that died
 * before goes back to pending.
 *
 * @param database - The API database.
 * @param now - The clock.
 * @returns How many rows expired and how many abandoned sends were recovered.
 */
export const sweepBacklog = async (
  database: Database,
  now: Date,
): Promise<Readonly<{ expired: number; abandoned: number }>> => {
  const expired = await expireBacklog(database, now);
  const lapsed = and(eq(agentEvidenceOutbox.state, 'sending'), lte(agentEvidenceOutbox.leaseExpiresAt, now));
  /* No identity was recorded, so no send began: it is safe to send again. */
  const unsent = await database
    .update(agentEvidenceOutbox)
    .set({ state: 'pending', reason: 'abandoned', leaseOwner: null, leaseExpiresAt: null })
    .where(and(lapsed, isNull(agentEvidenceOutbox.traceId)))
    .returning({ receiptId: agentEvidenceOutbox.receiptId });
  const abandoned = await database
    .update(agentEvidenceOutbox)
    .set({ state: 'uncertain', payload: null, reason: 'abandoned', leaseOwner: null, leaseExpiresAt: null })
    .where(and(lapsed, isNotNull(agentEvidenceOutbox.traceId)))
    .returning({ receiptId: agentEvidenceOutbox.receiptId });
  return { expired, abandoned: abandoned.length + unsent.length };
};

/**
 * Rows by state, for the delivery gauges. Counts only; no identifiers.
 *
 * @param database - The API database.
 * @returns The count per state and the bytes still held.
 */
export const backlogCounts = async (
  database: Database,
): Promise<Readonly<{ states: Readonly<Record<string, number>>; heldBytes: number }>> => {
  const rows = await database
    .select({
      state: agentEvidenceOutbox.state,
      count: sql<string>`count(*)`,
      bytes: sql<string>`coalesce(sum(${agentEvidenceOutbox.payloadBytes}) filter (where ${agentEvidenceOutbox.payload} is not null), 0)`,
    })
    .from(agentEvidenceOutbox)
    .groupBy(agentEvidenceOutbox.state);
  return {
    states: Object.fromEntries(rows.map((row) => [row.state, Number(row.count)])),
    heldBytes: rows.reduce((total, row) => total + Number(row.bytes), 0),
  };
};
