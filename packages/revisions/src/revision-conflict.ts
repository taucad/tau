/**
 * Reading a conflicted revision back into the three trees it was made from.
 *
 * A conflicted revision is a value in the graph (A22): it sits on the source
 * branch, its tree is that branch's own tree — no marker bytes are ever written
 * into anyone's files — and its `jj:trees` header records the three terms in
 * Jujutsu's add/remove order (`ours`, `base`, `theirs`) with a label each.
 *
 * The terms are addressed through the revision's **parents** rather than those
 * tree ids, because the port reads trees by revision and a bare tree id is not
 * something either engine exposes. A merge revision already names both sides —
 * `parents[0]` is the source branch it was minted on, `parents[1]` the branch it
 * collided with — and their merge base is the same graph question the merge
 * itself asked. The header stays authoritative for anything that reads this
 * repository without Tau.
 *
 * Nothing here is engine-specific: it is `readRevision`, `readTree`, `log` and
 * the three-way merge, so both legs answer identically by construction and the
 * conformance suite proves it once per row rather than twice per adapter.
 */

import { ImmutableRevisionTree, mergeRevisionTrees, renderConflictMarkers, revisionId } from '#algorithms/index.js';
import type { ConflictMarkerLabels, RevisionTreeConflict } from '#algorithms/index.js';
import { mergeBaseHeads, mergeBaseOf } from '#revision-log-order.js';
import { RevisionPortError } from '#revision-port.js';
import type { RevisionPort } from '#revision-port.js';

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
 * Read one conflicted revision's three terms and re-derive what did not settle.
 *
 * @param port - The store holding the revision.
 * @param id - The conflicted revision.
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
export const readConflictTerms = async (port: RevisionPort, id: string): Promise<RevisionConflictTerms | undefined> => {
  const record = await port.readRevision(revisionId(id));
  if (record === undefined) {
    throw new RevisionPortError('UNKNOWN_REVISION', 'This project no longer holds that conflicted revision.');
  }
  const recorded = await port.conflicts(revisionId(id));
  /* First parent is the branch the conflict was minted on — the one a person
   * merged *from*, so its own first-parent line keeps counting — and the second
   * is the branch they were on. "Mine" is therefore the second parent. */
  const [theirRevision, ourRevision] = record.parents;
  if (recorded === undefined || theirRevision === undefined || ourRevision === undefined) {
    return undefined;
  }

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
  const merged = mergeRevisionTrees(common, ours, theirs);
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
 * @returns Marker text, or `undefined` when the path is binary, is not
 *   conflicted, or the revision records no conflict at all.
 * @public
 */
export const materializeConflict = async (
  port: RevisionPort,
  input: MaterializeConflictInput,
): Promise<string | undefined> => {
  const terms = await readConflictTerms(port, input.revisionId);
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
