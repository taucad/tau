/**
 * Provenance carried by the agent's tool contract (blueprint R4, invariant I5).
 *
 * A read names the source revision it was computed from; a write names the revision it produced.
 * Both speak the digest vocabulary the runtime's `SourceRevision` and the parameter manifest's
 * `identity.sourceFiles` already use, so the two are directly comparable — which is what lets a
 * host gate notice that a verdict answers for bytes the agent has since replaced.
 *
 * @module
 */

import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

const contentDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u, 'Expected a lowercase sha256 content digest.');

/** A file digest, or `'missing'` where no file exists at that path. @public */
export const fileDigestSchema = z.union([contentDigestSchema, z.literal('missing')]);

/** The source closure a kernel-backed result was computed from. @public */
export const sourceRevisionSchema = z
  .object({
    entry: rootedFilePathSchema.describe('Entry file the kernel evaluated.'),
    files: z
      .record(rootedFilePathSchema, fileDigestSchema)
      .describe('Digest of every source file in the entry closure, including the entry itself.'),
  })
  .strict();

/** The revision a write produced: the digest now at that path, or `'missing'` after a delete. @public */
export const writeRevisionSchema = z
  .object({
    path: rootedFilePathSchema.describe('Path the write produced.'),
    digest: fileDigestSchema.describe('Digest of the bytes written, or "missing" once deleted.'),
  })
  .strict();

/** The source closure a kernel-backed result was computed from. @public */
export type SourceRevisionOutput = z.infer<typeof sourceRevisionSchema>;
/** The revision one write produced. @public */
export type WriteRevisionOutput = z.infer<typeof writeRevisionSchema>;
