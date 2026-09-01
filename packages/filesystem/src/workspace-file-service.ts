import type { FileStat, FileStatEntry, FileSystemBackend } from '@taucad/types';
import type {
  ChangeEvent,
  FileSystemProvider,
  FileTreeNode,
  TreeEntry,
  WatchRequest,
  WatchEvent,
  FileReadStreamOptions,
} from '#types.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResourceQueue } from '#resource-queue.js';
import type { ChangeEventBus } from '#change-event-bus.js';
import { InMemoryFileTree } from '#in-memory-file-tree.js';
import { WatchRegistry } from '#watch-registry.js';
import { bufferToStream } from '#backend/stream-utils.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import type { SharedPool } from '@taucad/memory';
import type { MountTable, MountConfig, MountResolution, WorkspaceScope } from '#mount-table.js';
import { createFileSystemService } from '#file-system-service.js';
import type { FileSystemService } from '#file-system-service.js';
import { tagEventOrigin } from '#event-origin-registry.js';
import { parentDirectory, joinPath, normalizePath } from '@taucad/utils/path';
import { MissingWorkspaceHandleError, WorkspaceMutationError } from '#workspace-errors.js';

/** Milliseconds. */
const kernelCoalescingWindow = 75;

/**
 * Absolute prefix of the read-only synthetic mount that hosts the
 * bundled `.d.ts` payloads (see {@link populateBundledTypesMount}).
 * Mirrored by the UI-side `bundledTypesWorkspaceRootSegment` constant.
 */
const bundledTypesAbsolutePrefix = '/node_modules';

function isUnderBundledTypesMount(absolutePath: string): boolean {
  return absolutePath === bundledTypesAbsolutePrefix || absolutePath.startsWith(`${bundledTypesAbsolutePrefix}/`);
}

/**
 * Map an arbitrary thrown value into a {@link WorkspaceMutationError}
 * by best-effort sniffing of well-known shapes (`EEXIST`, `ENOENT`,
 * {@link MissingWorkspaceHandleError}). Unknown causes fall through
 * to `NOT_FOUND` with the source path so the caller can still surface
 * something actionable.
 *
 * @param cause - The thrown value to translate. Typically a node-style
 *                `ErrnoException`, a {@link MissingWorkspaceHandleError},
 *                or an existing {@link WorkspaceMutationError}.
 * @param source - Source path of the failing mutation (used for the
 *                 fall-through `NOT_FOUND` carrier).
 * @param target - Target path of the failing mutation (used for the
 *                 `EEXIST → NAME_EXISTS` mapping where the collision is
 *                 at the destination).
 * @returns A {@link WorkspaceMutationError} the worker can return
 *          verbatim across the RPC boundary.
 */
function causeToMutationError(cause: unknown, source: string, target: string): WorkspaceMutationError {
  if (cause instanceof WorkspaceMutationError) {
    return cause;
  }
  if (cause instanceof MissingWorkspaceHandleError) {
    return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', source, { cause });
  }
  if (typeof cause === 'object' && cause !== null) {
    const errno = (cause as NodeJS.ErrnoException).code;
    if (errno === 'EEXIST') {
      return new WorkspaceMutationError('NAME_EXISTS', target, { target, cause });
    }
    if (errno === 'ENOENT') {
      return new WorkspaceMutationError('NOT_FOUND', source, { cause });
    }
  }
  return new WorkspaceMutationError('NOT_FOUND', source, { cause });
}

/**
 * Reject syntactically invalid workspace paths. Used by the `can*`
 * preflights so the explorer can show a typed error before issuing
 * the real mutation RPC.
 *
 * Rules:
 *  - Path must be absolute (`/`-prefixed) — workspace contract.
 *  - No empty path segments (`//`, trailing `/`).
 *  - No `.` or `..` segments — paths must be already normalised.
 *  - No control characters or NUL bytes.
 *
 * @param path - Absolute virtual workspace path to validate.
 * @returns `true` when the path passes every rule.
 */
function isStructurallyValidWorkspacePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false;
  }
  if (!path.startsWith('/')) {
    return false;
  }
  if (path !== '/' && path.endsWith('/')) {
    return false;
  }
  // oxlint-disable-next-line no-control-regex -- explicit control-char rejection for path validation
  if (/[\u0000-\u001F]/.test(path)) {
    return false;
  }
  const segments = path.split('/').slice(1);
  for (const segment of segments) {
    if (segment.length === 0) {
      return false;
    }
    if (segment === '.' || segment === '..') {
      return false;
    }
  }
  return true;
}

/**
 * Options for {@link WorkspaceFileService.mkdir}.
 * @public
 */
export type MkdirOptions = {
  mode?: number;
  recursive?: boolean;
};

/**
 * Optional metadata for workspace mutations initiated from a specific client
 * (e.g. a filesystem bridge port). Observer and direct UI paths omit this.
 *
 * @public
 */
export type WorkspaceMutationContext = {
  originClientId?: string;
};

/**
 * Layer 3a UI-side workspace orchestrator.
 *
 * Composes the routing/watch backbone of {@link FileSystemService} (Layer 2)
 * with workspace-only concerns: in-memory file index for fast
 * search, cross-tab write coordination, shared-memory file pool, multi-backend
 * provider creation via {@link ProviderRegistry}, and tree-shaped helpers
 * (zip, copy directory, recursive stat).
 *
 * @public
 */
export class WorkspaceFileService {
  private readonly _registry: ProviderRegistry;
  private readonly _resourceQueue: ResourceQueue;
  private readonly _eventBus: ChangeEventBus;
  private readonly _watchRegistry: WatchRegistry;
  private readonly _crossTabCoordinator: CrossTabCoordinator;
  private _filePool: SharedPool | undefined;
  private readonly _mountTable: MountTable;
  private readonly _fs: FileSystemService;
  private readonly _inMemoryTree = new InMemoryFileTree();
  /** Absolute path passed to the first {@link getDirectoryStat} that populated the tree; in-memory paths are relative to this root. */
  private _directoryStatRoot: string | undefined;

  /**
   * Create a {@link WorkspaceFileService} with injected dependencies.
   *
   * @param options - Service dependencies injected at construction time.
   */
  public constructor(options: {
    providerRegistry: ProviderRegistry;
    resourceQueue: ResourceQueue;
    eventBus: ChangeEventBus;
    crossTabCoordinator?: CrossTabCoordinator;
    /** Writer-side shared file pool for zero-IPC cached reads across threads. */
    filePool?: SharedPool;
    /** Mount table for multi-backend path routing. */
    mountTable: MountTable;
  }) {
    this._registry = options.providerRegistry;
    this._resourceQueue = options.resourceQueue;
    this._eventBus = options.eventBus;
    this._watchRegistry = new WatchRegistry(options.eventBus, { coalescingWindow: kernelCoalescingWindow });
    this._crossTabCoordinator = options.crossTabCoordinator ?? new CrossTabCoordinator();
    this._filePool = options.filePool;
    this._mountTable = options.mountTable;
    this._fs = createFileSystemService({ mountTable: options.mountTable, eventBus: options.eventBus });
  }

  /**
   * The Layer 2 {@link FileSystemService} backbone. Exposed so consumers that
   * only need primitive operations (e.g. kernel hosts) can drop down to the
   * narrow surface without depending on workspace orchestration.
   *
   * @returns The composed {@link FileSystemService} instance.
   */
  public get fileSystem(): FileSystemService {
    return this._fs;
  }

  /**
   * Set or replace the shared file pool for zero-IPC cached reads.
   * Enables late binding when the SharedArrayBuffer arrives after construction.
   *
   * @param pool - Writer-side shared file pool.
   */
  public setFilePool(pool: SharedPool): void {
    this._filePool = pool;
  }

  // --- Read operations (direct to provider, no serialization) ---

  /**
   * Read a single file. Pass `'utf8'` to decode as a string. Pass
   * `{ scope }` to read from the standalone provider for that workspace
   * scope instead of the mount table.
   *
   * @param filepath - Absolute path to the file.
   * @param options  - Encoding shorthand `'utf8'`, or an options bag with
   *                   optional `encoding`, `signal`, and `scope`.
   * @returns File contents as a string or `Uint8Array`.
   */
  public async readFile(
    filepath: string,
    options?: 'utf8' | { encoding?: 'utf8'; signal?: AbortSignal; scope?: WorkspaceScope },
  ): Promise<string | Uint8Array<ArrayBuffer>> {
    const optionsObject = typeof options === 'object' ? options : undefined;
    const signal = optionsObject?.signal;
    if (signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const { provider, path: resolvedPath } = await this._resolve(filepath, { scope: optionsObject?.scope });
    const encoding = options === 'utf8' || optionsObject?.encoding === 'utf8' ? 'utf8' : undefined;

    if (encoding === 'utf8') {
      return provider.readFile(resolvedPath, 'utf8');
    }
    const data = await provider.readFile(resolvedPath);
    if (optionsObject?.scope === undefined) {
      this._filePool?.store(filepath, data);
    }
    return data;
  }

  /**
   * Read multiple files in parallel, returning a map of path to raw bytes.
   *
   * @param paths - Absolute file paths to read.
   * @param options - Optional abort signal for cancellation.
   * @returns Map from path to file content.
   */
  public async readFiles(
    paths: string[],
    options?: { signal?: AbortSignal },
  ): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const results = await Promise.all(
      paths.map(async (filepath) => {
        if (options?.signal?.aborted) {
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        const { provider, path: resolvedPath } = this._resolveProvider(filepath);
        const data = await provider.readFile(resolvedPath);
        return [filepath, data] as const;
      }),
    );
    return Object.fromEntries(results);
  }

  /**
   * Stream a file as `ReadableStream<Uint8Array>`.
   * Routes to the provider's native `readFileStream` when available (capability-based),
   * otherwise falls back to wrapping `readFile` output in a chunked stream.
   *
   * @param filepath - Absolute path to the file.
   * @param options - Position, length, and signal for cancellation.
   * @returns Readable stream of file content.
   */
  public async readFileStream(
    filepath: string,
    options?: FileReadStreamOptions,
  ): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const { provider, path: resolvedPath } = this._resolveProvider(filepath);

    if (provider.readFileStream) {
      return provider.readFileStream(resolvedPath, options);
    }

    const buffer = await provider.readFile(resolvedPath);
    return bufferToStream(buffer, options);
  }

  /**
   * List entries in a directory.
   *
   * @param path - Absolute directory path.
   * @returns Array of entry names (not full paths).
   */
  public async readdir(path: string): Promise<string[]> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    const entries = await provider.readdir(resolvedPath);

    const childMounts = this._mountTable.getMountsUnder(path);
    for (const mount of childMounts) {
      const mountName = mount.prefix.split('/').pop();
      if (mountName && !entries.includes(mountName)) {
        entries.push(mountName);
      }
    }

    return entries;
  }

  /**
   * Get file or directory metadata.
   *
   * @param path - Absolute path.
   * @returns Stat information (type, size, mtime).
   */
  public async stat(path: string): Promise<FileStat> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    return provider.stat(resolvedPath);
  }

  /**
   * Get file or directory metadata without following symlinks.
   *
   * @param path - Absolute path.
   * @returns Stat information (type, size, mtime).
   */
  public async lstat(path: string): Promise<FileStat> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    return provider.lstat(resolvedPath);
  }

  /**
   * Check whether a file or directory exists.
   *
   * @param path - Absolute path.
   * @returns `true` if the entry exists.
   */
  public async exists(path: string): Promise<boolean> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    return provider.exists(resolvedPath);
  }

  /**
   * Check existence of multiple paths in parallel.
   *
   * @param paths - Absolute paths to check.
   * @returns Map from path to existence boolean.
   */
  public async batchExists(paths: string[]): Promise<Record<string, boolean>> {
    const results = await Promise.all(
      paths.map(async (path) => {
        const { provider, path: resolvedPath } = this._resolveProvider(path);
        return { path, exists: await provider.exists(resolvedPath) };
      }),
    );
    const existsMap: Record<string, boolean> = {};
    for (const { path, exists } of results) {
      existsMap[path] = exists;
    }
    return existsMap;
  }

  // --- Write operations (serialized via per-file ResourceQueue) ---

  /**
   * Write data to a file, creating parent directories as needed.
   * Serialized per file path through the {@link ResourceQueue}.
   *
   * @param path - Absolute file path.
   * @param data - File content as raw bytes or a UTF-8 string.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the write completes.
   */
  public async writeFile(
    path: string,
    data: Uint8Array<ArrayBuffer> | string,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    return this._crossTabCoordinator.withWriteLock(path, async () =>
      this._resourceQueue.queueFor(path, async () => {
        const { provider, path: resolvedPath, backend: resolvedBackend } = this._resolveProvider(path);
        await this._ensureParentDir(provider, resolvedPath);
        await provider.writeFile(resolvedPath, data);

        this._filePool?.invalidate(path);
        const size = typeof data === 'string' ? new TextEncoder().encode(data).byteLength : data.byteLength;
        this._inMemoryTreeAddFile(path, size);
        this._emitChangeEvent(
          {
            type: 'fileWritten',
            path,
            backend: resolvedBackend,
          },
          context,
        );
      }),
    );
  }

  /**
   * Write multiple files atomically within a single serialized operation.
   *
   * @param files - Map of absolute path to content.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when all writes complete.
   */
  public async writeFiles(
    files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    const entries = Object.entries(files);
    if (entries.length === 0) {
      return;
    }

    const resolvedBackend = this._mountTable.resolve('/').backend;
    await Promise.all(
      entries.map(async ([path, file]) =>
        this._resourceQueue.queueFor(path, async () => {
          const { provider, path: resolvedPath } = this._resolveProvider(path);
          await this._ensureParentDir(provider, resolvedPath);
          await provider.writeFile(resolvedPath, file.content);
          const size =
            typeof file.content === 'string'
              ? new TextEncoder().encode(file.content).byteLength
              : file.content.byteLength;
          this._inMemoryTreeAddFile(path, size);
        }),
      ),
    );

    this._emitChangeEvent(
      {
        type: 'directoryChanged',
        path: '/',
        backend: resolvedBackend,
      },
      context,
    );
  }

  /**
   * Create a directory, optionally with intermediate directories.
   *
   * @param path - Absolute directory path.
   * @param options - Pass `{ recursive: true }` to create parent directories.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the directory is created.
   */
  public async mkdir(path: string, options?: MkdirOptions, context?: WorkspaceMutationContext): Promise<void> {
    return this._resourceQueue.queueFor(path, async () => {
      const { provider, path: resolvedPath, backend: resolvedBackend } = this._resolveProvider(path);
      await provider.mkdir(resolvedPath, options?.recursive ? { recursive: true } : undefined);

      this._inMemoryTreeAddDirectory(path);

      this._emitChangeEvent(
        {
          type: 'directoryCreated',
          path,
          backend: resolvedBackend,
        },
        context,
      );
    });
  }

  /**
   * Rename or move a file or directory. Equivalent to {@link move} without
   * the returned stat — preserved for backward compatibility with callers
   * that do not need the new stat metadata.
   *
   * @param from - Current absolute path.
   * @param to - New absolute path.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the rename completes.
   */
  public async rename(from: string, to: string, context?: WorkspaceMutationContext): Promise<void> {
    await this.move(from, to, undefined, context);
  }

  /**
   * Move a file or directory from `source` to `target`, returning the
   * resulting {@link FileStat}. Directory-aware: same-mount moves delegate
   * to the provider's directory-aware rename; cross-mount moves recursively
   * copy the subtree and unlink the source.
   *
   * Emits `directoryRenamed` for directory sources and `fileRenamed` for
   * file sources so participants can distinguish bulk subtree migrations
   * from single-file renames.
   *
   * @param source - Current absolute path.
   * @param target - New absolute path.
   * @param options - Optional `{ overwrite }` for collision resolution at the destination.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns The {@link FileStat} of the resulting entry at `target`.
   */
  // oxlint-disable-next-line max-params -- (source, target, options, context) mirrors the mutation API across the rest of WorkspaceFileService; collapsing into an options bag would diverge from `unlink` / `rmdir` and confuse readers.
  public async move(
    source: string,
    target: string,
    options?: { overwrite?: boolean },
    context?: WorkspaceMutationContext,
  ): Promise<FileStat> {
    return this._resourceQueue.queueFor(source, async () => {
      const sourceResolution = this._resolveProvider(source);
      const targetResolution = this._resolveProvider(target);

      const sourceStat = await sourceResolution.provider.stat(sourceResolution.path);
      const overwrite = options?.overwrite === true;
      const targetExists = await targetResolution.provider.exists(targetResolution.path);
      if (targetExists) {
        if (!overwrite) {
          const error = new Error(`EEXIST: target already exists '${target}'`);
          (error as NodeJS.ErrnoException).code = 'EEXIST';
          throw error;
        }
        // oxlint-disable-next-line unicorn/prefer-ternary -- if/else preserves the dir-vs-file branch ordering for parity with `_rmdirRecursive` semantics; a ternary would obscure it.
        if (sourceStat.type === 'dir') {
          await this._removeRecursive(targetResolution.provider, targetResolution.path);
        } else {
          await targetResolution.provider.unlink(targetResolution.path);
        }
      }

      if (sourceResolution.provider === targetResolution.provider) {
        await sourceResolution.provider.rename(sourceResolution.path, targetResolution.path);
      } else if (sourceStat.type === 'dir') {
        await this._copyDirectoryAcrossProviders(
          sourceResolution.provider,
          sourceResolution.path,
          targetResolution.provider,
          targetResolution.path,
        );
        await this._removeRecursive(sourceResolution.provider, sourceResolution.path);
      } else {
        const data = await sourceResolution.provider.readFile(sourceResolution.path);
        await this._ensureParentDir(targetResolution.provider, targetResolution.path);
        await targetResolution.provider.writeFile(targetResolution.path, data);
        await sourceResolution.provider.unlink(sourceResolution.path);
      }

      this._filePool?.invalidate(source);
      this._filePool?.invalidate(target);
      this._inMemoryTreeRename(source, target);

      const resultingStat = await targetResolution.provider.stat(targetResolution.path);

      if (sourceStat.type === 'dir') {
        this._emitChangeEvent(
          {
            type: 'directoryRenamed',
            oldPath: source,
            newPath: target,
            backend: sourceResolution.backend,
          },
          context,
        );
      } else {
        this._emitChangeEvent(
          {
            type: 'fileRenamed',
            oldPath: source,
            newPath: target,
            backend: sourceResolution.backend,
          },
          context,
        );
      }

      return resultingStat;
    });
  }

  /**
   * Delete a file. Pass `{ scope }` to target the standalone provider
   * for an explicit workspace scope instead of the mount table.
   *
   * @param path    - Absolute file path.
   * @param options - Optional `{ scope }` discriminator.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the file is deleted.
   */
  public async unlink(
    path: string,
    options?: { scope?: WorkspaceScope },
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    return this._resourceQueue.queueFor(path, async () => {
      const { provider, path: resolvedPath, backend: resolvedBackend } = await this._resolve(path, options);
      await provider.unlink(resolvedPath);

      if (options?.scope === undefined) {
        this._filePool?.invalidate(path);
        this._inMemoryTreeRemoveFile(path);
      }
      this._emitChangeEvent(
        {
          type: 'fileDeleted',
          path,
          backend: resolvedBackend,
        },
        context,
      );
    });
  }

  /**
   * Remove a directory. Pass `{ scope }` to target the standalone
   * provider for an explicit workspace scope instead of the mount
   * table. Pass `{ scope, recursive: true }` for a recursive walk
   * (mount-routed recursive removal is not supported and throws).
   *
   * @param path    - Absolute directory path.
   * @param options - Optional `{ scope, recursive }` discriminator.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the directory is removed.
   */
  public async rmdir(
    path: string,
    options?: { scope?: WorkspaceScope; recursive?: boolean },
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    return this._resourceQueue.queueFor(path, async () => {
      const { provider, path: resolvedPath, backend: resolvedBackend } = await this._resolve(path, options);

      if (options?.recursive === true) {
        if (options.scope === undefined) {
          throw new Error(
            '[WorkspaceFileService] rmdir({ recursive: true }) without an explicit scope is not supported.',
          );
        }
        await this._rmdirRecursive(provider, resolvedPath);
      } else {
        await provider.rmdir(resolvedPath);
      }

      if (options?.scope === undefined) {
        this._inMemoryTreeRemoveDirectory(path);
      }
      this._emitChangeEvent(
        {
          type: 'directoryDeleted',
          path,
          backend: resolvedBackend,
        },
        context,
      );
    });
  }

  // --- Bulk move with rollback (R7) ---

  /**
   * Move many paths in a single batch. On mid-flight failure every
   * prior move within this batch is reversed (each by its own inverse
   * {@link move}) so the workspace returns to the pre-batch state.
   * Successes are surfaced via the `moved` array with their post-move
   * {@link FileStat}; the offending edit + structured error is
   * surfaced via `failed`.
   *
   * The whole batch runs inside the resource-queue critical section
   * for the **first** edit's source path so concurrent single-file
   * mutations on the same path are serialised against the batch.
   *
   * @param edits - Source → target pairs.
   * @param options - Optional `{ overwrite }` propagated to every move.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns The {@link BulkMoveResult} describing successes + the failure (if any).
   */
  public async bulkMove(
    edits: ReadonlyArray<{ source: string; target: string }>,
    options?: { overwrite?: boolean },
    context?: WorkspaceMutationContext,
  ): Promise<{
    moved: ReadonlyArray<{ edit: { source: string; target: string }; stat: FileStat }>;
    failed: ReadonlyArray<{ edit: { source: string; target: string }; error: WorkspaceMutationError }>;
  }> {
    if (edits.length === 0) {
      return { moved: [], failed: [] };
    }

    const completed: Array<{ edit: { source: string; target: string }; stat: FileStat }> = [];
    let failedEdit: { edit: { source: string; target: string }; error: WorkspaceMutationError } | undefined;

    for (const edit of edits) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential moves required so a mid-flight failure can rollback the prior moves
        const stat = await this.move(edit.source, edit.target, options, context);
        completed.push({ edit, stat });
      } catch (error) {
        const mutationError = causeToMutationError(error, edit.source, edit.target);
        failedEdit = { edit, error: mutationError };
        for (let index = completed.length - 1; index >= 0; index -= 1) {
          const prior = completed[index];
          if (prior === undefined) {
            continue;
          }
          try {
            // oxlint-disable-next-line no-await-in-loop -- Sequential rollback required to restore prior state
            await this.move(prior.edit.target, prior.edit.source, { overwrite: true }, context);
          } catch {
            // Best-effort rollback: surface the original failure regardless.
          }
        }
        break;
      }
    }

    if (failedEdit !== undefined) {
      return { moved: [], failed: [failedEdit] };
    }
    return { moved: completed, failed: [] };
  }

  // --- Preflight checks (R6) ---

  /**
   * Preflight {@link move}: verifies the source exists, the target does
   * not exist (unless `overwrite: true`), and that neither endpoint
   * sits on a read-only mount.
   *
   * Returns `true` when the move is safe to issue; otherwise returns a
   * structured {@link WorkspaceMutationError} so the caller can route
   * `code` to a copy registry without parsing message strings.
   *
   * @param source - Current absolute path.
   * @param target - Proposed destination absolute path.
   * @param options - Optional `{ overwrite }` to permit overwriting an existing destination.
   * @returns `true` on success or a {@link WorkspaceMutationError}.
   */
  public async canMove(
    source: string,
    target: string,
    options?: { overwrite?: boolean },
  ): Promise<true | WorkspaceMutationError> {
    if (!isStructurallyValidWorkspacePath(source)) {
      return new WorkspaceMutationError('INVALID_NAME', source);
    }
    if (!isStructurallyValidWorkspacePath(target)) {
      return new WorkspaceMutationError('INVALID_NAME', target);
    }
    if (isUnderBundledTypesMount(source) || isUnderBundledTypesMount(target)) {
      return new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', source, { target });
    }

    let sourceResolution: MountResolution;
    let targetResolution: MountResolution;
    try {
      sourceResolution = this._resolveProvider(source);
      targetResolution = this._resolveProvider(target);
    } catch (error) {
      if (error instanceof MissingWorkspaceHandleError) {
        return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', source, { cause: error });
      }
      throw error;
    }

    let sourceExists = false;
    try {
      sourceExists = await sourceResolution.provider.exists(sourceResolution.path);
    } catch (error) {
      if (error instanceof MissingWorkspaceHandleError) {
        return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', source, { cause: error });
      }
      throw error;
    }
    if (!sourceExists) {
      return new WorkspaceMutationError('NOT_FOUND', source);
    }

    if (options?.overwrite !== true) {
      let targetExists = false;
      try {
        targetExists = await targetResolution.provider.exists(targetResolution.path);
      } catch (error) {
        if (error instanceof MissingWorkspaceHandleError) {
          return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', target, { cause: error });
        }
        throw error;
      }
      if (targetExists) {
        return new WorkspaceMutationError('NAME_EXISTS', target, { target });
      }
    }

    return true;
  }

  /**
   * Preflight rename within a single parent directory. Equivalent to
   * {@link canMove} where the new path replaces only the basename.
   *
   * @param source - Absolute current path.
   * @param newName - New basename (no slashes).
   * @returns `true` on success or a {@link WorkspaceMutationError}.
   */
  public async canRename(source: string, newName: string): Promise<true | WorkspaceMutationError> {
    if (typeof newName !== 'string' || newName.length === 0 || newName.includes('/') || newName.includes('\\')) {
      return new WorkspaceMutationError('INVALID_NAME', typeof newName === 'string' ? newName : '');
    }
    if (newName === '.' || newName === '..') {
      return new WorkspaceMutationError('INVALID_NAME', newName);
    }
    if (!isStructurallyValidWorkspacePath(source)) {
      return new WorkspaceMutationError('INVALID_NAME', source);
    }
    const parent = parentDirectory(source);
    const target = parent === '/' ? `/${newName}` : `${parent}/${newName}`;
    return this.canMove(source, target);
  }

  /**
   * Preflight {@link writeFile} / {@link mkdir}: verifies the path is
   * structurally valid, does not collide with an existing entry, and
   * does not sit on a read-only mount.
   *
   * @param path - Proposed absolute path.
   * @param kind - `'file'` for {@link writeFile} / `'directory'` for {@link mkdir}.
   * @returns `true` on success or a {@link WorkspaceMutationError}.
   */
  public async canCreate(path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> {
    if (!isStructurallyValidWorkspacePath(path)) {
      return new WorkspaceMutationError('INVALID_NAME', path);
    }
    if (isUnderBundledTypesMount(path)) {
      return new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', path);
    }

    let resolution: MountResolution;
    try {
      resolution = this._resolveProvider(path);
    } catch (error) {
      if (error instanceof MissingWorkspaceHandleError) {
        return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', path, { cause: error });
      }
      throw error;
    }

    let exists = false;
    try {
      exists = await resolution.provider.exists(resolution.path);
    } catch (error) {
      if (error instanceof MissingWorkspaceHandleError) {
        return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', path, { cause: error });
      }
      throw error;
    }
    if (exists) {
      return new WorkspaceMutationError('NAME_EXISTS', path);
    }
    // `kind` is intentionally not used at the preflight layer — providers
    // route on the eventual mutation call. The parameter is preserved so
    // the RPC contract can grow (e.g. quota checks) without a signature
    // change.
    void kind;
    return true;
  }

  /**
   * Preflight {@link unlink} / {@link rmdir}: verifies the path exists
   * and does not sit on the read-only bundled-types mount.
   *
   * @param path - Absolute path to remove.
   * @returns `true` on success or a {@link WorkspaceMutationError}.
   */
  public async canDelete(path: string): Promise<true | WorkspaceMutationError> {
    if (!isStructurallyValidWorkspacePath(path)) {
      return new WorkspaceMutationError('INVALID_NAME', path);
    }
    if (isUnderBundledTypesMount(path)) {
      return new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', path);
    }

    let resolution: MountResolution;
    try {
      resolution = this._resolveProvider(path);
    } catch (error) {
      if (error instanceof MissingWorkspaceHandleError) {
        return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', path, { cause: error });
      }
      throw error;
    }

    let exists = false;
    try {
      exists = await resolution.provider.exists(resolution.path);
    } catch (error) {
      if (error instanceof MissingWorkspaceHandleError) {
        return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', path, { cause: error });
      }
      throw error;
    }
    if (!exists) {
      return new WorkspaceMutationError('NOT_FOUND', path);
    }
    return true;
  }

  // --- Higher-level operations ---

  /**
   * Recursively create a directory and all missing parents.
   *
   * @param path - Absolute directory path.
   * @returns Resolves when the directory exists.
   */
  public async ensureDirectoryExists(path: string): Promise<void> {
    return this._resourceQueue.queueFor(path, async () => {
      const { provider, path: resolvedPath } = this._resolveProvider(path);
      await this._ensureDirectoryExistsInternal(provider, resolvedPath);
      this._inMemoryTreeAddDirectory(path);
    });
  }

  /**
   * Copy a single file to a new location, creating parent directories as needed.
   *
   * @param sourcePath - Absolute path of the file to copy.
   * @param destinationPath - Absolute path for the new copy.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the copy completes.
   */
  public async duplicateFile(
    sourcePath: string,
    destinationPath: string,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    return this._resourceQueue.queueFor(destinationPath, async () => {
      const source = this._resolveProvider(sourcePath);
      const destination = this._resolveProvider(destinationPath);
      const data = await source.provider.readFile(source.path);
      await this._ensureParentDir(destination.provider, destination.path);
      await destination.provider.writeFile(destination.path, data);

      const size = data.byteLength;
      this._inMemoryTreeAddFile(destinationPath, size);
      this._emitChangeEvent(
        {
          type: 'fileCopied',
          sourcePath,
          targetPath: destinationPath,
          backend: destination.backend,
        },
        context,
      );
    });
  }

  /**
   * Recursively copy an entire directory tree to a new location.
   *
   * @param sourcePath - Absolute path of the source directory.
   * @param destinationPath - Absolute path for the destination directory.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the copy completes.
   */
  public async copyDirectory(
    sourcePath: string,
    destinationPath: string,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    return this._resourceQueue.queueFor(destinationPath, async () => {
      const source = this._resolveProvider(sourcePath);
      const files = await this._getDirectoryContentsInternal(source.provider, source.path);

      for (const [relativePath, content] of Object.entries(files)) {
        const destinationFile = joinPath(destinationPath, relativePath);
        // oxlint-disable-next-line no-await-in-loop -- Sequential writes required
        const destination = this._resolveProvider(destinationFile);
        // oxlint-disable-next-line no-await-in-loop -- Sequential writes required
        await this._ensureParentDir(destination.provider, destination.path);
        // oxlint-disable-next-line no-await-in-loop -- Sequential writes required
        await destination.provider.writeFile(destination.path, content);
        this._inMemoryTreeAddFile(destinationFile, content.byteLength);
      }

      const destinationResolution = this._resolveProvider(destinationPath);
      this._emitChangeEvent(
        {
          type: 'directoryCopied',
          sourcePath,
          targetPath: destinationPath,
          backend: destinationResolution.backend,
        },
        context,
      );
    });
  }

  /**
   * Recursively read all files under a directory as raw bytes.
   *
   * @param path - Absolute directory path.
   * @returns Map of relative paths to file contents (empty if directory missing).
   */
  public async getDirectoryContents(path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    const directoryExists = await provider.exists(resolvedPath);
    if (!directoryExists) {
      return {};
    }
    return this._getDirectoryContentsInternal(provider, resolvedPath);
  }

  /**
   * Package a directory's contents into a ZIP blob. Pass `{ scope }` to
   * zip from the standalone provider for an explicit workspace scope
   * instead of the mount table.
   *
   * @param path    - Absolute directory path.
   * @param options - Optional `{ scope }` discriminator.
   * @returns ZIP archive as a `Blob`.
   */
  public async getZippedDirectory(path: string, options?: { scope?: WorkspaceScope }): Promise<Blob> {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- JSZip is the library's class name
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    const { provider, path: resolvedPath } = await this._resolve(path, options);
    const directoryExists = await provider.exists(resolvedPath);
    const files = directoryExists ? await this._getDirectoryContentsInternal(provider, resolvedPath) : {};
    for (const [relativePath, content] of Object.entries(files)) {
      zip.file(relativePath, content);
    }
    return zip.generateAsync({ type: 'blob' });
  }

  // --- Tree operations ---

  /**
   * Read one directory level from the routed provider (`readdirWithStats` when available)
   * plus virtual child-mount rows. Stateless — no worker-side directory cache.
   *
   * @param path - Absolute directory path.
   * @param options - Optional abort signal for cancellation.
   * @returns Sorted array of file tree nodes.
   */
  public async readDirectory(path: string, options?: { signal?: AbortSignal }): Promise<FileTreeNode[]> {
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const { provider, path: resolvedPath } = this._resolveProvider(path);
    const entryMap = new Map<string, TreeEntry>();

    if (provider.readdirWithStats) {
      const statsEntries = await provider.readdirWithStats(resolvedPath);
      for (const entry of statsEntries) {
        entryMap.set(entry.name, {
          name: entry.name,
          type: entry.type,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
        });
      }
    } else {
      const entries = await provider.readdir(resolvedPath);
      for (const entry of entries) {
        const fullPath = joinPath(resolvedPath, entry);
        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for tree building
          const stat = await provider.stat(fullPath);
          entryMap.set(entry, {
            name: entry,
            type: stat.type,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          });
        } catch {
          // Skip entries that can't be stat'd (deleted between readdir and stat)
        }
      }
    }

    const childMounts = this._mountTable.getMountsUnder(path);
    for (const mount of childMounts) {
      const mountName = mount.prefix.split('/').pop();
      if (mountName && !entryMap.has(mountName)) {
        entryMap.set(mountName, { name: mountName, type: 'dir', size: 0, mtimeMs: Date.now() });
      }
    }

    return this._treeEntriesToNodes(entryMap);
  }

  /**
   * Recursively collect stat information for every file under a directory.
   *
   * @param path - Absolute directory path to walk.
   * @param options - Optional abort signal for long walks.
   * @returns Flat array of file stat entries with relative paths.
   */
  public async getDirectoryStat(path: string, options?: { signal?: AbortSignal }): Promise<FileStatEntry[]> {
    const normalizedPath = normalizePath(path);

    if (this._inMemoryTree.isBuilt && this._directoryStatRoot !== undefined) {
      const treeRelativePath = this._toTreeRelative(normalizedPath);
      if (treeRelativePath !== undefined) {
        return this._inMemoryTree.getDirectoryStat(treeRelativePath);
      }

      const { provider, path: resolvedPath } = this._resolveProvider(normalizedPath);
      return this._collectDirectoryStatsFromProvider(
        provider,
        { walkPath: resolvedPath, basePath: resolvedPath },
        options,
      );
    }

    const { provider, path: resolvedPath } = this._resolveProvider(normalizedPath);
    const fileStats = await this._collectDirectoryStatsFromProvider(
      provider,
      { walkPath: resolvedPath, basePath: resolvedPath },
      options,
    );

    this._directoryStatRoot = normalizedPath;
    this._inMemoryTree.build(
      fileStats.map((f) => ({
        path: f.path,
        type: 'file',
        size: f.size,
        mtimeMs: f.mtimeMs,
      })),
    );

    return fileStats;
  }

  /**
   * Search the in-memory file tree for entries whose paths contain the query substring.
   * Synchronous — runs entirely against the already-warm {@link InMemoryFileTree}.
   *
   * @param basePath - Absolute root path (must match or be under the scan root).
   * @param query - Case-insensitive substring to match against relative file paths.
   * @param options - Search options: `maxResults` (default 100), `includeDirectories` (default false).
   * @returns Matching entries with paths relative to the tree root.
   */
  public searchFiles(
    basePath: string,
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): FileStatEntry[] {
    if (!this._inMemoryTree.isBuilt) {
      return [];
    }
    const treeRelativePath = this._toTreeRelative(normalizePath(basePath));
    if (treeRelativePath === undefined) {
      return [];
    }
    return this._inMemoryTree.searchFiles(query, options);
  }

  /**
   * Read a single directory level. Pass `{ scope }` to read via the
   * standalone provider for an explicit workspace scope (used by the
   * `/files` route to show all backends side-by-side); omit `scope` to
   * route through the mount table.
   *
   * Webaccess scopes carry an explicit `directoryHandle` and stable
   * `workspaceId`; the standalone cache is keyed by `workspaceId` so two
   * workspaces with the same folder name never share a provider
   * (Finding 3 of the explicit-workspace-boundaries blueprint).
   *
   * Memory scopes return `[]` (no persisted cross-mount tree to render).
   * Provider construction or readdir failures bubble up to the caller
   * so the UI can render structured recovery (the previous "swallow to
   * `[]`" fallback hid revoked-permission errors).
   *
   * @param path    - Absolute directory path.
   * @param options - Optional `{ scope }` discriminator.
   * @returns Sorted tree nodes (folders first, then alphabetical).
   */
  public async readShallowDirectory(path: string, options?: { scope?: WorkspaceScope }): Promise<FileTreeNode[]> {
    if (options?.scope?.backend === 'memory') {
      return [];
    }

    const { provider, path: resolvedPath } = await this._resolve(path, options);

    const nodes: FileTreeNode[] = [];
    if (provider.readdirWithStats) {
      const statsEntries = await provider.readdirWithStats(resolvedPath);
      for (const entry of statsEntries) {
        const fullPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
        if (entry.type === 'dir') {
          nodes.push({ id: fullPath, name: entry.name, size: entry.size, mtimeMs: entry.mtimeMs, children: [] });
        } else {
          nodes.push({ id: fullPath, name: entry.name, size: entry.size, mtimeMs: entry.mtimeMs });
        }
      }
    } else {
      const entries = await provider.readdir(resolvedPath);
      for (const entry of entries) {
        const fullPath = path === '/' ? `/${entry}` : `${path}/${entry}`;
        // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for tree building
        const node = await this._statToTreeNode(provider, fullPath, entry);
        if (node) {
          nodes.push(node);
        }
      }
    }

    return nodes.sort((a, b) => {
      const aIsFolder = a.children !== undefined;
      const bIsFolder = b.children !== undefined;
      if (aIsFolder && !bIsFolder) {
        return -1;
      }
      if (!aIsFolder && bIsFolder) {
        return 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  // --- Watch API ---

  /**
   * Subscribe to filesystem changes matching the request.
   * Identical requests share one underlying subscription (ref-counted).
   *
   * @param request - paths, recursive, includes/excludes, filter, correlationId
   * @param handler - callback for matching WatchEvents
   * @param ownerId - optional port/session id for lifecycle cleanup
   * @returns unsubscribe function
   */
  public watch(request: WatchRequest, handler: (event: WatchEvent) => void, ownerId?: string): () => void {
    return this._watchRegistry.watch(request, handler, ownerId);
  }

  /**
   * Remove all watches owned by a port/session (disconnect cleanup).
   *
   * @param ownerId - Port or session id whose watches to remove.
   */
  public cleanupWatches(ownerId: string): void {
    this._watchRegistry.cleanupOwner(ownerId);
  }

  /**
   * The underlying watch subscription registry.
   *
   * @returns The watch registry instance.
   */
  public get watchRegistry(): WatchRegistry {
    return this._watchRegistry;
  }

  // --- Backend management ---

  /**
   * Dynamically mount a path prefix on a new provider instance for the
   * supplied {@link MountConfig}. The discriminated config makes
   * webaccess mounts compile-time-safe: callers must pass
   * `{ directoryHandle, workspaceId }` together with `backend: 'webaccess'`.
   *
   * The caller owns the path convention; WorkspaceFileService is
   * domain-agnostic.
   *
   * @param prefix - Absolute path prefix to mount (e.g. `/data`, `/projects/abc`).
   * @param config - Discriminated mount configuration.
   */
  public async mount(prefix: string, config: MountConfig): Promise<void> {
    const provider = await this._registry.createMountProvider(this._toScope(config));
    this._mountTable.mount(prefix, provider, config);

    if (prefix === '/') {
      this._watchRegistry.setCaseSensitive(provider.capabilities.caseSensitive ?? true);
    }
  }

  /**
   * Remove a dynamic mount, disposing the provider that backs it.
   * Subsequent reads under the prefix fall through to whichever broader
   * mount covers the path (typically the root mount), matching POSIX-like
   * `umount` semantics.
   *
   * @param prefix - The mount prefix to remove.
   */
  public unmount(prefix: string): void {
    let provider: FileSystemProvider | undefined;
    try {
      provider = this._mountTable.resolve(prefix).provider;
    } catch {
      // No matching mount — fall through to `unmount` which is a no-op.
    }
    this._mountTable.unmount(prefix);
    provider?.dispose();
  }

  /**
   * Invalidate the standalone provider cache for a given backend / scope.
   *
   * The webaccess standalone cache is keyed by `workspaceId` (Audit R6).
   * When the user picks a different folder for an existing workspace
   * (`/files` "Change Folder" or recovery `bindProjectToWorkspace`), the
   * cached provider holds onto the previous handle — invalidating the
   * `workspaceId` slot forces a fresh provider on the next standalone
   * read. For non-webaccess backends, the registry's invalidator drops
   * every entry for that backend.
   *
   * @param backend     - The backend whose standalone cache should be cleared.
   * @param workspaceId - Optional workspace id; required to scope webaccess
   *                      invalidation to a single entry. When omitted for
   *                      `webaccess`, every webaccess entry is dropped.
   */
  public invalidateStandaloneProvider(
    backend: 'webaccess' | 'indexeddb' | 'opfs' | 'memory',
    workspaceId?: string,
  ): void {
    this._registry.invalidateStandaloneProvider(backend, workspaceId);
  }

  /**
   * The change event bus for subscribing to filesystem events.
   *
   * @returns The change event bus instance.
   */
  public get eventBus(): ChangeEventBus {
    return this._eventBus;
  }

  /** Release all resources: watches, providers, caches, and event bus. */
  public dispose(): void {
    this._watchRegistry.dispose();
    this._fs.dispose();
    this._registry.disposeAll();
    this._eventBus.dispose();
  }

  private _toScope(config: MountConfig): WorkspaceScope {
    if (config.backend === 'webaccess') {
      // Defensive runtime check — the discriminated `MountConfig` makes
      // this unreachable in well-typed call sites, but structured-clone
      // deserialisation through the worker bridge is not type-checked.
      // oxlint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive runtime guard against unsafe (untyped RPC / `as any`) callers
      if (!config.directoryHandle) {
        throw new MissingWorkspaceHandleError({ workspaceId: config.workspaceId });
      }
      return {
        backend: 'webaccess',
        directoryHandle: config.directoryHandle,
        workspaceId: config.workspaceId,
      };
    }
    return { backend: config.backend };
  }

  // --- Private helpers ---

  private _emitChangeEvent(event: ChangeEvent, context?: WorkspaceMutationContext): void {
    if (context?.originClientId !== undefined) {
      tagEventOrigin(event, context.originClientId);
    }
    this._eventBus.emit(event);
  }

  /**
   * Convert an absolute path to a path relative to {@link _directoryStatRoot} (scan root).
   * Used so incremental in-memory updates match paths stored by {@link InMemoryFileTree.build}.
   *
   * @param absolutePath - Normalized absolute filesystem path.
   * @returns Path relative to the scan root, `''` for the root itself, or `undefined` if outside the tree.
   */
  private _toTreeRelative(absolutePath: string): string | undefined {
    if (this._directoryStatRoot === undefined) {
      return undefined;
    }

    const root = normalizePath(this._directoryStatRoot);
    const abs = normalizePath(absolutePath);

    if (abs === root) {
      return '';
    }

    if (root === '/') {
      return abs.startsWith('/') ? abs.slice(1) : abs;
    }

    const rootPrefix = `${root}/`;
    if (abs.startsWith(rootPrefix)) {
      return abs.slice(rootPrefix.length);
    }

    return undefined;
  }

  private async _statToTreeNode(
    provider: FileSystemProvider,
    fullPath: string,
    name: string,
  ): Promise<FileTreeNode | undefined> {
    try {
      const stat = await provider.stat(fullPath);
      return stat.type === 'dir'
        ? { id: fullPath, name, size: stat.size, mtimeMs: stat.mtimeMs, children: [] }
        : { id: fullPath, name, size: stat.size, mtimeMs: stat.mtimeMs };
    } catch {
      return undefined;
    }
  }

  private async _collectDirectoryStatsFromProvider(
    provider: {
      readdir(path: string): Promise<string[]>;
      stat(path: string): Promise<FileStat>;
      readdirWithStats?(path: string): Promise<Array<{ name: string } & FileStat>>;
    },
    scan: { walkPath: string; basePath: string },
    options?: { signal?: AbortSignal },
  ): Promise<FileStatEntry[]> {
    const { walkPath, basePath } = scan;
    const fileStats: FileStatEntry[] = [];

    const collectStats = async (currentPath: string, innerBasePath: string): Promise<void> => {
      if (options?.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }

      if (provider.readdirWithStats) {
        const statsEntries = await provider.readdirWithStats(currentPath);
        for (const entry of statsEntries) {
          if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
          }

          const fullPath = joinPath(currentPath, entry.name);
          if (entry.type === 'file') {
            const relativePath = innerBasePath === '/' ? fullPath.slice(1) : fullPath.slice(innerBasePath.length + 1);
            const segments = relativePath.split('/');
            const filename = segments.at(-1) ?? relativePath;
            fileStats.push({
              path: relativePath,
              name: filename,
              type: 'file',
              size: entry.size,
              mtimeMs: entry.mtimeMs,
            });
          } else {
            // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for recursive tree walk
            await collectStats(fullPath, innerBasePath);
          }
        }
      } else {
        const entries = await provider.readdir(currentPath);
        for (const entry of entries) {
          if (options?.signal?.aborted) {
            throw new DOMException('The operation was aborted.', 'AbortError');
          }

          const fullPath = joinPath(currentPath, entry);
          // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for recursive tree walk
          const stat = await provider.stat(fullPath);
          if (stat.type === 'file') {
            const relativePath = innerBasePath === '/' ? fullPath.slice(1) : fullPath.slice(innerBasePath.length + 1);
            const segments = relativePath.split('/');
            const filename = segments.at(-1) ?? relativePath;
            fileStats.push({
              path: relativePath,
              name: filename,
              type: 'file',
              size: stat.size,
              mtimeMs: stat.mtimeMs,
            });
          } else {
            // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for recursive tree walk
            await collectStats(fullPath, innerBasePath);
          }
        }
      }
    };

    await collectStats(walkPath, basePath);
    return fileStats;
  }

  private _inMemoryTreeAddFile(absolutePath: string, size: number): void {
    const treeRelativePath = this._toTreeRelative(normalizePath(absolutePath));
    if (treeRelativePath !== undefined) {
      this._inMemoryTree.addFile(treeRelativePath, size);
    }
  }

  private _inMemoryTreeAddDirectory(absolutePath: string): void {
    const treeRelativePath = this._toTreeRelative(normalizePath(absolutePath));
    if (treeRelativePath !== undefined) {
      this._inMemoryTree.addDirectory(treeRelativePath);
    }
  }

  private _inMemoryTreeRename(from: string, to: string): void {
    const relativeFromPath = this._toTreeRelative(normalizePath(from));
    const relativeToPath = this._toTreeRelative(normalizePath(to));
    if (relativeFromPath !== undefined && relativeToPath !== undefined) {
      this._inMemoryTree.rename(relativeFromPath, relativeToPath);
    }
  }

  private _inMemoryTreeRemoveFile(absolutePath: string): void {
    const treeRelativePath = this._toTreeRelative(normalizePath(absolutePath));
    if (treeRelativePath !== undefined) {
      this._inMemoryTree.removeFile(treeRelativePath);
    }
  }

  private _inMemoryTreeRemoveDirectory(absolutePath: string): void {
    const treeRelativePath = this._toTreeRelative(normalizePath(absolutePath));
    if (treeRelativePath !== undefined) {
      this._inMemoryTree.removeDirectory(treeRelativePath);
    }
  }

  private _treeEntriesToNodes(entries: Map<string, TreeEntry>): FileTreeNode[] {
    const nodes: FileTreeNode[] = [];
    for (const [, entry] of entries) {
      if (entry.type === 'dir') {
        nodes.push({ id: entry.name, name: entry.name, size: entry.size, mtimeMs: entry.mtimeMs, children: [] });
      } else {
        nodes.push({ id: entry.name, name: entry.name, size: entry.size, mtimeMs: entry.mtimeMs });
      }
    }
    return nodes.sort((a, b) => {
      const aIsFolder = a.children !== undefined;
      const bIsFolder = b.children !== undefined;
      if (aIsFolder && !bIsFolder) {
        return -1;
      }
      if (!aIsFolder && bIsFolder) {
        return 1;
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });
  }

  /**
   * Resolve the provider and provider-relative path for an absolute virtual path
   * via the mount table. Throws immediately if no mount matches.
   *
   * @param path - Absolute virtual path.
   * @returns Resolved provider and provider-relative path.
   */
  private _resolveProvider(path: string): MountResolution {
    return this._mountTable.resolve(path);
  }

  /**
   * Resolve the provider for an FS operation. When `options.scope` is
   * supplied the standalone provider for that scope is returned and the
   * absolute path is passed through verbatim (no mount-prefix stripping).
   * Otherwise the mount table is consulted as in {@link _resolveProvider}.
   *
   * @param path - Absolute virtual path inside the (possibly scoped) workspace.
   * @param options - Optional scope discriminator.
   * @returns Resolved provider, provider-relative path, and backend tag.
   */
  private async _resolve(
    path: string,
    options?: { scope?: WorkspaceScope },
  ): Promise<{ provider: FileSystemProvider; path: string; backend: FileSystemBackend }> {
    if (options?.scope !== undefined) {
      const provider = await this._registry.getStandaloneProvider(options.scope);
      return { provider, path, backend: options.scope.backend };
    }
    const resolution = this._mountTable.resolve(path);
    return { provider: resolution.provider, path: resolution.path, backend: resolution.backend };
  }

  private async _ensureParentDir(
    provider: { mkdir(path: string, options?: { recursive?: boolean }): Promise<void> },
    filePath: string,
  ): Promise<void> {
    const directory = parentDirectory(filePath);
    if (directory !== '/') {
      await this._ensureDirectoryExistsInternal(provider, directory);
    }
  }

  private async _ensureDirectoryExistsInternal(
    provider: {
      mkdir(path: string): Promise<void>;
      exists?(path: string): Promise<boolean>;
    },
    targetPath: string,
  ): Promise<void> {
    const normalized = normalizePath(targetPath);
    const segments = normalized.split('/').filter((s: string) => s.length > 0);

    let currentPath = '';
    for (const segment of segments) {
      currentPath += `/${segment}`;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Sequential mkdir required for recursive creation
        await provider.mkdir(currentPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
      }
    }
  }

  private async _rmdirRecursive(provider: FileSystemProvider, directoryPath: string): Promise<void> {
    const entries = await provider.readdir(directoryPath);
    for (const entry of entries) {
      const fullPath = joinPath(directoryPath, entry);
      // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for ordered deletion
      const entryStat = await provider.stat(fullPath);
      // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive deletion
      await (entryStat.type === 'dir' ? this._rmdirRecursive(provider, fullPath) : provider.unlink(fullPath));
    }
    await provider.rmdir(directoryPath);
  }

  /**
   * Remove either a file or a directory recursively from `provider`. Used by
   * {@link move} when an overwriting target needs to be cleared before the
   * source is copied/renamed over it.
   *
   * @param provider - Provider that owns the path being removed.
   * @param path     - Provider-relative absolute path.
   */
  private async _removeRecursive(provider: FileSystemProvider, path: string): Promise<void> {
    const targetStat = await provider.stat(path);
    // oxlint-disable-next-line unicorn/prefer-ternary -- explicit if/else preserves the dir-vs-file branch order so call sites can reason about the recursive walk symmetrically.
    if (targetStat.type === 'dir') {
      await this._rmdirRecursive(provider, path);
    } else {
      await provider.unlink(path);
    }
  }

  /**
   * Recursively copy every file under `sourcePath` (on `sourceProvider`) to
   * `targetPath` on `targetProvider`. Used by {@link move} when the source
   * and target resolve to different providers, since neither provider has
   * native cross-mount semantics.
   *
   * @param sourceProvider - Provider that owns the source subtree.
   * @param sourcePath     - Absolute path of the source directory on `sourceProvider`.
   * @param targetProvider - Provider that will receive the copy.
   * @param targetPath     - Absolute path of the destination directory on `targetProvider`.
   */
  // oxlint-disable-next-line max-params -- (sourceProvider, sourcePath, targetProvider, targetPath) mirrors the two-side cross-mount semantics; collapsing into a single options bag would obscure that the source and target are independently resolved.
  private async _copyDirectoryAcrossProviders(
    sourceProvider: FileSystemProvider,
    sourcePath: string,
    targetProvider: FileSystemProvider,
    targetPath: string,
  ): Promise<void> {
    await this._ensureDirectoryExistsInternal(targetProvider, targetPath);
    const entries = await sourceProvider.readdir(sourcePath);
    for (const entry of entries) {
      const sourceEntry = joinPath(sourcePath, entry);
      const targetEntry = joinPath(targetPath, entry);
      // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for ordered traversal
      const entryStat = await sourceProvider.stat(sourceEntry);
      if (entryStat.type === 'dir') {
        // oxlint-disable-next-line no-await-in-loop -- Sequential recursion required
        await this._copyDirectoryAcrossProviders(sourceProvider, sourceEntry, targetProvider, targetEntry);
      } else {
        // oxlint-disable-next-line no-await-in-loop -- Sequential reads required to bound memory
        const data = await sourceProvider.readFile(sourceEntry);
        // oxlint-disable-next-line no-await-in-loop -- Sequential writes required for ordered creation
        await targetProvider.writeFile(targetEntry, data);
      }
    }
  }

  private async _getDirectoryContentsInternal(
    provider: {
      readdir(path: string): Promise<string[]>;
      stat(path: string): Promise<FileStat>;
      readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    },
    path: string,
  ): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};

    const collect = async (currentPath: string, basePath: string): Promise<void> => {
      const entries = await provider.readdir(currentPath);
      for (const entry of entries) {
        const fullPath = joinPath(currentPath, entry);
        // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for recursive collection
        const stat = await provider.stat(fullPath);
        if (stat.type === 'file') {
          const relativePath = basePath === '/' ? fullPath.slice(1) : fullPath.slice(basePath.length + 1);
          // oxlint-disable-next-line no-await-in-loop -- Sequential reads required for recursive collection
          files[relativePath] = await provider.readFile(fullPath);
        } else {
          // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive collection
          await collect(fullPath, basePath);
        }
      }
    };

    await collect(path, path);
    return files;
  }
}
