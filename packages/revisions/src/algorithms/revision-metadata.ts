import { z } from 'zod';

/**
 * The person half of a recorded identity (S37, A26).
 *
 * @public
 */
export const revisionUserIdentitySchema = z.object({
  kind: z.literal('user'),
  id: z.string().min(1),
  name: z.string().optional(),
  email: z.string().optional(),
  anonymous: z.boolean().optional(),
});

/**
 * Who one capture is by, as version 2 of the record carries it (blueprint B1):
 * a person, or an agent's run and the person it ran for. Both are required, so
 * a record that names no one does not parse (I1).
 *
 * @public
 */
export const revisionIdentitySchema = z.discriminatedUnion('kind', [
  revisionUserIdentitySchema,
  z.object({
    kind: z.literal('agent'),
    id: z.string().min(1),
    runId: z.string().min(1),
    onBehalfOf: revisionUserIdentitySchema,
  }),
]);

/**
 * What asked for a revision (S30), as `RevisionTrigger` names it.
 *
 * @public
 */
export const revisionCaptureSchema = z.enum([
  'turn',
  'save',
  'idle',
  'hidden',
  'close',
  'merge',
  'restore',
  'switch',
  /* The Start version, V1 (A6): a project made in Tau, or one brought in. */
  'create',
  'import',
]);

/**
 * Which Tau leg recorded a revision, as `RevisionVia` names it (blueprint B1).
 *
 * @public
 */
export const revisionViaSchema = z.enum(['browser', 'desktop', 'cli', 'serve', 'cloud']);

/**
 * A revision's provenance, version 2 (blueprint B1): identity, capture and leg
 * required. There is no version 1 reader (I7).
 *
 * @public
 */
export const revisionProvenanceSchema = z.object({
  source: z.enum(['user', 'agent', 'merge', 'restore', 'import']),
  actor: revisionIdentitySchema,
  capture: revisionCaptureSchema,
  via: revisionViaSchema,
  runId: z.string().optional(),
  attempt: z.number().optional(),
  turnCut: z.enum(['base', 'result']).optional(),
  heldRunIds: z.array(z.string()).optional(),
  turnId: z.string().optional(),
  restoredFrom: z.string().optional(),
  createdAt: z.number(),
});

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
  version: z.literal(2),
  id: z.string(),
  parents: z.array(z.string()),
  provenance: revisionProvenanceSchema,
  summary: z.object({
    generated: z.string(),
    edited: z.string().optional(),
  }),
});
