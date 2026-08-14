import type { FileStat, FileStatEntry, ProjectManifest } from '@taucad/types';
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
  readFile(filepath: string, options: 'utf8' | { encoding: 'utf8'; scope?: WorkspaceScope }): Promise<string>;
  readFile(filepath: string, options?: { scope?: WorkspaceScope }): Promise<Uint8Array<ArrayBuffer>>;
  writeFile(filepath: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
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
  getDirectoryStat(path: string): Promise<FileStatEntry[]>;
  getDirectoryContents(path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  duplicateFile(sourcePath: string, destinationPath: string): Promise<void>;
  copyDirectory(sourcePath: string, destinationPath: string): Promise<void>;
  /**
   * Package a directory's contents into a ZIP archive. Pass `{ scope }`
   * to zip from the standalone provider for an explicit workspace scope
   * instead of the active mount table.
   */
  getZippedDirectory(path: string, options?: { scope?: WorkspaceScope }): Promise<Blob>;

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

  /**
   * Read a single directory level. Pass `{ scope }` to read via the
   * standalone provider for an explicit workspace scope (used by the
   * `/files` route to show all backends side-by-side); omit `scope` to
   * route through the active mount table.
   *
   * The standalone provider cache is keyed by `(backend, workspaceId)`
   * so two workspaces with the same folder name never share a provider.
   */
  readShallowDirectory(path: string, options?: { scope?: WorkspaceScope }): Promise<FileTreeNode[]>;

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

  searchFiles(
    root: string,
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): Promise<FileStatEntry[]>;

  /** Reconcile out-of-band changes under one routed root, or every configured webaccess root when omitted. */
  pollExternalChanges(root?: string): Promise<void>;

  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
};
