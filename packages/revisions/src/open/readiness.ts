import type { ProjectReadiness, RevisionStatusProjection } from '#project-revisions.types.js';

/**
 * The readiness states in the order a project reaches them (D10).
 *
 * - `connected` — the project is known, nothing of its tree is.
 * - `treeReady` — the tree is known: the tree and file list can render.
 * - `entryReady` — the entry closure (`tau.json` and the files it names) is readable.
 * - `materialized` — every authored text file is a file.
 * - `filled` — every large object is here too.
 *
 * @public
 */
export const projectReadinessStates: readonly ProjectReadiness[] = [
  'connected',
  'treeReady',
  'entryReady',
  'materialized',
  'filled',
];

/**
 * One reading of a project's readiness, and the tree it is about.
 *
 * States are monotonic within one tree only (I7): `tree` is what tells a later
 * reading whether it may fall back.
 *
 * @public
 */
export type ProjectReadinessReading = Readonly<{
  state: ProjectReadiness;
  /** The checkout and head the state is about; `undefined` before a head exists. */
  tree: string | undefined;
}>;

const rank = (state: ProjectReadiness): number => projectReadinessStates.indexOf(state);

/**
 * Whether a project in `state` serves a surface that needs `needed`.
 *
 * An unknown state serves nothing: unknown is never shown as empty (I7).
 *
 * @param state - The project's readiness, or `undefined` when unknown.
 * @param needed - The state the surface needs.
 * @returns `true` when `state` is `needed` or later.
 * @public
 */
export const reachesReadiness = (state: ProjectReadiness | undefined, needed: ProjectReadiness): boolean =>
  state !== undefined && rank(state) >= rank(needed);

/**
 * The projection fields a reading is derived from, and whether the entry
 * closure of the tree being written has landed: the host asks the checkout's
 * index, which knows every entry of that tree before any lands (D10).
 *
 * @public
 */
export type ReadinessSource = Pick<
  RevisionStatusProjection,
  | 'checkoutId'
  | 'checkoutRoot'
  | 'headRevisionId'
  | 'registrySettled'
  | 'remote'
  | 'sync'
  | 'largeObjects'
  | 'applyingRoots'
> &
  Readonly<{
    entryClosureLanded?: boolean;
    /** The last write of another revision's tree failed: that tree was never written whole. */
    treeWriteFailed?: boolean;
  }>;

/**
 * What one merged projection says about readiness, before monotonicity.
 *
 * While a write holds the tree it reads `treeReady`, then `entryReady` once
 * its entry closure has landed: the write lands the closure first, and the
 * checkout's index knows every entry of the tree, each placeholder with its
 * object, before any lands (D10). The write's end reads `materialized`, or
 * `filled` once the fill has nothing left to bring.
 *
 * @param status - A projection with the host's fill facet and apply bracket merged.
 * @param largeObjectsTold - Whether the fill has given its word on this checkout
 *   yet. Until it has, an absent facet is silence, not "nothing to fill", and the
 *   reading stops at `materialized`.
 * @param treeWrites - How many writes of another revision's tree (purpose
 *   `tree`) the host has seen begin on this checkout. Each one is a new tree,
 *   announced as the write begins, before any state of it is read (I7).
 * @returns The state it shows, and the tree that state is about.
 * @public
 */
export const readinessOf = (
  status: ReadinessSource,
  largeObjectsTold = true,
  treeWrites = 0,
): ProjectReadinessReading => {
  const tree =
    status.headRevisionId === undefined && treeWrites === 0
      ? undefined
      : `${status.checkoutId ?? ''}:${status.headRevisionId ?? ''}:${String(treeWrites)}`;
  if (!status.registrySettled || status.checkoutRoot === undefined) {
    return { state: 'connected', tree };
  }
  const applying =
    status.sync.pullPhase === 'applying' || (status.applyingRoots?.includes(status.checkoutRoot) ?? false);
  /* With no revision behind the checkout no placeholder can be in it, so silence there is "nothing to fill". */
  const written =
    status.largeObjects === undefined && (largeObjectsTold || tree === undefined) ? 'filled' : 'materialized';
  if (applying) {
    return { state: status.entryClosureLanded === true ? 'entryReady' : 'treeReady', tree };
  }
  if (status.treeWriteFailed === true) {
    /* An aborted write of a new tree: known, never `materialized` (I7 keeps what it already showed). */
    return { state: 'treeReady', tree };
  }
  if (tree !== undefined || status.remote.phase === 'none') {
    /* A local project with no revision yet is complete: its files are the only copy. */
    return { state: written, tree };
  }
  /* A remote project with no head has not shown its tree yet, unless the open already applied it. */
  return { state: status.sync.hasAppliedRemote === true ? written : 'connected', tree };
};

/**
 * The next published reading: never earlier than the last one about the same tree.
 *
 * A new tree (a restore, switch, pull or merge write, or a new head)
 * re-enters at whatever its own reading says; the announcement of the new tree
 * comes with it, so no state regresses about a tree it was already reported
 * for (I7). Within one tree nothing steps back: a write of another revision's
 * tree is a new tree from the moment it begins, and the fill of the old one
 * ends silently with it, so a pointer that write leaves is told about the new
 * tree, never the old.
 *
 * @param previous - The last published reading, if any.
 * @param next - The reading the current projection gives.
 * @returns The reading to publish.
 * @public
 */
export const settleReadiness = (
  previous: ProjectReadinessReading | undefined,
  next: ProjectReadinessReading,
): ProjectReadinessReading =>
  previous === undefined || previous.tree !== next.tree || rank(next.state) >= rank(previous.state) ? next : previous;
