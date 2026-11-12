/**
 * Version numbers: V1, V2, … once per project, across every branch (blueprint
 * B6, Q6, Q13, I6).
 *
 * A version is an annotated tag at `refs/tags/v<number>`: the ref is the
 * number, and the free-text name ("Ready for print") lives in the tag's
 * message and its `Tau-Tag` trailer, so any name is a valid version name and
 * a rename rewrites the tag at the same ref. There is no counter: the next
 * number is the lowest above every `refs/tags/v<n>` either side holds. V1 is
 * the Start entry (A6, `start-version.ts`), which has no tag, so a version
 * tag's number is 2 or more.
 *
 * Only an annotated tag with a valid `Tau-Tag` record is a version (I7: no
 * reader for any older shape). Any other `refs/tags/v<n>` — a lightweight tag,
 * a tag another tool wrote — still holds its number: it is never replaced,
 * and no version is given that number. It is held by number only.
 *
 * A version is identified by the random `id` its trailer carries
 * ({@link isSameVersion}); a rename and a move both keep it. A number is
 * provisional until its version is backed up. Tau Cloud refuses a version tag
 * whose number another version holds (`GIT_PUSH_VERSION_NUMBER_TAKEN`,
 * Revisions Policy rule 19); the device then moves its own version that is not
 * backed up to the next free number and pushes again
 * ({@link renumberUnpushedVersions}). Only that device has seen the
 * provisional number, so nothing anyone else saw changes, and a backed-up
 * number never changes. Versions cannot be removed (Q13), so no number is ever
 * retired.
 */

import { bytesToHex } from '#object-hash.js';
import { versionIdPattern } from '#revision-headers.js';
import { RevisionPortError, versionTagName } from '#revision-port.js';
import type { RevisionActor } from '#revision-authority.js';
import type { CreateRevisionTagInput, RemoteRef, RevisionPort, RevisionTag } from '#revision-port.js';
import type { VersionRenumbering } from '#sync.types.js';

/** The Start entry's number: every project's first entry is V1 (A6, Q8). @public */
export const startVersionNumber = 1;

const tagRefPrefix = 'refs/tags/';
const versionTagPattern = /^v([1-9]\d*)$/u;

/**
 * The number a tag name or ref names as a version, if it names one.
 *
 * @param name - A tag name (`v3`) or a full ref (`refs/tags/v3`).
 * @returns The number, or `undefined` for a tag that is not a version (any other name, or `v1`, which Start holds).
 * @public
 */
export const versionNumberOfTag = (name: string): number | undefined => {
  const match = versionTagPattern.exec(name.startsWith(tagRefPrefix) ? name.slice(tagRefPrefix.length) : name);
  const number = match === null ? undefined : Number(match[1]);
  return number === undefined || !Number.isSafeInteger(number) || number <= startVersionNumber ? undefined : number;
};

/**
 * The number the next new version takes: one above every number held.
 *
 * @param held - Every number a `refs/tags/v<n>` holds, version or not.
 * @returns At least 2, because V1 is Start.
 * @public
 */
export const nextVersionNumber = (held: ReadonlyArray<Readonly<{ number: number }>>): number =>
  Math.max(startVersionNumber, ...held.map((tag) => tag.number)) + 1;

/**
 * A new version's id: 16 random bytes as lowercase hex.
 *
 * @returns The id, which its trailer carries for as long as the version lives.
 * @public
 */
export const newVersionId = (): string => bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));

/**
 * Whether two tags are the same version: the same id. A rename and a move
 * keep it; two devices that each made a version offline differ, even on the
 * same entry in the same second.
 *
 * @param left - One version.
 * @param right - The other.
 * @returns True when they are one version.
 * @public
 */
export const isSameVersion = (
  left: Readonly<Pick<RevisionTag, 'id'>>,
  right: Readonly<Pick<RevisionTag, 'id'>>,
): boolean => left.id === right.id;

/** What a port writes for one {@link CreateRevisionTagInput}. @public */
export type VersionTagWrite = Readonly<{
  id: string;
  number: number;
  name: string;
  revisionId: RevisionTag['revisionId'];
  note: string | undefined;
  actor: RevisionActor | undefined;
  createdAt: number;
}>;

/** What {@link versionTagWrite} decides from. @public */
export type VersionTagWriteInput = Readonly<{
  /** The versions this store holds. */
  tags: readonly RevisionTag[];
  /** Every number a `refs/tags/v<n>` in this store holds, version or not. */
  held: readonly number[];
  /** The call's input. */
  input: CreateRevisionTagInput;
  /** The store's clock, for a new version. */
  now: number;
}>;

const refuse = (message: string): never => {
  throw new RevisionPortError('UNSUPPORTED_OPERATION', message);
};

/**
 * What one `tag` call writes, decided the same way on both engines and before
 * anything is written.
 *
 * With no number it is a new version: it mints an id and takes the next
 * number. A number that already names a version is a rename: the version
 * keeps its id, the entry it names, when it was created and who created it,
 * takes the new name, and keeps its note unless a new one is given. Any other
 * free number is written as given, which is how a renumbered version moves.
 *
 * @param write - The store's tags and the call's input.
 * @returns The tag to write.
 * @throws RevisionPortError `UNSUPPORTED_OPERATION` for an empty name, a
 *   number below 2, a number a tag that is not a version holds, or a rename
 *   that names another entry or another version's id: a version never moves.
 * @public
 */
export const versionTagWrite = ({ tags, held, input, now }: VersionTagWriteInput): VersionTagWrite => {
  if (input.name.trim() === '') {
    refuse('A version needs a name.');
  }
  if (input.number !== undefined && (!Number.isSafeInteger(input.number) || input.number <= startVersionNumber)) {
    refuse(`V${String(input.number)} is not a version number: versions start at V2, after Start.`);
  }
  if (input.id !== undefined && !versionIdPattern.test(input.id)) {
    refuse('A version id is 32 lowercase hex digits.');
  }
  const existing = input.number === undefined ? undefined : tags.find((tag) => tag.number === input.number);
  if (existing === undefined) {
    if (input.number !== undefined && held.includes(input.number)) {
      refuse(`${versionTagName(input.number)} is held by a tag that is not a version.`);
    }
    return Object.freeze({
      id: input.id ?? newVersionId(),
      number: input.number ?? nextVersionNumber([...tags, ...held.map((number) => ({ number }))]),
      name: input.name,
      revisionId: input.revisionId,
      note: input.note,
      actor: input.actor,
      createdAt: input.createdAt ?? now,
    });
  }
  if (input.id !== undefined && input.id !== existing.id) {
    refuse(`${versionTagName(existing.number)} holds another version.`);
  }
  if (existing.revisionId !== input.revisionId) {
    refuse(`${versionTagName(existing.number)} names another entry: a version keeps the entry it was made on.`);
  }
  return Object.freeze({
    id: existing.id,
    number: existing.number,
    name: input.name,
    revisionId: existing.revisionId,
    note: input.note ?? existing.note,
    actor: existing.actor,
    createdAt: existing.createdAt,
  });
};

/** One side's version tags: its versions, and every number a `refs/tags/v<n>` holds there. @public */
export type VersionNumberHolders = Readonly<{
  versions: readonly RevisionTag[];
  /** Every held number, version or not: a tag that is not a version holds its number too. */
  held: readonly number[];
}>;

/**
 * Which of this device's versions must move before they can be backed up.
 *
 * A version the remote holds under the same number keeps it, and so does one
 * whose number the remote does not hold at all. Each other version, in
 * creation order, moves: to a number where this device already holds the
 * same version, when a move was interrupted before its old number was let go,
 * and otherwise to one above every number either side holds.
 *
 * @param local - This store's version tags.
 * @param remote - The remote's version tags, as last fetched and advertised.
 * @returns One step per version that moves, in creation order.
 * @public
 */
export const planVersionRenumbering = (
  local: VersionNumberHolders,
  remote: VersionNumberHolders,
): readonly VersionRenumbering[] => {
  const theirs = new Map(remote.versions.map((tag) => [tag.number, tag] as const));
  const heldThere = new Set([...remote.held, ...theirs.keys()]);
  const keeps = (tag: RevisionTag): boolean => {
    const holder = theirs.get(tag.number);
    return holder === undefined ? !heldThere.has(tag.number) : isSameVersion(tag, holder);
  };
  let next = nextVersionNumber(
    [...local.held, ...remote.held, ...local.versions.map((tag) => tag.number), ...heldThere].map((number) => ({
      number,
    })),
  );
  const steps: VersionRenumbering[] = [];
  const byCreation = local.versions.toSorted(
    (left, right) => left.createdAt - right.createdAt || left.number - right.number,
  );
  for (const tag of byCreation) {
    if (keeps(tag)) {
      continue;
    }
    const landed = local.versions.find(
      (other) => other.number !== tag.number && isSameVersion(other, tag) && keeps(other),
    );
    if (landed === undefined) {
      steps.push(Object.freeze({ name: tag.name, from: tag.number, to: next }));
      next += 1;
    } else {
      steps.push(Object.freeze({ name: tag.name, from: tag.number, to: landed.number }));
    }
  }
  return Object.freeze(steps);
};

/** What {@link renumberUnpushedVersions} is asked. @public */
export type RenumberUnpushedVersionsInput = Readonly<{
  /** The remote that refused. */
  remote: string;
  /**
   * Numbers whose push lost its lease: a rename the remote refused because
   * another device renamed the same version first. Where the remote holds the
   * same version there, the remote's tag wins and replaces this store's.
   */
  adopt?: readonly number[];
  /** The push's signal. */
  signal?: AbortSignal;
}>;

/**
 * Give this device's versions that are not backed up a number no backed-up
 * version holds, after the remote refused one as taken; and give a refused
 * rename back to the remote's.
 *
 * Reads the remote's tags once and fetches them, so the other device's
 * version arrives here too and the next number counts it. Every advertised
 * `refs/tags/v<n>` holds its number, version or not. Each moving version is
 * written at its new number with the same id, entry, name, note, actor and
 * time, and its old number is given back to the version the remote holds
 * there by fetching it again. A move that was interrupted after the new tag
 * was written lets go of its old number and takes no other. A refused rename
 * is let go of the same way, so the fetch puts the remote's tag in its place.
 *
 * @param port - The store.
 * @param input - The remote that refused, the numbers whose lease was lost, and the push's signal.
 * @returns The versions that moved; empty when none had to.
 * @public
 */
export const renumberUnpushedVersions = async (
  port: RevisionPort,
  input: RenumberUnpushedVersionsInput,
): Promise<readonly VersionRenumbering[]> => {
  const signal = input.signal === undefined ? {} : { signal: input.signal };
  const advertised = await port.listRemoteRefs(input.remote, signal);
  const remoteTags: readonly RemoteRef[] = advertised.filter((ref) => versionNumberOfTag(ref.name) !== undefined);
  if (remoteTags.length === 0) {
    return Object.freeze([]);
  }
  const fetchRemoteTags = async (): Promise<void> => {
    await port.fetch({ remote: input.remote, refs: remoteTags.map((ref) => ref.name), advertised, ...signal });
  };
  const numbersOf = (references: ReadonlyArray<Readonly<{ name: string }>>): readonly number[] =>
    references.flatMap((ref) => {
      const number = versionNumberOfTag(ref.name);
      return number === undefined ? [] : [number];
    });
  await fetchRemoteTags();
  const [local, remote, localReferences] = await Promise.all([
    port.listTags(),
    port.listTags({ remote: input.remote }),
    port.listRefs('refs/tags'),
  ]);
  const adopted = (input.adopt ?? []).filter((number) => {
    const mine = local.find((tag) => tag.number === number);
    const theirs = remote.find((tag) => tag.number === number);
    return mine !== undefined && theirs !== undefined && isSameVersion(mine, theirs);
  });
  for (const number of adopted) {
    input.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- one ref per refused rename; the fetch below puts the remote's back.
    await port.deleteTag(number);
  }
  const steps = planVersionRenumbering(
    { versions: local, held: numbersOf(localReferences) },
    { versions: remote, held: numbersOf(remoteTags) },
  );
  for (const step of steps) {
    const tag = local.find((candidate) => candidate.number === step.from);
    if (tag === undefined) {
      continue;
    }
    input.signal?.throwIfAborted();
    const landed = local.find((candidate) => candidate.number === step.to);
    if (landed === undefined || !isSameVersion(landed, tag)) {
      // oxlint-disable-next-line no-await-in-loop -- one tag per moving version, each a ref write of its own.
      await port.tag({
        id: tag.id,
        name: tag.name,
        revisionId: tag.revisionId,
        createdAt: tag.createdAt,
        number: step.to,
        ...(tag.note === undefined ? {} : { note: tag.note }),
        ...(tag.actor === undefined ? {} : { actor: tag.actor }),
      });
    }
    // oxlint-disable-next-line no-await-in-loop -- the old number goes before the next version takes a new one.
    await port.deleteTag(step.from);
  }
  if (steps.length > 0 || adopted.length > 0) {
    await fetchRemoteTags();
  }
  return steps;
};
