/**
 * The header and trailer contract every adapter preserves (S-HEADERS).
 *
 * Provenance travels as one `Tau-Metadata` trailer on the commit message, so a
 * revision written by any engine reads back with its authorship intact. The
 * trailer deliberately does not carry the revision id: the id **is** the commit
 * id, so storing it inside the bytes being hashed would be circular.
 */

import { z } from 'zod';
import type { RevisionId } from '#algorithms/index.js';
import { revisionProvenanceSchema } from '#algorithms/revision-metadata.js';
import type {
  RevisionActor,
  RevisionIdentity,
  RevisionProvenance,
  RevisionSummary,
  RevisionUserActor,
} from '#revision-authority.js';
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

/** Annotated-tag trailer carrying a named version's name, note and actor (S31, B6). @public */
export const tagTrailerPrefix = 'Tau-Tag: ';

/** Identity every Tau host commits as. The author is the person; this is not. @public */
export const tauCommitter = Object.freeze({ name: 'Tau', email: 'noreply@tau.new' });

/** Email domain for a person who chose anonymity, in GitHub's `noreply` shape. @public */
export const anonymousActorEmailDomain = 'users.noreply.tau.new';

/**
 * The Tau account a Tau no-reply address names: `<id>@users.noreply.tau.new`.
 *
 * What a commit made with git under the identity Tau gives a person carries
 * instead of a Tau record. A pseudonym's address names no account, and
 * any other address is not Tau's, so both answer `undefined`.
 *
 * @param email - A commit's author address.
 * @returns The account id, or `undefined` when the address is not one account's Tau no-reply address.
 * @public
 */
export const tauNoreplyAccountOf = (email: string): string | undefined => {
  const suffix = `@${anonymousActorEmailDomain}`;
  const id = email.endsWith(suffix) ? email.slice(0, -suffix.length) : '';
  return id === '' || id.startsWith('anon:') || /[@\s<>]/u.test(id) ? undefined : id;
};

/**
 * Who a commit Tau did not record names: its git author's name, and the
 * Tau account its author address names when it is one person's no-reply
 * address (a commit made with git under the identity Tau gives them).
 *
 * @param commit - The decoded commit.
 * @returns The log entry's author fields.
 * @public
 */
export const unrecordedAuthorOf = (
  commit: Readonly<{ author: Readonly<{ name: string; email: string }> }>,
): Readonly<{ authorName: string; authorAccountId?: string }> => {
  const account = tauNoreplyAccountOf(commit.author.email);
  return account === undefined
    ? { authorName: commit.author.name }
    : { authorName: commit.author.name, authorAccountId: account };
};

/**
 * The git author line of a project linked to a forge (D33): that forge's
 * no-reply name and address for the person recording.
 *
 * An input to the author line alone, beside the record and never in it (I3):
 * no trailer, tag record or actor has a field for it. Only a GitHub no-reply
 * address is written; any other is not, and the line falls back to the Tau
 * no-reply address the person's id gives.
 *
 * @public
 */
export type RevisionCommitAuthor = Readonly<{ name: string; email: string }>;

/** GitHub's no-reply address, `<id>+<login>@users.noreply.github.com`, as Tau Cloud's push check reads it. */
const githubNoreplyAddress = /^\d+\+[A-Za-z\d](?:[A-Za-z\d-]*[A-Za-z\d])?@users\.noreply\.github\.com$/u;

/**
 * The commit-author input a setActor request or a linked import carries, as a schema.
 *
 * Strict, and only a forge's no-reply address parses, so a host refuses any
 * other address at its boundary rather than ignoring it later.
 *
 * @public
 */
export const revisionCommitAuthorSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[^\n<>]+$/u),
    email: z.string().regex(githubNoreplyAddress),
  })
  .strict();

const textEncoder = new TextEncoder();

/* Strict, like the commit record's: a version whose actor carries an address,
 * or any field a person or agent does not have, is not a version (I3, I7). */
const userActorSchema = z
  .object({
    kind: z.literal('user'),
    id: z.string(),
    name: z.string().optional(),
    anonymous: z.boolean().optional(),
  })
  .strict();

const actorSchema = z.discriminatedUnion('kind', [
  userActorSchema,
  z
    .object({
      kind: z.literal('agent'),
      id: z.string(),
      runId: z.string().optional(),
      onBehalfOf: userActorSchema.optional(),
    })
    .strict(),
]);

/**
 * The commit trailer's machine form, version 2 (blueprint B1): identity,
 * capture and leg are required, and no other version parses (I7). A commit
 * whose trailer is any other shape reads as one Tau did not record.
 */
const trailerSchema = z.object({
  version: z.literal(2),
  parents: z.array(z.string()),
  provenance: revisionProvenanceSchema,
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

/* One key order for a person, whoever built the object, so two hosts derive
 * the same trailer bytes for the same identity. The fields are copied, never
 * spread: an untyped caller's extra field, an address among them, is not
 * written (I3). */
const canonicalPerson = (person: RevisionUserActor): RevisionUserActor => ({
  kind: 'user',
  id: person.id,
  ...(person.name === undefined ? {} : { name: person.name }),
  ...(person.anonymous === undefined ? {} : { anonymous: person.anonymous }),
});

/* A version's actor, copied the same way. */
const canonicalActor = (actor: RevisionActor): RevisionActor =>
  actor.kind === 'agent'
    ? {
        kind: 'agent',
        id: actor.id,
        ...(actor.runId === undefined ? {} : { runId: actor.runId }),
        ...(actor.onBehalfOf === undefined ? {} : { onBehalfOf: canonicalPerson(actor.onBehalfOf) }),
      }
    : canonicalPerson(actor);

const canonicalIdentity = (actor: RevisionIdentity): RevisionIdentity =>
  actor.kind === 'agent'
    ? { kind: 'agent', id: actor.id, runId: actor.runId, onBehalfOf: canonicalPerson(actor.onBehalfOf) }
    : canonicalPerson(actor);

const canonicalTrailer = (input: RevisionTrailer): string =>
  JSON.stringify({
    version: 2,
    parents: [...input.parents],
    provenance: {
      source: input.provenance.source,
      actor: canonicalIdentity(input.provenance.actor),
      capture: input.provenance.capture,
      via: input.provenance.via,
      ...(input.provenance.runId === undefined ? {} : { runId: input.provenance.runId }),
      /* RM-R9, in a fixed order. */
      ...(input.provenance.attempt === undefined ? {} : { attempt: input.provenance.attempt }),
      ...(input.provenance.turnCut === undefined ? {} : { turnCut: input.provenance.turnCut }),
      ...(input.provenance.heldRunIds === undefined ? {} : { heldRunIds: [...input.provenance.heldRunIds] }),
      ...(input.provenance.turnId === undefined ? {} : { turnId: input.provenance.turnId }),
      ...(input.provenance.restoredFrom === undefined ? {} : { restoredFrom: input.provenance.restoredFrom }),
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
    `${actorTrailerPrefix}${describeActor(input.provenance.actor)}`,
    `${triggerTrailerPrefix}${input.provenance.capture}`,
  ];
  // `JSON.stringify` escapes every newline, so the trailer is always one line.
  return `${title === '' ? 'Tau revision' : title}\n\n${provenanceTrailerPrefix}${canonicalTrailer(input)}\n${readable.join('\n')}\n`;
};

/**
 * The `Tau-Actor` trailer's one-line value.
 *
 * @param actor - Who the revision is by.
 * @returns `agent <model> run <runId> for <person>`, or `user <name>`.
 */
const describeActor = (actor: RevisionIdentity): string => {
  if (actor.kind === 'agent') {
    return `agent ${actor.id} run ${actor.runId} for ${actor.onBehalfOf.name ?? actor.onBehalfOf.id}`;
  }
  return `user ${actor.name ?? actor.id}`;
};

/**
 * The git author of one revision: the person, never the tool (A26).
 *
 * The address is never the person's: it is the Tau no-reply address their id
 * gives, or, for a project linked to a forge, that forge's no-reply address,
 * given as its own input because no record carries an address (I3).
 *
 * Anonymity is applied at write time, so an anonymous actor arrives here with
 * an `anon:` id and gets the `noreply` address git clients already treat as
 * "no mailbox", never a forge's, which would name the account. Its `anon:` id
 * is a hash of a salt the history never records (EQ10 option (a)): signed in,
 * the API's per-`(workspace, account)` salt, an HMAC keyed with a server
 * secret; signed out, the device's random one. Without that salt the person cannot be recovered from the pseudonym,
 * even though attributed commits beside it carry user ids.
 *
 * @param provenance - The revision's provenance.
 * @param commitAuthor - The linked forge's no-reply identity for this person, if the project is linked to one.
 * @returns The `author` signature for the commit object.
 * @public
 */
export const revisionAuthorSignature = (
  provenance: RevisionProvenance,
  commitAuthor?: RevisionCommitAuthor,
): GitSignature => {
  const person = provenance.actor.kind === 'agent' ? provenance.actor.onBehalfOf : provenance.actor;
  const seconds = Math.floor(provenance.createdAt / 1000);
  const forge = person.anonymous === true ? undefined : revisionCommitAuthorSchema.safeParse(commitAuthor).data;
  if (forge !== undefined) {
    return { name: forge.name, email: forge.email, seconds, offsetMinutes: 0 };
  }
  return {
    name: person.name ?? person.id,
    email: `${person.id}@${anonymousActorEmailDomain}`,
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

const freezePerson = (person: RevisionUserActor): RevisionUserActor => Object.freeze(canonicalPerson(person));

/**
 * Recover provenance from a commit message written by any adapter.
 *
 * @param message - Full commit message.
 * @returns The trailer, or `undefined` when the commit carries no version 2 Tau trailer.
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
  const { actor } = provenance;
  return Object.freeze({
    parents: Object.freeze([...parents]),
    provenance: Object.freeze({
      source: provenance.source,
      actor:
        actor.kind === 'agent'
          ? Object.freeze({
              kind: 'agent',
              id: actor.id,
              runId: actor.runId,
              onBehalfOf: freezePerson(actor.onBehalfOf),
            })
          : freezePerson(actor),
      capture: provenance.capture,
      via: provenance.via,
      ...(provenance.runId === undefined ? {} : { runId: provenance.runId }),
      ...(provenance.attempt === undefined ? {} : { attempt: provenance.attempt }),
      ...(provenance.turnCut === undefined ? {} : { turnCut: provenance.turnCut }),
      ...(provenance.heldRunIds === undefined ? {} : { heldRunIds: Object.freeze([...provenance.heldRunIds]) }),
      ...(provenance.turnId === undefined ? {} : { turnId: provenance.turnId }),
      ...(provenance.restoredFrom === undefined ? {} : { restoredFrom: provenance.restoredFrom }),
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
 * Under the Tau no-reply address the person's id gives, never a forge's or
 * their own (I3): nothing a tag is made from carries an address.
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
    email: `${person.id}@${anonymousActorEmailDomain}`,
    seconds,
    offsetMinutes: 0,
  };
};

/** A named version's own metadata, as its annotated tag carries it (S31). @public */
export type RevisionTagTrailer = Readonly<{
  /**
   * The version's identity: 32 random lowercase hex digits, minted when the
   * version is made and kept by a rename or a move to another number. Two
   * versions made on two devices differ here even on the same entry in the
   * same second, which is what Tau Cloud and renumbering compare.
   */
  id: string;
  /**
   * The version's name, free text such as "Ready for print". The ref is
   * `refs/tags/v<number>` (`versionTagRef`), so the name is read from here and
   * never from the ref.
   */
  name: string;
  note: string | undefined;
  actor: RevisionActor | undefined;
}>;

/** What a version id looks like: 16 random bytes as lowercase hex. @public */
export const versionIdPattern = /^[\da-f]{32}$/u;

const tagTrailerSchema = z.object({
  version: z.literal(2),
  id: z.string().regex(versionIdPattern),
  name: z.string().min(1),
  note: z.string().optional(),
  actor: actorSchema.optional(),
});

/**
 * Build an annotated tag's message: the note (or the name), then the machine trailer.
 *
 * The same shape as a commit message and for the same reason — `git tag -n`
 * shows the note, and Tau reads the trailer. The number is the ref's, so the
 * trailer does not repeat it.
 *
 * @param input - The version's identity, its name and what is recorded about it.
 * @returns The exact tag message bytes both adapters write.
 * @public
 */
export const revisionTagMessage = (input: RevisionTagTrailer): string => {
  const title = (input.note ?? input.name).replaceAll(/[\n\r]+/gu, ' ').trim();
  const trailer = JSON.stringify({
    version: 2,
    id: input.id,
    name: input.name,
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.actor === undefined ? {} : { actor: canonicalActor(input.actor) }),
  });
  return `${title === '' ? input.name : title}\n\n${tagTrailerPrefix}${trailer}\n`;
};

/**
 * Recover a version's identity, name, note and actor from its tag message.
 *
 * Only a tag with a valid `Tau-Tag` record is a version (I7: there is no
 * reader for any other shape). A tag Tau did not write, a record without an
 * `id` and a lightweight tag all answer `undefined`: such a tag still holds
 * its number, but it is not a version.
 *
 * @param message - Full tag message, or `undefined` for a lightweight tag.
 * @returns The trailer, or `undefined` when the tag is not a version.
 * @public
 */
export const parseRevisionTagMessage = (message: string | undefined): RevisionTagTrailer | undefined => {
  const line = message?.split('\n').findLast((candidate) => candidate.startsWith(tagTrailerPrefix));
  if (line === undefined) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(tagTrailerPrefix.length));
  } catch {
    return undefined;
  }
  const result = tagTrailerSchema.safeParse(parsed);
  if (!result.success) {
    return undefined;
  }
  return Object.freeze({
    id: result.data.id,
    name: result.data.name,
    note: result.data.note,
    actor: result.data.actor === undefined ? undefined : Object.freeze(canonicalActor(result.data.actor)),
  });
};

/**
 * Derive the 16 change-id bytes a Tau-recorded revision carries from creation.
 *
 * Jujutsu mints a random change id and keeps it stable across rewrites. A store
 * with no rewrite operation has no such history to preserve, so the id is
 * derived from the revision **as recorded**: its tree, its parents and its whole
 * canonical trailer. The trailer is identity, not content — `actor`, `runId`,
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
