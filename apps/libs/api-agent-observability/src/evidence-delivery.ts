import { and, asc, eq, gt, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { Database } from '@taucad/api-database/owner-lock';
import { agentEvidenceOutbox, agentEvidenceReceipt } from '@taucad/api-database/schema';
import { stricterProtection } from '#evidence-admission.js';
import type { SourceProtection } from '#evidence-admission.js';

/** A backlog row leased to one worker, with the receipt facts delivery needs. */
export type LeasedDelivery = Readonly<
  Pick<
    typeof agentEvidenceOutbox.$inferSelect,
    'receiptId' | 'payload' | 'attempts' | 'traceId' | 'objectId' | 'observedAt' | 'sentAt' | 'expiresAt' | 'createdAt'
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
  | Readonly<{ kind: 'rejected' | 'expired'; reason: string }>
  /**
   * Not sent yet, and not a failed attempt: a generation waits for its call's settlement, or a settlement for its
   * generation (LW4, rule 8). Nothing was sent, so the row is pending again and its attempt is not counted.
   */
  | Readonly<{ kind: 'hold'; reason: 'settlement' | 'generation'; notBefore: Date }>
  /**
   * The receipt writes nothing: another receipt writes its Langfuse object, or it maps to none (LD12); a settlement's
   * values went in its generation's send (`merged`), or its generation went without them (`late`, LW4).
   */
  | Readonly<{ kind: 'superseded'; reason: 'object' | 'no-object' | 'merged' | 'late' }>;

type LeaseInput = Readonly<{ owner: string; leaseMilliseconds: number; limit: number; now: Date }>;

const strictest = (lineage: typeof agentEvidenceReceipt.$inferSelect.lineage): SourceProtection => {
  let protection: SourceProtection = 'free';
  for (const item of lineage) {
    protection = stricterProtection(protection, item.protection);
  }
  return protection;
};

const leasedOf = (
  row: typeof agentEvidenceOutbox.$inferSelect,
  receipt: typeof agentEvidenceReceipt.$inferSelect,
): LeasedDelivery => ({
  receiptId: row.receiptId,
  principalId: receipt.principalId,
  projectId: receipt.projectId,
  plane: receipt.plane,
  protection: strictest(receipt.lineage),
  payload: row.payload,
  attempts: row.attempts,
  traceId: row.traceId,
  objectId: row.objectId,
  observedAt: row.observedAt,
  sentAt: row.sentAt,
  expiresAt: row.expiresAt,
  createdAt: row.createdAt,
});

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
      return receipt === undefined ? [] : [leasedOf(row, receipt)];
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

/** Whether an error is the outbox's one-object-one-receipt constraint refusing a second claim. */
const claimsTakenObject = (error: unknown): boolean => {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth++) {
    if (
      Reflect.get(current, 'code') === '23505' &&
      Reflect.get(current, 'constraint_name') === 'agent_evidence_outbox_object_idx'
    ) {
      return true;
    }
    current = Reflect.get(current, 'cause');
  }
  return false;
};

/**
 * Record the observation's identity before its send begins, so a worker that
 * dies mid-send leaves a row the reconciler can still read for. The object id
 * is unique across the outbox: a receipt whose Langfuse object another
 * receipt already claimed is answered `taken` and must settle `superseded`.
 *
 * @param database - The API database.
 * @param lease - The leased row and its owner.
 * @param identity - The trace id, the object (span) id and the observation's start time.
 * @returns `claimed` when this worker may send, `taken` when another receipt writes the object, `lost` when the lease lapsed.
 */
export const prepareSend = async (
  database: Database,
  { receiptId, owner }: DeliveryLease,
  identity: Readonly<{ traceId: string; objectId: string; observedAt: Date }>,
): Promise<'claimed' | 'taken' | 'lost'> => {
  try {
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
    return rows.length > 0 ? 'claimed' : 'lost';
  } catch (error) {
    if (claimsTakenObject(error)) {
      return 'taken';
    }
    throw error;
  }
};

/** The receipts of one fact, by account, project and semantic key: a call's generation, or its settlement. */
export type FactKey = Readonly<{ principalId: string; projectId: string; semanticKey: string }>;

const receiptsOf = (key: FactKey) =>
  and(
    eq(agentEvidenceReceipt.principalId, key.principalId),
    eq(agentEvidenceReceipt.projectId, key.projectId),
    eq(agentEvidenceReceipt.semanticKey, key.semanticKey),
  );

/**
 * Lease a call's settlement for its generation's send (LW4, rule 8). Only a pending settlement is taken, whether or
 * not it is due, so the generation carries its values and settles it once that send is made.
 *
 * @param database - The API database.
 * @param key - The settlement's account, project and semantic key, as the generation derives them.
 * @param input - The lease owner, duration and clock; the batch size is not used.
 * @returns The taken row; `busy` while another worker holds it; `none` when no settlement waits.
 */
export const takeSettlement = async (
  database: Database,
  key: FactKey,
  { owner, leaseMilliseconds, now }: Omit<LeaseInput, 'limit'>,
): Promise<Readonly<{ kind: 'taken'; row: LeasedDelivery }> | Readonly<{ kind: 'busy' | 'none' }>> => {
  const waiting = await database
    .select({ receipt: agentEvidenceReceipt, state: agentEvidenceOutbox.state })
    .from(agentEvidenceReceipt)
    .innerJoin(agentEvidenceOutbox, eq(agentEvidenceOutbox.receiptId, agentEvidenceReceipt.id))
    .where(and(receiptsOf(key), inArray(agentEvidenceOutbox.state, ['pending', 'sending'])));
  for (const { receipt, state } of waiting) {
    if (state !== 'pending') {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- a call has one settlement; a second is tried only if the first raced
    const [taken] = await database
      .update(agentEvidenceOutbox)
      .set({
        state: 'sending',
        attempts: sql`${agentEvidenceOutbox.attempts} + 1`,
        sentAt: now,
        leaseOwner: owner,
        leaseExpiresAt: new Date(now.getTime() + leaseMilliseconds),
      })
      .where(and(eq(agentEvidenceOutbox.receiptId, receipt.id), eq(agentEvidenceOutbox.state, 'pending')))
      .returning();
    if (taken !== undefined) {
      return { kind: 'taken', row: leasedOf(taken, receipt) };
    }
  }
  return { kind: waiting.length === 0 ? 'none' : 'busy' };
};

/**
 * Whether a settlement's generation is still to be sent (LW4, rule 8): `pending` while any receipt of it is pending
 * or sending, `gone` once every receipt of it has settled, `none` before one is admitted.
 *
 * @param database - The API database.
 * @param key - The generation's account, project and semantic key, as the settlement derives them.
 * @returns Where the generation is.
 */
export const generationState = async (database: Database, key: FactKey): Promise<'pending' | 'gone' | 'none'> => {
  const rows = await database
    .select({ state: agentEvidenceOutbox.state })
    .from(agentEvidenceReceipt)
    .innerJoin(agentEvidenceOutbox, eq(agentEvidenceOutbox.receiptId, agentEvidenceReceipt.id))
    .where(receiptsOf(key));
  if (rows.length === 0) {
    return 'none';
  }
  return rows.some((row) => row.state === 'pending' || row.state === 'sending') ? 'pending' : 'gone';
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
  const values = ((): PgUpdateSetSource<typeof agentEvidenceOutbox> => {
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
          objectId: null,
          observedAt: null,
          reason: settlement.reason,
          leaseExpiresAt: settlement.notBefore,
        };
      }
      case 'hold': {
        return {
          ...released,
          state: 'pending',
          attempts: sql`greatest(${agentEvidenceOutbox.attempts} - 1, 0)`,
          traceId: null,
          objectId: null,
          observedAt: null,
          reason: 'held',
          leaseExpiresAt: settlement.notBefore,
        };
      }
      case 'confirmed': {
        return { ...released, state: 'confirmed', payload: null, reason: null, leaseExpiresAt: null };
      }
      case 'recheck': {
        return { ...released, leaseExpiresAt: settlement.notBefore };
      }
      case 'rejected': {
        /* Refused for good, so nothing was stored: a later projection of the fact may write the object. */
        return {
          ...released,
          state: 'rejected',
          payload: null,
          objectId: null,
          reason: settlement.reason,
          leaseExpiresAt: null,
        };
      }
      case 'expired': {
        return { ...released, state: 'expired', payload: null, reason: settlement.reason, leaseExpiresAt: null };
      }
      case 'superseded': {
        return {
          ...released,
          state: 'superseded',
          payload: null,
          traceId: null,
          objectId: null,
          observedAt: null,
          reason: settlement.reason,
          leaseExpiresAt: null,
        };
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
