/**
 * Version numbers: V1, V2, … once per project, across every branch (blueprint
 * B6, Q6, Q13, I6).
 *
 * A version's number lives in its own tag (`Tau-Tag` trailer, `number`); there
 * is no counter, so the next number is the highest known plus one. V1 is the
 * Start entry (A6, `start-version.ts`), which has no tag, so a tag's number is
 * 2 or more. A tag written before numbers records none and is numbered when
 * read, V2 onward in the order the tags were created, around any number
 * another tag already records; that is reader logic, not a migration (I7).
 *
 * A number is provisional until its version is backed up. Tau Cloud refuses a
 * tag whose number another version holds (`GIT_PUSH_VERSION_NUMBER_TAKEN`,
 * Revisions Policy rule 19); the device then gives its own version that is
 * not backed up the next free number and pushes again
 * ({@link renumberUnpushedVersions}). Only that device has seen the
 * provisional number, so nothing anyone else saw changes, and a backed-up
 * number never changes. Versions cannot be removed (Q13), so no number is ever
 * retired.
 */

import type { RemoteRef, RevisionPort, RevisionTag } from '#revision-port.js';
import type { VersionRenumbering } from '#sync.types.js';

/** The Start entry's number: every project's first entry is V1 (A6, Q8). @public */
export const startVersionNumber = 1;

/** What numbering reads of one tag. @public */
export type VersionNumberSource = Readonly<{ name: string; createdAt: number; number?: number }>;

const tagRefPrefix = 'refs/tags/';

/* Creation order, ties by name in code-unit order so every host agrees. */
const byCreation = (left: VersionNumberSource, right: VersionNumberSource): number =>
  left.createdAt - right.createdAt || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0);

/**
 * Give every tag the number it reads as.
 *
 * A tag that records a number keeps it. A tag that records none (written
 * before numbers, or not by Tau) takes, in creation order, the lowest number
 * from V2 that no recorded tag holds: three such tags read V2, V3 and V4.
 *
 * @param tags - The store's tags as the port read them.
 * @returns The same tags, each with its `number`, in the same order.
 * @public
 * @example <caption>Two tags written before numbers, read in creation order</caption>
 * ```typescript
 * import { numberVersions } from '@taucad/revisions';
 *
 * numberVersions([
 *   { name: 'Lid', createdAt: 2 },
 *   { name: 'Base', createdAt: 1 },
 * ]).map((tag) => tag.number); // [3, 2]
 * ```
 */
export const numberVersions = <Tag extends VersionNumberSource>(
  tags: readonly Tag[],
): ReadonlyArray<Tag & Readonly<{ number: number }>> => {
  const held = new Set(tags.flatMap((tag) => (tag.number === undefined ? [] : [tag.number])));
  const read = new Map<string, number>();
  let next = startVersionNumber + 1;
  for (const tag of tags.filter((candidate) => candidate.number === undefined).toSorted(byCreation)) {
    while (held.has(next)) {
      next += 1;
    }
    read.set(tag.name, next);
    next += 1;
  }
  return Object.freeze(
    tags.map((tag) =>
      tag.number === undefined
        ? Object.freeze({ ...tag, number: read.get(tag.name) ?? startVersionNumber + 1 })
        : (tag as Tag & Readonly<{ number: number }>),
    ),
  );
};

/**
 * The number the next new version takes: the highest known plus one.
 *
 * @param tags - The store's tags, each with the number it reads as.
 * @returns At least 2, because V1 is Start.
 * @public
 */
export const nextVersionNumber = (tags: ReadonlyArray<Readonly<{ number?: number }>>): number =>
  Math.max(startVersionNumber, ...tags.flatMap((tag) => (tag.number === undefined ? [] : [tag.number]))) + 1;

/**
 * The number a tag written under `name` records: the one that name already
 * has, so moving a version keeps its number, or the next one.
 *
 * @param tags - The store's tags, each with the number it reads as.
 * @param name - The tag's name.
 * @returns The number to write into its trailer.
 * @public
 */
export const versionNumberFor = (
  tags: ReadonlyArray<Readonly<{ name: string; number?: number }>>,
  name: string,
): number => tags.find((tag) => tag.name === name)?.number ?? nextVersionNumber(tags);

/**
 * Which of this device's versions must move before they can be backed up.
 *
 * A version the remote already holds keeps its number. Each other version, in
 * creation order, keeps its number while no earlier one holds it and
 * otherwise takes the highest known plus one.
 *
 * @param tags - The store's tags, each with the number it reads as.
 * @param backedUp - The names the remote holds.
 * @returns One step per version that moves, in creation order.
 * @public
 */
export const planVersionRenumbering = (
  tags: readonly VersionNumberSource[],
  backedUp: ReadonlySet<string>,
): readonly VersionRenumbering[] => {
  const claimed = new Set(
    tags.flatMap((tag) => (backedUp.has(tag.name) && tag.number !== undefined ? [tag.number] : [])),
  );
  let next = nextVersionNumber(tags);
  const steps: VersionRenumbering[] = [];
  for (const tag of tags.filter((candidate) => !backedUp.has(candidate.name)).toSorted(byCreation)) {
    if (tag.number === undefined) {
      continue;
    }
    if (!claimed.has(tag.number)) {
      claimed.add(tag.number);
      continue;
    }
    steps.push(Object.freeze({ name: tag.name, from: tag.number, to: next }));
    claimed.add(next);
    next += 1;
  }
  return Object.freeze(steps);
};

/**
 * Give this device's versions that are not backed up a number no backed-up
 * version holds, after the remote refused one as taken.
 *
 * Reads the remote's tags once, fetches them (so the other device's version
 * arrives here too and the next number counts it), and re-writes each moving
 * tag with its new number on the same revision, note, actor and time.
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
  const advertised = await port.listRemoteRefs(
    input.remote,
    input.signal === undefined ? {} : { signal: input.signal },
  );
  const remoteTags: readonly RemoteRef[] = advertised.filter((ref) => ref.name.startsWith(tagRefPrefix));
  if (remoteTags.length > 0) {
    await port.fetch({
      remote: input.remote,
      refs: remoteTags.map((ref) => ref.name),
      advertised,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  }
  const tags: readonly RevisionTag[] = await port.listTags();
  const steps = planVersionRenumbering(tags, new Set(remoteTags.map((ref) => ref.name.slice(tagRefPrefix.length))));
  for (const step of steps) {
    const tag = tags.find((candidate) => candidate.name === step.name);
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
  }
  return steps;
};
