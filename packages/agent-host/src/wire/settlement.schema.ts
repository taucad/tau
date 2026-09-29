/**
 * The one settlement shape (D11, W8 TS-S9): the write gate for the three `turn.*` rows the host appends, and the
 * placement of record attempt 1's `running` row carries. Readers stay tolerant (D16): the log's own reader accepts a
 * legacy row without `attempt`, and gives it the attempt its position implies. Zod only.
 */

import { z } from 'zod';

const nonEmpty = z.string().min(1);
/** The attempt a row settles: required on write (D10). */
const attemptKey = { turnId: nonEmpty, runId: nonEmpty, chatId: nonEmpty, attempt: z.number().int().positive() };

/**
 * Where an attempt was placed, as the placement answers it: `mode` follows the checkout's kind, never the client
 * (HD-9). Carried by attempt 1's `run.lifecycle{running}` row, never by `admitted`.
 *
 * @public
 */
export const turnPlacementSchema = z.strictObject({
  checkoutId: nonEmpty,
  branch: nonEmpty.optional(),
  baseRevisionId: nonEmpty.optional(),
  mode: z.enum(['direct', 'candidate']),
});

/** A placement of record. @public */
export type TurnPlacementRecord = z.infer<typeof turnPlacementSchema>;

/**
 * One settlement row's body, as M1 appends it from the port's `settled` fact (TS-R18). A minted outcome's record is
 * the revision's provenance; this row points at it (D10). `turn.failed` is written only for an attempt that never
 * executed, and names the base its placement minted, if any.
 *
 * @public
 */
export const turnSettlementSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('turn.finalized'),
    ...attemptKey,
    projectId: nonEmpty,
    checkoutId: nonEmpty.optional(),
    revisionId: nonEmpty.optional(),
    branch: nonEmpty.optional(),
    changedPaths: z.array(z.string()).readonly(),
    treeId: nonEmpty.optional(),
    trigger: z.literal('turn'),
    runIds: z.array(nonEmpty).readonly(),
  }),
  z.strictObject({ type: z.literal('turn.conflicted'), ...attemptKey, checkoutId: nonEmpty.optional() }),
  z.strictObject({
    type: z.literal('turn.failed'),
    ...attemptKey,
    checkoutId: nonEmpty.optional(),
    revisionId: nonEmpty.optional(),
    reason: z.string(),
    code: nonEmpty,
  }),
]);

/** One settlement row's body. @public */
export type TurnSettlementBody = z.infer<typeof turnSettlementSchema>;
