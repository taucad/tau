/* eslint-disable import-x/no-extraneous-dependencies -- the package import map resolves `#*.js` to this package's own source files. */
/**
 * The header and trailer contract every adapter preserves (S-HEADERS).
 *
 * Provenance travels as one `Tau-Metadata` trailer on the commit message, so a
 * revision written by any engine reads back with its authorship intact. The
 * trailer deliberately does not carry the revision id: the id **is** the commit
 * id, so storing it inside the bytes being hashed would be circular.
 */

import { z } from 'zod';
import type { RevisionId } from '@taucad/filesystem/revisions';
import type { RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import { digest } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import { GitObjectError } from '#git-objects.js';

/** Commit-message trailer prefix carrying Tau provenance. @public */
export const provenanceTrailerPrefix = 'Tau-Metadata: ';

const textEncoder = new TextEncoder();

const trailerSchema = z.object({
  version: z.literal(1),
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

/** Provenance and summary recovered from one commit message. @public */
export type RevisionTrailer = Readonly<{
  parents: readonly string[];
  provenance: RevisionProvenance;
  summary: RevisionSummary;
}>;

const canonicalTrailer = (input: RevisionTrailer): string =>
  JSON.stringify({
    version: 1,
    parents: [...input.parents],
    provenance: {
      source: input.provenance.source,
      actorId: input.provenance.actorId,
      ...(input.provenance.runId === undefined ? {} : { runId: input.provenance.runId }),
      createdAt: input.provenance.createdAt,
    },
    summary: {
      generated: input.summary.generated,
      ...(input.summary.edited === undefined ? {} : { edited: input.summary.edited }),
    },
  });

/**
 * Build the full commit message: a one-line title and the provenance trailer.
 *
 * @param input - Parents, provenance and summary for this revision.
 * @returns The exact commit message bytes every adapter writes.
 * @public
 */
export const revisionCommitMessage = (input: RevisionTrailer): string => {
  const title = (input.summary.edited ?? input.summary.generated).replaceAll(/[\n\r]+/gu, ' ').trim();
  // `JSON.stringify` escapes every newline, so the trailer is always one line.
  return `${title === '' ? 'Tau revision' : title}\n\n${provenanceTrailerPrefix}${canonicalTrailer(input)}\n`;
};

/**
 * Recover provenance from a commit message written by any adapter.
 *
 * @param message - Full commit message.
 * @returns The trailer, or `undefined` when the commit is not a Tau revision.
 * @public
 */
export const parseRevisionCommitMessage = (message: string): RevisionTrailer | undefined => {
  const line = message.split('\n').findLast((candidate) => candidate.startsWith(provenanceTrailerPrefix));
  if (line === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(provenanceTrailerPrefix.length));
  } catch {
    return undefined;
  }
  const result = trailerSchema.safeParse(parsed);
  if (!result.success) {
    return undefined;
  }
  const { parents, provenance, summary } = result.data;
  return Object.freeze({
    parents: Object.freeze([...parents]),
    provenance: Object.freeze({
      source: provenance.source,
      actorId: provenance.actorId,
      ...(provenance.runId === undefined ? {} : { runId: provenance.runId }),
      createdAt: provenance.createdAt,
    }),
    summary: Object.freeze({
      generated: summary.generated,
      ...(summary.edited === undefined ? {} : { edited: summary.edited }),
    }),
  });
};

/**
 * Derive the 16 change-id bytes a Tau-recorded revision carries from creation.
 *
 * Jujutsu mints a random change id and keeps it stable across rewrites. A store
 * with no rewrite operation has no such history to preserve, so the id is
 * derived from the revision's own content: the same content is then the same
 * revision, with the same change id, on every host that derives it this way.
 *
 * ponytail: swap the derivation for a carried id the moment an adapter gains a
 * rewrite operation, because a content-derived id cannot survive one.
 *
 * @param objectFormat - Recorded repository object format.
 * @param input - Tree id, parents and provenance identifying this revision.
 * @returns 16 change-id bytes.
 * @public
 */
export const deriveChangeId = (
  objectFormat: ObjectFormat,
  input: Readonly<{ treeId: string; parents: readonly RevisionId[]; trailer: RevisionTrailer }>,
): Uint8Array<ArrayBuffer> => {
  const preimage = `tau-change-id\0${input.treeId}\0${input.parents.join(' ')}\0${canonicalTrailer(input.trailer)}`;
  const bytes = digest(objectFormat, textEncoder.encode(preimage)).slice(0, 16);
  if (bytes.length !== 16) {
    throw new GitObjectError('INVALID_COMMIT', 'Change-id derivation produced too few bytes.');
  }
  return bytes;
};
