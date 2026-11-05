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

/** The projection fields a reading is derived from. @public */
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
>;

/**
 * What one merged projection says about readiness, before monotonicity.
 *
 * The tree apply still writes every file before it releases its bracket, so
 * `entryReady` and `materialized` are reached together until the tree is read
 * from the index (W4); this answers the later of the two.
 *
 * @param status - A projection with the host's fill facet and apply bracket merged.
 * @param largeObjectsTold - Whether the fill has given its word on this checkout
 *   yet. Until it has, an absent facet is silence, not "nothing to fill", and the
 *   reading stops at `materialized`.
 * @returns The state it shows, and the tree that state is about.
 * @public
 */
export const readinessOf = (status: ReadinessSource, largeObjectsTold = true): ProjectReadinessReading => {
  const tree = status.headRevisionId === undefined ? undefined : `${status.checkoutId ?? ''}:${status.headRevisionId}`;
  if (!status.registrySettled || status.checkoutRoot === undefined) {
    return { state: 'connected', tree };
  }
  const applying =
    status.sync.pullPhase === 'applying' || (status.applyingRoots?.includes(status.checkoutRoot) ?? false);
  const written = status.largeObjects === undefined && largeObjectsTold ? 'filled' : 'materialized';
  if (applying) {
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
 * A new tree (restore, switch, pull, or the first head) re-enters at whatever
 * its own reading says; the announcement of the new tree comes with it, so no
 * state regresses about a tree it was already reported for (I7).
 *
 * One step back is taken, because I7 asks for truth first: `filled` gives way to
 * `materialized` when the fill names a pointer in the same tree, since a render
 * over that pointer would be partial geometry. The fill tells before it asks for
 * its first object, so this is a refill after a wholesale write, never the open.
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
  previous === undefined ||
  previous.tree !== next.tree ||
  rank(next.state) >= rank(previous.state) ||
  (previous.state === 'filled' && next.state === 'materialized')
    ? next
    : previous;
