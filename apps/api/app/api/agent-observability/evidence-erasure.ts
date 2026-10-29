import { randomUUID } from 'node:crypto';
import { and, asc, eq, inArray, isNotNull, isNull, lte, notExists, or, sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { Database, OwnerLockTransaction } from '#database/owner-lock.js';
import { lockProjectLifecycle } from '#database/project-lifecycle.js';
import {
  agentEvidenceErasure,
  agentEvidenceErasureTrace,
  agentEvidenceOutbox,
  agentEvidenceReceipt,
  project,
} from '#database/schema.js';

/*
 * Erasure of delivered agent evidence (blueprint T13).
 *
 * Deleting an account or a project has to remove what Tau sent to Langfuse,
 * and afterwards nothing says what that was: the account cascade takes the
 * receipts with it, and a project's receipts name traces only through rows
 * that are about to expire. So the erasure is admitted first. In one
 * transaction it records the subject, stops every send that has not reached
 * the vendor, and copies every trace id a send may have written. The journal
 * has no foreign key to the subject, so the cascade that follows cannot take
 * it, and a drainer deletes and then reads back each trace.
 *
 * Admission and erasure serialize on one lock per subject: the project
 * lifecycle lock evidence admission already takes, and a per-account lock it
 * takes beside it. Neither sees the other half-done, so no receipt is
 * admitted under an erased subject and no trace is written that the journal
 * does not name.
 */

/** Whose evidence an erasure covers. */
export type ErasureSubject = Readonly<{ scope: 'account' | 'project'; subjectId: string }>;

/** What admitting an erasure did. */
export type ErasureAdmission = Readonly<{ erasureId: string; fenced: number; traces: number }>;

/**
 * Serialize evidence admission and an account's erasure. A separate key space
 * from the owner and project locks (seed 0) and the per-source lock (seed 1);
 * admission takes it after both.
 *
 * @param transaction - The transaction to hold it in.
 * @param principalId - The account.
 */
export const lockEvidencePrincipal = async (transaction: OwnerLockTransaction, principalId: string): Promise<void> => {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`agent-evidence:${principalId}`}, 2))`);
};

const receiptsOf = (transaction: OwnerLockTransaction, subject: ErasureSubject) =>
  transaction
    .select({ id: agentEvidenceReceipt.id })
    .from(agentEvidenceReceipt)
    .where(
      subject.scope === 'account'
        ? eq(agentEvidenceReceipt.principalId, subject.subjectId)
        : eq(agentEvidenceReceipt.projectId, subject.subjectId),
    );

/**
 * Admit an erasure inside the caller's transaction. Idempotent per subject: a
 * repeat reopens it only if it finds traces the journal did not yet name.
 *
 * @param transaction - The caller's transaction; project deletion's own, or one of {@link eraseAccountEvidence}'s.
 * @param subject - The account or project.
 * @returns The erasure, how many unsent rows it stopped and how many traces it named.
 */
export const admitEvidenceErasure = async (
  transaction: OwnerLockTransaction,
  subject: ErasureSubject,
): Promise<ErasureAdmission> => {
  await (subject.scope === 'account'
    ? lockEvidencePrincipal(transaction, subject.subjectId)
    : lockProjectLifecycle(transaction, subject.subjectId));
  await transaction
    .insert(agentEvidenceErasure)
    .values({ id: `eve_${randomUUID()}`, scope: subject.scope, subjectId: subject.subjectId })
    .onConflictDoNothing();
  const [erasure] = await transaction
    .select({ id: agentEvidenceErasure.id })
    .from(agentEvidenceErasure)
    .where(and(eq(agentEvidenceErasure.scope, subject.scope), eq(agentEvidenceErasure.subjectId, subject.subjectId)));
  const erasureId = erasure!.id;
  /* Row locks order this against `prepareSend`: a send that recorded its trace first is copied below, and one that comes after finds its row stopped. */
  const fenced = await transaction
    .update(agentEvidenceOutbox)
    .set({ state: 'expired', payload: null, reason: 'erased', leaseOwner: null, leaseExpiresAt: null })
    .where(
      and(
        inArray(agentEvidenceOutbox.receiptId, receiptsOf(transaction, subject)),
        inArray(agentEvidenceOutbox.state, ['pending', 'sending', 'uncertain']),
      ),
    )
    .returning({ receiptId: agentEvidenceOutbox.receiptId });
  const named = await transaction
    .insert(agentEvidenceErasureTrace)
    .select(
      transaction
        .selectDistinct({
          erasureId: sql<string>`${erasureId}`.as('erasure_id'),
          traceId: sql<string>`${agentEvidenceOutbox.traceId}`.as('trace_id'),
          state: sql<'pending'>`'pending'`.as('state'),
          attempts: sql<number>`0`.as('attempts'),
          leaseOwner: sql`null`.as('lease_owner'),
          dueAt: sql<Date>`now()`.as('due_at'),
          requestedAt: sql`null::timestamptz`.as('requested_at'),
          reason: sql`null`.as('reason'),
        })
        .from(agentEvidenceOutbox)
        .where(
          and(
            inArray(agentEvidenceOutbox.receiptId, receiptsOf(transaction, subject)),
            isNotNull(agentEvidenceOutbox.traceId),
          ),
        ),
    )
    .onConflictDoNothing()
    .returning({ traceId: agentEvidenceErasureTrace.traceId });
  if (named.length > 0) {
    await transaction
      .update(agentEvidenceErasure)
      .set({ completedAt: null })
      .where(eq(agentEvidenceErasure.id, erasureId));
  }
  return { erasureId, fenced: fenced.length, traces: named.length };
};

/**
 * Erase an account's evidence before the account is deleted: every project it
 * owns, which the account cascade deletes with everyone's evidence in it, and
 * then everything the account itself reported. Each subject commits in its
 * own transaction, so no transaction holds two subject locks.
 *
 * @param database - The API database.
 * @param accountId - The account being deleted.
 * @returns How many unsent rows were stopped and how many traces were named.
 */
export const eraseAccountEvidence = async (
  database: Database,
  accountId: string,
): Promise<Readonly<{ fenced: number; traces: number }>> => {
  const owned = await database.select({ id: project.id }).from(project).where(eq(project.ownerId, accountId));
  const subjects: ErasureSubject[] = [
    ...owned.map((row): ErasureSubject => ({ scope: 'project', subjectId: row.id })),
    { scope: 'account', subjectId: accountId },
  ];
  let fenced = 0;
  let traces = 0;
  for (const subject of subjects) {
    // oxlint-disable-next-line no-await-in-loop -- one subject lock per transaction, in order
    const admitted = await database.transaction(async (transaction) => admitEvidenceErasure(transaction, subject));
    fenced += admitted.fenced;
    traces += admitted.traces;
  }
  return { fenced, traces };
};

/**
 * Whether evidence for this account and project may no longer be admitted or
 * sent. Read under the subject locks, it is a fence; read without them, a hint.
 *
 * @param database - The API database or a transaction.
 * @param scope - The account and project.
 * @returns Whether either is erased.
 */
export const readEvidenceErasure = async (
  database: Pick<Database, 'select'>,
  scope: Readonly<{ principalId: string; projectId: string }>,
): Promise<boolean> => {
  const [row] = await database
    .select({ id: agentEvidenceErasure.id })
    .from(agentEvidenceErasure)
    .where(
      or(
        and(eq(agentEvidenceErasure.scope, 'account'), eq(agentEvidenceErasure.subjectId, scope.principalId)),
        and(eq(agentEvidenceErasure.scope, 'project'), eq(agentEvidenceErasure.subjectId, scope.projectId)),
      ),
    )
    .limit(1);
  return row !== undefined;
};

/** A journal trace leased to one worker. */
export type LeasedErasureTrace = Readonly<
  Pick<typeof agentEvidenceErasureTrace.$inferSelect, 'erasureId' | 'traceId' | 'state' | 'attempts' | 'requestedAt'>
>;

/** How a leased trace settles. */
export type ErasureSettlement =
  | Readonly<{ kind: 'requested'; recheckAt: Date }>
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'retry'; reason: string; notBefore: Date }>;

/**
 * Lease due traces: `pending` ones to delete, or `requested` ones to read back.
 *
 * @param database - The API database.
 * @param input - The state, lease owner, duration, batch size and clock.
 * @returns The leased traces, oldest due first.
 */
export const leaseErasureTraces = async (
  database: Database,
  input: Readonly<{
    state: 'pending' | 'requested';
    owner: string;
    leaseMilliseconds: number;
    limit: number;
    now: Date;
  }>,
): Promise<LeasedErasureTrace[]> =>
  database.transaction(async (transaction) => {
    const due = await transaction
      .select({ erasureId: agentEvidenceErasureTrace.erasureId, traceId: agentEvidenceErasureTrace.traceId })
      .from(agentEvidenceErasureTrace)
      .where(and(eq(agentEvidenceErasureTrace.state, input.state), lte(agentEvidenceErasureTrace.dueAt, input.now)))
      .orderBy(asc(agentEvidenceErasureTrace.dueAt))
      .limit(input.limit)
      .for('update', { skipLocked: true });
    if (due.length === 0) {
      return [];
    }
    return transaction
      .update(agentEvidenceErasureTrace)
      .set({ leaseOwner: input.owner, dueAt: new Date(input.now.getTime() + input.leaseMilliseconds) })
      .where(
        or(
          ...due.map((row) =>
            and(
              eq(agentEvidenceErasureTrace.erasureId, row.erasureId),
              eq(agentEvidenceErasureTrace.traceId, row.traceId),
            ),
          ),
        ),
      )
      .returning({
        erasureId: agentEvidenceErasureTrace.erasureId,
        traceId: agentEvidenceErasureTrace.traceId,
        state: agentEvidenceErasureTrace.state,
        attempts: agentEvidenceErasureTrace.attempts,
        requestedAt: agentEvidenceErasureTrace.requestedAt,
      });
  });

/**
 * Settle leased traces. Fenced on the lease owner, so a worker whose lease
 * lapsed cannot overwrite a newer outcome.
 *
 * @param database - The API database.
 * @param input - The traces, their owner and the settlement.
 * @returns How many this worker still held.
 */
export const settleErasureTraces = async (
  database: Database,
  input: Readonly<{
    traces: ReadonlyArray<Pick<LeasedErasureTrace, 'erasureId' | 'traceId'>>;
    owner: string;
    settlement: ErasureSettlement;
    now: Date;
  }>,
): Promise<number> => {
  if (input.traces.length === 0) {
    return 0;
  }
  const { settlement } = input;
  const values = ((): PgUpdateSetSource<typeof agentEvidenceErasureTrace> => {
    switch (settlement.kind) {
      case 'requested': {
        return {
          state: 'requested',
          attempts: sql`${agentEvidenceErasureTrace.attempts} + 1`,
          requestedAt: input.now,
          dueAt: settlement.recheckAt,
          reason: null,
        };
      }
      case 'absent': {
        return { state: 'absent', reason: null };
      }
      case 'retry': {
        return { state: 'pending', dueAt: settlement.notBefore, reason: settlement.reason };
      }
    }
  })();
  const rows = await database
    .update(agentEvidenceErasureTrace)
    .set({ ...values, leaseOwner: null })
    .where(
      and(
        eq(agentEvidenceErasureTrace.leaseOwner, input.owner),
        or(
          ...input.traces.map((row) =>
            and(
              eq(agentEvidenceErasureTrace.erasureId, row.erasureId),
              eq(agentEvidenceErasureTrace.traceId, row.traceId),
            ),
          ),
        ),
      ),
    )
    .returning({ traceId: agentEvidenceErasureTrace.traceId });
  return rows.length;
};

/**
 * Release a read-back that could not answer, keeping the trace `requested`.
 *
 * @param database - The API database.
 * @param input - The trace, its owner and when to read again.
 * @returns Whether this worker still held it.
 */
export const recheckErasureTrace = async (
  database: Database,
  input: Readonly<{ trace: Pick<LeasedErasureTrace, 'erasureId' | 'traceId'>; owner: string; notBefore: Date }>,
): Promise<boolean> => {
  const rows = await database
    .update(agentEvidenceErasureTrace)
    .set({ leaseOwner: null, dueAt: input.notBefore })
    .where(
      and(
        eq(agentEvidenceErasureTrace.leaseOwner, input.owner),
        eq(agentEvidenceErasureTrace.erasureId, input.trace.erasureId),
        eq(agentEvidenceErasureTrace.traceId, input.trace.traceId),
      ),
    )
    .returning({ traceId: agentEvidenceErasureTrace.traceId });
  return rows.length > 0;
};

/**
 * Mark erasures complete once every trace they named was read back absent.
 *
 * @param database - The API database.
 * @param now - The clock.
 * @returns How many erasures completed.
 */
export const completeErasures = async (database: Database, now: Date): Promise<number> => {
  const done = await database
    .update(agentEvidenceErasure)
    .set({ completedAt: now })
    .where(
      and(
        isNull(agentEvidenceErasure.completedAt),
        notExists(
          database
            .select({ one: sql`1` })
            .from(agentEvidenceErasureTrace)
            .where(
              and(
                eq(agentEvidenceErasureTrace.erasureId, agentEvidenceErasure.id),
                inArray(agentEvidenceErasureTrace.state, ['pending', 'requested']),
              ),
            ),
        ),
      ),
    )
    .returning({ id: agentEvidenceErasure.id });
  return done.length;
};
