import { BoundedFileCache } from '@taucad/filesystem';
import { Topic } from '@taucad/events';
import { PathSubscriberRegistry } from '#path-subscriber-registry.js';
import type { RefreshGenerationGuard } from '#refresh-generation-guard.js';
import type { WorkerChangeChannel, WorkerRelativeRenameEvent } from '#worker-change-channel.js';
import type { WorkspacePathResolver } from '#workspace-path-resolver.js';
import type { SharedPool } from '@taucad/memory';
import type { BulkMoveEdit, BulkMoveResult, FileSystemClient } from '#file-system-client.js';
import type { WorkspaceMutationError } from '@taucad/filesystem';
import type { FileWriteSource } from '#file-write-source.js';
import { headSniffByteLength, seemsBinary } from '#seems-binary.js';
import { BinaryFileError, FileNotFoundError, FileTooLargeError } from '#file-content-errors.js';

/**
 * Content-side mutation / read notifications for subscribers.
 *
 * @public
 */
export type ContentChangeEvent =
  | { type: 'written'; path: string; data: Uint8Array<ArrayBuffer>; source: FileWriteSource }
  | { type: 'read'; path: string; data: Uint8Array<ArrayBuffer> }
  | { type: 'renamed'; oldPath: string; newPath: string }
  | { type: 'deleted'; path: string; source: FileWriteSource }
  | { type: 'batchWritten'; paths: string[]; source: FileWriteSource }
  | { type: 'directoryCreated'; path: string }
  | { type: 'directoryDeleted'; path: string }
  | { type: 'directoryRenamed'; oldPath: string; newPath: string }
  | { type: 'fileCopied'; sourcePath: string | undefined; targetPath: string }
  | { type: 'directoryCopied'; sourcePath: string | undefined; targetPath: string };

/**
 * Discriminated outcome of a content resolve.
 * The hook + render layer route on `kind` instead of guessing from cache state.
 *
 * @public
 */
export type FileContentResult =
  | { kind: 'loading' }
  | { kind: 'text'; content: Uint8Array<ArrayBuffer> }
  | { kind: 'binary'; size: number; head: Uint8Array<ArrayBuffer> }
  | { kind: 'too-large'; size: number; limit: number }
  | { kind: 'orphaned' }
  | { kind: 'error'; cause: unknown };

/**
 * Options for {@link FileContentService.resolve}.
 *
 * @public
 */
export type ResolveOptions = {
  /** Bypass binary sniff and treat the bytes as text regardless. */
  readonly forceText?: boolean;
  /** Override the open-time size limit for this resolve only. */
  readonly sizeLimit?: number;
};

/**
 * Outcome publication event for `useSyncExternalStore` consumers.
 *
 * @public
 */
export type OutcomeChangeEvent = { path: string; result: FileContentResult };

type FileContentServiceInit = {
  proxy: FileSystemClient;
  paths: WorkspacePathResolver;
  channel: WorkerChangeChannel;
  refreshGuard: RefreshGenerationGuard;
  cacheOptions?: {
    maxEntries?: number;
    maxTotalBytes?: number;
    maxSingleFileBytes?: number;
  };
  /**
   * Open-time size policy. Files exceeding this limit produce a `too-large`
   * outcome before the bytes are admitted to the cache. Distinct from
   * `cacheOptions.maxSingleFileBytes`, which only bounds memory pressure.
   * Defaults to 50 MiB (matches VS Code's web confirmation limit).
   */
  openSizeBytes?: number;
  /** Reader-side shared file pool for zero-IPC cached reads across threads. */
  filePool?: SharedPool;
};

const defaultMaxEntries = 500;
const defaultMaxTotalBytes = 128 * 1024 * 1024;
const defaultMaxSingleFileBytes = 1024 * 1024;
const defaultOpenSizeBytes = 50 * 1024 * 1024;

/**
 * Shared sentinel for unresolved paths. `peekOutcome` MUST return a
 * referentially-stable value when nothing has changed, otherwise
 * `useSyncExternalStore` consumers re-render in a loop and the
 * surrounding error boundary remounts the project tree (crash-loop).
 */
const loadingOutcome: FileContentResult = { kind: 'loading' };

/**
 * Orphan state transition for editor routing.
 *
 * @public
 */
export type OrphanChangeEvent = { path: string; orphaned: boolean };

type EditorSaveState = {
  pending: Uint8Array<ArrayBuffer> | undefined;
  completion: Promise<void>;
};

type EditorMutationBarrier = {
  readonly source: string;
  readonly target: string | undefined;
  readonly deferred: Map<string, Uint8Array<ArrayBuffer>>;
  readonly settled: PromiseWithResolvers<void>;
};

/**
 * Single content authority on the main thread.
 * All content operations (read, write, rename, delete, duplicate)
 * go through this service. No consumer ever calls the proxy for
 * content operations directly.
 *
 * `resolve` returns a discriminated `FileContentResult` so that the
 * binary/too-large/orphaned/error decisions are made inside the read
 * pipeline rather than guessed from cache content in the render layer.
 * Callers that just want bytes use `resolveBytes`, which throws typed
 * errors for non-text outcomes.
 *
 * @public
 * @example <caption>Wire FileContentService with a worker change channel</caption>
 * ```typescript
 * import { FileContentService } from '@taucad/fs-client/file-content-service';
 * import { RefreshGenerationGuard } from '@taucad/fs-client/refresh-generation-guard';
 * import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
 * import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
 * import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
 * import type { WorkerChangeChannelTransport } from '@taucad/fs-client/worker-change-channel';
 * export function createExampleFileContentService(
 *   proxy: FileSystemClient,
 *   listen: WorkerChangeChannelTransport['listen'],
 * ): FileContentService {
 *   const paths = new WorkspacePathResolver('/projects/p1');
 *   const channel = new WorkerChangeChannel({ transport: { listen }, paths });
 *   return new FileContentService({
 *     proxy,
 *     paths,
 *     channel,
 *     refreshGuard: new RefreshGenerationGuard(),
 *   });
 * }
 * ```
 */
export class FileContentService {
  private readonly cache: BoundedFileCache;
  private readonly proxy: FileSystemClient;
  private readonly filePool: SharedPool | undefined;
  private readonly openSizeBytes: number;
  private readonly paths: WorkspacePathResolver;
  private readonly refreshGuard: RefreshGenerationGuard;
  private readonly pendingResolves = new Map<string, Promise<FileContentResult>>();
  private readonly outcomes = new Map<string, FileContentResult>();
  private readonly pathNotifyRegistry = new PathSubscriberRegistry();
  private readonly contentChangeRegistry = new PathSubscriberRegistry<ContentChangeEvent>();
  private readonly orphanedPaths = new Set<string>();
  private readonly editorSaves = new Map<string, EditorSaveState>();
  private readonly editorMutationBarriers: EditorMutationBarrier[] = [];
  private readonly unsubscribeChannel: Array<() => void>;
  readonly #orphanTopic = new Topic<OrphanChangeEvent>({ name: 'FileContentService.orphan' });
  readonly #outcomeTopic = new Topic<OutcomeChangeEvent>({ name: 'FileContentService.outcome' });

  public constructor(init: FileContentServiceInit) {
    this.proxy = init.proxy;
    this.paths = init.paths;
    this.refreshGuard = init.refreshGuard;
    this.filePool = init.filePool;
    this.openSizeBytes = init.openSizeBytes ?? defaultOpenSizeBytes;
    this.cache = new BoundedFileCache({
      maxEntries: init.cacheOptions?.maxEntries ?? defaultMaxEntries,
      maxTotalBytes: init.cacheOptions?.maxTotalBytes ?? defaultMaxTotalBytes,
      maxSingleFileBytes: init.cacheOptions?.maxSingleFileBytes ?? defaultMaxSingleFileBytes,
    });
    this.unsubscribeChannel = [
      init.channel.onFileWritten({
        handler: (event) => {
          this.onWorkerFileWritten(event.path);
        },
      }),
      init.channel.onFileDeleted({
        handler: (event) => {
          this.onWorkerFileDeleted(event.path);
        },
      }),
      init.channel.onFileRenamed({
        handler: (event) => {
          this.onWorkerFileRenamed(event);
        },
      }),
      init.channel.onFileCopied({
        handler: (event) => {
          this.notifyGlobalSubscribers({
            type: 'fileCopied',
            sourcePath: event.sourcePath,
            targetPath: event.targetPath,
          });
        },
      }),
      init.channel.onDirectoryChanged({
        handler: (event) => {
          this.refreshOpenPathsUnderDirectory(event.path);
        },
      }),
      init.channel.onDirectoryCreated({
        handler: (event) => {
          this.notifyGlobalSubscribers({ type: 'directoryCreated', path: event.path });
        },
      }),
      init.channel.onDirectoryDeleted({
        handler: (event) => {
          this.onWorkerDirectoryDeleted(event.path);
          this.notifyGlobalSubscribers({ type: 'directoryDeleted', path: event.path });
        },
      }),
      init.channel.onDirectoryRenamed({
        handler: (event) => {
          this.onWorkerDirectoryRenamed(event.oldPath, event.newPath);
          if (event.oldPath !== undefined && event.newPath !== undefined) {
            this.notifyGlobalSubscribers({
              type: 'directoryRenamed',
              oldPath: event.oldPath,
              newPath: event.newPath,
            });
          }
        },
      }),
      init.channel.onDirectoryCopied({
        handler: (event) => {
          this.notifyGlobalSubscribers({
            type: 'directoryCopied',
            sourcePath: event.sourcePath,
            targetPath: event.targetPath,
          });
        },
      }),
      init.channel.onBackendChanged(() => {
        this.onWorkerBackendChanged();
      }),
    ];
  }

  /**
   * Resolve file content, returning a discriminated outcome that captures
   * the binary/too-large/orphaned/error decision inside the read pipeline.
   * Cache hit short-circuits the read and re-uses the cached `text` outcome.
   * @param path - Workspace-relative path.
   * @param options - Optional resolve overrides (`forceText`, `sizeLimit`).
   * @returns Latest discriminated {@link FileContentResult} for the path.
   */
  public async resolve(path: string, options?: ResolveOptions): Promise<FileContentResult> {
    const cached = this.cache.get(path);
    if (cached !== undefined && !this.shouldRecompute(options)) {
      const existing = this.outcomes.get(path);
      if (existing?.kind === 'text') {
        return existing;
      }
      const refreshed: FileContentResult = { kind: 'text', content: cached };
      this.publishOutcome(path, refreshed);
      return refreshed;
    }

    const pending = this.pendingResolves.get(path);
    if (pending !== undefined && !this.shouldRecompute(options)) {
      return pending;
    }

    const generation = this.refreshGuard.begin(path);
    const promise = this.computeOutcome(path, generation, options);
    this.pendingResolves.set(path, promise);

    try {
      return await promise;
    } finally {
      this.pendingResolves.delete(path);
    }
  }

  /**
   * Resolve file content as raw bytes, throwing typed errors for
   * non-text outcomes. Use this when the caller expects text bytes
   * (e.g. KCL LSP, RPC handlers, chat-stack-trace).
   * @param path - Workspace-relative path.
   * @param options - Optional resolve overrides (`forceText`, `sizeLimit`).
   * @returns Raw UTF-8 bytes when the outcome is representable as text.
   */
  public async resolveBytes(path: string, options?: ResolveOptions): Promise<Uint8Array<ArrayBuffer>> {
    const result = await this.resolve(path, options);
    switch (result.kind) {
      case 'text': {
        return result.content;
      }
      case 'binary': {
        throw new BinaryFileError(`File '${path}' is binary and cannot be read as text`, {
          path,
          size: result.size,
        });
      }
      case 'too-large': {
        throw new FileTooLargeError(
          `File '${path}' (${result.size} bytes) exceeds open-time size limit (${result.limit} bytes)`,
          { path, size: result.size, limit: result.limit },
        );
      }
      case 'orphaned': {
        throw new FileNotFoundError(`File '${path}' was not found`, { path });
      }
      case 'error': {
        throw result.cause instanceof Error ? result.cause : new Error(String(result.cause));
      }
      case 'loading': {
        throw new Error(`Unexpected 'loading' outcome for '${path}'`);
      }
    }
  }

  /**
   * Sync snapshot of the most recent outcome for a path.
   * Returns `{ kind: 'loading' }` when no outcome has been computed yet.
   * Compatible with `useSyncExternalStore`.
   * @param path - Workspace-relative path.
   * @returns Referentially stable {@link FileContentResult} snapshot (may be the shared loading sentinel).
   */
  public peekOutcome(path: string): FileContentResult {
    return this.outcomes.get(path) ?? loadingOutcome;
  }

  /**
   * Write file content. Clones buffer before transfer to prevent detachment.
   *
   * `path` **MUST** be workspace-relative; absolute keys that escape the
   * workspace root throw {@link WorkspaceScopeViolationError} synchronously.
   * Use `FileSystemClient.writeFiles` for cross-workspace writes (e.g. the
   * project bootstrap mount-write-unmount transaction).
   *
   * @param path - Workspace-relative path.
   * @param data - Bytes to persist (copied before crossing the worker boundary).
   * @param source - Provenance tag for downstream refresh heuristics.
   * @throws {WorkspaceScopeViolationError} When `path` escapes the workspace root.
   */
  public async write(path: string, data: Uint8Array<ArrayBuffer>, source: FileWriteSource): Promise<void> {
    const key = this.paths.toWorkspaceRelativeKey('write', path);
    const localCopy = new Uint8Array(data);
    const wireCopy = new Uint8Array(data);
    const absolutePath = this.paths.toAbsolutePath(key);
    await this.proxy.writeFile(absolutePath, wireCopy);
    this.refreshGuard.begin(key);
    this.cache.set(key, localCopy);
    this.setOrphaned(key, false);
    this.publishOutcome(key, { kind: 'text', content: localCopy });
    this.notifyGlobalSubscribers({ type: 'written', path: key, data: localCopy, source });
  }

  /**
   * Persist Monaco working-copy changes with one active write and one
   * replaceable latest value per workspace path.
   *
   * @param path - Workspace-relative model path.
   * @param data - Latest model bytes.
   * @returns Promise settled after the latest accepted value is durable.
   */
  // oxlint-disable-next-line @typescript-eslint/promise-function-async -- Concurrent callers must receive the shared queue promise by identity.
  public saveEditor(path: string, data: Uint8Array<ArrayBuffer>): Promise<void> {
    const key = this.paths.toWorkspaceRelativeKey('saveEditor', path);
    const copy = new Uint8Array(data);
    const barrier = this._editorMutationBarrierFor(key);
    if (barrier !== undefined) {
      barrier.deferred.set(key, copy);
      return barrier.settled.promise;
    }

    const existing = this.editorSaves.get(key);
    if (existing !== undefined) {
      existing.pending = copy;
      return existing.completion;
    }

    const state: EditorSaveState = { pending: copy, completion: Promise.resolve() };
    this.editorSaves.set(key, state);
    state.completion = this._drainEditorSave(key, state);
    return state.completion;
  }

  /**
   * Write multiple files. Clones each buffer before transfer.
   *
   * Map keys **MUST** be workspace-relative; absolute keys that escape the
   * workspace root throw {@link WorkspaceScopeViolationError} synchronously
   * before any worker round-trip. Use `FileSystemClient.writeFiles` for
   * cross-workspace writes.
   *
   * @param files - Map of relative paths to file payloads.
   * @param source - Provenance tag for downstream refresh heuristics.
   * @throws {WorkspaceScopeViolationError} When any key escapes the workspace root.
   */
  public async writeFiles(
    files: Record<string, { content: Uint8Array<ArrayBuffer> }>,
    source: FileWriteSource,
  ): Promise<void> {
    const absoluteFiles: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
    const clones = new Map<string, Uint8Array<ArrayBuffer>>();
    const paths: string[] = [];

    for (const [path, file] of Object.entries(files)) {
      const key = this.paths.toWorkspaceRelativeKey('writeFiles', path);
      const localCopy = new Uint8Array(file.content);
      const wireCopy = new Uint8Array(file.content);
      clones.set(key, localCopy);
      absoluteFiles[this.paths.toAbsolutePath(key)] = { content: wireCopy };
      paths.push(key);
    }

    await this.proxy.writeFiles(absoluteFiles);

    for (const [key, localCopy] of clones) {
      this.refreshGuard.begin(key);
      this.cache.set(key, localCopy);
      this.publishOutcome(key, { kind: 'text', content: localCopy });
    }

    this.notifyGlobalSubscribers({ type: 'batchWritten', paths, source });
  }

  /**
   * Move a file or directory. Updates cache and notifies subscribers for
   * every affected descendant when the source is a directory.
   *
   * Both arguments **MUST** be workspace-relative; absolute keys that escape
   * the workspace root throw {@link WorkspaceScopeViolationError}
   * synchronously.
   *
   * @param oldPath - Source workspace-relative path.
   * @param newPath - Target workspace-relative path.
   * @throws {WorkspaceScopeViolationError} When either key escapes the workspace root.
   */
  public async move(oldPath: string, newPath: string): Promise<void> {
    const oldKey = this.paths.toWorkspaceRelativeKey('move', oldPath);
    const newKey = this.paths.toWorkspaceRelativeKey('move', newPath);
    const absoluteOldPath = this.paths.toAbsolutePath(oldKey);
    const absoluteNewPath = this.paths.toAbsolutePath(newKey);
    const barrier = this._beginEditorMutation(oldKey, newKey);
    await this._drainEditorSavesUnder(oldKey, barrier, false);
    try {
      await this.proxy.move(absoluteOldPath, absoluteNewPath);
      this.recordMove(oldKey, newKey);
      await this._finishEditorMutation(barrier, true);
    } catch (error) {
      await this._finishEditorMutation(barrier, false);
      throw error;
    }
  }

  /**
   * Preflight {@link move}. Workspace-relative wrapper that delegates
   * to the worker's `canMove`; returns `true` when safe to issue or a
   * structured {@link WorkspaceMutationError} otherwise.
   *
   * @param oldPath - Workspace-relative source path.
   * @param newPath - Workspace-relative target path.
   * @returns `true` when the move is valid, otherwise its structured error.
   */
  public async canMove(oldPath: string, newPath: string): Promise<true | WorkspaceMutationError> {
    const oldKey = this.paths.toWorkspaceRelativeKey('canMove', oldPath);
    const newKey = this.paths.toWorkspaceRelativeKey('canMove', newPath);
    return this.proxy.canMove(this.paths.toAbsolutePath(oldKey), this.paths.toAbsolutePath(newKey));
  }

  /**
   * Preflight rename within a single parent directory. Workspace-relative wrapper.
   *
   * @param oldPath - Workspace-relative current path.
   * @param newName - New basename (no slashes).
   * @returns `true` when the rename is valid, otherwise its structured error.
   */
  public async canRename(oldPath: string, newName: string): Promise<true | WorkspaceMutationError> {
    const oldKey = this.paths.toWorkspaceRelativeKey('canRename', oldPath);
    return this.proxy.canRename(this.paths.toAbsolutePath(oldKey), newName);
  }

  /**
   * Preflight create. Workspace-relative wrapper for `canCreate`.
   *
   * @param path - Workspace-relative path.
   * @param kind - `'file'` or `'directory'`.
   * @returns `true` when creation is valid, otherwise its structured error.
   */
  public async canCreate(path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> {
    const key = this.paths.toWorkspaceRelativeKey('canCreate', path);
    return this.proxy.canCreate(this.paths.toAbsolutePath(key), kind);
  }

  /**
   * Preflight delete. Workspace-relative wrapper for `canDelete`.
   *
   * @param path - Workspace-relative path.
   * @returns `true` when deletion is valid, otherwise its structured error.
   */
  public async canDelete(path: string): Promise<true | WorkspaceMutationError> {
    const key = this.paths.toWorkspaceRelativeKey('canDelete', path);
    return this.proxy.canDelete(this.paths.toAbsolutePath(key));
  }

  /**
   * Move many paths sequentially. This workspace-relative wrapper
   * translates each edit's source/target into absolute paths, calls
   * the worker {@link FileSystemClient.bulkMove}, and migrates the local
   * cache + outcome map for every completed entry via
   * the same logic as {@link move}.
   *
   * @param edits - Workspace-relative source/target pairs.
   * @returns Per-edit move successes and failures.
   */
  public async bulkMove(edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult> {
    if (edits.length === 0) {
      return { moved: [], failed: [] };
    }

    const normalized = edits.map((edit) => {
      const oldKey = this.paths.toWorkspaceRelativeKey('bulkMove', edit.source);
      const newKey = this.paths.toWorkspaceRelativeKey('bulkMove', edit.target);
      return {
        oldKey,
        newKey,
        source: this.paths.toAbsolutePath(oldKey),
        target: this.paths.toAbsolutePath(newKey),
      };
    });

    const barriers = normalized.map(({ oldKey, newKey }) => this._beginEditorMutation(oldKey, newKey));
    await Promise.all(
      barriers.map(async (barrier) => {
        await this._drainEditorSavesUnder(barrier.source, barrier, false);
      }),
    );

    let result: BulkMoveResult;
    try {
      result = await this.proxy.bulkMove(normalized.map(({ source, target }) => ({ source, target })));
    } catch (error) {
      await Promise.all(barriers.map(async (barrier) => this._finishEditorMutation(barrier, false)));
      throw error;
    }

    for (const moved of result.moved) {
      const entry = normalized.find(
        ({ source, target }) => source === moved.edit.source && target === moved.edit.target,
      );
      if (entry === undefined) {
        continue;
      }
      const { oldKey, newKey } = entry;
      this.refreshGuard.begin(oldKey);
      this.refreshGuard.begin(newKey);
      const subtreeKeys: string[] = [];
      const oldPrefix = oldKey === '' ? '' : `${oldKey}/`;
      for (const path of this.outcomes.keys()) {
        if (path === oldKey || path.startsWith(oldPrefix)) {
          subtreeKeys.push(path);
        }
      }
      for (const [path] of this.cache.entries()) {
        if ((path === oldKey || path.startsWith(oldPrefix)) && !subtreeKeys.includes(path)) {
          subtreeKeys.push(path);
        }
      }

      if (subtreeKeys.length === 0) {
        this.cache.rename(oldKey, newKey);
        this.pathNotifyRegistry.notifyPath(oldKey, undefined);
        this.notifyGlobalSubscribers({ type: 'renamed', oldPath: oldKey, newPath: newKey });
        continue;
      }

      const newPrefix = newKey === '' ? '' : `${newKey}/`;
      for (const path of subtreeKeys) {
        const remapped = path === oldKey ? newKey : `${newPrefix}${path.slice(oldPrefix.length)}`;
        this.refreshGuard.begin(path);
        this.refreshGuard.begin(remapped);
        this.cache.rename(path, remapped);
        const oldOutcome = this.outcomes.get(path);
        if (oldOutcome) {
          this.outcomes.delete(path);
          this.publishOutcome(remapped, oldOutcome);
        }
        this.pathNotifyRegistry.notifyPath(path, undefined);
        this.notifyGlobalSubscribers({ type: 'renamed', oldPath: path, newPath: remapped });
      }
    }

    const movedSources = new Set(result.moved.map(({ edit }) => edit.source));
    await Promise.all(
      barriers.map(async (barrier, index) =>
        this._finishEditorMutation(barrier, movedSources.has(normalized[index]!.source)),
      ),
    );

    return result;
  }

  /**
   * Delete a file. Removes from cache and notifies subscribers.
   *
   * `path` **MUST** be workspace-relative; absolute keys that escape the
   * workspace root throw {@link WorkspaceScopeViolationError} synchronously.
   *
   * @param path - Workspace-relative path.
   * @param source - Provenance tag for downstream refresh heuristics.
   * @throws {WorkspaceScopeViolationError} When `path` escapes the workspace root.
   */
  public async delete(path: string, source: FileWriteSource): Promise<void> {
    const key = this.paths.toWorkspaceRelativeKey('delete', path);
    const absolutePath = this.paths.toAbsolutePath(key);
    const barrier = this._beginEditorMutation(key);
    await this._drainEditorSavesUnder(key, barrier, true);
    try {
      await this.proxy.unlink(absolutePath);
      this.refreshGuard.begin(key);
      this.cache.delete(key);
      this.setOrphaned(key, true);
      this.publishOutcome(key, { kind: 'orphaned' });
      this.notifyGlobalSubscribers({ type: 'deleted', path: key, source });
      await this._finishEditorMutation(barrier, true);
    } catch (error) {
      await this._finishEditorMutation(barrier, false);
      throw error;
    }
  }

  /**
   * Create a directory through the project-scoped workspace facade.
   *
   * `path` **MUST** be workspace-relative; absolute keys that escape the
   * workspace root throw {@link WorkspaceScopeViolationError} synchronously.
   *
   * @param path - Workspace-relative directory path.
   * @param options - Optional `{ recursive }` for intermediate directories.
   * @throws {WorkspaceScopeViolationError} When `path` escapes the workspace root.
   */
  public async createDirectory(path: string, options?: { recursive?: boolean }): Promise<void> {
    const key = this.paths.toWorkspaceRelativeKey('createDirectory', path);
    await this.proxy.mkdir(this.paths.toAbsolutePath(key), options);
    this.notifyGlobalSubscribers({ type: 'directoryCreated', path: key });
  }

  /**
   * Delete a directory through the project-scoped workspace facade.
   *
   * `path` **MUST** be workspace-relative; absolute keys that escape the
   * workspace root throw {@link WorkspaceScopeViolationError} synchronously.
   *
   * @param path - Workspace-relative directory path.
   * @param options - Optional `{ recursive }` for subtree deletion.
   * @throws {WorkspaceScopeViolationError} When `path` escapes the workspace root.
   */
  public async deleteDirectory(path: string, options?: { recursive?: boolean }): Promise<void> {
    const key = this.paths.toWorkspaceRelativeKey('deleteDirectory', path);
    const barrier = this._beginEditorMutation(key);
    await this._drainEditorSavesUnder(key, barrier, true);
    try {
      await this.proxy.rmdir(this.paths.toAbsolutePath(key), options);
      this.orphanSubtree(key);
      this.notifyGlobalSubscribers({ type: 'directoryDeleted', path: key });
      await this._finishEditorMutation(barrier, true);
    } catch (error) {
      await this._finishEditorMutation(barrier, false);
      throw error;
    }
  }

  /**
   * Duplicate a file. Reads source via resolveBytes, writes dest, and emits a
   * typed copy fact for downstream participants.
   *
   * Both arguments **MUST** be workspace-relative; absolute keys that escape
   * the workspace root throw {@link WorkspaceScopeViolationError}
   * synchronously before any worker round-trip.
   *
   * @param sourcePath - Existing workspace-relative file path.
   * @param destinationPath - Destination workspace-relative file path.
   * @throws {WorkspaceScopeViolationError} When either key escapes the workspace root.
   */
  public async duplicate(sourcePath: string, destinationPath: string): Promise<void> {
    const sourceKey = this.paths.toWorkspaceRelativeKey('duplicate', sourcePath);
    const destinationKey = this.paths.toWorkspaceRelativeKey('duplicate', destinationPath);
    const data = await this.resolveBytes(sourceKey);
    const localCopy = new Uint8Array(data);
    const wireCopy = new Uint8Array(data);
    await this.proxy.writeFile(this.paths.toAbsolutePath(destinationKey), wireCopy);
    this.refreshGuard.begin(destinationKey);
    this.cache.set(destinationKey, localCopy);
    this.setOrphaned(destinationKey, false);
    this.publishOutcome(destinationKey, { kind: 'text', content: localCopy });
    this.notifyGlobalSubscribers({ type: 'fileCopied', sourcePath: sourceKey, targetPath: destinationKey });
  }

  /**
   * Copy a directory. Proxy pass-through, no content caching. Emits a typed
   * copy fact so FileTreeService and project participants refresh explicitly.
   * @param source - Source directory (worker-resolved path form expected by proxy).
   * @param destination - Destination directory for the copy operation.
   */
  public async copyDirectory(source: string, destination: string): Promise<void> {
    const sourceKey = this.paths.toWorkspaceRelativeKey('copyDirectory', source);
    const destinationKey = this.paths.toWorkspaceRelativeKey('copyDirectory', destination);
    await this.proxy.copyDirectory(this.paths.toAbsolutePath(sourceKey), this.paths.toAbsolutePath(destinationKey));
    this.notifyGlobalSubscribers({ type: 'directoryCopied', sourcePath: sourceKey, targetPath: destinationKey });
  }

  /**
   * Get a zipped archive of a directory.
   * @param path - Workspace-relative directory path.
   * @returns Blob containing the archive bytes from the worker.
   * @throws {WorkspaceScopeViolationError} When `path` escapes the workspace root.
   */
  public async getZippedDirectory(path: string): Promise<Blob> {
    const key = this.paths.toWorkspaceRelativeKey('getZippedDirectory', path);
    return this.proxy.getZippedDirectory(this.paths.toAbsolutePath(key));
  }

  /**
   * Read cached content without LRU promotion. Safe for React renders.
   * @param path - Workspace-relative path.
   * @returns Cached bytes, or `undefined` when nothing is cached.
   */
  public peek(path: string): Uint8Array<ArrayBuffer> | undefined {
    return this.cache.peek(path);
  }

  /**
   * Check if content is cached for the given path.
   * @param path - Workspace-relative path.
   * @returns `true` when an entry exists in the bounded file cache.
   */
  public has(path: string): boolean {
    return this.cache.has(path);
  }

  /**
   * Sync check of cached orphan flag. A file is orphaned when a resolve
   * attempt fails with ENOENT or after an explicit delete.
   * @param path - Workspace-relative path.
   * @returns `true` when the path is currently marked orphaned.
   */
  public isOrphaned(path: string): boolean {
    return this.orphanedPaths.has(path);
  }

  /**
   * Subscribe to orphan state transitions. Fires when a path transitions
   * between orphaned and non-orphaned.
   * @param handler - Called with `{ path, orphaned }` on transitions.
   * @returns Unsubscribe function removing `handler`.
   */
  public onDidChangeOrphaned(handler: (event: OrphanChangeEvent) => void): () => void {
    return this.#orphanTopic.subscribe(handler);
  }

  /**
   * Subscribe to outcome transitions for any path. Fires once per outcome
   * change with the new discriminated result. Mirrors VS Code's
   * `TextFileEditorModelManager.onDidResolve` channel.
   * @param handler - Called with `{ path, result }` whenever an outcome changes.
   * @returns Unsubscribe function removing `handler`.
   */
  public onDidChangeOutcome(handler: (event: OutcomeChangeEvent) => void): () => void {
    return this.#outcomeTopic.subscribe(handler);
  }

  /**
   * Subscribe to changes for a specific path (or all paths if undefined).
   * Compatible with `useSyncExternalStore`.
   * @param path - Workspace-relative path, or `undefined` for global invalidation taps.
   * @param callback - Invoked whenever matching content notifications fire.
   * @returns Unsubscribe function removing this subscription.
   */
  public subscribe(path: string | undefined, callback: () => void): () => void {
    if (path === undefined) {
      return this.contentChangeRegistry.subscribeGlobal((_event: ContentChangeEvent) => {
        callback();
      });
    }
    return this.pathNotifyRegistry.subscribePath(path, () => {
      callback();
    });
  }

  /**
   * Subscribe to all content change events.
   * Used by MonacoModelService, FileTreeService, toast notifications.
   * @param handler - Invoked for every {@link ContentChangeEvent}.
   * @returns Unsubscribe function removing `handler`.
   */
  public onDidContentChange(handler: (event: ContentChangeEvent) => void): () => void {
    return this.contentChangeRegistry.subscribeGlobal(handler);
  }

  /**
   * Reset the service for a new root directory (e.g., project change).
   * @param rootDirectory - New absolute project root used by {@link WorkspacePathResolver}.
   */
  public reset(rootDirectory: string): void {
    this._cancelEditorPendingWork();
    this.paths.reset(rootDirectory);
    this.cache.clear();
    this.pendingResolves.clear();
    this.orphanedPaths.clear();
    this.outcomes.clear();
    this.refreshGuard.reset();
  }

  /**
   * Release workers, caches, and subscriptions owned by this service.
   */
  public dispose(): void {
    this._cancelEditorPendingWork();
    for (const unsubscribe of this.unsubscribeChannel) {
      unsubscribe();
    }
    this.cache.clear();
    this.pendingResolves.clear();
    this.pathNotifyRegistry.clear();
    this.contentChangeRegistry.clear();
    this.orphanedPaths.clear();
    this.#orphanTopic.dispose();
    this.outcomes.clear();
    this.#outcomeTopic.dispose();
    this.refreshGuard.reset();
  }

  private async _drainEditorSave(path: string, state: EditorSaveState): Promise<void> {
    let finalError: unknown;
    try {
      while (state.pending !== undefined) {
        const data = state.pending;
        state.pending = undefined;
        try {
          // oxlint-disable-next-line no-await-in-loop -- Saves for one path are intentionally serialized.
          await this.write(path, data, 'editor');
          finalError = undefined;
        } catch (error) {
          finalError = error;
        }
      }
      if (finalError !== undefined) {
        // oxlint-disable-next-line @typescript-eslint/only-throw-error -- Preserve the exact rejection from the filesystem client.
        throw finalError;
      }
    } finally {
      if (this.editorSaves.get(path) === state) {
        this.editorSaves.delete(path);
      }
    }
  }

  private _beginEditorMutation(source: string, target?: string): EditorMutationBarrier {
    const barrier: EditorMutationBarrier = {
      source,
      target,
      deferred: new Map(),
      settled: Promise.withResolvers<void>(),
    };
    this.editorMutationBarriers.push(barrier);
    return barrier;
  }

  private async _drainEditorSavesUnder(
    prefix: string,
    barrier: EditorMutationBarrier,
    cancelPending: boolean,
  ): Promise<void> {
    const completions: Array<Promise<void>> = [];
    for (const [path, state] of this.editorSaves) {
      if (!this._pathIsWithin(path, prefix)) {
        continue;
      }
      if (cancelPending && state.pending !== undefined) {
        barrier.deferred.set(path, state.pending);
        state.pending = undefined;
      }
      completions.push(state.completion);
    }
    await Promise.allSettled(completions);
  }

  private async _finishEditorMutation(barrier: EditorMutationBarrier, succeeded: boolean): Promise<void> {
    const index = this.editorMutationBarriers.indexOf(barrier);
    if (index !== -1) {
      this.editorMutationBarriers.splice(index, 1);
    }
    if (succeeded && barrier.target === undefined) {
      barrier.settled.resolve();
      return;
    }

    const saves: Array<Promise<void>> = [];
    for (const [path, data] of barrier.deferred) {
      const destination =
        succeeded && barrier.target !== undefined
          ? path === barrier.source
            ? barrier.target
            : `${barrier.target}${path.slice(barrier.source.length)}`
          : path;
      saves.push(this.saveEditor(destination, data));
    }
    try {
      await Promise.all(saves);
      barrier.settled.resolve();
    } catch (error) {
      barrier.settled.reject(error);
    }
  }

  private _editorMutationBarrierFor(path: string): EditorMutationBarrier | undefined {
    return this.editorMutationBarriers.findLast(({ source }) => this._pathIsWithin(path, source));
  }

  private _pathIsWithin(path: string, prefix: string): boolean {
    return path === prefix || prefix === '' || path.startsWith(`${prefix}/`);
  }

  private _cancelEditorPendingWork(): void {
    for (const state of this.editorSaves.values()) {
      state.pending = undefined;
    }
    for (const barrier of this.editorMutationBarriers.splice(0)) {
      barrier.deferred.clear();
      barrier.settled.resolve();
    }
  }

  private recordMove(oldKey: string, newKey: string): void {
    this.refreshGuard.begin(oldKey);
    this.refreshGuard.begin(newKey);
    const subtreeKeys: string[] = [];
    const oldPrefix = oldKey === '' ? '' : `${oldKey}/`;
    for (const path of this.outcomes.keys()) {
      if (path === oldKey || path.startsWith(oldPrefix)) {
        subtreeKeys.push(path);
      }
    }
    for (const [path] of this.cache.entries()) {
      if ((path === oldKey || path.startsWith(oldPrefix)) && !subtreeKeys.includes(path)) {
        subtreeKeys.push(path);
      }
    }

    if (subtreeKeys.length === 0) {
      this.cache.rename(oldKey, newKey);
      this.pathNotifyRegistry.notifyPath(oldKey, undefined);
      this.notifyGlobalSubscribers({ type: 'renamed', oldPath: oldKey, newPath: newKey });
      return;
    }

    const newPrefix = newKey === '' ? '' : `${newKey}/`;
    for (const path of subtreeKeys) {
      const remapped = path === oldKey ? newKey : `${newPrefix}${path.slice(oldPrefix.length)}`;
      this.refreshGuard.begin(path);
      this.refreshGuard.begin(remapped);
      this.cache.rename(path, remapped);
      const oldOutcome = this.outcomes.get(path);
      if (oldOutcome) {
        this.outcomes.delete(path);
        this.publishOutcome(remapped, oldOutcome);
      }
      this.pathNotifyRegistry.notifyPath(path, undefined);
      this.notifyGlobalSubscribers({ type: 'renamed', oldPath: path, newPath: remapped });
    }
  }

  private shouldRecompute(options?: ResolveOptions): boolean {
    return Boolean(options?.forceText) || options?.sizeLimit !== undefined;
  }

  private onWorkerFileWritten(relativePath: string): void {
    this.refreshGuard.begin(relativePath);
    this.setOrphaned(relativePath, false);
    if (this.shouldRefreshWorkerPath(relativePath)) {
      // async-iife: bootstrap
      // oxlint-disable-next-line promise/prefer-await-to-then -- fire-and-forget refresh
      void this.refreshOutcomeInPlace(relativePath).catch(() => undefined);
    } else {
      this.cache.delete(relativePath);
    }
  }

  private onWorkerFileDeleted(relativePath: string): void {
    this.refreshGuard.begin(relativePath);
    this.cache.delete(relativePath);
    this.setOrphaned(relativePath, true);
    this.publishOutcome(relativePath, { kind: 'orphaned' });
  }

  private onWorkerFileRenamed(event: WorkerRelativeRenameEvent): void {
    const { oldPath, newPath } = event;
    if (oldPath !== undefined) {
      this.cache.delete(oldPath);
      this.refreshGuard.begin(oldPath);
      this.setOrphaned(oldPath, true);
      this.publishOutcome(oldPath, { kind: 'orphaned' });
    }
    if (newPath !== undefined) {
      this.refreshGuard.begin(newPath);
      this.cache.delete(newPath);
      this.setOrphaned(newPath, false);
      if (this.shouldRefreshWorkerPath(newPath)) {
        // async-iife: bootstrap
        // oxlint-disable-next-line promise/prefer-await-to-then -- fire-and-forget refresh
        void this.refreshOutcomeInPlace(newPath).catch(() => undefined);
      }
    }
  }

  private onWorkerDirectoryDeleted(relativeDirectory: string): void {
    this.orphanSubtree(relativeDirectory);
  }

  private orphanSubtree(relativeDirectory: string): void {
    const prefix = relativeDirectory === '' ? '' : `${relativeDirectory}/`;
    const affected = new Set<string>();
    for (const path of this.outcomes.keys()) {
      if (path === relativeDirectory || path.startsWith(prefix)) {
        affected.add(path);
      }
    }
    for (const [path] of this.cache.entries()) {
      if (path === relativeDirectory || path.startsWith(prefix)) {
        affected.add(path);
      }
    }
    for (const path of affected) {
      this.cache.delete(path);
      this.refreshGuard.begin(path);
      this.setOrphaned(path, true);
      this.publishOutcome(path, { kind: 'orphaned' });
    }
  }

  private onWorkerDirectoryRenamed(oldDirectory: string | undefined, newDirectory: string | undefined): void {
    if (oldDirectory === undefined) {
      return;
    }
    const oldPrefix = oldDirectory === '' ? '' : `${oldDirectory}/`;
    const newPrefix = newDirectory === undefined ? undefined : newDirectory === '' ? '' : `${newDirectory}/`;
    const affected = new Set<string>();
    for (const path of this.outcomes.keys()) {
      if (path === oldDirectory || path.startsWith(oldPrefix)) {
        affected.add(path);
      }
    }
    for (const [path] of this.cache.entries()) {
      if (path === oldDirectory || path.startsWith(oldPrefix)) {
        affected.add(path);
      }
    }
    for (const path of affected) {
      this.cache.delete(path);
      this.refreshGuard.begin(path);
      this.setOrphaned(path, true);
      this.publishOutcome(path, { kind: 'orphaned' });
      const remapped =
        newPrefix === undefined
          ? undefined
          : path === oldDirectory
            ? newDirectory
            : `${newPrefix}${path.slice(oldPrefix.length)}`;
      if (remapped !== undefined) {
        this.refreshGuard.begin(remapped);
        this.notifyGlobalSubscribers({ type: 'renamed', oldPath: path, newPath: remapped });
        if (this.shouldRefreshWorkerPath(remapped)) {
          // async-iife: bootstrap
          // oxlint-disable-next-line promise/prefer-await-to-then -- fire-and-forget refresh
          void this.refreshOutcomeInPlace(remapped).catch(() => undefined);
        }
      }
    }
  }

  private onWorkerBackendChanged(): void {
    const pathsToRefresh = new Set<string>([...this.outcomes.keys(), ...this.pathNotifyRegistry.subscribedPaths()]);
    for (const [path] of this.cache.entries()) {
      pathsToRefresh.add(path);
    }
    this.cache.clear();
    this.orphanedPaths.clear();
    for (const path of pathsToRefresh) {
      // async-iife: bootstrap
      // oxlint-disable-next-line promise/prefer-await-to-then -- fire-and-forget refresh
      void this.refreshOutcomeInPlace(path).catch(() => undefined);
    }
  }

  /**
   * Re-run in-place refresh for every open path under a workspace-relative
   * directory prefix (from `directoryChanged`).
   * @param relativeDirectory - Workspace-relative directory key (possibly `''` for root).
   */
  private refreshOpenPathsUnderDirectory(relativeDirectory: string): void {
    const directoryPrefix =
      relativeDirectory === '' ? '' : relativeDirectory.endsWith('/') ? relativeDirectory : `${relativeDirectory}/`;
    const toRefresh = new Set<string>();
    for (const path of this.outcomes.keys()) {
      if (directoryPrefix === '' || path === relativeDirectory || path.startsWith(directoryPrefix)) {
        toRefresh.add(path);
      }
    }
    for (const [path] of this.cache.entries()) {
      if (directoryPrefix === '' || path === relativeDirectory || path.startsWith(directoryPrefix)) {
        toRefresh.add(path);
      }
    }
    for (const path of this.pathNotifyRegistry.subscribedPaths()) {
      if (directoryPrefix === '' || path === relativeDirectory || path.startsWith(directoryPrefix)) {
        toRefresh.add(path);
      }
    }
    for (const path of toRefresh) {
      // async-iife: bootstrap
      // oxlint-disable-next-line promise/prefer-await-to-then -- fire-and-forget refresh
      void this.refreshOutcomeInPlace(path).catch(() => undefined);
    }
  }

  private shouldRefreshWorkerPath(relative: string): boolean {
    return (
      this.outcomes.has(relative) || this.cache.has(relative) || this.pathNotifyRegistry.hasPathSubscribers(relative)
    );
  }

  /**
   * Re-run read + binary / size classification for `path` and publish when
   * this refresh is still the newest for the path (interleaved worker events).
   * @param path - Workspace-relative file path.
   */
  private async refreshOutcomeInPlace(path: string): Promise<void> {
    const generation = this.refreshGuard.begin(path);
    const data = await this.readBytes(path, generation, true);
    if (!this.refreshGuard.isCurrent(path, generation)) {
      return;
    }
    if (data === undefined) {
      return;
    }

    const limit = this.openSizeBytes;

    if (seemsBinary(data)) {
      const head = data.slice(0, headSniffByteLength);
      const outcome: FileContentResult = { kind: 'binary', size: data.byteLength, head };
      if (!this.refreshGuard.isCurrent(path, generation)) {
        return;
      }
      this.cache.delete(path);
      this.publishOutcome(path, outcome);
      return;
    }

    if (data.byteLength > limit) {
      const outcome: FileContentResult = { kind: 'too-large', size: data.byteLength, limit };
      if (!this.refreshGuard.isCurrent(path, generation)) {
        return;
      }
      this.cache.delete(path);
      this.publishOutcome(path, outcome);
      return;
    }

    if (!this.refreshGuard.isCurrent(path, generation)) {
      return;
    }
    this.cache.set(path, data);
    const outcome: FileContentResult = { kind: 'text', content: data };
    this.publishOutcome(path, outcome);
    this.notifyGlobalSubscribers({ type: 'read', path, data });
  }

  private async computeOutcome(path: string, generation: number, options?: ResolveOptions): Promise<FileContentResult> {
    const data = await this.readBytes(path, generation);
    if (data === undefined) {
      return this.outcomes.get(path) ?? loadingOutcome;
    }

    const limit = options?.sizeLimit ?? this.openSizeBytes;
    const forceText = Boolean(options?.forceText);

    if (!forceText && seemsBinary(data)) {
      const head = data.slice(0, headSniffByteLength);
      const outcome: FileContentResult = { kind: 'binary', size: data.byteLength, head };
      if (this.refreshGuard.isCurrent(path, generation)) {
        this.publishOutcome(path, outcome);
      }
      return outcome;
    }

    if (data.byteLength > limit) {
      const outcome: FileContentResult = { kind: 'too-large', size: data.byteLength, limit };
      if (this.refreshGuard.isCurrent(path, generation)) {
        this.publishOutcome(path, outcome);
      }
      return outcome;
    }

    if (!this.refreshGuard.isCurrent(path, generation)) {
      return { kind: 'text', content: data };
    }
    this.cache.set(path, data);
    const outcome: FileContentResult = { kind: 'text', content: data };
    this.publishOutcome(path, outcome);
    this.notifyGlobalSubscribers({ type: 'read', path, data });
    return outcome;
  }

  private async readBytes(
    path: string,
    generation: number,
    bypassSharedPool = false,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> {
    if (!bypassSharedPool && this.filePool) {
      const absolutePath = this.paths.toAbsolutePath(path);
      const poolData = this.filePool.resolveCopy(absolutePath);
      if (poolData) {
        if (this.refreshGuard.isCurrent(path, generation)) {
          this.setOrphaned(path, false);
        }
        return poolData;
      }
    }

    const absolutePath = this.paths.toAbsolutePath(path);
    try {
      const data = await this.proxy.readFile(absolutePath);
      if (this.refreshGuard.isCurrent(path, generation)) {
        this.setOrphaned(path, false);
      }
      return data;
    } catch (error) {
      if (!this.refreshGuard.isCurrent(path, generation)) {
        return undefined;
      }
      if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.setOrphaned(path, true);
        this.publishOutcome(path, { kind: 'orphaned' });
        return undefined;
      }
      this.publishOutcome(path, { kind: 'error', cause: error });
      return undefined;
    }
  }

  private publishOutcome(path: string, result: FileContentResult): void {
    const previous = this.outcomes.get(path);
    if (previous && outcomesEqual(previous, result)) {
      return;
    }
    this.outcomes.set(path, result);
    this.#outcomeTopic.emit({ path, result });
    this.notifyPathSubscribers(path);
  }

  private setOrphaned(path: string, orphaned: boolean): void {
    const changed = orphaned ? !this.orphanedPaths.has(path) : this.orphanedPaths.has(path);
    if (!changed) {
      return;
    }
    if (orphaned) {
      this.orphanedPaths.add(path);
    } else {
      this.orphanedPaths.delete(path);
    }
    this.#orphanTopic.emit({ path, orphaned });
  }

  private notifyPathSubscribers(path: string): void {
    this.pathNotifyRegistry.notifyPath(path, undefined);
  }

  private notifyGlobalSubscribers(event: ContentChangeEvent): void {
    this.contentChangeRegistry.notifyGlobal(event);
  }
}

function outcomesEqual(a: FileContentResult, b: FileContentResult): boolean {
  if (a.kind !== b.kind) {
    return false;
  }
  switch (a.kind) {
    case 'loading':
    case 'orphaned': {
      return true;
    }
    case 'text': {
      const other = b as Extract<FileContentResult, { kind: 'text' }>;
      return bytesEqual(a.content, other.content);
    }
    case 'binary': {
      const other = b as Extract<FileContentResult, { kind: 'binary' }>;
      return a.size === other.size && bytesEqual(a.head, other.head);
    }
    case 'too-large': {
      const other = b as Extract<FileContentResult, { kind: 'too-large' }>;
      return a.size === other.size && a.limit === other.limit;
    }
    case 'error': {
      const other = b as Extract<FileContentResult, { kind: 'error' }>;
      return a.cause === other.cause;
    }
  }
}

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
