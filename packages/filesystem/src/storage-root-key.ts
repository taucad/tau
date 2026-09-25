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
  | { readonly backend: 'memory'; readonly storageRootKey: string }
  | { readonly backend: 'node'; readonly path: string };

/**
 * Lexical `path.isAbsolute` — POSIX root, Windows drive (`C:\` or `C:/`), and
 * UNC (`\\server\share`). Written out rather than imported: this module is
 * bundled into the browser worker, where `node:path` must never follow it.
 */
const isAbsoluteHostPath = (path: string): boolean =>
  path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[/\\]/.test(path);

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
    case 'node': {
      const { path } = identity;
      // The absolute host path is the physical identity of a node root, the way
      // `workspaceId` is for webaccess. A relative path would alias two roots.
      if (!isAbsoluteHostPath(path)) {
        throw new TypeError('Node storage root must be an absolute host path.');
      }
      return `node:${path}`;
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
