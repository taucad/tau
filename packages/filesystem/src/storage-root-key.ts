/**
 * Identity-bearing fields a storage-root key derives from. A subset of
 * {@link import('#mount-table.js').WorkspaceScope} so main-thread callers —
 * which hold no `FileSystemDirectoryHandle` — can derive the same key the
 * worker does.
 * @public
 */
export type StorageRootIdentity =
  | { readonly backend: 'indexeddb' | 'opfs' }
  | { readonly backend: 'webaccess'; readonly workspaceId: string }
  | { readonly backend: 'memory'; readonly storageRootKey: string };

/**
 * Resolve the canonical physical storage-root identity used for provider
 * caching, authority locks, and cross-tab invalidation.
 *
 * Sole derivation on both sides of the worker boundary: the library's
 * "is this root observable" decision is a string comparison between a
 * worker-derived and a UI-derived key, so a second implementation would
 * wedge the library on any drift (blueprint Finding 3 / R12).
 *
 * @param identity - Backend plus whatever identifies its physical root.
 * @param databasePrefix - IndexedDB database prefix owned by the app shell.
 * @returns Canonical storage-root key.
 * @public
 */
export const resolveStorageRootKey = (identity: StorageRootIdentity, databasePrefix: string): string => {
  switch (identity.backend) {
    case 'indexeddb': {
      return `indexeddb:${databasePrefix}`;
    }
    case 'opfs': {
      return 'opfs:origin';
    }
    case 'webaccess': {
      return `webaccess:${identity.workspaceId}`;
    }
    case 'memory': {
      const { storageRootKey } = identity;
      if (
        typeof storageRootKey !== 'string' ||
        !storageRootKey.startsWith('memory:') ||
        storageRootKey.slice('memory:'.length).trim().length === 0
      ) {
        throw new TypeError('Memory storage root must use memory:<scope>.');
      }
      return storageRootKey;
    }
  }
};
