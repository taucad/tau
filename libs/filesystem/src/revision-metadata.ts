import { z } from 'zod';

/** Persisted revision metadata shared by browser storage and native Git notes. @public */
export const revisionMetadataSchema = z
  .object({
    version: z.literal(1),
    id: z.string().optional(),
    revisionId: z.string().optional(),
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
  })
  .refine(({ id, revisionId }) => id !== undefined || revisionId !== undefined, {
    message: 'Revision metadata requires an identifier.',
  });
