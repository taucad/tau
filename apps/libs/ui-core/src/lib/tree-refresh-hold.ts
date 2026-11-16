import type { RevisionStatusProjection } from '@taucad/revisions';

/** The projection reader a hold follows: a revision client's `status` and `subscribe`. */
type ApplyingStatusSource = Readonly<{
  status: () => RevisionStatusProjection | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

/** The tree whose directory re-reads a hold pauses, and lets one re-read of what it listed through at its first view. */
type PausableTree = Readonly<{ pauseRefreshes: () => () => void; refreshListedThroughHold: () => void }>;

const trimRoot = (root: string): string => (root.length > 1 && root.endsWith('/') ? root.slice(0, -1) : root);

/**
 * Hold a file tree's directory re-reads while a revision apply writes its root.
 *
 * The worker names every checkout root an apply is writing in the projection's
 * `applyingRoots`. While this tree's root is among them, its re-reads wait; when
 * the root leaves the list, the tree lists every directory the apply touched
 * once. The projection replays on reconnect, so a page that connects mid-apply
 * still holds, and disposing releases any hold still taken.
 *
 * The tree first shows at `entryReady`, while the apply still writes (STO-25):
 * each time the root's reading enters it during a hold, the tree re-reads what it
 * has listed, so it shows every entry the apply will land, landed or arriving,
 * never the root as it was before the apply (I7). The worker publishes that
 * reading after the entries are announced and the entry closure has landed, so
 * a listing asked for then holds both.
 *
 * @param input - The projection source, the tree, and the root the tree shows.
 * @returns A disposer that stops following the projection and releases the hold.
 */
export const holdTreeRefreshesWhileApplying = (
  input: Readonly<{ client: ApplyingStatusSource; tree: PausableTree; root: string }>,
): (() => void) => {
  const root = trimRoot(input.root);
  let release: (() => void) | undefined;
  /* Whether the last reading was this root's `entryReady`: each edge into it is another tree's first view. */
  let wasEntryReady = false;
  const follow = (): void => {
    const status = input.client.status();
    const applying = status?.applyingRoots?.some((candidate) => trimRoot(candidate) === root) === true;
    if (applying && release === undefined) {
      release = input.tree.pauseRefreshes();
      /* A reading taken before this hold is no edge for it: its first entryReady re-reads through it. */
      wasEntryReady = false;
    } else if (!applying && release !== undefined) {
      const held = release;
      release = undefined;
      held();
    }
    const entryReady =
      status?.readiness === 'entryReady' && status.checkoutRoot !== undefined && trimRoot(status.checkoutRoot) === root;
    if (release !== undefined && entryReady && !wasEntryReady) {
      input.tree.refreshListedThroughHold();
    }
    wasEntryReady = entryReady;
  };
  follow();
  const unsubscribe = input.client.subscribe(follow);
  return () => {
    unsubscribe();
    const held = release;
    release = undefined;
    held?.();
  };
};
