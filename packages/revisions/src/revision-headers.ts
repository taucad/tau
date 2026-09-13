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
import type { RevisionActor, RevisionProvenance, RevisionSummary } from '#revision-authority.js';
import type { GitSignature } from '#git-objects.js';
import { digest } from '#object-hash.js';
import type { ObjectFormat } from '#object-hash.js';
import { GitObjectError } from '#git-objects.js';

/** Commit-message trailer prefix carrying Tau provenance. @public */
export const provenanceTrailerPrefix = 'Tau-Metadata: ';

/** Trailer naming the actor in the form a person reads in `git log`. @public */
export const actorTrailerPrefix = 'Tau-Actor: ';

/** Trailer naming what asked for the revision. @public */
export const triggerTrailerPrefix = 'Tau-Trigger: ';

/** Annotated-tag trailer carrying a named version's note and actor (S31). @public */
export const tagTrailerPrefix = 'Tau-Tag: ';

/** Identity every Tau host commits as. The author is the person; this is not. @public */
export const tauCommitter = Object.freeze({ name: 'Tau', email: 'noreply@tau.new' });

/** Email domain for a person who chose anonymity, in GitHub's `noreply` shape. @public */
export const anonymousActorEmailDomain = 'users.noreply.tau.new';

const textEncoder = new TextEncoder();

const userActorSchema = z.object({
  kind: z.literal('user'),
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
  anonymous: z.boolean().optional(),
});

const actorSchema = z.discriminatedUnion('kind', [
  userActorSchema,
  z.object({
    kind: z.literal('agent'),
    id: z.string(),
    runId: z.string().optional(),
    onBehalfOf: userActorSchema.optional(),
  }),
]);

const trailerSchema = z.object({
  version: z.literal(1),
  parents: z.array(z.string()),
  provenance: z.object({
    source: z.enum(['user', 'agent', 'merge', 'restore', 'import']),
    actorId: z.string(),
    runId: z.string().optional(),
    turnId: z.string().optional(),
    actor: actorSchema.optional(),
    trigger: z.enum(['turn', 'save', 'idle', 'hidden', 'close', 'merge', 'restore', 'switch']).optional(),
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
      ...(input.provenance.turnId === undefined ? {} : { turnId: input.provenance.turnId }),
      ...(input.provenance.actor === undefined ? {} : { actor: input.provenance.actor }),
      ...(input.provenance.trigger === undefined ? {} : { trigger: input.provenance.trigger }),
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
  /* Two readable trailers beside the machine one: `git log` on a clone with no
   * Tau shows who and why without anybody parsing JSON (S37, A26). */
  const readable = [
    `${actorTrailerPrefix}${describeActor(input.provenance)}`,
    ...(input.provenance.trigger === undefined ? [] : [`${triggerTrailerPrefix}${input.provenance.trigger}`]),
  ];
  // `JSON.stringify` escapes every newline, so the trailer is always one line.
  return `${title === '' ? 'Tau revision' : title}\n\n${provenanceTrailerPrefix}${canonicalTrailer(input)}\n${readable.join('\n')}\n`;
};

/**
 * The `Tau-Actor` trailer's one-line value.
 *
 * @param provenance - The revision's provenance.
 * @returns `agent <model> run <runId>`, `user <name>`, or the bare actor id.
 */
const describeActor = (provenance: RevisionProvenance): string => {
  const { actor } = provenance;
  if (actor === undefined) {
    return `${provenance.source} ${provenance.actorId}`;
  }
  if (actor.kind === 'agent') {
    const run = actor.runId === undefined ? '' : ` run ${actor.runId}`;
    const behalf = actor.onBehalfOf === undefined ? '' : ` for ${actor.onBehalfOf.name ?? actor.onBehalfOf.id}`;
    return `agent ${actor.id}${run}${behalf}`;
  }
  return `user ${actor.name ?? actor.id}`;
};

/**
 * The git author of one revision: the person, never the tool (A26).
 *
 * Anonymity is applied at write time, so an anonymous actor arrives here with
 * an `anon:` id and no email and gets the `noreply` address git clients already
 * treat as "no mailbox"; nothing about the person is recoverable from the
 * commit afterwards, because nothing about them was ever written.
 *
 * @param provenance - The revision's provenance.
 * @returns The `author` signature for the commit object.
 * @public
 */
export const revisionAuthorSignature = (provenance: RevisionProvenance): GitSignature => {
  const seconds = Math.floor(provenance.createdAt / 1000);
  const person = provenance.actor?.kind === 'agent' ? provenance.actor.onBehalfOf : provenance.actor;
  if (person === undefined) {
    /* No session to map: the id is still the truthful author, and the address
     * says "this is not a mailbox" rather than inventing one. */
    return {
      name: provenance.actorId,
      email: `${provenance.actorId}@${anonymousActorEmailDomain}`,
      seconds,
      offsetMinutes: 0,
    };
  }
  return {
    name: person.name ?? person.id,
    email: person.email ?? `${person.id}@${anonymousActorEmailDomain}`,
    seconds,
    offsetMinutes: 0,
  };
};

/**
 * The git committer of every Tau revision: Tau itself.
 *
 * Author and committer are the split git already has for "who wrote this" and
 * "who recorded it", which is exactly the split between a person or an agent
 * and the tool that minted the commit.
 *
 * @param provenance - The revision's provenance, for its time.
 * @returns The `committer` signature for the commit object.
 * @public
 */
export const revisionCommitterSignature = (provenance: RevisionProvenance): GitSignature => ({
  name: tauCommitter.name,
  email: tauCommitter.email,
  seconds: Math.floor(provenance.createdAt / 1000),
  offsetMinutes: 0,
});

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
      ...(provenance.turnId === undefined ? {} : { turnId: provenance.turnId }),
      ...(provenance.actor === undefined ? {} : { actor: Object.freeze(provenance.actor) }),
      ...(provenance.trigger === undefined ? {} : { trigger: provenance.trigger }),
      createdAt: provenance.createdAt,
    }),
    summary: Object.freeze({
      generated: summary.generated,
      ...(summary.edited === undefined ? {} : { edited: summary.edited }),
    }),
  });
};

/**
 * The tagger of one annotated tag: whoever named the revision.
 *
 * Falls back to Tau itself, because a tag object must have a tagger and a host
 * that names a version at publish time has no person to attribute it to.
 *
 * @param actor - Who named it, when a person or an agent did.
 * @param createdAt - Milliseconds since the Unix epoch.
 * @returns The `tagger` signature for the tag object.
 * @public
 */
export const taggerSignature = (actor: RevisionActor | undefined, createdAt: number): GitSignature => {
  const seconds = Math.floor(createdAt / 1000);
  const person = actor?.kind === 'agent' ? actor.onBehalfOf : actor;
  if (person === undefined) {
    return { name: tauCommitter.name, email: tauCommitter.email, seconds, offsetMinutes: 0 };
  }
  return {
    name: person.name ?? person.id,
    email: person.email ?? `${person.id}@${anonymousActorEmailDomain}`,
    seconds,
    offsetMinutes: 0,
  };
};

/** A named version's own metadata, as its annotated tag carries it (S31). @public */
export type RevisionTagTrailer = Readonly<{
  note: string | undefined;
  actor: RevisionActor | undefined;
}>;

const tagTrailerSchema = z.object({
  version: z.literal(1),
  note: z.string().optional(),
  actor: actorSchema.optional(),
});

/**
 * Build an annotated tag's message: the note, then the machine trailer.
 *
 * The same shape as a commit message and for the same reason — `git tag -n`
 * shows the note, and Tau reads the trailer.
 *
 * @param input - The name and what is recorded about it.
 * @returns The exact tag message bytes both adapters write.
 * @public
 */
export const revisionTagMessage = (input: Readonly<{ name: string }> & RevisionTagTrailer): string => {
  const title = (input.note ?? input.name).replaceAll(/[\n\r]+/gu, ' ').trim();
  const trailer = JSON.stringify({
    version: 1,
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.actor === undefined ? {} : { actor: input.actor }),
  });
  return `${title === '' ? input.name : title}\n\n${tagTrailerPrefix}${trailer}\n`;
};

/**
 * Recover a named version's note and actor from its tag message.
 *
 * @param message - Full tag message, or `undefined` for a lightweight tag.
 * @returns The trailer; both fields are `undefined` for a tag Tau did not write.
 * @public
 */
export const parseRevisionTagMessage = (message: string | undefined): RevisionTagTrailer => {
  const line = message?.split('\n').findLast((candidate) => candidate.startsWith(tagTrailerPrefix));
  if (line === undefined) {
    return Object.freeze({ note: undefined, actor: undefined });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(tagTrailerPrefix.length));
  } catch {
    return Object.freeze({ note: undefined, actor: undefined });
  }
  const result = tagTrailerSchema.safeParse(parsed);
  if (!result.success) {
    return Object.freeze({ note: undefined, actor: undefined });
  }
  return Object.freeze({
    note: result.data.note,
    actor: result.data.actor === undefined ? undefined : Object.freeze(result.data.actor),
  });
};

/**
 * Derive the 16 change-id bytes a Tau-recorded revision carries from creation.
 *
 * Jujutsu mints a random change id and keeps it stable across rewrites. A store
 * with no rewrite operation has no such history to preserve, so the id is
 * derived from the revision **as recorded**: its tree, its parents and its whole
 * canonical trailer. The trailer is identity, not content — `actorId`, `runId`,
 * `createdAt` and (since W5) `turnId` are all in the preimage — so two hosts
 * derive the same change id only for the same *recording* of the same content,
 * never for two independent recordings of it. Identical edits on two hosts give
 * the same **tree** id (I4, proven by the conformance table's last row); they do
 * not give the same change id, and nothing in the product asks them to.
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
