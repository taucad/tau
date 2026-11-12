/**
 * Version numbers: V1, V2, … once per project, across every branch (blueprint
 * B6, Q6, Q13, I6).
 *
 * A version is an annotated tag at `refs/tags/v<number>`: the ref is the
 * number, and the free-text name ("Ready for print") lives in the tag's
 * message and its `Tau-Tag` trailer, so any name is a valid version name and
 * a rename rewrites the tag at the same ref. There is no counter: the next
 * number is the highest known plus one. V1 is the Start entry (A6,
 * `start-version.ts`), which has no tag, so a version tag's number is 2 or
 * more. A tag under any other ref is not a version (I7: no reader for the
 * name-based tags written before this).
 *
 * A version is identified by the entry it names and when it was created
 * ({@link isSameVersion}); a rename keeps both. A number is provisional until
 * its version is backed up. Tau Cloud refuses a version tag whose number
 * another version holds (`GIT_PUSH_VERSION_NUMBER_TAKEN`, Revisions Policy
 * rule 19); the device then moves its own version that is not backed up to the
 * next free number and pushes again ({@link renumberUnpushedVersions}). Only
 * that device has seen the provisional number, so nothing anyone else saw
 * changes, and a backed-up number never changes. Versions cannot be removed
 * (Q13), so no number is ever retired.
 */

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
 * The number the next new version takes: the highest known plus one.
 *
 * @param tags - The versions this store knows.
 * @returns At least 2, because V1 is Start.
 * @public
 */
export const nextVersionNumber = (tags: ReadonlyArray<Readonly<{ number: number }>>): number =>
  Math.max(startVersionNumber, ...tags.map((tag) => tag.number)) + 1;

/**
 * Whether two tags are the same version: the same entry, created at the same
 * time. A rename rewrites the tag but keeps both; two devices that each made
 * a version offline differ in at least one.
 *
 * @param left - One version.
 * @param right - The other.
 * @returns True when they are one version.
 * @public
 */
export const isSameVersion = (
  left: Readonly<Pick<RevisionTag, 'revisionId' | 'createdAt'>>,
  right: Readonly<Pick<RevisionTag, 'revisionId' | 'createdAt'>>,
): boolean => left.revisionId === right.revisionId && left.createdAt === right.createdAt;

/** What a port writes for one {@link CreateRevisionTagInput}. @public */
export type VersionTagWrite = Readonly<{
  number: number;
  name: string;
  revisionId: RevisionTag['revisionId'];
  note: string | undefined;
  actor: RevisionActor | undefined;
  createdAt: number;
}>;

/**
 * What one `tag` call writes, decided the same way on both engines.
 *
 * With no number it is a new version and takes the next one. A number that
 * already names a version is a rename: the version keeps the entry it names,
 * when it was created and who created it, takes the new name, and keeps its
 * note unless a new one is given. Any other number is written as given, which
 * is how a renumbered version moves.
 *
 * @param tags - The versions this store holds.
 * @param input - The call's input.
 * @param now - The store's clock, for a new version.
 * @returns The tag to write.
 * @throws RevisionPortError `UNSUPPORTED_OPERATION` when a rename names another entry: a version never moves.
 * @public
 */
export const versionTagWrite = (
  tags: readonly RevisionTag[],
  input: CreateRevisionTagInput,
  now: number,
): VersionTagWrite => {
  const existing = input.number === undefined ? undefined : tags.find((tag) => tag.number === input.number);
  if (existing === undefined) {
    return Object.freeze({
      number: input.number ?? nextVersionNumber(tags),
      name: input.name,
      revisionId: input.revisionId,
      note: input.note,
      actor: input.actor,
      createdAt: input.createdAt ?? now,
    });
  }
  if (existing.revisionId !== input.revisionId) {
    throw new RevisionPortError(
      'UNSUPPORTED_OPERATION',
      `${versionTagName(existing.number)} names another entry: a version keeps the entry it was made on.`,
    );
  }
  return Object.freeze({
    number: existing.number,
    name: input.name,
    revisionId: existing.revisionId,
    note: input.note ?? existing.note,
    actor: existing.actor,
    createdAt: existing.createdAt,
  });
};

/**
 * Which of this device's versions must move before they can be backed up.
 *
 * A version the remote holds under the same number keeps it. Each other
 * version, in creation order, keeps its number while the remote does not hold
 * that number, and otherwise takes the highest number either side knows plus
 * one.
 *
 * @param local - This store's versions.
 * @param remote - The remote's versions, as last fetched.
 * @returns One step per version that moves, in creation order.
 * @public
 */
export const planVersionRenumbering = (
  local: readonly RevisionTag[],
  remote: readonly RevisionTag[],
): readonly VersionRenumbering[] => {
  const held = new Map(remote.map((tag) => [tag.number, tag] as const));
  let next = nextVersionNumber([...local, ...remote]);
  const steps: VersionRenumbering[] = [];
  const byCreation = local.toSorted((left, right) => left.createdAt - right.createdAt || left.number - right.number);
  for (const tag of byCreation) {
    const holder = held.get(tag.number);
    if (holder === undefined || isSameVersion(tag, holder)) {
      continue;
    }
    steps.push(Object.freeze({ name: tag.name, from: tag.number, to: next }));
    next += 1;
  }
  return Object.freeze(steps);
};

/**
 * Give this device's versions that are not backed up a number no backed-up
 * version holds, after the remote refused one as taken.
 *
 * Reads the remote's tags once and fetches them, so the other device's
 * version arrives here too and the next number counts it. Each moving version
 * is written at its new number with the same entry, name, note, actor and
 * time, and its old number is given back to the version the remote holds
 * there by fetching it again.
 *
 * @param port - The store.
 * @param input - The remote that refused, and the push's signal.
 * @returns The versions that moved; empty when none had to.
 * @public
 */
export const renumberUnpushedVersions = async (
  port: RevisionPort,
  input: Readonly<{ remote: string; signal?: AbortSignal }>,
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
  await fetchRemoteTags();
  const local = await port.listTags();
  const steps = planVersionRenumbering(local, await port.listTags({ remote: input.remote }));
  for (const step of steps) {
    const tag = local.find((candidate) => candidate.number === step.from);
    if (tag === undefined) {
      continue;
    }
    input.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- one tag per moving version, each a ref write of its own.
    await port.tag({
      name: tag.name,
      revisionId: tag.revisionId,
      createdAt: tag.createdAt,
      number: step.to,
      ...(tag.note === undefined ? {} : { note: tag.note }),
      ...(tag.actor === undefined ? {} : { actor: tag.actor }),
    });
    // oxlint-disable-next-line no-await-in-loop -- the old number goes before the next version takes a new one.
    await port.deleteTag(step.from);
  }
  if (steps.length > 0) {
    await fetchRemoteTags();
  }
  return steps;
};
