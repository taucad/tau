import type { FileEntry, FileStatEntry, FileStat } from '@taucad/types';
import type { FileTreeNode } from '@taucad/filesystem';
import { FileSystemObserverBridge } from '@taucad/filesystem';
import { Topic } from '@taucad/events';
import type { FileContentService, ContentChangeEvent } from '#file-content-service.js';
import type { FileSystemClient } from '#file-system-client.js';
import type {
  WorkerChangeChannel,
  WorkerRelativeDirectoryRenameEvent,
  WorkerRelativeRenameEvent,
} from '#worker-change-channel.js';
import type { WorkspacePathResolver } from '#workspace-path-resolver.js';
import { WorkspacePathEscapeError } from '#workspace-path-resolver.js';
import type { VisibilityProvider } from '#visibility-provider.js';
import { PathSubscriberRegistry } from '#path-subscriber-registry.js';
import { RefreshGenerationGuard } from '#refresh-generation-guard.js';
import {
  DirectoryListingErrorCode,
  DirectoryListingFailedError,
  classifyDirectoryListingError,
} from '#directory-listing.js';
import type { ListedDirectoryEntry } from '#directory-listing.js';

/** Milliseconds. */
const defaultRefreshDebounce = 100;
/** Milliseconds. */
const watchIntervalFocused = 2000;
/** Milliseconds. */
const watchIntervalBlurred = 10_000;

/**
 * Lightweight file listing entry for search / complete-tree snapshots.
 *
 * @public
 */
export type FileItem = {
  path: string;
  size: number;
};

type FileTreeServiceInit = {
  proxy: FileSystemClient;
  paths: WorkspacePathResolver;
  channel: WorkerChangeChannel;
  visibility: VisibilityProvider;
  initialEntries?: FileEntry[];
  /** Debounce window between subsequent tree-refresh fires. Milliseconds. */
  refreshDebounce?: number;
};

/**
 * Single tree/metadata authority on the main thread.
 * All tree reads, directory listings, existence checks, and stat operations
 * go through this service. Owns the fileTree Map.
 *
 * @public
 * @example <caption>Construct a file tree service for tests</caption>
 * ```typescript
 * import { FileTreeService } from '@taucad/fs-client/file-tree-service';
 * import { WorkerChangeChannel } from '@taucad/fs-client/worker-change-channel';
 * import { WorkspacePathResolver } from '@taucad/fs-client/workspace-path-resolver';
 * import { headlessVisibilityProvider } from '@taucad/fs-client/visibility-provider';
 * import type { FileSystemClient } from '@taucad/fs-client/file-system-client';
 * import type { WorkerChangeChannelTransport } from '@taucad/fs-client/worker-change-channel';
 * export function createExampleFileTreeService(
 *   proxy: FileSystemClient,
 *   listen: WorkerChangeChannelTransport['listen'],
 * ): FileTreeService {
 *   const paths = new WorkspacePathResolver('/project');
 *   const channel = new WorkerChangeChannel({ transport: { listen }, paths });
 *   return new FileTreeService({
 *     proxy,
 *     paths,
 *     channel,
 *     visibility: headlessVisibilityProvider,
 *   });
 * }
 * ```
 */
export class FileTreeService {
  private _tree: Map<string, FileEntry>;
  private readonly proxy: FileSystemClient;
  private readonly paths: WorkspacePathResolver;
  private readonly visibility: VisibilityProvider;
  readonly #treeTopic = new Topic<void>({ name: 'FileTreeService.tree' });
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingRefreshPath = '';
  private pollingTimer: ReturnType<typeof setTimeout> | undefined;
  private visibilityUnsub: (() => void) | undefined;
  private contentUnsubscribe: (() => void) | undefined;
  /** Milliseconds. */
  private readonly refreshDebounce: number;
  private _observerBridge: FileSystemObserverBridge | undefined;
  private _refreshAbortController: AbortController | undefined;
  private _cachedCompleteTree: FileItem[] | undefined;
  private _completeTreeVersion = 0;
  private _searchIndexWarmed = false;
  private readonly _listingPathSubscribers = new PathSubscriberRegistry<void>();
  private readonly _listingGuard = new RefreshGenerationGuard();
  private readonly _inFlightDirectoryList = new Map<string, Promise<void>>();
  private readonly unsubscribeChannel: Array<() => void>;

  public constructor(init: FileTreeServiceInit) {
    this.proxy = init.proxy;
    this.paths = init.paths;
    this.visibility = init.visibility;
    this.refreshDebounce = init.refreshDebounce ?? defaultRefreshDebounce;
    this._tree = new Map();
    if (init.initialEntries) {
      for (const entry of init.initialEntries) {
        this._tree.set(entry.path, entry);
      }
      if (init.initialEntries.length > 0) {
        this._tree.set('', {
          path: '',
          name: '',
          type: 'dir',
          size: 0,
          mtimeMs: Date.now(),
          isLoaded: true,
          isDirectoryResolved: true,
        });
      }
    }
    this.unsubscribeChannel = [
      init.channel.onFileWritten({
        interestedIn: (relativePath) => this.isDirectoryResolvedKey(this.paths.parentOf(relativePath)),
        handler: (event) => {
          this.handleFileWrittenRelative(event.path);
        },
      }),
      init.channel.onFileDeleted({
        handler: (event) => {
          this.handleFileDeletedRelative(event.path);
        },
      }),
      init.channel.onFileRenamed({
        interestedIn: (relativePath) => this.isDirectoryResolvedKey(this.paths.parentOf(relativePath)),
        handler: (event) => {
          this.handleFileRenamedRelative(event);
        },
      }),
      init.channel.onDirectoryChanged({
        interestedIn: (relativeDirectory) => this.isDirectoryResolvedKey(relativeDirectory),
        handler: (event) => {
          this.handleDirectoryChangedRelative(event.path);
        },
      }),
      init.channel.onDirectoryCreated({
        handler: (event) => {
          this.handleDirectoryCreatedRelative(event.path);
        },
      }),
      init.channel.onDirectoryDeleted({
        handler: (event) => {
          this.handleDirectoryDeletedRelative(event.path);
        },
      }),
      init.channel.onDirectoryRenamed({
        handler: (event) => {
          this.handleDirectoryRenamedRelative(event);
        },
      }),
      init.channel.onBackendChanged(() => {
        this.scheduleRefresh('');
      }),
    ];
  }

  // === Tree Access (sync, from cache) ===

  /**
   * Returns the current tree Map. Stable reference when unchanged.
   * Required by `useSyncExternalStore`.
   * @returns Mutable backing map of {@link FileEntry} records keyed by path.
   */
  public getTreeSnapshot(): Map<string, FileEntry> {
    return this._tree;
  }

  /**
   * Monotonically increasing counter that increments on every tree change.
   * Consumers can use this to cheaply detect staleness.
   * @returns Current tree revision counter.
   */
  public get completeTreeVersion(): number {
    return this._completeTreeVersion;
  }

  /**
   * Return a cached list of all file entries currently in the lazy tree.
   * Derives synchronously from `_tree` — no worker RPC. The list grows
   * progressively as directories are expanded via {@link listDirectory}.
   * @returns Lightweight {@link FileItem} records for all known files.
   */
  public getCachedFileItems(): FileItem[] {
    this._cachedCompleteTree ??= [...this._tree.values()]
      .filter((entry) => entry.type === 'file')
      .map((entry) => ({ path: entry.path, size: entry.size }));
    return this._cachedCompleteTree;
  }

  /**
   * Get a single entry by path. Tree-first O(1), then proxy.stat fallback.
   * @param path - User or workspace-relative path string.
   * @returns Cached or freshly-stated {@link FileEntry}, or `undefined` when absent.
   */
  public async getEntry(path: string): Promise<FileEntry | undefined> {
    const relativeKey = this.relativeKeyFromUserPath(path);
    const cached = this._tree.get(path) ?? this._tree.get(relativeKey);
    if (cached) {
      return cached;
    }
    try {
      const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
      const stat = await this.proxy.stat(absolutePath);
      return {
        path,
        name: path.split('/').pop() ?? path,
        type: stat.type,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        isLoaded: false,
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Check if a path exists. Tree-first O(1), then proxy.stat fallback.
   * @param path - User or workspace-relative path string.
   * @returns `true` when the path resolves to an on-disk object.
   */
  public async exists(path: string): Promise<boolean> {
    const relativeKey = this.relativeKeyFromUserPath(path);
    if (this._tree.has(path) || this._tree.has(relativeKey)) {
      return true;
    }
    try {
      const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
      await this.proxy.stat(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  // === Metadata Operations (async, proxy) ===

  /**
   * Get file stat via proxy.
   * @param path - Resolvable path string (workspace-relative forms allowed).
   * @returns Worker-backed {@link FileStat}.
   */
  public async stat(path: string): Promise<FileStat> {
    const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
    return this.proxy.stat(absolutePath);
  }

  /**
   * Get all file stats in a directory recursively via proxy.
   * @param path - Directory path to enumerate.
   * @returns Recursive listing from the worker index.
   */
  public async getDirectoryStat(path: string): Promise<FileStatEntry[]> {
    const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
    return this.proxy.getDirectoryStat(absolutePath);
  }

  /**
   * Get all file stats in a directory recursively via proxy.
   * directory is already resolved; otherwise cold-loads via
   * `proxy.readDirectory` and merges with {@link mergeChildren}.
   *
   * @param path - Directory path (root aliases accepted).
   * @param options - Optional {@link AbortSignal} for cancellation.
   * @returns Immediate children with folder flag and timestamps from the tree.
   * @throws {DirectoryListingFailedError} When resolution or the worker read fails.
   */
  public async listDirectory(
    path: string,
    options?: { signal?: AbortSignal },
  ): Promise<readonly ListedDirectoryEntry[]> {
    options?.signal?.throwIfAborted();
    let relativeKey: string;
    try {
      relativeKey = this.relativeDirectoryKeyFromUserPath(path);
    } catch (error) {
      throw new DirectoryListingFailedError(classifyDirectoryListingError(error, path));
    }
    if (this.isDirectoryResolvedKey(relativeKey)) {
      return this.entriesAtDirectoryLevel(relativeKey);
    }
    try {
      await this.ensureDirectoryLoadedForListing(path, relativeKey, options?.signal);
    } catch (error) {
      const listing = classifyDirectoryListingError(error, path);
      throw new DirectoryListingFailedError(listing);
    }
    if (!this.isDirectoryResolvedKey(relativeKey)) {
      throw new DirectoryListingFailedError({
        code: DirectoryListingErrorCode.Unavailable,
        message: 'Directory listing did not complete',
        path,
      });
    }
    return this.entriesAtDirectoryLevel(relativeKey);
  }

  /**
   * Synchronous read of listing when the directory has already been merged.
   * @param path - Workspace-relative directory (same aliases as {@link FileTreeService.listDirectory}).
   * @returns Children or `undefined` when not yet resolved.
   */
  public listDirectorySync(path: string): readonly ListedDirectoryEntry[] | undefined {
    let relativeKey: string;
    try {
      relativeKey = this.relativeDirectoryKeyFromUserPath(path);
    } catch (error) {
      throw new DirectoryListingFailedError(classifyDirectoryListingError(error, path));
    }
    if (!this.isDirectoryResolvedKey(relativeKey)) {
      return undefined;
    }
    return this.entriesAtDirectoryLevel(relativeKey);
  }

  /**
   * Subscribe to listing mutations for one workspace-relative directory key.
   * @param path - Directory path (normalized to a relative key).
   * @param callback - Invoked when that directory's merged children change.
   * @returns Unsubscribe function.
   */
  public subscribePath(path: string, callback: () => void): () => void {
    const relativeKey = this.relativeDirectoryKeyFromUserPath(path);
    return this._listingPathSubscribers.subscribePath(relativeKey, callback);
  }

  /**
   * Search files on the worker's InMemoryFileTree. Returns only matching results.
   * The main thread never holds the full file index for interactive filtering.
   * @param query - Free-text search string understood by the worker search index.
   * @param options - Optional cap / directory inclusion flags forwarded to the proxy.
   * @returns Matching {@link FileStatEntry} records from the worker.
   */
  public async searchFiles(
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): Promise<FileStatEntry[]> {
    const absolutePath = this.paths.toAbsoluteWorkspacePath('');
    if (!this._searchIndexWarmed) {
      await this.proxy.getDirectoryStat(absolutePath);
      this._searchIndexWarmed = true;
    }
    return this.proxy.searchFiles(absolutePath, query, options);
  }

  /**
   * Remove a directory via proxy.
   * @param path - Workspace-relative directory to remove (must be empty per worker semantics).
   */
  public async rmdir(path: string): Promise<void> {
    const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
    await this.proxy.rmdir(absolutePath);
  }

  // === Refresh Control ===

  /**
   * Debounce tree refresh. Multiple calls coalesce to common ancestor.
   * @param path - Path hint whose refresh should be merged with pending work.
   */
  public scheduleRefresh(path: string): void {
    if (this.pendingRefreshPath === '' || path === '') {
      this.pendingRefreshPath = path;
    } else {
      const currentParts = this.pendingRefreshPath.split('/');
      const newParts = path.split('/');
      const commonParts: string[] = [];
      for (let i = 0; i < Math.min(currentParts.length, newParts.length); i++) {
        if (currentParts[i] === newParts[i]) {
          commonParts.push(currentParts[i]!);
        } else {
          break;
        }
      }
      this.pendingRefreshPath = commonParts.join('/');
    }

    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.executeRefresh(this.pendingRefreshPath);
      this.pendingRefreshPath = '';
    }, this.refreshDebounce);
  }

  // === Change Detection (Observer preferred, polling fallback) ===

  /**
   * Whether the observer is actively monitoring changes.
   * @returns `true` when a native {@link FileSystemObserverBridge} session is active.
   */
  public get isObserving(): boolean {
    return this._observerBridge?.isObserving ?? false;
  }

  /**
   * Start observing via FileSystemObserver (Chrome 133+).
   * Returns `true` if the observer was started, `false` if unavailable.
   * When observer is active, polling is stopped to eliminate double work.
   * @param handle - Native directory handle supplied by the host picker.
   * @returns `true` when observation started successfully.
   */
  public async startObserving(handle: FileSystemDirectoryHandle): Promise<boolean> {
    this.stopPolling();

    this._observerBridge = new FileSystemObserverBridge((event) => {
      const path = 'path' in event ? event.path : '';
      this.scheduleRefresh(path);
    });

    const started = await this._observerBridge.observe(handle);
    if (!started) {
      this._observerBridge = undefined;
      return false;
    }
    return true;
  }

  /**
   * Stop observing. Allows polling to be started again.
   * @returns `void` after tearing down the observer bridge, if any.
   */
  public stopObserving(): void {
    if (this._observerBridge) {
      this._observerBridge.disconnect();
      this._observerBridge = undefined;
    }
  }

  /**
   * Unified entry point for external change detection.
   * Tries FileSystemObserver first; falls back to polling.
   * @param handle - Optional host handle enabling native observation.
   */
  public async startChangeDetection(handle?: FileSystemDirectoryHandle): Promise<void> {
    if (handle) {
      const observerStarted = await this.startObserving(handle);
      if (observerStarted) {
        return;
      }
    }
    this.startPolling();
  }

  /**
   * Stop all change detection (observer + polling).
   * @returns `void` once timers/observer subscriptions are cleared.
   */
  public stopChangeDetection(): void {
    this.stopObserving();
    this.stopPolling();
  }

  /**
   * Begin polling the worker on a visibility-aware interval when observers are unavailable.
   */
  public startPolling(): void {
    if (this.isObserving) {
      return;
    }

    this.stopPolling();

    const poll = (): void => {
      const pollInterval = this.visibility.isVisible() ? watchIntervalFocused : watchIntervalBlurred;
      this.pollingTimer = setTimeout(() => {
        this.scheduleRefresh('');
        poll();
      }, pollInterval);
    };

    poll();

    this.visibilityUnsub = this.visibility.onVisibilityChange(() => {
      this.stopPolling();
      poll();
    });
  }

  /**
   * Tear down polling timers and visibility subscriptions.
   */
  public stopPolling(): void {
    if (this.pollingTimer !== undefined) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    if (this.visibilityUnsub !== undefined) {
      this.visibilityUnsub();
      this.visibilityUnsub = undefined;
    }
  }

  // === Content Change Subscription ===

  /**
   * Subscribe to content changes from FileContentService.
   * Skips tree refresh for `source === 'editor'` (editor typing doesn't
   * change tree structure). Otherwise applies optimistic update + schedules
   * debounced refresh.
   * @param contentService - Live content authority emitting mutation events.
   */
  public connectToContentService(contentService: FileContentService): void {
    this.contentUnsubscribe?.();
    this.contentUnsubscribe = contentService.onDidContentChange((event) => {
      this.handleContentChange(event);
    });
  }

  // === Tree Subscriptions (useSyncExternalStore) ===

  /**
   * Subscribe to tree mutations for `useSyncExternalStore` consumers.
   * @param callback - Invoked after the internal Map snapshot changes.
   * @returns Unsubscribe function removing `callback`.
   */
  public subscribeTree(callback: () => void): () => void {
    return this.#treeTopic.subscribe(callback);
  }

  // === Lifecycle ===

  /**
   * Reset tree caches when the workspace root or bootstrap entries change.
   * @param rootDirectory - New worker root path.
   * @param initialEntries - Optional seed entries for eagerly known files.
   */
  public reset(rootDirectory: string, initialEntries?: FileEntry[]): void {
    this.paths.reset(rootDirectory);
    this._refreshAbortController?.abort();
    this._refreshAbortController = undefined;
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.pendingRefreshPath = '';
    this._searchIndexWarmed = false;

    const newTree = new Map<string, FileEntry>();
    if (initialEntries) {
      for (const entry of initialEntries) {
        newTree.set(entry.path, entry);
      }
      if (initialEntries.length > 0) {
        newTree.set('', {
          path: '',
          name: '',
          type: 'dir',
          size: 0,
          mtimeMs: Date.now(),
          isLoaded: true,
          isDirectoryResolved: true,
        });
      }
    }
    this._tree = newTree;
    this.notifyTreeSubscribers();
    this._listingPathSubscribers.notifyGlobal(undefined);
  }

  /**
   * Check whether a directory's children have been loaded into the tree.
   * @param path - Directory key to query in the resolved-directory ledger.
   * @returns `true` when lazy loading previously completed for `path`.
   */
  public hasChildrenLoaded(path: string): boolean {
    return this.isDirectoryResolvedKey(path);
  }

  /**
   * Dispose worker subscriptions, timers, and in-flight refresh controllers.
   */
  public dispose(): void {
    for (const unsubscribe of this.unsubscribeChannel) {
      unsubscribe();
    }
    this.stopChangeDetection();
    this._refreshAbortController?.abort();
    this._refreshAbortController = undefined;
    this.contentUnsubscribe?.();
    this.contentUnsubscribe = undefined;
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.#treeTopic.dispose();
    this._listingPathSubscribers.clear();
  }

  private relativeKeyFromUserPath(path: string): string {
    const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
    return this.paths.toRelativePath(absolutePath) ?? '';
  }

  /**
   * Workspace-relative directory key for {@link mergeChildren} and tree-prefix scans.
   * @param path - User-supplied path (any alias accepted by {@link WorkspacePathResolver.toAbsoluteWorkspacePath}).
   * @returns Workspace-relative directory key used for lazy-tree bookkeeping.
   */
  private relativeDirectoryKeyFromUserPath(path: string): string {
    return this.relativeKeyFromUserPath(path);
  }

  // === Private: Worker Event Handlers (workspace-relative paths) ===

  private handleFileWrittenRelative(relativePath: string): void {
    const parentPath = this.paths.parentOf(relativePath);
    if (this.isDirectoryResolvedKey(parentPath)) {
      this.optimisticAdd(relativePath, 0);
    }
  }

  private handleFileDeletedRelative(relativePath: string): void {
    this.optimisticDelete(relativePath);
  }

  private handleFileRenamedRelative(event: WorkerRelativeRenameEvent): void {
    const oldRelative = event.oldPath;
    const newRelative = event.newPath;
    if (oldRelative !== undefined && newRelative !== undefined) {
      this.optimisticRename(oldRelative, newRelative);
      return;
    }
    if (oldRelative !== undefined) {
      this.optimisticDelete(oldRelative);
      return;
    }
    if (newRelative !== undefined) {
      const parentPath = this.paths.parentOf(newRelative);
      if (this.isDirectoryResolvedKey(parentPath)) {
        this.optimisticAdd(newRelative, 0);
      }
    }
  }

  private handleDirectoryChangedRelative(relativePath: string): void {
    if (this.isDirectoryResolvedKey(relativePath)) {
      this.scheduleRefresh(relativePath);
    }
  }

  private handleDirectoryCreatedRelative(relativePath: string): void {
    const parent = this.paths.parentOf(relativePath);
    if (!this.isDirectoryResolvedKey(parent)) {
      return;
    }
    const newTree = new Map(this._tree);
    if (!newTree.has(relativePath)) {
      const name = relativePath.split('/').pop() ?? relativePath;
      newTree.set(relativePath, {
        path: relativePath,
        name,
        type: 'dir',
        size: 0,
        mtimeMs: Date.now(),
        isLoaded: false,
        isDirectoryResolved: true,
      });
      this._tree = newTree;
      this.notifyTreeSubscribers();
      this._listingPathSubscribers.notifyPath(parent, undefined);
    }
  }

  private handleDirectoryDeletedRelative(relativePath: string): void {
    this.dropSubtree(relativePath);
  }

  private handleDirectoryRenamedRelative(event: WorkerRelativeDirectoryRenameEvent): void {
    const { oldPath, newPath } = event;
    if (oldPath !== undefined && newPath !== undefined) {
      this.renameSubtree(oldPath, newPath);
      return;
    }
    if (oldPath !== undefined) {
      this.dropSubtree(oldPath);
      return;
    }
    if (newPath !== undefined) {
      this.handleDirectoryCreatedRelative(newPath);
    }
  }

  private dropSubtree(relativePath: string): void {
    const prefix = relativePath === '' ? '' : relativePath.endsWith('/') ? relativePath : `${relativePath}/`;
    const newTree = new Map(this._tree);
    let changed = newTree.delete(relativePath);
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot keys before mutating newTree to keep iteration deterministic across V8/Bun Map invalidation semantics.
    for (const key of [...newTree.keys()]) {
      if (key.startsWith(prefix)) {
        newTree.delete(key);
        changed = true;
      }
    }
    if (changed) {
      this._tree = newTree;
      this.notifyTreeSubscribers();
      this._listingPathSubscribers.notifyPath(this.paths.parentOf(relativePath), undefined);
    }
  }

  private renameSubtree(oldPath: string, newPath: string): void {
    const oldPrefix = oldPath === '' ? '' : oldPath.endsWith('/') ? oldPath : `${oldPath}/`;
    const newPrefix = newPath === '' ? '' : newPath.endsWith('/') ? newPath : `${newPath}/`;
    const newTree = new Map(this._tree);
    let changed = false;
    const ownEntry = newTree.get(oldPath);
    if (ownEntry) {
      newTree.delete(oldPath);
      const name = newPath.split('/').pop() ?? newPath;
      newTree.set(newPath, { ...ownEntry, path: newPath, name });
      changed = true;
    }
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot entries before mutating newTree to keep iteration deterministic across V8/Bun Map invalidation semantics.
    for (const [key, entry] of [...newTree.entries()]) {
      if (key.startsWith(oldPrefix)) {
        const remapped = `${newPrefix}${key.slice(oldPrefix.length)}`;
        newTree.delete(key);
        newTree.set(remapped, { ...entry, path: remapped });
        changed = true;
      }
    }
    if (changed) {
      this._tree = newTree;
      this.notifyTreeSubscribers();
      this._listingPathSubscribers.notifyPath(this.paths.parentOf(oldPath), undefined);
      this._listingPathSubscribers.notifyPath(this.paths.parentOf(newPath), undefined);
    }
  }

  private notifyTreeSubscribers(): void {
    this._cachedCompleteTree = undefined;
    this._completeTreeVersion++;
    this.#treeTopic.emit();
  }

  private handleContentChange(event: ContentChangeEvent): void {
    switch (event.type) {
      case 'written': {
        if (event.source === 'editor') {
          return;
        }
        this.optimisticAdd(event.path, event.data.byteLength);
        this.scheduleRefreshForParent(event.path);
        break;
      }
      case 'deleted': {
        if (event.source === 'editor') {
          return;
        }
        this.optimisticDelete(event.path);
        this.scheduleRefreshForParent(event.path);
        break;
      }
      case 'renamed': {
        this.optimisticRename(event.oldPath, event.newPath);
        this.scheduleRefreshForParent(event.oldPath);
        this.scheduleRefreshForParent(event.newPath);
        break;
      }
      case 'batchWritten': {
        for (const path of event.paths) {
          this.scheduleRefreshForParent(path);
        }
        break;
      }
      case 'read': {
        break;
      }
    }
  }

  private optimisticAdd(path: string, size: number): void {
    const parts = path.split('/');
    const name = parts.at(-1) ?? path;
    const newTree = new Map(this._tree);
    newTree.set(path, { path, name, type: 'file', size, mtimeMs: Date.now(), isLoaded: false });
    this._tree = newTree;
    this.notifyTreeSubscribers();
    this._listingPathSubscribers.notifyPath(this.paths.parentOf(path), undefined);
  }

  private optimisticDelete(path: string): void {
    if (!this._tree.has(path)) {
      return;
    }
    const parent = this.paths.parentOf(path);
    const newTree = new Map(this._tree);
    newTree.delete(path);
    this._tree = newTree;
    this.notifyTreeSubscribers();
    this._listingPathSubscribers.notifyPath(parent, undefined);
  }

  private optimisticRename(oldPath: string, newPath: string): void {
    const entry = this._tree.get(oldPath);
    if (!entry) {
      return;
    }
    const parts = newPath.split('/');
    const name = parts.at(-1) ?? newPath;
    const oldParent = this.paths.parentOf(oldPath);
    const newParent = this.paths.parentOf(newPath);
    const newTree = new Map(this._tree);
    newTree.delete(oldPath);
    newTree.set(newPath, { ...entry, path: newPath, name });
    this._tree = newTree;
    this.notifyTreeSubscribers();
    this._listingPathSubscribers.notifyPath(oldParent, undefined);
    this._listingPathSubscribers.notifyPath(newParent, undefined);
  }

  private scheduleRefreshForParent(path: string): void {
    this.scheduleRefresh(this.paths.parentOf(path));
  }

  private async executeRefresh(path: string): Promise<void> {
    this._refreshAbortController?.abort();
    const controller = new AbortController();
    this._refreshAbortController = controller;

    try {
      const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
      const relativeDirectory = this.relativeDirectoryKeyFromUserPath(path);
      const entries = await this.proxy.readDirectory(absolutePath);
      if (controller.signal.aborted) {
        return;
      }
      this.mergeChildren(relativeDirectory, entries);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      if (error instanceof WorkspacePathEscapeError) {
        // Defence in depth: the FileContentService contract guarantees that
        // subscribers receive workspace-relative paths, so this branch is
        // unreachable in normal operation. Downgrade from `console.error` to
        // `console.warn` so a future contract regression is still visible
        // but never spams users — the original bug here was `createProject`
        // writing `/projects/<id>/...` keys through the root FM's content
        // service, which produced a refresh on every new chat.
        console.warn('[FileTreeService] dropped refresh for out-of-workspace path', {
          path,
          root: error.root,
        });
        return;
      }
      console.error('[FileTreeService] refresh failed:', error);
    }
  }

  /**
   * Whether immediate children for `relativeKey` have been merged into the tree.
   * @param relativeKey - Normalized key from {@link FileTreeService.relativeDirectoryKeyFromUserPath}.
   * @returns `true` when the directory row exists and is marked resolved.
   */
  private isDirectoryResolvedKey(relativeKey: string): boolean {
    if (relativeKey === '') {
      const root = this._tree.get('');
      return root?.type === 'dir' && root.isDirectoryResolved === true;
    }
    const entry = this._tree.get(relativeKey);
    return entry?.type === 'dir' && entry.isDirectoryResolved === true;
  }

  private async ensureDirectoryLoadedForListing(
    path: string,
    relativeKey: string,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!this._inFlightDirectoryList.has(relativeKey)) {
      this._inFlightDirectoryList.set(
        relativeKey,
        (async () => {
          const generation = this._listingGuard.begin(relativeKey);
          try {
            signal?.throwIfAborted();
            const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
            const nodes = await this.proxy.readDirectory(absolutePath);
            signal?.throwIfAborted();
            if (!this._listingGuard.isCurrent(relativeKey, generation)) {
              return;
            }
            this.mergeChildren(relativeKey, nodes);
          } finally {
            this._inFlightDirectoryList.delete(relativeKey);
          }
        })(),
      );
    }
    await this._inFlightDirectoryList.get(relativeKey)!;
  }

  private entriesAtDirectoryLevel(directoryKey: string): ListedDirectoryEntry[] {
    const prefix = directoryKey === '' ? '' : directoryKey.endsWith('/') ? directoryKey : `${directoryKey}/`;
    const out: ListedDirectoryEntry[] = [];
    for (const [entryPath, entry] of this._tree) {
      if (prefix === '') {
        if (entryPath !== '' && !entryPath.includes('/')) {
          out.push({
            name: entry.name,
            path: entryPath,
            isFolder: entry.type === 'dir',
            size: entry.size,
            mtimeMs: entry.mtimeMs,
          });
        }
      } else if (entryPath.startsWith(prefix) && !entryPath.slice(prefix.length).includes('/')) {
        out.push({
          name: entry.name,
          path: entryPath,
          isFolder: entry.type === 'dir',
          size: entry.size,
          mtimeMs: entry.mtimeMs,
        });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  private applyResolvedDirectoryRow(newTree: Map<string, FileEntry>, directoryKey: string): void {
    if (directoryKey === '') {
      const existingRoot = newTree.get('');
      newTree.set('', {
        path: '',
        name: '',
        type: 'dir',
        size: 0,
        mtimeMs: existingRoot?.mtimeMs ?? Date.now(),
        isLoaded: true,
        isDirectoryResolved: true,
      });
      return;
    }
    const parent = newTree.get(directoryKey);
    if (parent?.type === 'dir') {
      newTree.set(directoryKey, { ...parent, isDirectoryResolved: true });
      return;
    }
    const name = directoryKey.split('/').pop() ?? directoryKey;
    newTree.set(directoryKey, {
      path: directoryKey,
      name,
      type: 'dir',
      size: 0,
      mtimeMs: Date.now(),
      isLoaded: false,
      isDirectoryResolved: true,
    });
  }

  /**
   * Merge fresh `readDirectory` children into the tree. Removes stale
   * direct children, adds new disk entries, preserves {@link FileEntry}
   * object identity when path + type are unchanged.
   * @param directoryKey - Workspace-relative directory (`''` for root).
   * @param entries - Immediate child nodes from the worker.
   */
  private mergeChildren(directoryKey: string, entries: FileTreeNode[]): void {
    const newTree = new Map(this._tree);
    const prefix = directoryKey === '' ? '' : directoryKey.endsWith('/') ? directoryKey : `${directoryKey}/`;

    const existingChildKeys = new Set<string>();
    for (const key of newTree.keys()) {
      if (prefix === '') {
        if (!key.includes('/') && key !== '') {
          existingChildKeys.add(key);
        }
      } else if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
        existingChildKeys.add(key);
      }
    }

    const diskNames = new Set(entries.map((node) => node.name));
    for (const key of existingChildKeys) {
      const name = prefix === '' ? key : key.slice(prefix.length);
      if (!diskNames.has(name)) {
        newTree.delete(key);
      }
    }

    for (const entry of entries) {
      const entryPath = prefix ? `${prefix}${entry.name}` : entry.name;
      const inferredType: 'file' | 'dir' = entry.children === undefined ? 'file' : 'dir';
      const existing = newTree.get(entryPath);
      if (existing === undefined) {
        newTree.set(entryPath, {
          path: entryPath,
          name: entry.name,
          type: inferredType,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          isLoaded: false,
        });
        continue;
      }
      if (existing.type === inferredType) {
        if (existing.size !== entry.size || existing.mtimeMs !== entry.mtimeMs) {
          newTree.set(entryPath, { ...existing, size: entry.size, mtimeMs: entry.mtimeMs });
        }
        continue;
      }
      newTree.set(entryPath, {
        ...existing,
        type: inferredType,
        name: entry.name,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        isDirectoryResolved: inferredType === 'dir' ? existing.isDirectoryResolved : undefined,
      });
    }

    this.applyResolvedDirectoryRow(newTree, directoryKey);

    this._tree = newTree;
    this._listingPathSubscribers.notifyPath(directoryKey, undefined);
    this.notifyTreeSubscribers();
  }
}
