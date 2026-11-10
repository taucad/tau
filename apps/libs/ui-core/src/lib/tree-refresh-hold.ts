import type { RevisionStatusProjection } from '@taucad/revisions';

/** The projection reader a hold follows: a revision client's `status` and `subscribe`. */
type ApplyingStatusSource = Readonly<{
  status: () => RevisionStatusProjection | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

/** The tree whose directory re-reads a hold pauses. */
type PausableTree = Readonly<{ pauseRefreshes: () => () => void }>;

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
 * @param input - The projection source, the tree, and the root the tree shows.
 * @returns A disposer that stops following the projection and releases the hold.
 */
export const holdTreeRefreshesWhileApplying = (
  input: Readonly<{ client: ApplyingStatusSource; tree: PausableTree; root: string }>,
): (() => void) => {
  const root = trimRoot(input.root);
  let release: (() => void) | undefined;
  const follow = (): void => {
    const applying = input.client.status()?.applyingRoots?.some((candidate) => trimRoot(candidate) === root) === true;
    if (applying && release === undefined) {
      release = input.tree.pauseRefreshes();
    } else if (!applying && release !== undefined) {
      const held = release;
      release = undefined;
      held();
    }
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
