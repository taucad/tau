import { useEffect, useMemo } from 'react';
import { useObservation } from '#react/use-observation.js';
import { DirectoryListingErrorCode } from '#directory-listing.js';
import type { DirectoryListing } from '#directory-listing.js';
import type { FileTreeService } from '#file-tree-service.js';

/** Explicit retry token for a failed directory listing. @public */
export type UseDirectoryListingOptions = { reloadToken?: number };

/**
 * Select the shared service-owned directory projection.
 * @param treeService - Captured incremental tree owner.
 * @param path - Workspace-relative directory.
 * @param options - Explicit retry token.
 * @returns Stable listing with error discrimination preserved.
 * @public
 */
export function useDirectoryListing(
  treeService: FileTreeService | undefined,
  path: string,
  options?: UseDirectoryListingOptions,
): DirectoryListing {
  const incarnation = treeService?.incarnation;
  const service = useMemo(() => treeService?.observeDirectory(path), [treeService, path, incarnation]);
  const snapshot = useObservation(service);
  const reloadToken = options?.reloadToken ?? 0;
  useEffect(() => {
    if (reloadToken !== 0) {
      service?.refresh();
    }
  }, [service, reloadToken]);
  const warm = useMemo<DirectoryListing | undefined>(() => {
    const entries = treeService?.listDirectorySync(path);
    return entries === undefined ? undefined : { kind: 'ready', path, entries };
  }, [treeService, path, incarnation]);
  const value = snapshot.value ?? warm;
  return useMemo<DirectoryListing>(() => {
    if (snapshot.status === 'error' || snapshot.status === 'closed') {
      return treeService
        ? {
            kind: 'error',
            path,
            cause: {
              code: DirectoryListingErrorCode.Unavailable,
              message: snapshot.error ?? 'Directory observation closed.',
              path,
            },
          }
        : { kind: 'unready' };
    }
    if (value?.kind === 'ready' && (snapshot.status === 'pending' || snapshot.status === 'registering')) {
      return { ...value, pending: true };
    }
    return value ?? (treeService ? { kind: 'loading', path } : { kind: 'unready' });
  }, [value, snapshot.status, snapshot.error, treeService, path]);
}
