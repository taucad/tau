import { z } from 'zod';

/**
 * Persisted revision metadata shared by browser storage and native Git notes.
 *
 * One identifier field, named `id`. The pair `id | revisionId` existed because
 * two writers named the same value differently and neither could be required;
 * a revision id is now the commit id, so there is one value and one name for it.
 *
 * @public
 */
export const revisionMetadataSchema = z.object({
  version: z.literal(1),
  id: z.string(),
  parents: z.array(z.string()),
  provenance: z.object({
    source: z.enum(['user', 'agent', 'merge', 'restore', 'import']),
    actorId: z.string(),
    runId: z.string().optional(),
    createdAt: z.number(),
  }),
  summary: z.object({
    generated: z.string(),
    edited: z.string().optional(),
  }),
});
