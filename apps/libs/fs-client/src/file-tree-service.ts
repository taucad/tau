import { ObservationService } from '#observation-service.js';
import type {
  FileContentMetadata,
  FileEntry,
  FileProvenance,
  FileStatEntry,
  FileStat,
  FileTreeContentMetadata,
} from '@taucad/types';
import type { DirectoryStatRow, FileTreeNode } from '@taucad/filesystem';
import { getFileContentMetadata } from '@taucad/filesystem';
import { Topic } from '@taucad/events';
import type { FileContentService, ContentChangeEvent } from '#file-content-service.js';
import type { ComposedViewClient } from '#composed-view-client.js';
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
import type { DirectoryListing, ListedDirectoryEntry } from '#directory-listing.js';

/** Milliseconds. */
const defaultRefreshDebounce = 100;
/** Milliseconds. */
const watchIntervalFocused = 2000;
/** Milliseconds. */
const watchIntervalBlurred = 10_000;
/** Milliseconds. Safety-net cadence while the worker observes the root natively. */
const watchIntervalNativeSafetyNet = 60_000;
/** Milliseconds. */
const pollingTelemetryWindow = 60_000;
// oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
// ponytail: 5-tick global reconcile (10 s visible / 50 s hidden); tune from poll telemetry.
const globalReconcileTickInterval = 5;

type FileTreeFileNode = Extract<FileTreeNode, { contentKind: FileContentMetadata['contentKind'] }>;
type CachedFileEntry = Extract<FileEntry, { type: 'file' }>;

/**
 * Provenance is data, so a row is stale when *any* of it moved — `versioned`
 * dims the row, `overrides` names the overlay unit a project file replaced, and
 * `identity` is the serving source. Comparing only `source` and `agentAccess`
 * left those three frozen on screen while size and mtime stood still.
 */
const sameProvenance = (current?: FileProvenance, next?: FileProvenance): boolean =>
  current?.source === next?.source &&
  current?.versioned === next?.versioned &&
  current?.agentAccess === next?.agentAccess &&
  current?.identity === next?.identity &&
  current?.overrides === next?.overrides;

/**
 * Content-free aggregate for the existing external-filesystem polling loop.
 *
 * @public
 */
export type ExternalPollTelemetry = {
  readonly count: number;
  readonly successes: number;
  readonly failures: number;
  readonly visible: number;
  readonly hidden: number;
  /** Milliseconds. */
  readonly p50: number;
  /** Milliseconds. */
  readonly p95: number;
};

type PollingTelemetryState = {
  startedAt: number;
  durations: number[];
  successes: number;
  failures: number;
  visible: number;
  hidden: number;
  inFlight: boolean;
  stopped: boolean;
};

const isFileTreeFileNode = (entry: FileTreeNode): entry is FileTreeFileNode => entry.children === undefined;

const fileMetadataFields = (metadata: FileTreeContentMetadata): FileTreeContentMetadata =>
  metadata.contentKind === 'text'
    ? { contentKind: 'text', ...(metadata.lineCount === undefined ? {} : { lineCount: metadata.lineCount }) }
    : { contentKind: 'binary' };

/**
 * Lightweight file listing entry for search / complete-tree snapshots.
 *
 * @public
 */
export type FileItem = {
  path: string;
  size: number;
} & FileTreeContentMetadata;

type FileTreeServiceInit = {
  proxy: ComposedViewClient;
  paths: WorkspacePathResolver;
  channel: WorkerChangeChannel;
  visibility: VisibilityProvider;
  initialEntries?: FileEntry[];
  /** Debounce window between subsequent tree-refresh fires. Milliseconds. */
  refreshDebounce?: number;
  onExternalPollTelemetry?: (aggregate: ExternalPollTelemetry) => void;
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
 * import type { ComposedViewClient } from '@taucad/fs-client/composed-view-client';
 * import type { WorkerChangeChannelTransport } from '@taucad/fs-client/worker-change-channel';
 * export function createExampleFileTreeService(
 *   proxy: ComposedViewClient,
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
  private readonly channel: WorkerChangeChannel;
  private readonly directoryErrors = new Map<string, unknown>();
  private readonly closedSignal = Promise.withResolvers<void>();
  // Selection can precede acquisition; callers and active leases retain the selected owner.
  private readonly listingObservations = new Map<string, WeakRef<ObservationService<DirectoryListing>>>();
  private readonly retiredListingObservations = new FinalizationRegistry<{
    path: string;
    reference: WeakRef<ObservationService<DirectoryListing>>;
  }>(({ path, reference }) => {
    if (this.listingObservations.get(path) === reference) {
      this.listingObservations.delete(path);
    }
  });
  private _tree: Map<string, FileEntry>;
  private readonly proxy: ComposedViewClient;
  private readonly paths: WorkspacePathResolver;
  private readonly visibility: VisibilityProvider;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  /* Every directory a mutation touched in this window. A re-read lists one
   * directory, so collapsing two to their common ancestor re-read neither. */
  private readonly pendingRefreshPaths = new Set<string>();
  private pollingTimer: ReturnType<typeof setTimeout> | undefined;
  private pollingActive = false;
  private visibilityUnsub: (() => void) | undefined;
  /** Set from the worker's last poll result: native observation makes the poll a safety net. */
  private nativelyObserved = false;
  private reschedulePoll: (() => void) | undefined;
  private pollingEpoch = 0;
  private pollingTelemetry: PollingTelemetryState | undefined;
  private contentUnsubscribe: (() => void) | undefined;
  /** Milliseconds. */
  private readonly refreshDebounce: number;
  private readonly onExternalPollTelemetry: ((aggregate: ExternalPollTelemetry) => void) | undefined;
  private _refreshAbortController: AbortController | undefined;
  private _backendResync: Promise<void> | undefined;
  private _epoch = 0;
  private _cachedCompleteTree: FileItem[] | undefined;
  private _completeTreeVersion = 0;
  private readonly _listingPathSubscribers = new PathSubscriberRegistry<void>();
  private readonly _listingGuard = new RefreshGenerationGuard();
  /* Latest-started re-read wins, per directory: a refresh of one directory
   * never cancels another's, and an older listing never lands over a newer. */
  private readonly _refreshGuard = new RefreshGenerationGuard();
  private readonly _inFlightDirectoryList = new Map<string, Promise<void>>();
  private readonly unsubscribeChannel: Array<() => void>;
  readonly #treeTopic = new Topic<void>({ name: 'FileTreeService.tree' });

  public constructor(init: FileTreeServiceInit) {
    this.proxy = init.proxy;
    this.channel = init.channel;
    this.paths = init.paths;
    this.visibility = init.visibility;
    this.refreshDebounce = init.refreshDebounce ?? defaultRefreshDebounce;
    this.onExternalPollTelemetry = init.onExternalPollTelemetry;
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
        interestedIn: (relativePath) =>
          this.isDirectoryResolvedKey(this.paths.parentOf(relativePath)) ||
          this._inFlightDirectoryList.has(this.paths.parentOf(relativePath)),
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
        interestedIn: (relativePath) =>
          this.isDirectoryResolvedKey(this.paths.parentOf(relativePath)) ||
          this._inFlightDirectoryList.has(this.paths.parentOf(relativePath)),
        handler: (event) => {
          this.handleFileRenamedRelative(event);
        },
      }),
      init.channel.onDirectoryChanged({
        interestedIn: (relativeDirectory) =>
          this.isDirectoryResolvedKey(relativeDirectory) || this._inFlightDirectoryList.has(relativeDirectory),
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
      init.channel.onFileCopied({
        handler: ({ targetPath }) => {
          this.invalidatePendingDirectory(this.paths.parentOf(targetPath));
          this.refreshResolvedParent(targetPath);
        },
      }),
      init.channel.onDirectoryCopied({
        handler: ({ targetPath }) => {
          this.invalidatePendingDirectory(this.paths.parentOf(targetPath));
          for (const key of this._inFlightDirectoryList.keys()) {
            if (key === targetPath || key.startsWith(`${targetPath}/`)) {
              this.invalidatePendingDirectory(key);
            }
          }
          this.refreshResolvedParent(targetPath);
        },
      }),
      init.channel.onBackendChanged(() => {
        for (const key of this._inFlightDirectoryList.keys()) {
          this.invalidatePendingDirectory(key);
        }
        const resync = this.resyncResolvedDirectories();
        this._backendResync = resync;
        // async-iife: bootstrap — worker callbacks cannot await the full resolved-directory walk.
        // oxlint-disable-next-line promise/prefer-await-to-then -- Identity-guarded cleanup tracks this exact resync promise.
        void resync.finally(() => {
          if (this._backendResync === resync) {
            this._backendResync = undefined;
          }
        });
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
  /** Captured-root incarnation for selecting bindings. */
  public get incarnation(): number {
    return this._epoch;
  }

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
      .map((entry) => ({
        path: entry.path,
        size: entry.size,
        ...fileMetadataFields(entry),
      }));
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
      const name = path.split('/').pop() ?? path;
      if (stat.type === 'dir') {
        return {
          path,
          name,
          type: 'dir',
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          isLoaded: false,
          isDirectoryResolved: false,
        };
      }
      return {
        path,
        name,
        type: 'file',
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        isLoaded: false,
        ...fileMetadataFields(stat),
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

  /** Exact current children for agent RPCs, independent of the cached UI tree. */
  public async listDirectoryExact(path: string): Promise<DirectoryStatRow[]> {
    try {
      return await this.proxy.readDirectoryExact(this.paths.toAbsoluteWorkspacePath(path));
    } catch (error) {
      throw new DirectoryListingFailedError(classifyDirectoryListingError(error, path));
    }
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
    const epoch = this._epoch;
    try {
      await this.ensureDirectoryLoadedForListing(path, relativeKey, options?.signal);
      if (this._epoch !== epoch) {
        throw new Error('Directory capability changed during the read.');
      }
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
   * Select an existing incremental tree through the shared observation lifecycle.
   * @param path - Captured directory key.
   * @returns Service-owned presentation projection.
   */
  public observeDirectory(path: string): ObservationService<DirectoryListing> {
    const key = this.relativeDirectoryKeyFromUserPath(path);
    const existing = this.listingObservations.get(key)?.deref();
    if (existing) {
      return existing;
    }
    let fresh = true;
    let merging = false;
    const observation = new ObservationService<DirectoryListing>({
      resource: key,
      refresh: () => {
        fresh = true;
      },
      watch: (invalidate, reset) => {
        fresh = true;
        const unsubscribe = this.subscribePath(key, () => {
          if (!merging) {
            invalidate();
          }
        });
        const watch = this.channel.watchReady({ paths: [key], recursive: false }, (event) => {
          fresh = true;
          if (event.type === 'reset') {
            reset();
          } else {
            invalidate();
          }
        });
        return {
          ready: watch.ready,
          closed: watch.closed,
          dispose: () => {
            unsubscribe();
            watch.dispose();
          },
        };
      },
      read: async ({ signal, isCurrent }) => {
        try {
          if (fresh) {
            fresh = false;
            const epoch = this._epoch;
            const generation = this._refreshGuard.begin(key);
            const entries = await this.proxy.readDirectory(this.paths.toAbsoluteWorkspacePath(key));
            signal.throwIfAborted();
            if (epoch === this._epoch && isCurrent() && this._refreshGuard.isCurrent(key, generation)) {
              merging = true;
              try {
                this.mergeChildren(key, entries);
              } finally {
                merging = false;
              }
            }
          }
          if (!isCurrent()) {
            fresh = true;
            return { kind: 'loading', path };
          }
          const error = this.directoryErrors.get(key);
          if (error !== undefined) {
            throw new DirectoryListingFailedError(classifyDirectoryListingError(error, path));
          }
          return { kind: 'ready', path, entries: await this.listDirectory(key, { signal }) };
        } catch (error) {
          return { kind: 'error', path, cause: classifyDirectoryListingError(error, path) };
        }
      },
      equal: (previous, next) =>
        previous.kind === 'ready' && next.kind === 'ready'
          ? JSON.stringify(previous.entries) === JSON.stringify(next.entries)
          : previous === next,
    });
    const reference = new WeakRef(observation);
    this.listingObservations.set(key, reference);
    this.retiredListingObservations.register(observation, { path: key, reference }, reference);
    return observation;
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
   * Search the project through the worker's index for this root. Returns only
   * matching results: the main thread never holds the full file index for
   * interactive filtering.
   * @param query - Free-text search string understood by the worker search index.
   * @param options - Optional cap / directory inclusion flags forwarded to the proxy.
   * @returns Matching {@link FileStatEntry} records from the worker.
   */
  public async searchFiles(
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): Promise<FileStatEntry[]> {
    const absolutePath = this.paths.toAbsoluteWorkspacePath('');
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
   * Debounce tree refresh. Calls inside one window coalesce into one re-read per directory.
   * @param path - Directory to re-read once the window closes.
   */
  public scheduleRefresh(path: string): void {
    this.pendingRefreshPaths.add(path);

    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      const pendingPaths = [...this.pendingRefreshPaths];
      this.pendingRefreshPaths.clear();
      for (const pendingPath of pendingPaths) {
        const observation = this.listingObservations.get(pendingPath)?.deref();
        if (observation && observation.activeLeaseCount > 0) {
          observation.refresh();
        } else {
          void this.executeRefresh(pendingPath);
        }
      }
    }, this.refreshDebounce);
  }

  /**
   * Begin polling the worker on a visibility-aware interval.
   */
  public startPolling(): void {
    if (this.pollingActive) {
      return;
    }
    this.stopPolling();
    this.pollingActive = true;
    const epoch = ++this.pollingEpoch;
    const telemetry: PollingTelemetryState = {
      startedAt: performance.now(),
      durations: [],
      successes: 0,
      failures: 0,
      visible: 0,
      hidden: 0,
      inFlight: false,
      stopped: false,
    };
    this.pollingTelemetry = telemetry;
    let completedTicks = 0;

    const poll = (): void => {
      if (epoch !== this.pollingEpoch) {
        return;
      }
      const pollInterval = this.nativelyObserved
        ? watchIntervalNativeSafetyNet
        : this.visibility.isVisible()
          ? watchIntervalFocused
          : watchIntervalBlurred;
      this.pollingTimer = setTimeout(async () => {
        this.pollingTimer = undefined;
        const visible = this.visibility.isVisible();
        const startedAt = performance.now();
        let success = false;
        telemetry.inFlight = true;
        try {
          this.nativelyObserved = await this.proxy.pollExternalChanges(this.paths.toAbsoluteWorkspacePath(''));
          completedTicks++;
          if (completedTicks % globalReconcileTickInterval === 0) {
            await this.proxy.pollExternalChanges();
          }
          success = true;
        } catch (error) {
          console.error('[FileTreeService] external filesystem poll failed:', error);
        } finally {
          const completedAt = performance.now();
          telemetry.inFlight = false;
          telemetry.durations.push(completedAt - startedAt);
          telemetry.successes += success ? 1 : 0;
          telemetry.failures += success ? 0 : 1;
          telemetry.visible += visible ? 1 : 0;
          telemetry.hidden += visible ? 0 : 1;
          if (telemetry.stopped || completedAt - telemetry.startedAt >= pollingTelemetryWindow) {
            this.flushPollingTelemetry(telemetry, completedAt);
          }
          if (!telemetry.stopped) {
            poll();
          }
        }
      }, pollInterval);
    };

    poll();

    this.reschedulePoll = (): void => {
      if (this.pollingTimer !== undefined) {
        clearTimeout(this.pollingTimer);
        this.pollingTimer = undefined;
        poll();
      }
    };
    this.visibilityUnsub = this.visibility.onVisibilityChange(this.reschedulePoll);
  }

  /**
   * Tear down polling timers and visibility subscriptions.
   */
  public stopPolling(): void {
    this.pollingActive = false;
    this.pollingEpoch++;
    this.nativelyObserved = false;
    this.reschedulePoll = undefined;
    if (this.pollingTimer !== undefined) {
      clearTimeout(this.pollingTimer);
      this.pollingTimer = undefined;
    }
    if (this.visibilityUnsub !== undefined) {
      this.visibilityUnsub();
      this.visibilityUnsub = undefined;
    }
    const telemetry = this.pollingTelemetry;
    if (telemetry) {
      telemetry.stopped = true;
      if (!telemetry.inFlight) {
        this.flushPollingTelemetry(telemetry, performance.now());
      }
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
    this._epoch++;
    this.directoryErrors.clear();
    const observations = [...this.listingObservations.values()];
    for (const reference of observations) {
      this.retiredListingObservations.unregister(reference);
    }
    this.listingObservations.clear();
    for (const reference of observations) {
      reference.deref()?.dispose();
    }
    this._inFlightDirectoryList.clear();
    this._listingGuard.reset();
    this.paths.reset(rootDirectory);
    this._refreshAbortController?.abort();
    this._refreshAbortController = undefined;
    if (this.refreshTimer !== undefined) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    this.pendingRefreshPaths.clear();
    // The new root has not reported native observation yet: poll it promptly.
    this.nativelyObserved = false;
    this.reschedulePoll?.();

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
  /** Captured observation source lifetime. */
  public get closed(): Promise<void> {
    return this.closedSignal.promise;
  }

  public dispose(): void {
    this.closedSignal.resolve();
    const observations = [...this.listingObservations.values()];
    for (const reference of observations) {
      this.retiredListingObservations.unregister(reference);
    }
    this.listingObservations.clear();
    for (const reference of observations) {
      reference.deref()?.dispose();
    }
    this._epoch++;
    this.directoryErrors.clear();
    for (const unsubscribe of this.unsubscribeChannel) {
      unsubscribe();
    }
    this.stopPolling();
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

  private flushPollingTelemetry(telemetry: PollingTelemetryState, completedAt: number): void {
    if (telemetry.durations.length === 0) {
      if (telemetry.stopped && this.pollingTelemetry === telemetry) {
        this.pollingTelemetry = undefined;
      }
      return;
    }
    const sorted = [...telemetry.durations].sort((left, right) => left - right);
    const percentile = (value: number): number => sorted[Math.ceil(sorted.length * value) - 1]!;
    try {
      this.onExternalPollTelemetry?.({
        count: sorted.length,
        successes: telemetry.successes,
        failures: telemetry.failures,
        visible: telemetry.visible,
        hidden: telemetry.hidden,
        p50: percentile(0.5),
        p95: percentile(0.95),
      });
    } catch {
      // Telemetry must never alter polling continuity.
    }
    telemetry.startedAt = completedAt;
    telemetry.durations = [];
    telemetry.successes = 0;
    telemetry.failures = 0;
    telemetry.visible = 0;
    telemetry.hidden = 0;
    if (telemetry.stopped && this.pollingTelemetry === telemetry) {
      this.pollingTelemetry = undefined;
    }
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
    this.invalidatePendingDirectory(this.paths.parentOf(relativePath));
    const parentPath = this.paths.parentOf(relativePath);
    if (
      this.isDirectoryResolvedKey(parentPath) &&
      (this.listingObservations.get(parentPath)?.deref()?.activeLeaseCount ?? 0) === 0
    ) {
      this.scheduleRefresh(parentPath);
    }
  }

  private handleFileDeletedRelative(relativePath: string): void {
    this.invalidatePendingDirectory(this.paths.parentOf(relativePath));
    this.optimisticDelete(relativePath);
  }

  /*
   * The optimistic patch shows the move at once; the parent's re-read is what
   * makes it true (Rule 7). A rename from a name the tree never listed — a
   * staged copy swapped into place — patches nothing, and a listing taken
   * mid-swap can land after the patch, so only a re-read that starts after
   * the event settles the directory.
   */
  private handleFileRenamedRelative(event: WorkerRelativeRenameEvent): void {
    for (const path of [event.oldPath, event.newPath]) {
      if (path !== undefined) {
        this.invalidatePendingDirectory(this.paths.parentOf(path));
      }
    }
    const oldRelative = event.oldPath;
    const newRelative = event.newPath;
    if (oldRelative !== undefined && newRelative !== undefined) {
      this.optimisticRename(oldRelative, newRelative);
    } else if (oldRelative !== undefined) {
      this.optimisticDelete(oldRelative);
    }
    for (const path of [oldRelative, newRelative]) {
      if (path !== undefined) {
        this.refreshResolvedParent(path);
      }
    }
  }

  private refreshResolvedParent(relativePath: string): void {
    const parentPath = this.paths.parentOf(relativePath);
    if (
      this.isDirectoryResolvedKey(parentPath) &&
      (this.listingObservations.get(parentPath)?.deref()?.activeLeaseCount ?? 0) === 0
    ) {
      this.scheduleRefresh(parentPath);
    }
  }

  private handleDirectoryChangedRelative(relativePath: string): void {
    this.invalidatePendingDirectory(relativePath);
    if (
      this.isDirectoryResolvedKey(relativePath) &&
      (this.listingObservations.get(relativePath)?.deref()?.activeLeaseCount ?? 0) === 0
    ) {
      this.scheduleRefresh(relativePath);
    }
  }

  private handleDirectoryCreatedRelative(relativePath: string): void {
    this.invalidatePendingDirectory(this.paths.parentOf(relativePath));
    const parent = this.paths.parentOf(relativePath);
    if (!this.isDirectoryResolvedKey(parent) || this._tree.has(relativePath)) {
      return;
    }
    const newTree = new Map(this._tree);
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
    for (const key of this._inFlightDirectoryList.keys()) {
      if (key === relativePath || key.startsWith(`${relativePath}/`) || relativePath === '') {
        this.invalidatePendingDirectory(key);
      }
    }
    this.invalidatePendingDirectory(this.paths.parentOf(relativePath));
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
    for (const key of this._inFlightDirectoryList.keys()) {
      if (key === oldPath || key.startsWith(`${oldPath}/`) || key === newPath || key.startsWith(`${newPath}/`)) {
        this.invalidatePendingDirectory(key);
      }
    }
    this.invalidatePendingDirectory(this.paths.parentOf(oldPath));
    this.invalidatePendingDirectory(this.paths.parentOf(newPath));
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
        const metadata = { size: event.data.byteLength, ...getFileContentMetadata(event.data) };
        if (event.source === 'editor') {
          this.updateFileMetadata(event.path, metadata);
          return;
        }
        this.optimisticAdd(event.path, metadata);
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
      case 'fileCopied': {
        this.scheduleRefreshForParent(event.targetPath);
        break;
      }
      case 'directoryCopied': {
        this.scheduleRefreshForParent(event.targetPath);
        break;
      }
      case 'directoryCreated': {
        this.handleDirectoryCreatedRelative(event.path);
        break;
      }
      case 'directoryDeleted': {
        this.handleDirectoryDeletedRelative(event.path);
        break;
      }
      case 'directoryRenamed': {
        this.renameSubtree(event.oldPath, event.newPath);
        break;
      }
      case 'read': {
        break;
      }
    }
  }

  private optimisticAdd(path: string, metadata: { size: number } & FileContentMetadata): void {
    /* A write to a listed file changes its content, never what the view stamped on it. */
    if (this._tree.get(path)?.type === 'file') {
      this.updateFileMetadata(path, metadata);
      return;
    }
    const parts = path.split('/');
    const name = parts.at(-1) ?? path;
    const newTree = new Map(this._tree);
    newTree.set(path, {
      path,
      name,
      type: 'file',
      size: metadata.size,
      mtimeMs: Date.now(),
      isLoaded: false,
      ...fileMetadataFields(metadata),
    });
    this._tree = newTree;
    this.notifyTreeSubscribers();
    this._listingPathSubscribers.notifyPath(this.paths.parentOf(path), undefined);
  }

  private updateFileMetadata(path: string, metadata: { size: number } & FileContentMetadata): void {
    const entry = this._tree.get(path);
    if (entry?.type !== 'file') {
      return;
    }
    const newTree = new Map(this._tree);
    newTree.set(path, {
      path: entry.path,
      name: entry.name,
      type: 'file',
      size: metadata.size,
      mtimeMs: Date.now(),
      isLoaded: entry.isLoaded,
      ...fileMetadataFields(metadata),
      ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
    });
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
    const epoch = this._epoch;
    while (this._backendResync !== undefined) {
      // oxlint-disable-next-line no-await-in-loop -- A replacement resync may be installed while the prior generation settles.
      await this._backendResync;
    }
    if (this._epoch !== epoch) {
      return;
    }

    try {
      const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
      const relativeDirectory = this.relativeDirectoryKeyFromUserPath(path);
      const generation = this._refreshGuard.begin(relativeDirectory);
      const entries = await this.proxy.readDirectory(absolutePath);
      if (this._epoch !== epoch || !this._refreshGuard.isCurrent(relativeDirectory, generation)) {
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
      if (this._epoch === epoch) {
        this.directoryErrors.set(this.relativeDirectoryKeyFromUserPath(path), error);
        this._listingPathSubscribers.notifyPath(this.relativeDirectoryKeyFromUserPath(path), undefined);
      }
      console.error('[FileTreeService] refresh failed:', error);
    }
  }

  private async resyncResolvedDirectories(): Promise<void> {
    this._refreshAbortController?.abort();
    const controller = new AbortController();
    this._refreshAbortController = controller;
    const resolvedDirectories = [...this._tree.keys()]
      .filter(
        (path) =>
          this.isDirectoryResolvedKey(path) &&
          (this.listingObservations.get(path)?.deref()?.activeLeaseCount ?? 0) === 0,
      )
      .toSorted((left, right) => {
        const leftDepth = left === '' ? 0 : left.split('/').length;
        const rightDepth = right === '' ? 0 : right.split('/').length;
        return leftDepth - rightDepth;
      });

    try {
      for (const path of resolvedDirectories) {
        if (controller.signal.aborted) {
          return;
        }
        if (!this.isDirectoryResolvedKey(path)) {
          continue;
        }
        const generation = this._refreshGuard.begin(path);
        // oxlint-disable-next-line no-await-in-loop -- Parent directories must merge before their still-present resolved descendants.
        const entries = await this.proxy.readDirectory(this.paths.toAbsoluteWorkspacePath(path));
        if (controller !== this._refreshAbortController) {
          return;
        }
        if (this._refreshGuard.isCurrent(path, generation) && this.isDirectoryResolvedKey(path)) {
          this.mergeChildren(path, entries);
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('[FileTreeService] backend resync failed:', error);
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

  private invalidatePendingDirectory(key: string): void {
    if (this._inFlightDirectoryList.has(key)) {
      this._listingGuard.begin(key);
    }
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
          const epoch = this._epoch;
          try {
            const absolutePath = this.paths.toAbsoluteWorkspacePath(path);
            for (;;) {
              const generation = this._listingGuard.begin(relativeKey);
              let nodes: FileTreeNode[];
              try {
                // oxlint-disable-next-line no-await-in-loop -- A dirty bootstrap read must finish before one authoritative catch-up starts.
                nodes = await this.proxy.readDirectory(absolutePath);
              } catch (error) {
                if (this._epoch !== epoch) {
                  return;
                }
                if (!this._listingGuard.isCurrent(relativeKey, generation)) {
                  continue;
                }
                throw error;
              }
              if (this._epoch !== epoch) {
                return;
              }
              if (!this._listingGuard.isCurrent(relativeKey, generation)) {
                continue;
              }
              this.mergeChildren(relativeKey, nodes);
              break;
            }
          } finally {
            if (this._epoch === epoch) {
              this._inFlightDirectoryList.delete(relativeKey);
            }
          }
        })(),
      );
    }
    await this._inFlightDirectoryList.get(relativeKey)!;
    signal?.throwIfAborted();
  }

  private entriesAtDirectoryLevel(directoryKey: string): ListedDirectoryEntry[] {
    const prefix = directoryKey === '' ? '' : directoryKey.endsWith('/') ? directoryKey : `${directoryKey}/`;
    const out: ListedDirectoryEntry[] = [];
    for (const [entryPath, entry] of this._tree) {
      if (prefix === '') {
        if (entryPath !== '' && !entryPath.includes('/')) {
          out.push(this.toListedDirectoryEntry(entryPath, entry));
        }
      } else if (entryPath.startsWith(prefix) && !entryPath.slice(prefix.length).includes('/')) {
        out.push(this.toListedDirectoryEntry(entryPath, entry));
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  private toListedDirectoryEntry(path: string, entry: FileEntry): ListedDirectoryEntry {
    if (entry.type === 'dir') {
      return {
        name: entry.name,
        path,
        isFolder: true,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
      };
    }
    return {
      name: entry.name,
      path,
      isFolder: false,
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      ...fileMetadataFields(entry),
    };
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
    this.directoryErrors.delete(directoryKey);
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
        const subtreePrefix = `${key}/`;
        for (const descendant of newTree.keys()) {
          if (descendant.startsWith(subtreePrefix)) {
            newTree.delete(descendant);
          }
        }
      }
    }

    for (const entry of entries) {
      const entryPath = prefix ? `${prefix}${entry.name}` : entry.name;
      const existing = newTree.get(entryPath);
      if (isFileTreeFileNode(entry)) {
        const nextFile = this.toFileEntry(entryPath, entry, existing?.isLoaded ?? false);
        if (existing === undefined) {
          newTree.set(entryPath, nextFile);
          continue;
        }
        if (existing.type === 'file') {
          if (this.hasFileEntryChanged(existing, nextFile)) {
            newTree.set(entryPath, { ...nextFile, isLoaded: existing.isLoaded });
          }
          continue;
        }
        newTree.set(entryPath, nextFile);
        continue;
      }

      const nextDirectory = this.toDirectoryEntry(entryPath, entry, existing);
      if (existing === undefined) {
        newTree.set(entryPath, nextDirectory);
        continue;
      }
      if (existing.type === 'dir') {
        if (
          existing.size !== nextDirectory.size ||
          existing.mtimeMs !== nextDirectory.mtimeMs ||
          existing.isDirectoryResolved !== nextDirectory.isDirectoryResolved ||
          !sameProvenance(existing.provenance, nextDirectory.provenance)
        ) {
          newTree.set(entryPath, nextDirectory);
        }
        continue;
      }
      newTree.set(entryPath, nextDirectory);
    }

    this.applyResolvedDirectoryRow(newTree, directoryKey);

    this._tree = newTree;
    this._listingPathSubscribers.notifyPath(directoryKey, undefined);
    this.notifyTreeSubscribers();
  }

  private toFileEntry(path: string, entry: FileTreeFileNode, isLoaded: boolean): CachedFileEntry {
    return {
      path,
      name: entry.name,
      type: 'file',
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      isLoaded,
      ...fileMetadataFields(entry),
      ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
    };
  }

  private toDirectoryEntry(
    path: string,
    entry: Exclude<FileTreeNode, FileTreeFileNode>,
    existing?: FileEntry,
  ): FileEntry {
    return {
      path,
      name: entry.name,
      type: 'dir',
      size: entry.size,
      mtimeMs: entry.mtimeMs,
      isLoaded: existing?.type === 'dir' ? existing.isLoaded : false,
      isDirectoryResolved: existing?.type === 'dir' ? existing.isDirectoryResolved : false,
      ...(entry.provenance === undefined ? {} : { provenance: entry.provenance }),
    };
  }

  private hasFileEntryChanged(current: CachedFileEntry, next: CachedFileEntry): boolean {
    return (
      current.size !== next.size ||
      current.mtimeMs !== next.mtimeMs ||
      current.contentKind !== next.contentKind ||
      !sameProvenance(current.provenance, next.provenance) ||
      (current.contentKind === 'text' && next.contentKind === 'text' && current.lineCount !== next.lineCount)
    );
  }
}
