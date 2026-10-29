import { inArray, lte } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { agentEvidenceReceipt } from '#database/schema.js';

/*
 * Expiry of Tau's own agent-evidence records (blueprint T13).
 *
 * A receipt and its backlog row are held for the evidence's retention, plus a
 * day. The payload is already gone at expiry (`expireBacklog`); the day keeps
 * the receipt past any clock skew ingress allows, since ingress refuses
 * evidence past its retention window and so a receipt deleted after that is
 * never needed to answer a replay. Langfuse expires the delivered trace under the same
 * 180-day origin; a trace this deletes the receipt of is no longer Tau's to
 * name for erasure.
 *
 * A source's recorded protection is kept: it is what stops a later envelope,
 * whatever expiry it claims for the source, from relabelling an earlier Pro
 * source under a downgraded account.
 */

/**
 * Delete one bounded batch of receipts that expired before `before`, with
 * their backlog rows. Bounded so a backlog of expiries never holds long
 * locks; the next pass takes the rest.
 *
 * @param database - The API database.
 * @param input - The cutoff and the batch size.
 * @returns How many receipts were deleted.
 */
export const reapExpiredEvidence = async (
  database: Database,
  input: Readonly<{ before: Date; limit: number }>,
): Promise<number> => {
  const receipts = await database
    .delete(agentEvidenceReceipt)
    .where(
      inArray(
        agentEvidenceReceipt.id,
        database
          .select({ id: agentEvidenceReceipt.id })
          .from(agentEvidenceReceipt)
          .where(lte(agentEvidenceReceipt.expiresAt, input.before))
          .limit(input.limit),
      ),
    )
    .returning({ id: agentEvidenceReceipt.id });
  return receipts.length;
};
