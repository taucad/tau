import type { CheckedFileWrite, CheckedFileWriteResult, FileStat, ProjectManifest } from '@taucad/types';
import type { ContentExportFilter } from '@taucad/filesystem/content-ops';
import type {
  FileTreeNode,
  MkdirOptions,
  MountConfig,
  WatchEvent,
  WatchRequest,
  WorkspaceMutationError,
  WorkspaceScope,
  ProjectRootConfiguration,
  ProjectDiscoveryResult,
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
} from '@taucad/filesystem';

/**
 * One entry of a {@link FileSystemClient.bulkMove} edit list.
 *
 * @public
 */
export type BulkMoveEdit = Readonly<{
  source: string;
  target: string;
}>;

/**
 * Result of a {@link FileSystemClient.bulkMove}. Successful moves are
 * surfaced via `moved` with their post-move {@link FileStat}; failures
 * are reported independently and never erase completed edits.
 *
 * @public
 */
export type BulkMoveResult = Readonly<{
  moved: ReadonlyArray<Readonly<{ edit: BulkMoveEdit; stat: FileStat }>>;
  failed: ReadonlyArray<Readonly<{ edit: BulkMoveEdit; error: WorkspaceMutationError }>>;
}>;

/**
 * The physical-scope reads the `/files` workspace browser makes (charter D5).
 *
 * Every path here names a {@link WorkspaceScope} the mount table does not route
 * — a folder the person granted that no project claims — so no composed view
 * exists to serve it and the authority reads it through a standalone provider.
 * `scope` is **required** on all three: a *routed* path is content, and content
 * is the rooted surface's, never the authority's (D5, D12).
 *
 * @public
 */
export type ScopedStorageClient = {
  readShallowDirectory(path: string, options: { readonly scope: WorkspaceScope }): Promise<FileTreeNode[]>;
  readFile(path: string, options: { readonly encoding: 'utf8'; readonly scope: WorkspaceScope }): Promise<string>;
  readFile(path: string, options: { readonly scope: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
  getZippedDirectory(path: string, options: { readonly scope: WorkspaceScope }): Promise<Blob>;
};

/**
 * Everything an **unrooted** bridge connection answers (charter D5, W11).
 *
 * Topology, the change stream and the `/files` browser's three scoped reads,
 * spelled as the wire spells them. Charter deviation H3 is closed here on the
 * client side: no per-path content member exists for a caller to reach, so a
 * project tree cannot be read or written without naming the root and the
 * consumer that owns it.
 *
 * @public
 */
export type WorkspaceAuthorityClient = Pick<
  FileSystemClient,
  | 'mount'
  | 'unmount'
  | 'configureProjectRoots'
  | 'listProjectManifests'
  | 'commitPendingProjectDirectory'
  | 'adoptProjectDirectory'
  | 'permanentlyDeleteProjectDirectory'
  | 'disposeStorageRoot'
  | 'pollExternalChanges'
  | 'watch'
> & {
  readScopedFile(path: string, options: { readonly encoding: 'utf8'; readonly scope: WorkspaceScope }): Promise<string>;
  readScopedFile(path: string, options: { readonly scope: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
  readScopedShallowDirectory(path: string, options: { readonly scope: WorkspaceScope }): Promise<FileTreeNode[]>;
  getScopedZippedDirectory(path: string, options: { readonly scope: WorkspaceScope }): Promise<Blob>;
};

/**
 * Typed filesystem RPC surface consumed by main-thread facades such as
 * `FileContentService` and `FileTreeService`. Matches the worker `FileManager` protocol without
 * transport lifecycle hooks (`listen`, `dispose`).
 *
 * The webaccess identity is **always** carried explicitly inside
 * `MountConfig` / `WorkspaceScope` discriminated unions — there is no
 * ambient `setDirectoryHandle` knob and the worker never holds a
 * single "active" handle.
 *
 * @public
 * @example <caption>Import the client type for a host adapter</caption>
 * ```typescript
 * import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
 * export function exampleExists(adapter: FileSystemClient): Promise<boolean> {
 *   return adapter.exists('/');
 * }
 * ```
 */
export type FileSystemClient = {
  readFile(filepath: string, options: 'utf8' | { encoding: 'utf8' }): Promise<string>;
  readFile(filepath: string, options?: { encoding?: undefined }): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(filepath: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  writeFileChecked(input: Omit<CheckedFileWrite, 'signal'>): Promise<CheckedFileWriteResult>;
  writeFiles(files: Record<string, { content: Uint8Array<ArrayBuffer> }>): Promise<void>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  lstat(path: string): Promise<FileStat>;
  /**
   * Move a file or directory. Directory-aware: same-mount moves delegate to
   * the provider's directory-aware rename and cross-mount moves recursively
   * copy the subtree before unlinking the source.
   *
   * @param source - Current absolute path.
   * @param target - New absolute path.
   * @returns Stat of the resulting entry at `target`.
   */
  move(source: string, target: string): Promise<FileStat>;
  /**
   * Preflight {@link move}. Returns `true` when the move is safe to
   * issue; otherwise returns a structured {@link WorkspaceMutationError}
   * with a machine-readable `code` (`NAME_EXISTS`, `INVALID_NAME`,
   * `BUNDLED_TYPES_WORKSPACE`, `READ_ONLY_MOUNT`, `NOT_FOUND`,
   * `MISSING_WORKSPACE_HANDLE`, `OPERATION_FAILED`) so the UI can route to a copy registry
   * without parsing message strings.
   */
  canMove(source: string, target: string): Promise<true | WorkspaceMutationError>;
  /**
   * Preflight rename within a single parent directory. See {@link canMove}.
   */
  canRename(source: string, newName: string): Promise<true | WorkspaceMutationError>;
  /**
   * Preflight create. `kind` is `'file'` for {@link writeFile} or
   * `'directory'` for {@link mkdir}.
   */
  canCreate(path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError>;
  /**
   * Preflight delete. See {@link canMove}.
   */
  canDelete(path: string): Promise<true | WorkspaceMutationError>;
  /**
   * Move many paths sequentially and report each completed or failed edit.
   */
  bulkMove(edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult>;
  /** Delete a single mount-routed file. */
  unlink(path: string): Promise<void>;
  /**
   * Remove a mount-routed directory. Pass `{ recursive: true }` for a
   * recursive walk; crossing a nested mount point is rejected.
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
  /*
   * `duplicateFile`, `copyDirectory`, `searchFiles` and `getDirectoryStat` are
   * **not** here (charter D3, D4, W12d). Each walked or indexed the raw provider
   * unmasked; each is now the rooted surface's — `duplicate`, `copyTree`,
   * `search`, `statTree` — where the composed view supplies the mask before any
   * provider I/O. The absolute-path spellings live on {@link ComposedViewClient},
   * which routes them to the view.
   */
  /**
   * Package a directory's contents into a ZIP archive, minus whatever the path
   * registry hides.
   *
   * Served by `archive` on the rooted surface, where the mask comes with the view
   * and `{ versionedOnly }` keeps only the bytes the registry counts as the
   * project. A physical workspace scope the mount table does not route is the
   * `/files` browser's download and is {@link ScopedStorageClient}'s (charter D5).
   */
  getZippedDirectory(path: string, options?: ContentExportFilter): Promise<Blob>;

  /**
   * Mount a path prefix on a fresh provider instance. Webaccess mounts
   * carry an explicit `directoryHandle` and stable `workspaceId` —
   * the discriminated `MountConfig` makes the omission a compile-time
   * error.
   */
  mount(prefix: string, config: MountConfig): Promise<void>;
  unmount(prefix: string): void;
  /** Replace the worker's persistent project routes from the main-thread locator store. */
  configureProjectRoots(configuration: ProjectRootConfiguration): Promise<void>;
  /** Discover content-addressed projects by scanning configured physical roots. */
  listProjectManifests(): Promise<ProjectDiscoveryResult>;
  /** Commit one durable journal snapshot as an identity-safe manifest-last project directory. */
  commitPendingProjectDirectory(
    input: CommitPendingProjectDirectoryInput,
  ): Promise<CommitPendingProjectDirectoryResult>;
  /** Mint a fresh identity for an `adoption-required` project directory (R11). */
  adoptProjectDirectory(locator: ProjectLocator): Promise<ProjectManifest>;
  /** Permanently remove one exact physical project after verifying its manifest identity. */
  permanentlyDeleteProjectDirectory(
    input: PermanentDeleteProjectDirectoryInput,
  ): Promise<PermanentDeleteProjectDirectoryResult>;

  /*
   * `readShallowDirectory` is **not** here (W11, H3). One directory level of a
   * routed path is `readDirectory` through the view; one level of a physical
   * scope the mount table does not route is {@link ScopedStorageClient}'s, and
   * naming it here again is how a routed read finds the raw provider.
   */

  /**
   * Drop the cached standalone provider for the given backend / scope.
   * Webaccess invalidation is keyed by `workspaceId`; pass `undefined`
   * to clear every webaccess entry. Wired up by `/files` "Change
   * Folder" and the recovery `bindProjectToWorkspace` flow so the next
   * standalone read picks up the fresh handle.
   */
  /** Dispose a registry-owned physical storage root after an explicit rebind/teardown. */
  disposeStorageRoot(storageRootKey: string): void;

  readDirectory(path: string): Promise<FileTreeNode[]>;

  /**
   * Reconcile out-of-band changes under one routed root, or every configured webaccess root when omitted.
   * Resolves `true` when the worker has live `FileSystemObserver` delivery for the polled root(s),
   * so the caller can fall back to a slow safety-net cadence.
   */
  pollExternalChanges(root?: string): Promise<boolean>;

  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
};
