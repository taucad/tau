import type { FileStat, FileStatEntry } from '@taucad/types';
import type {
  FileTreeNode,
  MkdirOptions,
  MountConfig,
  WatchEvent,
  WatchRequest,
  WorkspaceMutationError,
  WorkspaceScope,
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
 * surfaced via `moved` with their post-move {@link FileStat}; on
 * mid-flight failure every prior move is rolled back, `moved` is
 * empty, and `failed` carries the offending edit + structured error.
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
  readFiles(paths: string[]): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
  writeFile(filepath: string, data: Uint8Array<ArrayBuffer> | string): Promise<void>;
  writeFiles(files: Record<string, { content: Uint8Array<ArrayBuffer> }>): Promise<void>;
  mkdir(path: string, options?: MkdirOptions): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  lstat(path: string): Promise<FileStat>;
  rename(oldPath: string, newPath: string): Promise<void>;
  /**
   * Move a file or directory. Directory-aware: same-mount moves delegate to
   * the provider's directory-aware rename and cross-mount moves recursively
   * copy the subtree before unlinking the source.
   *
   * @param source - Current absolute path.
   * @param target - New absolute path.
   * @param options - Optional `{ overwrite }` for collision resolution.
   * @returns Stat of the resulting entry at `target`.
   */
  move(source: string, target: string, options?: { overwrite?: boolean }): Promise<FileStat>;
  /**
   * Preflight {@link move}. Returns `true` when the move is safe to
   * issue; otherwise returns a structured {@link WorkspaceMutationError}
   * with a machine-readable `code` (`NAME_EXISTS`, `INVALID_NAME`,
   * `BUNDLED_TYPES_WORKSPACE`, `READ_ONLY_MOUNT`, `NOT_FOUND`,
   * `MISSING_WORKSPACE_HANDLE`) so the UI can route to a copy registry
   * without parsing message strings.
   */
  canMove(source: string, target: string, options?: { overwrite?: boolean }): Promise<true | WorkspaceMutationError>;
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
   * Move many paths atomically. On mid-flight failure every prior
   * move in the batch is reversed so the workspace returns to its
   * pre-batch state. See {@link BulkMoveResult}.
   */
  bulkMove(edits: readonly BulkMoveEdit[], options?: { overwrite?: boolean }): Promise<BulkMoveResult>;
  /**
   * Delete a single file. Pass `{ scope }` to target the standalone
   * provider for an explicit workspace scope instead of the active
   * mount table.
   */
  unlink(path: string, options?: { scope?: WorkspaceScope }): Promise<void>;
  /**
   * Remove a directory. Pass `{ scope }` to target the standalone
   * provider; pass `{ scope, recursive: true }` for a recursive walk
   * (mount-routed recursive removal is not supported and throws).
   */
  rmdir(path: string, options?: { scope?: WorkspaceScope; recursive?: boolean }): Promise<void>;
  exists(path: string): Promise<boolean>;
  batchExists(paths: string[]): Promise<Record<string, boolean>>;
  ensureDirectoryExists(path: string): Promise<void>;
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
  invalidateStandaloneProvider(backend: 'webaccess' | 'indexeddb' | 'opfs' | 'memory', workspaceId?: string): void;

  readDirectory(path: string): Promise<FileTreeNode[]>;

  searchFiles(
    basePath: string,
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): FileStatEntry[];

  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
};
