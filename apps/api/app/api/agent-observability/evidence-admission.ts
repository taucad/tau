import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { Evidence } from '@taucad/agent-observability/contract';
import { evidenceKeys } from '@taucad/agent-observability/identity';
import type { Database, OwnerLockTransaction } from '#database/owner-lock.js';
import { lockProjectLifecycle, readProjectDeletion } from '#database/project-lifecycle.js';
import { agentEvidenceOutbox, agentEvidenceReceipt, agentEvidenceSource } from '#database/schema.js';
import { lockEvidencePrincipal, readEvidenceErasure } from '#api/agent-observability/evidence-erasure.js';

/** Protection of one source, strictest last. */
export type SourceProtection = 'free' | 'pro' | 'unknown';

const strictness: Readonly<Record<SourceProtection, number>> = { free: 0, pro: 1, unknown: 2 };

/** The stricter of two protections. A client claim can only add protection, never remove it. */
export const stricterProtection = (left: SourceProtection, right: SourceProtection): SourceProtection =>
  strictness[left] >= strictness[right] ? left : right;

/** The longest any evidence may be held, counted from Tau's own receipt time. */
export const evidenceRetentionMilliseconds = 180 * 86_400_000;

/** A receipt as the client is answered with it. */
export type EvidenceReceipt = Readonly<{
  receipt: string;
  /** `accepted` dispatches; `revoked` and `expired` are durable answers to a replay that will not. */
  disposition: 'accepted' | 'revoked' | 'expired';
  /** Whether this submission matched one Tau already held. */
  duplicate: boolean;
  receivedAt: string;
  expiresAt: string;
}>;

/** The outcome of one admission. Every refusal is a bounded code; none carries the payload. */
export type EvidenceAdmissionOutcome =
  | Readonly<{ kind: 'receipt'; receipt: EvidenceReceipt }>
  | Readonly<{ kind: 'refused' | 'conflict' | 'fenced' | 'capacity' }>;

/** Everything one admission depends on, resolved by the caller from authenticated server state. */
export type EvidenceAdmissionInput = Readonly<{
  database: Database;
  evidence: Evidence;
  /**
   * What current policy allows. `replay` is whether the plane's purpose is
   * still granted, which decides a held receipt's disposition; `admit` also
   * requires the submission's policy epoch to be the current one.
   */
  allowed: Readonly<{ replay: boolean; admit: boolean }>;
  /** The protection the account's material carries now. */
  protection: SourceProtection;
  /** Seal the canonical evidence for one receipt id; the caller holds the key. */
  seal: (receipt: string) => Readonly<{ payload: string; keyVersion: number }>;
  budgets: Readonly<{ total: number; principal: number }>;
  now: Date;
}>;

const toReceipt = (
  row: Pick<typeof agentEvidenceReceipt.$inferSelect, 'id' | 'receivedAt' | 'expiresAt'>,
  disposition: EvidenceReceipt['disposition'],
  duplicate: boolean,
): EvidenceReceipt => ({
  receipt: row.id,
  disposition,
  duplicate,
  receivedAt: row.receivedAt.toISOString(),
  expiresAt: row.expiresAt.toISOString(),
});

/**
 * Admit one parsed, digest-verified evidence document (blueprint T06).
 *
 * The project lifecycle lock, a per-source lock and the per-account evidence
 * lock serialize every submission of the same fact against the others and
 * against erasure, so the checks below hold to commit:
 *
 * - a replay of a held projection answers its existing receipt: `accepted`
 *   while policy still allows it, otherwise `revoked` or `expired`, and never
 *   enqueues it again;
 * - changed source bytes, a changed semantic identity or changed projection
 *   bytes under one identity are a conflict, not another fact;
 * - a deletion-fenced project, and an erased account or project, admit nothing;
 * - the receipt, the source protection and the sealed backlog row commit
 *   together, before the caller answers.
 *
 * A purpose withdrawn after the caller's policy read and before commit can
 * still be admitted here; dispatch rechecks current authority before any
 * send (T08), so admission is not permission to deliver.
 *
 * @param input - The evidence, current authority and sealing for this admission.
 * @returns A receipt, or a bounded refusal.
 */
export const admitEvidence = async (input: EvidenceAdmissionInput): Promise<EvidenceAdmissionOutcome> => {
  const keys = evidenceKeys(input.evidence);
  try {
    return await input.database.transaction(async (transaction) => admitWithin(transaction, input, keys));
  } catch (error) {
    if (error instanceof AdmissionRefusal) {
      return { kind: error.kind };
    }
    throw error;
  }
};

/**
 * A refusal after the transaction has written. Throwing it rolls the
 * lineage rows back with everything else, so a refused submission leaves
 * no trace.
 */
class AdmissionRefusal extends Error {
  public constructor(public readonly kind: 'conflict') {
    super(kind);
  }
}

const admitWithin = async (
  transaction: OwnerLockTransaction,
  input: EvidenceAdmissionInput,
  keys: ReturnType<typeof evidenceKeys>,
): Promise<EvidenceAdmissionOutcome> => {
  const { evidence } = input;
  const { principal, project } = evidence.scope;
  await lockProjectLifecycle(transaction, project);
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${keys.source}, 1))`);
  await lockEvidencePrincipal(transaction, principal);

  const held = await transaction
    .select()
    .from(agentEvidenceReceipt)
    .where(eq(agentEvidenceReceipt.sourceKey, keys.source));
  if (held.some((row) => row.sourceDigest !== evidence.source.digest || row.semanticKey !== keys.semantic)) {
    return { kind: 'conflict' };
  }
  const replay = held.find((row) => row.projectionKey === keys.projection);
  if (replay !== undefined) {
    if (replay.projectionDigest !== evidence.projection.digest) {
      return { kind: 'conflict' };
    }
    const disposition =
      replay.expiresAt.getTime() <= input.now.getTime() ? 'expired' : input.allowed.replay ? 'accepted' : 'revoked';
    return { kind: 'receipt', receipt: toReceipt(replay, disposition, true) };
  }
  if (!input.allowed.admit) {
    return { kind: 'refused' };
  }
  if (
    (await readProjectDeletion(transaction, project)) !== undefined ||
    (await readEvidenceErasure(transaction, { principalId: principal, projectId: project }))
  ) {
    return { kind: 'fenced' };
  }

  const id = `evr_${randomUUID()}`;
  const sealed = input.seal(id);
  if (!(await withinBudget(transaction, { principal, bytes: sealed.payload.length, budgets: input.budgets }))) {
    return { kind: 'capacity' };
  }
  const lineage = await recordLineage(transaction, input);
  if (lineage === undefined) {
    throw new AdmissionRefusal('conflict');
  }
  const expiresAt = new Date(
    Math.min(evidence.retention.expiresAt, input.now.getTime() + evidenceRetentionMilliseconds),
  );
  const [row] = await transaction
    .insert(agentEvidenceReceipt)
    .values({
      id,
      principalId: principal,
      projectId: project,
      sourceKey: keys.source,
      semanticKey: keys.semantic,
      projectionKey: keys.projection,
      sourceDigest: evidence.source.digest,
      projectionDigest: evidence.projection.digest,
      plane: evidence.payload.plane,
      family: evidence.semantic.kind,
      lineage,
      receivedAt: input.now,
      expiresAt,
    })
    .returning({
      id: agentEvidenceReceipt.id,
      receivedAt: agentEvidenceReceipt.receivedAt,
      expiresAt: agentEvidenceReceipt.expiresAt,
    });
  await transaction.insert(agentEvidenceOutbox).values({
    receiptId: id,
    keyVersion: sealed.keyVersion,
    payload: sealed.payload,
    payloadBytes: sealed.payload.length,
    expiresAt,
  });
  return { kind: 'receipt', receipt: toReceipt(row!, 'accepted', false) };
};

/**
 * Record or confirm each lineage source. A source Tau already holds keeps its
 * first digest and protection, made stricter by any stricter claim; a new
 * source takes the stricter of the account's current protection and the
 * claim. Answers `undefined` when a held source's digest differs.
 */
const recordLineage = async (
  transaction: OwnerLockTransaction,
  input: EvidenceAdmissionInput,
): Promise<Array<{ source: string; protection: SourceProtection }> | undefined> => {
  const { evidence } = input;
  const scope = and(
    eq(agentEvidenceSource.principalId, evidence.scope.principal),
    eq(agentEvidenceSource.projectId, evidence.scope.project),
  );
  const ids = evidence.lineage.map((item) => item.source);
  const heldRows = await transaction
    .select()
    .from(agentEvidenceSource)
    .where(and(scope, inArray(agentEvidenceSource.sourceId, ids)));
  const existing = new Map(heldRows.map((row) => [row.sourceId, row]));

  const lineage: Array<{ source: string; protection: SourceProtection }> = [];
  for (const item of evidence.lineage) {
    const held = existing.get(item.source);
    if (held !== undefined && held.digest !== item.digest) {
      return undefined;
    }
    const protection = stricterProtection(held?.protection ?? input.protection, item.protection);
    lineage.push({ source: item.source, protection });
    if (held === undefined) {
      // oxlint-disable-next-line no-await-in-loop -- bounded by the contract's lineage limit, inside one transaction
      await transaction.insert(agentEvidenceSource).values({
        principalId: evidence.scope.principal,
        projectId: evidence.scope.project,
        sourceId: item.source,
        digest: item.digest,
        protection,
        expiresAt: new Date(item.expiresAt),
      });
    } else if (protection !== held.protection) {
      // oxlint-disable-next-line no-await-in-loop -- as above
      await transaction
        .update(agentEvidenceSource)
        .set({ protection })
        .where(and(scope, eq(agentEvidenceSource.sourceId, item.source)));
    }
  }
  return lineage;
};

/** Whether the backlog can take another sealed payload, in total and for this principal. */
const withinBudget = async (
  transaction: OwnerLockTransaction,
  {
    principal,
    bytes,
    budgets,
  }: Readonly<{ principal: string; bytes: number; budgets: EvidenceAdmissionInput['budgets'] }>,
): Promise<boolean> => {
  const [usage] = await transaction
    .select({
      total: sql<string>`coalesce(sum(${agentEvidenceOutbox.payloadBytes}), 0)`,
      principal: sql<string>`coalesce(sum(${agentEvidenceOutbox.payloadBytes}) filter (where ${agentEvidenceReceipt.principalId} = ${principal}), 0)`,
    })
    .from(agentEvidenceOutbox)
    .innerJoin(agentEvidenceReceipt, eq(agentEvidenceReceipt.id, agentEvidenceOutbox.receiptId))
    .where(isNotNull(agentEvidenceOutbox.payload));
  return (
    Number(usage?.total ?? 0) + bytes <= budgets.total && Number(usage?.principal ?? 0) + bytes <= budgets.principal
  );
};
