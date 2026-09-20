/**
 * What a host publishes from one project's revision tree, and what it feeds in.
 *
 * Both halves were the browser worker's and are host-neutral (W10.5): the Node
 * daemon had no comparator at all, so it emitted a status frame per machine
 * transition and every client repainted for each. They live beside the
 * projection rather than inside `project-revisions.machine.ts` because a
 * machine module may not import the filesystem package
 * (`machines.import-boundary.test.ts`), and a change event and a path policy
 * both come from there.
 */
import type { ChangeEvent, PathPolicy } from '@taucad/filesystem';
import type { RevisionStatusProjection } from '#project-revisions.machine.js';

/**
 * The versioned paths one content-change event touches inside one project.
 *
 * One call per bus event, whatever its path count: the root mints one
 * `generation` per `changed`, and the checkout compares that counter across a
 * mint, so a seam that split an event into several would make a write that
 * landed during a mint invisible (F9, F4). Paths are returned
 * project-relative, which is the namespace the revision tree speaks.
 *
 * @param event - One authority-level change event.
 * @param projectRoot - The project's route, e.g. `/projects/p1`.
 * @param policy - The classifier this project's layout answers with (EQ6).
 * @returns Every versioned project-relative path the event touched.
 * @public
 */
export const versionedChangePaths = (
  event: ChangeEvent,
  projectRoot: string,
  policy: PathPolicy,
): readonly string[] => {
  const absolute =
    'path' in event
      ? [event.path]
      : 'oldPath' in event
        ? [event.oldPath, event.newPath]
        : 'sourcePath' in event
          ? [event.sourcePath, event.targetPath]
          : [];
  const prefix = `${projectRoot}/`;
  return absolute
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length))
    .filter((path) => path !== '' && policy.classify(path).versioned);
};

/**
 * One branch row as the string a reader would see.
 *
 * @param row - The facet row.
 * @returns Its visible fields, joined.
 */
const branchKey = (row: RevisionStatusProjection['branches'][number]): string =>
  [row.name, row.head ?? '', row.checkoutId ?? '', row.checkoutRoot ?? '', ...row.leaseChatIds].join('\u0000');

/**
 * Whether two branch facets say the same thing.
 *
 * The rows are rebuilt on every transition, so identity is never the answer;
 * the pane re-renders only when a name, head, checkout or chat chip moves.
 *
 * @param left - The published rows.
 * @param right - The rows the machine would publish now.
 * @returns True when nothing a reader can see has changed.
 */
const sameBranches = (
  left: RevisionStatusProjection['branches'],
  right: RevisionStatusProjection['branches'],
): boolean => left.map((row) => branchKey(row)).join('\u0001') === right.map((row) => branchKey(row)).join('\u0001');

/**
 * Whether two conflict-card sets say the same thing (W10).
 *
 * Every visible field, including each file's chosen side: the card is the one
 * surface where a person's own click is the state, so a projection that compared
 * only the revision ids would never repaint after *Keep mine*.
 *
 * @param left - The published cards.
 * @param right - The cards the machine would publish now.
 * @returns True when nothing a reader can see has changed.
 */
/**
 * Whether two string lists say the same thing (P28: settled values only).
 *
 * @param left - The published list.
 * @param right - The candidate list.
 * @returns Whether a reader would see the same list.
 */
const sameStrings = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const sameConflicts = (
  left: RevisionStatusProjection['conflicts'],
  right: RevisionStatusProjection['conflicts'],
): boolean => {
  const key = (card: RevisionStatusProjection['conflicts'][number]): string =>
    [
      card.revisionId,
      card.branch ?? '',
      card.labels?.ours ?? '',
      card.labels?.theirs ?? '',
      String(card.busy),
      String(card.ready),
      ...card.paths.map((row) => `${row.path}\u0002${String(row.openable)}\u0002${row.side ?? ''}`),
    ].join('\u0000');
  return left.map((card) => key(card)).join('\u0001') === right.map((card) => key(card)).join('\u0001');
};

/**
 * Whether two projections say the same thing to a reader (P28, P52).
 *
 * Every settled field a surface renders, and nothing that ticks. A field left
 * out here is a surface that never repaints: `remote.*` was missing, so
 * *Connect Tau Cloud* moved `phase` none → connecting → connected and the Sync
 * region kept drawing the disconnected state (W18 DEF-6).
 *
 * @param left - The published projection.
 * @param right - The candidate projection.
 * @returns Whether the page would draw the same thing.
 * @public
 */
export const sameRevisionStatus = (left: RevisionStatusProjection, right: RevisionStatusProjection): boolean =>
  left.checkoutId === right.checkoutId &&
  left.checkoutRoot === right.checkoutRoot &&
  left.branch === right.branch &&
  left.projectDirty === right.projectDirty &&
  left.dirty === right.dirty &&
  left.minting === right.minting &&
  left.headRevisionId === right.headRevisionId &&
  left.follow === right.follow &&
  left.attention === right.attention &&
  left.branchVerb.busy === right.branchVerb.busy &&
  left.branchVerb.asking === right.branchVerb.asking &&
  left.branchVerb.branch === right.branchVerb.branch &&
  /* The Sync row and the header chip are settled values (A38, P28), so this is
   * the whole of what a reader can see change about sync. */
  left.sync.state === right.sync.state &&
  left.sync.pendingCount === right.sync.pendingCount &&
  left.sync.online === right.sync.online &&
  left.sync.conflictRef === right.sync.conflictRef &&
  /* P52/DEF-6: the Sync region renders the *connection*, not only the push
   * queue. Without these, `Connect Tau Cloud` moved `remote.phase` from
   * `none` to `connecting` to `connected` and the page never repainted
   * unless some unrelated field happened to move at the same time. */
  left.remote.phase === right.remote.phase &&
  left.remote.kind === right.remote.kind &&
  left.remote.url === right.remote.url &&
  left.remote.storage?.used === right.remote.storage?.used &&
  left.remote.storage?.quota === right.remote.storage?.quota &&
  left.remote.error === right.remote.error &&
  sameStrings(left.remote.overQuota, right.remote.overQuota) &&
  /* The same gap, in the two other facets the projection carries and a
   * surface reads: the restore confirmation (S19) and the Publish dialog
   * (S32). One comparator, every settled facet. */
  left.restore.asking === right.restore.asking &&
  left.restore.busy === right.restore.busy &&
  left.restore.removedPathCount === right.restore.removedPathCount &&
  left.restore.dirty === right.restore.dirty &&
  left.restore.revisionNumber === right.restore.revisionNumber &&
  left.publish.phase === right.publish.phase &&
  left.publish.publicationId === right.publish.publicationId &&
  left.publish.shareUrl === right.publish.shareUrl &&
  left.publish.error === right.publish.error &&
  sameStrings(
    left.publish.tags.map((tag) => tag.name),
    right.publish.tags.map((tag) => tag.name),
  ) &&
  sameBranches(left.branches, right.branches) &&
  sameConflicts(left.conflicts, right.conflicts);
