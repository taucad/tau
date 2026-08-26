import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { Topic } from '@taucad/events';
import type { DirectoryListing, DirectoryListingError } from '#directory-listing.js';
import { DirectoryListingFailedError, classifyDirectoryListingError } from '#directory-listing.js';
import type { FileTreeService } from '#file-tree-service.js';

type ListingStore = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => DirectoryListing;
  emit: (next: DirectoryListing) => void;
};

const createListingStore = (): ListingStore => {
  let snapshot: DirectoryListing = { kind: 'unready' };
  const topic = new Topic<void>({ name: 'directory-listing' });
  return {
    subscribe(onStoreChange: () => void) {
      return topic.subscribe(onStoreChange);
    },
    getSnapshot(): DirectoryListing {
      return snapshot;
    },
    emit(next: DirectoryListing) {
      snapshot = next;
      topic.emit();
    },
  };
};

const serverSnapshot: DirectoryListing = { kind: 'unready' };

function listingErrorFromUnknown(error: unknown, path: string): DirectoryListingError {
  if (error instanceof DirectoryListingFailedError) {
    return error.listing;
  }
  return classifyDirectoryListingError(error, path);
}

/**
 * Options for {@link useDirectoryListing} (retry token, etc.).
 *
 * @public
 */
export type UseDirectoryListingOptions = {
  /**
   * Increment (or any monotonic change) to re-run a cold load after `kind: 'error'`
   * without changing the path (e.g. user pressed Retry).
   */
  reloadToken?: number;
};

/**
 * React binding for {@link FileTreeService.listDirectory}: keeps a
 * {@link DirectoryListing} snapshot in sync via `useSyncExternalStore` and
 * `subscribePath`, cold-loads unresolved directories with an `AbortController`
 * tied to the `(treeService, path)` dependency tuple.
 *
 * @param treeService - File tree facade, or `undefined` when the file manager is not mounted.
 * @param path - Directory path (workspace-relative; root aliases accepted by the tree service).
 * @param options - Optional {@link UseDirectoryListingOptions.reloadToken} for explicit retry.
 * @returns Current {@link DirectoryListing} snapshot for the given path.
 *
 * @public
 */
export function useDirectoryListing(
  treeService: FileTreeService | undefined,
  path: string,
  options?: UseDirectoryListingOptions,
): DirectoryListing {
  const reloadToken = options?.reloadToken ?? 0;
  const store = useMemo(() => {
    const listingStore = createListingStore();
    if (treeService) {
      const sync = treeService.listDirectorySync(path);
      if (sync === undefined) {
        listingStore.emit({ kind: 'loading', path });
      } else {
        listingStore.emit({ kind: 'ready', path, entries: sync });
      }
    } else {
      listingStore.emit({ kind: 'unready' });
    }
    return listingStore;
  }, [treeService, path]);

  const listing = useSyncExternalStore(store.subscribe, store.getSnapshot, () => serverSnapshot);

  useEffect(() => {
    if (treeService) {
      return treeService.subscribePath(path, () => {
        const next = treeService.listDirectorySync(path);
        if (next !== undefined) {
          store.emit({ kind: 'ready', path, entries: next });
        }
      });
    }
    return undefined;
  }, [store, treeService, path]);

  useEffect(() => {
    if (!treeService) {
      return undefined;
    }

    if (treeService.listDirectorySync(path) !== undefined) {
      return undefined;
    }

    store.emit({ kind: 'loading', path });

    const service = treeService;
    const abortController = new AbortController();
    const { signal } = abortController;
    let cancelled = false;

    async function loadDirectory(): Promise<void> {
      try {
        const entries = await service.listDirectory(path, { signal });
        if (cancelled || signal.aborted) {
          return;
        }
        store.emit({ kind: 'ready', path, entries });
      } catch (rawError) {
        if (cancelled || signal.aborted) {
          return;
        }
        store.emit({ kind: 'error', path, cause: listingErrorFromUnknown(rawError, path) });
      }
    }

    void loadDirectory();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [store, treeService, path, reloadToken]);

  return listing;
}
