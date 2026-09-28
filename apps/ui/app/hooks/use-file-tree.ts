import { useCallback, useRef, useSyncExternalStore } from 'react';
import type { FileEntry } from '@taucad/types';
import { useOptionalFileManager } from '#hooks/use-file-manager.js';

const noop = (): void => {
  /* Intentional no-op when subscribe is unavailable (useSyncExternalStore fallback). */
};
const emptyTree = new Map<string, FileEntry>();
const selectTree = (tree: Map<string, FileEntry>): Map<string, FileEntry> => tree;

type TreeSelection<T> = {
  readonly tree: Map<string, FileEntry>;
  readonly select: (tree: Map<string, FileEntry>) => T;
  readonly value: T;
};

/** The selection for `tree`, keeping the previous value while `isEqual` says the new one draws the same. */
const settleSelection = <T>(
  cache: { current: TreeSelection<T> | undefined },
  tree: Map<string, FileEntry>,
  {
    select,
    isEqual,
  }: { readonly select: TreeSelection<T>['select']; readonly isEqual: (previous: T, next: T) => boolean },
): T => {
  const last = cache.current;
  if (last?.tree === tree && last.select === select) {
    return last.value;
  }
  const next = select(tree);
  cache.current = { tree, select, value: last !== undefined && isEqual(last.value, next) ? last.value : next };
  return cache.current.value;
};

/**
 * Reactive hook for a value derived from the file tree Map.
 *
 * The tree service publishes a new Map for every change, including a content
 * write that only moves a file's size and mtime. The component re-renders only
 * when the selection changes under `isEqual`; while it holds, the previous
 * selection is returned unchanged. Pass a module-level or memoised `select` and
 * `isEqual`, or the selection is recomputed on every render.
 *
 * @param select - Derives the value the component renders from the tree Map.
 * @param isEqual - Whether two selections render the same; defaults to `Object.is`.
 * @returns The current selection, identical to the previous one while `isEqual` holds.
 */
export function useFileTreeSelector<T>(
  select: (tree: Map<string, FileEntry>) => T,
  isEqual: (previous: T, next: T) => boolean = Object.is,
): T {
  /* Optional on purpose: the hook already degrades to an empty tree when the
   * service is unbound, and the tree is now read by presentation-only surfaces
   * (the pane breadcrumb) that must render outside a FileManagerProvider. */
  const treeService = useOptionalFileManager()?.treeService;

  const cache = useRef<TreeSelection<T> | undefined>(undefined);

  return useSyncExternalStore(
    useCallback((callback: () => void) => treeService?.subscribeTree(callback) ?? noop, [treeService]),
    useCallback(
      () => settleSelection(cache, treeService?.getTreeSnapshot() ?? emptyTree, { select, isEqual }),
      [treeService, select, isEqual],
    ),
    useCallback(() => settleSelection(cache, emptyTree, { select, isEqual }), [select, isEqual]),
  );
}

/**
 * Reactive hook for the file tree Map. Re-renders on every tree publication,
 * including content-only changes; use {@link useFileTreeSelector} to render
 * only what changed.
 */
export function useFileTreeMap(): Map<string, FileEntry> {
  return useFileTreeSelector(selectTree);
}

/**
 * Reactive hook for a single file tree entry by path.
 */
export function useFileTreeEntry(path: string | undefined): FileEntry | undefined {
  const tree = useFileTreeMap();
  return path ? tree.get(path) : undefined;
}
