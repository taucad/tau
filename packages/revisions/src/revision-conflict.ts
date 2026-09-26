/**
 * Conflict lines, and reading a conflicted revision back into its three trees.
 *
 * A conflicted revision is a value in the graph (A22, D14): it sits on its
 * **conflict line** `refs/heads/conflicts/<branch>/<device>`, where `<branch>`
 * is the line the decision lands on, its tree is the other side's own tree — no
 * marker bytes are ever written into anyone's files (I7) — and its `jj:trees`
 * header records the three terms in Jujutsu's add/remove order (`ours`, `base`,
 * `theirs`) with a label each.
 *
 * Its parents are the two diverged heads — `parents[0]` the other side,
 * `parents[1]` the recording device's side — and then the line's previous tip,
 * so the line only ever fast-forwards and travels like any history ref. The
 * terms are addressed through those parents rather than the header's tree ids,
 * because the port reads trees by revision; the header stays authoritative for
 * anything that reads this repository without Tau.
 *
 * Nothing here is engine-specific: it is `readRevision`, `readTree`, `log`,
 * `divergence` and the three-way merge, so both legs answer identically by
 * construction and the conformance suite proves it once.
 */

import { ImmutableRevisionTree, mergeRevisionTrees, renderConflictMarkers, revisionId } from '#algorithms/index.js';
import type {
  ConflictMarkerLabels,
  MergeRevisionTreesOptions,
  RevisionId,
  RevisionTreeConflict,
} from '#algorithms/index.js';
import { mergeBaseHeads, mergeBaseOf } from '#revision-log-order.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort } from '#revision-port.js';

/** The reserved branch prefix conflict lines live under (D14). */
const conflictLinePrefix = 'conflicts';

/**
 * Whether a person may not name a branch this: `conflicts` and everything under
 * it belong to decisions that travel between devices (D14).
 *
 * @param name - A proposed branch name, without `refs/heads/`.
 * @returns `true` when the name is reserved.
 * @public
 */
export const isReservedBranchName = (name: string): boolean =>
  name === conflictLinePrefix || name.startsWith(`${conflictLinePrefix}/`);

/* Bytes a segment keeps as they are; everything else is escaped. */
const plainSegmentByte = /^[a-z0-9-]$/u;

/**
 * One device's id as a ref-name segment (D14, RV-W6 F7).
 *
 * An escape encoding, not a hash, so an engineer can still read whose line it
 * is: lowercase letters, digits and `-` stay; every other UTF-8 byte — `_`,
 * uppercase, `.`, `:` and anything a ref forbids — becomes `_` and two
 * lowercase hex digits. Distinct ids give distinct segments (`_` is itself
 * escaped), the result is always a valid ref component (no `.`, so no `..`,
 * leading dot or `.lock`), and it has no case for a case-insensitive disk to
 * fold. `host:user` reads `host_3auser`.
 *
 * @param deviceId - The host's device id.
 * @returns The segment, stable for one id.
 */
const deviceSegment = (deviceId: string): string => {
  if (deviceId === '') {
    /* Not an escape any id produces, so it cannot collide. */
    return '_';
  }
  let segment = '';
  for (const byte of new TextEncoder().encode(deviceId)) {
    const character = String.fromCodePoint(byte);
    segment += plainSegmentByte.test(character) ? character : `_${byte.toString(16).padStart(2, '0')}`;
  }
  return segment;
};

/**
 * The conflict line one device records its decisions about `branch` on (D14).
 *
 * @param branch - The line the decision lands on, e.g. `main`.
 * @param deviceId - The recording device.
 * @returns The branch name, without `refs/heads/`.
 * @public
 */
export const conflictLineOf = (branch: string, deviceId: string): string =>
  `${conflictLinePrefix}/${branch}/${deviceSegment(deviceId)}`;

/**
 * What a conflict line is about, or `undefined` for any other branch.
 *
 * @param line - A branch name, with or without `refs/heads/`.
 * @param deviceId - This host's device id, to say whether the line is its own.
 * @returns The line the decision lands on, and whether another device recorded it.
 * @public
 */
export const parseConflictLine = (
  line: string,
  deviceId: string | undefined,
): Readonly<{ into: string; foreign: boolean }> | undefined => {
  const name = line.startsWith('refs/heads/') ? line.slice('refs/heads/'.length) : line;
  const segments = name.split('/');
  if (segments[0] !== conflictLinePrefix || segments.length < 3) {
    return undefined;
  }
  return {
    into: segments.slice(1, -1).join('/'),
    foreign: deviceId === undefined || segments.at(-1) !== deviceSegment(deviceId),
  };
};

/**
 * Where a conflicted revision is read from (D14): this device's current tip of
 * the line the decision lands on, and whether this device recorded it.
 *
 * @public
 */
export type ConflictPerspective = Readonly<{
  /** `<branch>`'s head on this device, when it has one. */
  head: string | undefined;
  /** Whether the conflict line is this device's own. */
  recorder: boolean;
}>;

/** What a conflicted revision's middle term is called. @public */
const conflictBaseLabel = 'base';

/**
 * The `jj:conflict-labels` value for a two-sided conflict.
 *
 * Odd count, add/remove order: the side the merge was made *from* first, the
 * base it removed, then the side it collided with.
 *
 * @param labels - The two branch names a person would recognise.
 * @returns The header's three labels, in term order.
 * @public
 */
export const conflictLabels = (labels: ConflictMarkerLabels): readonly string[] =>
  Object.freeze([labels.ours, conflictBaseLabel, labels.theirs]);

/** The three trees one conflicted revision was made from, and what did not settle. @public */
export type RevisionConflictTerms = Readonly<{
  /** The common ancestor, or the empty tree when the two lines share none. */
  base: ImmutableRevisionTree;
  /** The branch the person was on when they merged. */
  ours: ImmutableRevisionTree;
  /** The branch they merged. */
  theirs: ImmutableRevisionTree;
  /** The revisions those trees came from, for a caller that records provenance. */
  revisions: Readonly<{ base: string | undefined; ours: string; theirs: string }>;
  labels: ConflictMarkerLabels;
  /** Everything that did not settle, sorted by path. */
  conflicts: readonly RevisionTreeConflict[];
  /** Everything that did, as a tree — the left-hand side of any resolution. */
  merged: ImmutableRevisionTree;
}>;

/** What one conflicted path is materialized for. @public */
export type MaterializeConflictInput = Readonly<{
  /** The conflicted revision. */
  revisionId: string;
  /** One conflicted path inside it. */
  path: string;
}>;

/**
 * Which two revisions one device compares, as mine and theirs (D14).
 *
 * On the recording device mine is its own recorded side and theirs the other;
 * whichever of them `<branch>` already contains is read as `<branch>`'s tip, so
 * work the line gained after the conflict was recorded is one of the terms and
 * a resolution never drops it. On any other device mine is simply its own tip
 * and theirs the recorded side that tip does not contain yet — the same card,
 * from where it stands.
 *
 * @param port - The store.
 * @param parents - `otherSide` is `parents[0]`, `recorderSide` is `parents[1]`.
 * @param perspective - This device's tip, and whether it recorded the conflict.
 * @returns The two revisions to merge.
 */
const sidesOf = async (
  port: RevisionPort,
  parents: Readonly<{ otherSide: RevisionId; recorderSide: RevisionId }>,
  perspective: ConflictPerspective | undefined,
): Promise<Readonly<{ mine: RevisionId; theirs: RevisionId }>> => {
  const { otherSide, recorderSide } = parents;
  const head = perspective?.head === undefined ? undefined : revisionId(perspective.head);
  if (head === undefined || perspective === undefined) {
    return { mine: recorderSide, theirs: otherSide };
  }
  const contains = async (revision: RevisionId): Promise<boolean> => {
    if (revision === head) {
      return true;
    }
    const { behind } = await port.divergence({ head, base: revision });
    return behind === 0;
  };
  if (!perspective.recorder) {
    /* Theirs is whichever recorded side this tip does not hold yet: the other
     * device's work after a sync divergence, the merged branch after a branch
     * merge (RV-W6 F1). */
    return { mine: head, theirs: (await contains(otherSide)) ? recorderSide : otherSide };
  }
  if (await contains(recorderSide)) {
    return { mine: head, theirs: otherSide };
  }
  return (await contains(otherSide)) ? { mine: recorderSide, theirs: head } : { mine: recorderSide, theirs: otherSide };
};

/**
 * Read one conflicted revision's three terms and re-derive what did not settle.
 *
 * @param port - The store holding the revision.
 * @param id - The conflicted revision.
 * @param options - The host's merge options: the same parameter codec the merge
 *   that recorded the conflict used, so the terms settle as it did (D12); and
 *   `perspective`, this device's tip of the line the decision lands on. Without
 *   it the terms are the two recorded sides.
 * @returns Its terms, or `undefined` when the revision records no conflict.
 * @throws RevisionPortError When the store does not hold the revision.
 * @public
 *
 * @example <caption>Which files a person still has to choose between</caption>
 * ```typescript
 * import { readConflictTerms } from '@taucad/revisions';
 * import type { RevisionPort } from '@taucad/revisions';
 *
 * declare const port: RevisionPort;
 * const terms = await readConflictTerms(port, 'a1b2c3');
 * terms?.conflicts.map((conflict) => conflict.path); // ['enclosure.ts']
 * ```
 */
export const readConflictTerms = async (
  port: RevisionPort,
  id: string,
  options: MergeRevisionTreesOptions & Readonly<{ perspective?: ConflictPerspective }> = {},
): Promise<RevisionConflictTerms | undefined> => {
  const { perspective } = options;
  const record = await port.readRevision(revisionId(id));
  if (record === undefined) {
    throw new RevisionPortError('UNKNOWN_REVISION', 'This project no longer holds that conflicted revision.');
  }
  const recorded = await port.conflicts(revisionId(id));
  const [otherSide, recorderSide] = record.parents;
  if (recorded === undefined || otherSide === undefined || recorderSide === undefined) {
    return undefined;
  }
  const { mine: ourRevision, theirs: theirRevision } = await sidesOf(port, { otherSide, recorderSide }, perspective);

  const graph = await port.log({ heads: mergeBaseHeads(theirRevision, ourRevision) });
  const baseRevision = mergeBaseOf(graph, theirRevision, ourRevision);
  const [base, theirs, ours] = await Promise.all([
    baseRevision === undefined ? undefined : port.readTree(baseRevision),
    port.readTree(theirRevision),
    port.readTree(ourRevision),
  ]);
  if (ours === undefined || theirs === undefined) {
    throw new RevisionPortError('UNKNOWN_REVISION', 'This project no longer holds both sides of that conflict.');
  }
  /* The empty tree is the honest base for two lines that share no history: every
   * path is then an add on one side or the other, which is exactly true. */
  const common = base ?? new ImmutableRevisionTree([]);
  const merged = mergeRevisionTrees(common, ours, theirs, options);
  const labels = {
    ours: recorded.labels[0] ?? 'mine',
    theirs: recorded.labels[2] ?? 'theirs',
  };
  return Object.freeze({
    base: common,
    ours,
    theirs,
    revisions: { base: baseRevision, ours: ourRevision, theirs: theirRevision },
    labels,
    conflicts: merged.status === 'conflicted' ? merged.conflicts : Object.freeze([]),
    merged: merged.status === 'conflicted' ? merged.merged : merged.tree,
  });
};

/**
 * Render one conflicted path as marker text.
 *
 * The bytes never touch a checkout: this is what an editor is *handed*, and
 * what comes back is a resolution, not a file the next cut would record with
 * `<<<<<<<` in it (A22, AC14).
 *
 * @param port - The store holding the revision.
 * @param input - The conflicted revision and the path inside it.
 * @param options - The host's merge options and this device's perspective, as {@link readConflictTerms} takes them.
 * @returns Marker text, or `undefined` when the path is binary, is not
 *   conflicted, or the revision records no conflict at all.
 * @public
 */
export const materializeConflict = async (
  port: RevisionPort,
  input: MaterializeConflictInput,
  options: MergeRevisionTreesOptions & Readonly<{ perspective?: ConflictPerspective }> = {},
): Promise<string | undefined> => {
  const terms = await readConflictTerms(port, input.revisionId, options);
  if (terms === undefined || !terms.conflicts.some((conflict) => conflict.path === input.path)) {
    return undefined;
  }
  return renderConflictMarkers({
    base: terms.base.get(input.path),
    ours: terms.ours.get(input.path),
    theirs: terms.theirs.get(input.path),
    labels: terms.labels,
  });
};
