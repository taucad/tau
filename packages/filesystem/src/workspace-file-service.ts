import { projectIdSchema } from '@taucad/types';
import type {
  AuthorityCheckedFileWrite,
  CheckedFileWriteResult,
  FileWritePrecondition,
  FileStat,
  FileSystemBackend,
} from '@taucad/types';
import type {
  FileSystemProvider,
  FileTreeNode,
  FileReadStreamOptions,
  MkdirOptions,
  PathPolicy,
  TreeEntry,
  WatchRequest,
  WatchEvent,
  WorkspaceMutationContext,
} from '#types.js';
import { MutationPipeline, causeToMutationError, isProjectDirectoryPath } from '#mutation-pipeline.js';
import type { BulkMoveEdit, BulkMoveResult } from '#mutation-pipeline.js';
import { RootedViews } from '#rooted-views.js';
import type { RootedFileSystem } from '#rooted-views.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResourceQueue } from '#resource-queue.js';
import type { ChangeEventBus } from '#change-event-bus.js';
import { ProjectIndexes } from '#project-index/project-indexes.js';
import { WatchRegistry } from '#watch-registry.js';
import { bufferToStream, validateFileReadStreamOptions } from '#backend/stream-utils.js';
/* The scope discriminants are the backend layer's own vocabulary (D13); the
 * authority reads capabilities and admission answers, never a backend name. */
import { isDurableScope, matchesProtectedMountScope, scopeForRouteConfig, toScope } from '#backend/scope.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
/* External change and cross-tab receive are their own modules (D13/W9); the
 * authority keeps the one public poll and owns nothing of either mechanism. */
import { ExternalChangeIngest } from '#external-change-ingest.js';
import type { StagedDiscoveryRoot } from '#external-change-ingest.js';
import { RemoteChanges } from '#remote-changes.js';
import { homeRootUnavailableCode, rootStateForError } from '#mount-table.js';
import type {
  CheckoutRootConfig,
  MountTable,
  MountConfig,
  MountResolution,
  ProjectRootConfig,
  ProjectRootConfiguration,
  ProjectRootConfigurationResult,
  RootStatus,
  SkippedConfigurationEntry,
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';
/* The project-directory lifecycle is its own module (D5/W7); the authority
 * keeps the four public calls and owns nothing of the manifest. */
import { ProjectDirectories } from '#project-directories.js';
import type { ImportStagingPort } from '#importer/staging.js';
import type { HostImportSourcePort } from '#importer/sources.js';
import type { ProjectDiscoveryResult, ProjectRouteVerification, ResolvedDiscoveryRoot } from '#project-directories.js';
import { assertRootedPath, joinRelativePath, parentDirectory, resolveAuthorityPath } from '@taucad/utils/path';
import { MissingWorkspaceHandleError, WorkspaceMutationError } from '#workspace-errors.js';
import { fileMetadataFields } from '#content-metadata.js';
import { archive } from '#content-ops/archive.js';
import { asMarkedRow, readAsMarked } from '#pending-content.js';
import type { PendingObjectSource } from '#pending-content.js';
import { checkoutRoute, nodeModulesRoute, parseRoute, projectRoute } from '#project-routes.js';

/** Milliseconds. */
const kernelCoalescingWindow = 75;

/** One project or checkout route staged for installation, before its provider is resolved. */
type StagedRouteMount = {
  readonly kind: 'project' | 'checkout';
  readonly prefix: string;
  readonly config: ProjectRootConfig;
  readonly scope: WorkspaceScope;
  readonly storageRootKey: string;
  readonly providerBasePath: string;
};

/**
 * One configured root as the last configuration named it: a staged root's key,
 * whose status the ingest owns, or the status of a root staging skipped.
 */
type ConfiguredRootEntry =
  | { readonly storageRootKey: string; readonly status?: undefined; readonly error?: undefined }
  | { readonly storageRootKey?: undefined; readonly status: RootStatus; readonly error?: unknown };

/** The rejection of a configuration whose Home cannot be staged or admitted (blueprint D1). */
const homeRootUnavailable = (cause: unknown): Error =>
  Object.assign(new Error(cause instanceof Error ? cause.message : 'The Home root could not be admitted.', { cause }), {
    code: homeRootUnavailableCode,
  });

/** One skipped route, with the fields its kind carries. */
const skippedRoute = (entry: {
  readonly kind: 'project' | 'checkout';
  readonly reason: SkippedConfigurationEntry['reason'];
  readonly storageRootKey?: string;
  readonly projectId?: string;
}): SkippedConfigurationEntry => ({
  kind: entry.kind,
  reason: entry.reason,
  ...(entry.projectId === undefined ? {} : { projectId: entry.projectId }),
  ...(entry.storageRootKey === undefined ? {} : { storageRootKey: entry.storageRootKey }),
});

/** What one staging pass shares between its route families. */
type RouteStagingPass = {
  /** Webaccess handles the routes reference by workspace id. */
  readonly webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>;
  /** Physical routes already claimed by this pass; extended in place. */
  readonly physicalRoutes: Set<string>;
  /** Skipped entries of this pass; extended in place. */
  readonly skipped: SkippedConfigurationEntry[];
};

/** A provider path that is already canonical, or `undefined` when it is not. */
const canonicalProviderPath = (path: string): string | undefined => {
  try {
    const rooted = assertRootedPath(path);
    return rooted === path ? rooted : undefined;
  } catch {
    return undefined;
  }
};

/** Split staged routes into those that pass and those that fail one test, keeping order. */
const partition = (
  entries: readonly StagedRouteMount[],
  test: (entry: StagedRouteMount) => boolean,
): [StagedRouteMount[], StagedRouteMount[]] => {
  const passing: StagedRouteMount[] = [];
  const failing: StagedRouteMount[] = [];
  for (const entry of entries) {
    (test(entry) ? passing : failing).push(entry);
  }
  return [passing, failing];
};

/** A route prefix's authority spelling, or `undefined` when the path rules refuse it (a NUL, for one). */
const canonicalRoute = (prefix: string): string | undefined => {
  try {
    return resolveAuthorityPath(prefix);
  } catch {
    return undefined;
  }
};

/** Raised when a logical project route is used before an exact locator is bound. @public */
export class UnboundProjectRouteError extends Error {
  public readonly projectId: string;

  /**
   * Error code for unbound routes.
   *
   * @returns Stable error code for unbound logical project routes.
   */
  public get code(): 'UNBOUND_PROJECT_ROUTE' {
    return 'UNBOUND_PROJECT_ROUTE';
  }

  public constructor(projectId: string) {
    super(`Project route is not bound: ${projectId}`);
    this.name = 'UnboundProjectRouteError';
    this.projectId = projectId;
  }
}

/**
 * The `/node_modules` route is read-only to every consumer: declaration bytes
 * are installed by the typing feature through its own trusted rooted handle
 * (charter D15), never through an authority-global mutation.
 *
 * @param absolutePath - Canonical authority-global path.
 * @returns Whether the path lies on the read-only route.
 */
function isUnderNodeModulesRoute(absolutePath: string): boolean {
  return absolutePath === nodeModulesRoute || absolutePath.startsWith(`${nodeModulesRoute}/`);
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
  try {
    return resolveAuthorityPath(path) === path;
  } catch {
    return false;
  }
}

/**
 * Layer 3a UI-side workspace orchestrator.
 *
 * Composes routing and watch primitives with workspace-only concerns: in-memory file index for fast
 * search, cross-tab write coordination, multi-backend
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
  private readonly _mountTable: MountTable;
  private readonly _policy: PathPolicy | undefined;
  private _pendingSource: PendingObjectSource | undefined;
  private readonly _pendingStallMilliseconds: number | undefined;
  /* Told the live mount prefixes, an index never answers for a path behind a nested mount. */
  private readonly _projectIndexes: ProjectIndexes;
  private readonly _projectRoutes = new Set<string>();
  private readonly _checkoutRoutes = new Set<string>();
  private _projectConfigurationTail: Promise<void> = Promise.resolve();
  private _projectConfigurationFailed = false;
  private _discoveryRoots: readonly ResolvedDiscoveryRoot[] = [];
  /** Every root the last configuration named, in its order. */
  private _rootEntries: readonly ConfiguredRootEntry[] = [];
  /** The routes the last configuration staged, mounted or not. */
  private _stagedRoutes: {
    readonly projects: readonly StagedRouteMount[];
    readonly checkouts: readonly StagedRouteMount[];
  } = { projects: [], checkouts: [] };
  private readonly _rootStatusListeners = new Set<(roots: readonly RootStatus[]) => void>();
  private _publishedRootFingerprint = '[]';
  private readonly _pipeline: MutationPipeline;
  private readonly _rootedViews: RootedViews;
  private readonly _projectDirectories: ProjectDirectories;
  private readonly _externalChanges: ExternalChangeIngest;
  private readonly _remoteChanges: RemoteChanges;

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
    /** Mount table for multi-backend path routing. */
    mountTable: MountTable;
    /**
     * The reserved layout an unrouted archive masks with, injected by the host
     * and never imported here (D6). Without one nothing is masked, which is what
     * a workspace with no reserved layout means.
     */
    policy?: PathPolicy;
    /** How long a read of a pending entry waits for its object; see {@link pendingStallMilliseconds}. */
    pendingStallMilliseconds?: number;
  }) {
    this._registry = options.providerRegistry;
    this._pendingStallMilliseconds = options.pendingStallMilliseconds;
    this._resourceQueue = options.resourceQueue;
    this._eventBus = options.eventBus;
    // Kernels deduplicate by content hash, so a lone edit is delivered at once and only the burst behind it waits.
    this._watchRegistry = new WatchRegistry(options.eventBus, {
      coalescingWindow: kernelCoalescingWindow,
      leadingEdge: true,
    });
    this._crossTabCoordinator = options.crossTabCoordinator ?? new CrossTabCoordinator();
    this._mountTable = options.mountTable;
    this._policy = options.policy;
    const coordinator = this._crossTabCoordinator;
    this._projectIndexes = new ProjectIndexes({
      mountPrefixes: () => this._mountTable.prefixes,
      resolve: (root) => this._indexRoot(root),
      policy: options.policy,
      tab: () => ({ tabId: coordinator.tabId, seq: coordinator.seq }),
    });
    this._pipeline = new MutationPipeline({
      mountTable: this._mountTable,
      resourceQueue: this._resourceQueue,
      eventBus: this._eventBus,
      crossTabCoordinator: this._crossTabCoordinator,
      projectIndexes: this._projectIndexes,
    });
    this._rootedViews = new RootedViews({
      mountTable: this._mountTable,
      pipeline: this._pipeline,
      watchRegistry: this._watchRegistry,
      projectIndexes: this._projectIndexes,
      pendingSource: () => this._pendingSource,
      ...(options.pendingStallMilliseconds === undefined
        ? {}
        : { pendingStallMilliseconds: options.pendingStallMilliseconds }),
    });
    this._projectDirectories = new ProjectDirectories({
      registry: this._registry,
      resourceQueue: this._resourceQueue,
      crossTabCoordinator: this._crossTabCoordinator,
      pipeline: this._pipeline,
      projectIndexes: this._projectIndexes,
      discoveryRoots: () => this._discoveryRoots,
      /* A non-Home root reads `pending` until its admission settles: discovery
       * never resolves the provider of a root still under its deadline (D1). */
      rootState: (storageRootKey) => {
        const state = this._externalChanges.rootState(storageRootKey);
        if (
          storageRootKey === this._discoveryRoots[0]?.storageRootKey ||
          (state !== undefined && state !== 'available')
        ) {
          return state;
        }
        return this._externalChanges.isProbePending(storageRootKey) ? 'pending' : (state ?? 'pending');
      },
      revokeProjectRoute: (path, notifyPeers) => {
        this._revokeProjectRoute(path, notifyPeers);
      },
    });
    this._externalChanges = new ExternalChangeIngest({
      registry: this._registry,
      mountTable: this._mountTable,
      pipeline: this._pipeline,
      crossTabCoordinator: this._crossTabCoordinator,
      projectIndexes: this._projectIndexes,
      policy: options.policy,
      disposeStorageRoot: (storageRootKey) => {
        this.disposeStorageRoot(storageRootKey);
      },
      /* A root admitted after its deadline attaches itself: its routes mount
       * and the new statuses are published (blueprint D1). */
      onRootStatusChange: () => {
        // async-iife: bootstrap -- a late admission arrives on the ingest's own settlement, not a caller's.
        void this._enqueueTopologyFollowUp(async () => this._attachLateRoots());
      },
    });
    this._remoteChanges = new RemoteChanges({
      registry: this._registry,
      mountTable: this._mountTable,
      pipeline: this._pipeline,
      projectIndexes: this._projectIndexes,
      watchRegistry: this._watchRegistry,
      discoveryRoots: () => this._discoveryRoots,
      revokeProjectRoute: (path, notifyPeers) => {
        this._revokeProjectRoute(path, notifyPeers);
      },
    });
    this._crossTabCoordinator.onRemoteChange((notification) => {
      this._remoteChanges.apply(notification);
    });
    // A root that undid a crashed realm's creates as it opened publishes the
    // removals like any other change (I1).
    this._registry.setRecoveryListener((storageRootKey, providerPaths) => {
      const backend: FileSystemBackend = storageRootKey.startsWith('webaccess:') ? 'webaccess' : 'opfs';
      this._pipeline.publishRecoveredRemovals(storageRootKey, backend, providerPaths);
    });
  }

  /**
   * Capture one exact mount selected by trusted composition as a fully
   * writable filesystem whose entire visible namespace has root `''`.
   *
   * @param authorityRoot - Exact authority-global mount path to capture.
   * @param mutationContext - Optional origin metadata for echo suppression.
   * @param options - `placeholders: 'raw'` for the revision layer alone, which reads large-object pointers as they are.
   * @returns A writable filesystem whose root is the captured mount.
   */
  public createRootedFileSystem(
    authorityRoot: string,
    mutationContext?: WorkspaceMutationContext,
    options?: Readonly<{ placeholders?: 'raw' }>,
  ): RootedFileSystem {
    return this._rootedViews.create(authorityRoot, mutationContext, options);
  }

  /**
   * Say where a read of a pending entry gets its large object (D9): the
   * revision layer's store, fetching by oid on demand. Without one, every
   * such read refuses with `PENDING`.
   *
   * @param source - The host's source, or `undefined` to remove it.
   */
  public setPendingObjectSource(source: PendingObjectSource | undefined): void {
    this._pendingSource = source;
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

    const canonicalPath = resolveAuthorityPath(filepath);
    const { provider, path: resolvedPath } = await this._resolve(canonicalPath, { scope: optionsObject?.scope });
    const encoding = options === 'utf8' || optionsObject?.encoding === 'utf8' ? 'utf8' : undefined;

    const data = await this._readThrough(canonicalPath, { provider, path: resolvedPath }, optionsObject);
    return encoding === 'utf8' ? new TextDecoder().decode(data) : data;
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
    validateFileReadStreamOptions(options);
    if (options?.signal?.aborted) {
      throw new DOMException('The operation was aborted.', 'AbortError');
    }

    const canonicalPath = resolveAuthorityPath(filepath);
    const { provider, path: resolvedPath } = this._resolveProvider(canonicalPath);

    /* A file small enough to be a pointer is read whole, so a pending entry streams its object (D9). */
    let size: number | undefined;
    try {
      ({ size } = await provider.stat(resolvedPath));
    } catch {
      size = undefined;
    }
    if (size !== undefined && size <= 1024) {
      return bufferToStream(await this._readThrough(canonicalPath, { provider, path: resolvedPath }, options), options);
    }

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
    return this._asMarked(path, await provider.stat(resolvedPath), async () => provider.readFile(resolvedPath));
  }

  /**
   * Get file or directory metadata without following symlinks.
   *
   * @param path - Absolute path.
   * @returns Stat information (type, size, mtime).
   */
  public async lstat(path: string): Promise<FileStat> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    return this._asMarked(path, await provider.lstat(resolvedPath), async () => provider.readFile(resolvedPath));
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

  // --- Write operations (serialized by logical and physical conflict paths) ---

  /**
   * Write data to a file, creating parent directories as needed.
   * Serialized through the logical and physical conflict paths owned by the mutation.
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
    const canonicalPath = resolveAuthorityPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    const ownedData = typeof data === 'string' ? data : new Uint8Array(data);
    return this._pipeline.writeFileResolved({ path: canonicalPath, resolution, data: ownedData, context });
  }

  /** Check current bytes and replace one file inside the canonical mutation fence. */
  public async writeFileChecked(
    input: AuthorityCheckedFileWrite,
    context?: WorkspaceMutationContext,
  ): Promise<CheckedFileWriteResult> {
    const path = resolveAuthorityPath(input.path);
    this._assertGenericMutationPath(path);
    const resolution = this._resolveProvider(path);
    const preconditions = input.preconditions.map((precondition) => {
      const preconditionPath = resolveAuthorityPath(precondition.path);
      this._assertGenericMutationPath(preconditionPath);
      return { ...precondition, path: preconditionPath, resolution: this._resolveProvider(preconditionPath) };
    });
    return this._pipeline.writeFileCheckedResolved({
      path,
      resolution,
      data: input.data,
      preconditions,
      signal: input.signal,
      context,
    });
  }

  /** Check current bytes and delete one file inside the canonical mutation fence. */
  public async deleteFileChecked(
    input: { path: string; preconditions: readonly FileWritePrecondition[]; signal?: AbortSignal },
    context?: WorkspaceMutationContext,
  ): Promise<CheckedFileWriteResult> {
    const path = resolveAuthorityPath(input.path);
    this._assertGenericMutationPath(path);
    const resolution = this._resolveProvider(path);
    const preconditions = input.preconditions.map((precondition) => {
      const preconditionPath = resolveAuthorityPath(precondition.path);
      this._assertGenericMutationPath(preconditionPath);
      return { ...precondition, path: preconditionPath, resolution: this._resolveProvider(preconditionPath) };
    });
    return this._pipeline.deleteFileCheckedResolved({ path, resolution, preconditions, signal: input.signal, context });
  }

  /**
   * Append data to a file through the selected provider, creating the file and
   * missing parents when absent. Mutations share the canonical write locks.
   */
  public async appendFile(
    path: string,
    data: Uint8Array<ArrayBuffer> | string,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    const canonicalPath = resolveAuthorityPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    const ownedData = typeof data === 'string' ? data : new Uint8Array(data);
    return this._pipeline.appendFileResolved({ path: canonicalPath, resolution, data: ownedData, context });
  }

  /**
   * Write multiple files through the canonical mutation path.
   *
   * The rooted surface serves the same batch over root-relative paths
   * (charter D4); this authority-global spelling stays until W12 migrates the
   * cross-root writers.
   *
   * @param files - Map of absolute path to content.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when all writes complete.
   */
  public async writeFiles(
    files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    return this._pipeline.writeFiles(
      Object.entries(files).map(([path, file]) => {
        const canonicalPath = resolveAuthorityPath(path);
        this._assertGenericMutationPath(canonicalPath);
        return {
          path: canonicalPath,
          resolution: this._resolveProvider(canonicalPath),
          content: typeof file.content === 'string' ? file.content : new Uint8Array(file.content),
        };
      }),
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
    const canonicalPath = resolveAuthorityPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    return this._pipeline.mkdirResolved({ path: canonicalPath, resolution, options, context });
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
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns The {@link FileStat} of the resulting entry at `target`.
   */
  public async move(source: string, target: string, context?: WorkspaceMutationContext): Promise<FileStat> {
    const canonicalSource = resolveAuthorityPath(source);
    const canonicalTarget = resolveAuthorityPath(target);
    this._assertGenericMutationPath(canonicalSource, canonicalTarget);
    this._assertGenericMutationPath(canonicalTarget, canonicalSource);
    const sourceResolution = this._resolveProvider(canonicalSource);
    const targetResolution = this._resolveProvider(canonicalTarget);
    return this._pipeline.moveResolved({
      source: canonicalSource,
      target: canonicalTarget,
      sourceResolution,
      targetResolution,
      context,
    });
  }

  /**
   * Delete a mount-routed file.
   *
   * @param path - Absolute file path.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the file is deleted.
   */
  public async unlink(path: string, context?: WorkspaceMutationContext): Promise<void> {
    const canonicalPath = resolveAuthorityPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    return this._pipeline.unlinkResolved({
      path: canonicalPath,
      resolution,
      context,
    });
  }

  /**
   * Remove a mount-routed directory. Pass `{ recursive: true }` to recursively remove a subtree.
   * Mount-routed recursive removal is allowed only when the subtree does
   * not contain another mount point; crossing mount boundaries would make
   * a single delete affect multiple providers.
   *
   * @param path    - Absolute directory path.
   * @param options - Optional recursive removal flag.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when the directory is removed.
   */
  public async rmdir(
    path: string,
    options?: { recursive?: boolean },
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    const canonicalPath = resolveAuthorityPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    return this._pipeline.rmdirResolved({
      path: canonicalPath,
      resolution,
      options,
      context,
    });
  }

  // --- Sequential bulk move ---

  /**
   * Move many paths sequentially and report every completed and failed edit.
   * Completed edits are never rolled back over newer peer data.
   *
   * The rooted surface serves the same sequence over root-relative paths
   * (charter D4); this spelling stays until W12 migrates the Files pane.
   *
   * @param edits - Source → target pairs.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns The {@link BulkMoveResult} describing successes + the failure (if any).
   */
  public async bulkMove(edits: readonly BulkMoveEdit[], context?: WorkspaceMutationContext): Promise<BulkMoveResult> {
    const resolved = [];
    const failures = new Map<BulkMoveEdit, BulkMoveResult['failed'][number]>();
    for (const edit of edits) {
      try {
        const source = resolveAuthorityPath(edit.source);
        const target = resolveAuthorityPath(edit.target);
        this._assertGenericMutationPath(source, target);
        this._assertGenericMutationPath(target, source);
        resolved.push({
          edit,
          source,
          target,
          sourceResolution: this._resolveProvider(source),
          targetResolution: this._resolveProvider(target),
        });
      } catch (error) {
        failures.set(edit, { edit, error: causeToMutationError(error, edit.source, edit.target) });
      }
    }
    const result = await this._pipeline.bulkMove(resolved, context);
    for (const failure of result.failed) {
      failures.set(failure.edit, failure);
    }
    return { moved: result.moved, failed: edits.flatMap((edit) => failures.get(edit) ?? []) };
  }

  /*
   * --- Preflight checks (R6) ---
   *
   * The rooted surface answers the same four over root-relative paths, with the
   * view refusing a masked operand before the probe (charter D4). These
   * authority-global spellings stay until W12 migrates the explorer.
   */

  /**
   * Preflight {@link move}: verifies the source exists, the target does
   * not exist, and that neither endpoint sits on a read-only mount.
   *
   * Returns `true` when the move is safe to issue; otherwise returns a
   * structured {@link WorkspaceMutationError} so the caller can route
   * `code` to a copy registry without parsing message strings.
   *
   * @param source - Current absolute path.
   * @param target - Proposed destination absolute path.
   * @returns `true` on success or a {@link WorkspaceMutationError}.
   */
  public async canMove(source: string, target: string): Promise<true | WorkspaceMutationError> {
    if (!isStructurallyValidWorkspacePath(source)) {
      return new WorkspaceMutationError('INVALID_NAME', source);
    }
    if (!isStructurallyValidWorkspacePath(target)) {
      return new WorkspaceMutationError('INVALID_NAME', target);
    }
    if (isUnderNodeModulesRoute(source) || isUnderNodeModulesRoute(target)) {
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
    if (isUnderNodeModulesRoute(path)) {
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
   * and does not sit on the read-only `/node_modules` route.
   *
   * @param path - Absolute path to remove.
   * @returns `true` on success or a {@link WorkspaceMutationError}.
   */
  public async canDelete(path: string): Promise<true | WorkspaceMutationError> {
    if (!isStructurallyValidWorkspacePath(path)) {
      return new WorkspaceMutationError('INVALID_NAME', path);
    }
    if (isUnderNodeModulesRoute(path)) {
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

  /*
   * No `duplicateFile` and no `copyDirectory` (charter D4, W12d). Both walked or
   * wrote a project tree unmasked, which is what W0 pin (d) recorded; the
   * gestures a consumer reaches are `duplicate` and `copyTree` on the rooted
   * surface, where the composed view above supplies the entry filter before any
   * provider I/O. Their last consumers went with the client wave.
   */

  /**
   * Package a directory's contents into a ZIP blob, from the standalone
   * provider for an explicit workspace scope.
   *
   * This is the `/files` workspace browser's folder download: a physical
   * directory the mount table does not route, so no composed view exists to
   * serve it. Every archive that *is* routed — the whole-project export and the
   * Files pane's folder download — is served by `archive` on the rooted surface
   * instead, where the mask comes with the view (charter D2, W12).
   *
   * With no view, the registry supplies the mask directly, and it reaches
   * exactly as far as PP3 does: a control-plane row matches its folded segment
   * at any depth, so a workspace folder holding a project packs neither its
   * `.git` nor its `.tau/binding.json`. Root-matched rows (`.tau/chats`,
   * `exports`, `thumbnail.webp`) are PP4's and stay in the archive — the browser
   * does not know where each nested project's root sits, so it cannot rebase
   * them.
   *
   * @param path    - Absolute directory path.
   * @param options - The `{ scope }` discriminator (a routed path has a view to
   *   serve it instead), and the caller's byte ceiling, when it wants one.
   * @returns ZIP archive as a `Blob`.
   */
  public async getZippedDirectory(path: string, options: { scope: WorkspaceScope; maxBytes?: number }): Promise<Blob> {
    const { provider, path: resolvedPath } = await this._resolve(path, options);
    return archive(provider, resolvedPath, {
      admits: (relativePath) => this._policy?.classify(relativePath).agentAccess !== 'hidden',
      ...(options.maxBytes === undefined ? {} : { maxBytes: options.maxBytes }),
    });
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
      /* A tree row needs a name, a size and a kind, never a line count (I3). */
      const statsEntries = await provider.readdirWithStats(resolvedPath);
      for (const entry of statsEntries) {
        if (entry.type === 'dir') {
          entryMap.set(entry.name, {
            name: entry.name,
            type: 'dir',
            size: entry.size,
            mtimeMs: entry.mtimeMs,
          });
        } else {
          entryMap.set(entry.name, {
            name: entry.name,
            type: 'file',
            size: entry.size,
            mtimeMs: entry.mtimeMs,
            ...fileMetadataFields(entry),
          });
        }
      }
    } else {
      const entries = await provider.readdir(resolvedPath);
      for (const entry of entries) {
        const fullPath = joinRelativePath(resolvedPath, entry);
        try {
          // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for tree building
          const stat = await provider.stat(fullPath);
          if (stat.type === 'dir') {
            entryMap.set(entry, {
              name: entry,
              type: 'dir',
              size: stat.size,
              mtimeMs: stat.mtimeMs,
            });
          } else {
            entryMap.set(entry, {
              name: entry,
              type: 'file',
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              ...fileMetadataFields(stat),
            });
          }
        } catch {
          // Skip entries that can't be stat'd (deleted between readdir and stat)
        }
      }
    }

    const childMounts = this._mountTable.getMountsUnder(path);
    for (const mount of childMounts) {
      const mountName = mount.prefix.split('/').pop();
      if (mountName && !entryMap.has(mountName)) {
        entryMap.set(mountName, { name: mountName, type: 'dir', size: 0, mtimeMs: 0 });
      }
    }

    return this._treeEntriesToNodes(entryMap);
  }

  /*
   * No `getDirectoryStat` and no `searchFiles` (charter D3, W12d). Both answered
   * from the per-root index with nothing masking the rows on the way out; a
   * consumer reaches the same index through `statTree` and `search` on the
   * rooted surface, where the composed view applies its policy before the
   * descent. The index itself stays — {@link WorkspaceFileService.createRootedFileSystem}
   * opens it through `ProjectIndexes.ready` and every mutation still feeds it.
   */

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
    if (options?.scope !== undefined && !isDurableScope(options.scope)) {
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
          nodes.push({
            id: fullPath,
            name: entry.name,
            size: entry.size,
            mtimeMs: entry.mtimeMs,
            ...fileMetadataFields(entry),
          });
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
   * @param request - paths, recursive, includes/excludes, and filter
   * @param handler - callback for matching WatchEvents
   * @returns unsubscribe function
   */
  public watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void {
    return this._watchRegistry.watch(request, handler);
  }

  /**
   * Safety-reconcile one routed project, or every configured webaccess root when
   * omitted, then run the head-metadata compare of the warm Project Indexes it
   * covers whose roots other programs edit (D5): that project's, or every one.
   *
   * @param root - Optional routed project root.
   * @returns `true` when every root this call covered is under live `FileSystemObserver`
   *          delivery, which lets the caller poll on a slow safety-net cadence instead.
   */
  public async pollExternalChanges(root?: string): Promise<boolean> {
    const nativelyObserved = await this._externalChanges.poll(root);
    /* The same moments — a poll, a tab regaining visibility — compare the warm
     * Project Indexes of the roots other programs edit (D5); a root only Tau
     * writes learns every change from its own hooks and is never compared here. */
    await this._projectIndexes.compareExternallyEdited(root);
    return nativelyObserved;
  }

  // --- Backend management ---

  /**
   * Replace logical project routes and physical discovery roots.
   *
   * Home, `roots[0]`, is the one required root. Every other root settles on its
   * own into a {@link RootStatus}, and every invalid entry is skipped and
   * reported, so a lost folder never fails the call (blueprint D1).
   *
   * @param configuration - Complete next authority topology.
   * @returns One status per configured root and every skipped entry, once the topology is installed in invocation order.
   * @throws Error with code `HOME_ROOT_UNAVAILABLE` when `roots[0]` cannot be staged or admitted.
   */
  public async configureProjectRoots(configuration: ProjectRootConfiguration): Promise<ProjectRootConfigurationResult> {
    return this._enqueueTopology(async () => this._configureProjectRoots(configuration));
  }

  /**
   * The published status of each configured root, in configuration order.
   *
   * @returns One status per configured root.
   */
  public async getRootStatuses(): Promise<RootStatus[]> {
    return this._publishedRootStatuses();
  }

  /**
   * Probe again every root that is `notFound`, `permission` or `unreachable`
   * and has no probe pending; a root that became available mounts its routes.
   *
   * @param storageRootKeys - Limit the re-check to these roots; every eligible root when omitted.
   * @returns The status of each configured root, in configuration order.
   */
  public async recheckRoots(storageRootKeys?: string[]): Promise<RootStatus[]> {
    return this._enqueueTopology(async () => {
      await this._externalChanges.recheckRoots(storageRootKeys);
      await this._mountAvailableRoutes();
      this._publishRootStatusesIfChanged();
      return this._publishedRootStatuses();
    });
  }

  /**
   * Subscribe to root-status changes: each delivery is the full list, after a
   * configuration, a re-check or a late admission changed it.
   *
   * @param handler - Receives every configured root's status.
   * @returns Unsubscribe function.
   */
  public onRootStatusChange(handler: (roots: readonly RootStatus[]) => void): () => void {
    this._rootStatusListeners.add(handler);
    return () => {
      this._rootStatusListeners.delete(handler);
    };
  }

  /**
   * Verify only the current exact project binding, without scanning or repairing storage.
   * @param input - Durable project identity to verify.
   * @returns A verified project, discovery fallback, unavailable storage, or superseded authority.
   */
  public async verifyProjectRoute(input: { projectId: string }): Promise<ProjectRouteVerification> {
    if (!projectIdSchema.safeParse(input.projectId).success) {
      return { status: 'discovery-required' };
    }
    const configuration = this._projectConfigurationTail;
    await configuration;
    if (configuration !== this._projectConfigurationTail) {
      return { status: 'superseded' };
    }
    if (this._projectConfigurationFailed) {
      return { status: 'unavailable' };
    }
    const route = projectRoute(input.projectId);
    const mount = this._mountTable.getExactMount(route);
    if (!this._projectRoutes.has(route) || mount?.kind !== 'project' || mount.storageRootKey === undefined) {
      return { status: 'discovery-required' };
    }
    const result = await this._projectDirectories.verifyProjectRoute({
      projectId: input.projectId,
      provider: mount.provider,
      directory: mount.providerBasePath,
      storageRootKey: mount.storageRootKey,
    });
    return configuration === this._projectConfigurationTail && this._mountTable.getExactMount(route) === mount
      ? result
      : { status: 'superseded' };
  }

  /**
   * Discover physical project manifests. A project is any immediate child
   * directory of a configured root carrying `tau.json`; dot-prefixed children
   * hold app state and are never scanned.
   *
   * @returns Manifests and per-root completeness from the configured physical roots.
   */
  public async listProjectManifests(): Promise<ProjectDiscoveryResult> {
    return this._projectDirectories.listProjectManifests();
  }

  /**
   * Give an `adoption-required` project directory a Tau identity in place.
   *
   * @param locator - Discovery locator of the directory to adopt.
   * @param options - `id` restores the identity this directory's route was bound to.
   * @returns The manifest now on disk, identity included.
   */
  /* The return type is the lifecycle's own: this class no longer names the
   * product's manifest (boundary rule `project-manifest`). */
  public async adoptProjectDirectory(
    locator: ProjectLocator,
    options?: { readonly id?: string },
  ): ReturnType<ProjectDirectories['adoptProjectDirectory']> {
    return this._projectDirectories.adoptProjectDirectory(locator, options);
  }

  /**
   * Permanently remove one exact physical project directory.
   *
   * @param input - Exact project identity, physical path, and storage scope.
   * @returns Identity-safe deletion outcome.
   */
  public async permanentlyDeleteProjectDirectory(
    input: PermanentDeleteProjectDirectoryInput,
  ): Promise<PermanentDeleteProjectDirectoryResult> {
    return this._projectDirectories.permanentlyDeleteProjectDirectory(input);
  }

  /**
   * Commit one durable pending-operation snapshot to its exact physical
   * project directory.
   *
   * @param input - Owned journal snapshot and exact target locator.
   * @param context - Optional mutation origin metadata.
   * @returns Replay-safe commit outcome.
   */
  public async commitPendingProjectDirectory(
    input: CommitPendingProjectDirectoryInput,
    context?: WorkspaceMutationContext,
  ): Promise<CommitPendingProjectDirectoryResult> {
    return this._projectDirectories.commitPendingProjectDirectory(input, context);
  }

  /**
   * Where an import stages on one durable storage root (in process only: the
   * import runs in the authority, so no wire carries this).
   *
   * @param scope - A durable storage root.
   * @returns The staging port.
   */
  public async importStaging(scope: StorageRootConfig): Promise<ImportStagingPort> {
    return this._projectDirectories.importStaging(scope);
  }

  /**
   * The sources a person chose on the host for an import (W7.4): on desktop,
   * the node host's, which list and preview them by grant; elsewhere none.
   *
   * @returns The host's import sources, or `undefined`.
   */
  public async importSources(): Promise<HostImportSourcePort | undefined> {
    return this._registry.importSources();
  }

  /**
   * Install one admitted ephemeral preview mount or the boot-owned
   * `/node_modules` mount. Project routes are configured only through
   * {@link configureProjectRoots}; `/` is installed directly by composition.
   *
   * @param prefix - `/previews/<instance>` or `/node_modules`.
   * @param config - Discriminated mount configuration.
   */
  public async mount(prefix: string, config: MountConfig): Promise<void> {
    const canonicalPrefix = resolveAuthorityPath(prefix);
    if (canonicalPrefix !== prefix) {
      throw new TypeError(`Dynamic mount prefix must already be canonical: ${prefix}`);
    }
    const previewInstance = this._previewInstance(canonicalPrefix);
    if (previewInstance === undefined && canonicalPrefix !== nodeModulesRoute) {
      throw new TypeError(`Dynamic mount prefix is not admitted: ${prefix}`);
    }
    if (!matchesProtectedMountScope(config, previewInstance)) {
      throw new TypeError(`Dynamic mount configuration does not match its protected prefix: ${prefix}`);
    }
    const providerBasePath = assertRootedPath(config.providerBasePath ?? '');
    if (providerBasePath !== (config.providerBasePath ?? '')) {
      throw new TypeError(`Dynamic provider path must already be canonical: ${config.providerBasePath}`);
    }
    const scope = toScope(config);
    const provider = await this._registry.getProvider(scope);
    const storageRootKey = this._registry.resolveStorageRootKey(scope);
    const existing = this._mountTable.getExactMount(canonicalPrefix);
    if (
      existing?.provider === provider &&
      existing.backend === config.backend &&
      existing.storageRootKey === storageRootKey &&
      existing.providerBasePath === providerBasePath
    ) {
      return;
    }
    this._mountTable.mount(canonicalPrefix, provider, {
      backend: config.backend,
      storageRootKey,
      providerBasePath,
      class: config.class,
    });
    this._resetTopologyState([canonicalPrefix]);
  }

  /**
   * Remove a dynamic mount. Providers remain owned by the registry so sibling
   * routes to the same physical root remain live.
   * Subsequent reads under the prefix fall through to whichever broader
   * mount covers the path (typically the root mount), matching POSIX-like
   * `umount` semantics.
   *
   * @param prefix - The mount prefix to remove.
   */
  public unmount(prefix: string): void {
    const canonicalPrefix = resolveAuthorityPath(prefix);
    if (
      canonicalPrefix !== prefix ||
      (this._previewInstance(canonicalPrefix) === undefined && canonicalPrefix !== nodeModulesRoute)
    ) {
      throw new TypeError(`Dynamic mount prefix is not admitted: ${prefix}`);
    }
    if (this._mountTable.getExactMount(canonicalPrefix) === undefined) {
      return;
    }
    this._mountTable.unmount(canonicalPrefix);
    this._projectRoutes.delete(canonicalPrefix);
    this._resetTopologyState([canonicalPrefix]);
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
   * @param storageRootKey - Stable physical storage-root identity to dispose.
   */
  public disposeStorageRoot(storageRootKey: string): void {
    this._externalChanges.disconnectRoot(storageRootKey);
    const changed: string[] = [];
    for (const mount of this._mountTable.listMounts()) {
      if (mount.storageRootKey === storageRootKey) {
        this._mountTable.unmount(mount.prefix);
        this._projectRoutes.delete(mount.prefix);
        changed.push(mount.prefix);
      }
    }
    const retainedDiscoveryRoots = this._discoveryRoots.filter((root) => root.storageRootKey !== storageRootKey);
    if (retainedDiscoveryRoots.length !== this._discoveryRoots.length) {
      this._discoveryRoots = retainedDiscoveryRoots;
      /* A discovery root reaches the index only through the routes above, but
       * which of them is the dropped root's business, not this method's: evict
       * from the authority root, which covers every index there is. */
      changed.push('/');
    }
    if (changed.length > 0) {
      this._resetTopologyState(changed);
    }
    this._registry.disposeRoot(storageRootKey);
  }

  /**
   * Release all resources, as {@link WorkspaceFileService.dispose} does, then
   * wait until nothing this service began can still write to a root.
   *
   * A Project Index snapshot write in flight stops at its next await before the
   * disk, or finishes if it is past it. Await this, not `dispose`, before
   * removing or moving a root this service served: on Windows a write that
   * lands in `.tau/index` during the removal fails it with `ENOTEMPTY`.
   *
   * @returns Once no snapshot write this service began is still running.
   */
  public async close(): Promise<void> {
    this.dispose();
    await this._projectIndexes.close();
  }

  /** Release all resources: watches, providers, caches, and event bus. */
  public dispose(): void {
    this._projectDirectories.dispose();
    this._externalChanges.dispose();
    this._projectIndexes.dispose();
    this._projectRoutes.clear();
    this._discoveryRoots = [];
    this._mountTable.dispose();
    this._watchRegistry.emitResetAll();
    this._crossTabCoordinator.dispose();
    this._watchRegistry.dispose();
    this._registry.disposeAll();
    this._eventBus.dispose();
  }

  /* A row as a rooted view's stat answers it: settled as its mount's marks say, a pending entry as its object (D9). */
  private async _asMarked(
    path: string,
    row: FileStat,
    read: () => Promise<Uint8Array<ArrayBuffer>>,
  ): Promise<FileStat> {
    if (row.type !== 'file') {
      return row;
    }
    const canonicalPath = resolveAuthorityPath(path);
    const root = this._mountTable.resolve(canonicalPath).entry?.prefix ?? canonicalPath;
    return asMarkedRow(
      row,
      await this._projectIndexes.settleMarks({
        root,
        authorityPath: canonicalPath,
        size: row.size,
        mtimeMs: row.mtimeMs,
        bytes: async () => read().catch(() => undefined),
      }),
    );
  }

  /**
   * Read one file's bytes, through to its object when it is a pending entry (D9), as a rooted view reads it (see
   * `readAsMarked`).
   *
   * @param canonicalPath - Absolute authority path.
   * @param resolved - The provider and path it resolves to.
   * @param options - The caller's cancellation and the scope it read under.
   * @returns The bytes the path stands for.
   */
  private async _readThrough(
    canonicalPath: string,
    resolved: Readonly<{ provider: FileSystemProvider; path: string }>,
    options?: Readonly<{ signal?: AbortSignal | undefined; scope?: WorkspaceScope | undefined }>,
  ): Promise<Uint8Array<ArrayBuffer>> {
    const bytes = await resolved.provider.readFile(resolved.path);
    /* The source answers by mount, as a rooted view's read asks it. */
    const root = options?.scope === undefined ? this._mountTable.resolve(canonicalPath).entry?.prefix : undefined;
    const local = root === undefined ? canonicalPath : canonicalPath.slice(root === '/' ? 1 : root.length + 1);
    return readAsMarked(this._projectIndexes, this._pendingSource, {
      authorityPath: canonicalPath,
      root: root ?? canonicalPath,
      path: local,
      bytes,
      mtimeMs: async () => {
        try {
          const head = await resolved.provider.stat(resolved.path);
          return head.mtimeMs;
        } catch {
          return undefined;
        }
      },
      signal: options?.signal,
      stallMilliseconds: this._pendingStallMilliseconds,
    });
  }

  /** Run one topology change after every earlier one, keeping the queue live after a rejection. */
  /**
   * Run topology work that follows a configuration, such as a late admission
   * attaching its routes, in the same order as configurations, so it never
   * acts on a staged topology another configuration is replacing. It leaves
   * the last configuration's outcome as it was, and never rejects.
   */
  private async _enqueueTopologyFollowUp(operation: () => Promise<void>): Promise<void> {
    const predecessor = this._projectConfigurationTail;
    const applyInOrder = async (): Promise<void> => {
      await predecessor;
      try {
        await operation();
      } catch (error) {
        console.error('[filesystem] Attaching a late root failed.', error);
      }
    };
    const scheduled = applyInOrder();
    this._projectConfigurationTail = scheduled;
    return scheduled;
  }

  private async _enqueueTopology<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this._projectConfigurationTail;
    const applyInOrder = async (): Promise<T> => {
      await predecessor;
      return operation();
    };
    const scheduled = applyInOrder();
    const settle = async (): Promise<void> => {
      try {
        await scheduled;
        this._projectConfigurationFailed = false;
      } catch {
        this._projectConfigurationFailed = true;
        // Keep the configuration queue live after a rejected predecessor.
      }
    };
    this._projectConfigurationTail = settle();
    return scheduled;
  }

  private async _configureProjectRoots(
    configuration: ProjectRootConfiguration,
  ): Promise<ProjectRootConfigurationResult> {
    const skipped: SkippedConfigurationEntry[] = [];
    const { stagedRoots, webAccessRoots, rootEntries } = this._stageDiscoveryRoots(configuration.roots, skipped);
    /* Project and checkout routes share the physical-route set: two logical
     * routes may not name the same physical directory, whichever kind they are. */
    const pass: RouteStagingPass = { webAccessRoots, physicalRoutes: new Set<string>(), skipped };
    const stagedInputs = this._stageProjectRoutes(configuration.projects, pass);
    const stagedCheckoutInputs = this._stageCheckoutRoutes(configuration.checkouts ?? [], pass);

    await this._externalChanges.evictReplacedRoots(stagedRoots);

    /* Home's routes, and the routes of roots already admitted, install before
     * the roots settle, so they answer while the other roots are admitted. Any
     * other route waits for its root's admission, which runs under the
     * deadline: no provider of a root still being admitted is awaited here, so
     * one that never settles cannot hold Home (D1). Its provider outcome is
     * still recorded, to name a route skipped for it. */
    const providerFailures = new Set<string>();
    /* Roots after Home are the ones admitted under the deadline; a route on a
     * storage root no discovery root names has no admission to wait for. */
    const admittedLater = new Set(stagedRoots.slice(1).map((root) => root.storageRootKey));
    const installsNow = (entry: StagedRouteMount): boolean =>
      !admittedLater.has(entry.storageRootKey) ||
      (this._externalChanges.rootState(entry.storageRootKey) === 'available' &&
        !this._externalChanges.isProbePending(entry.storageRootKey));
    const [immediateProjects, deferredProjects] = partition(stagedInputs, installsNow);
    const [immediateCheckouts, deferredCheckouts] = partition(stagedCheckoutInputs, installsNow);
    this._recordProviderFailures([...deferredProjects, ...deferredCheckouts], providerFailures);
    const projectInstall = await this._installRouteMounts(immediateProjects, providerFailures);
    const checkoutInstall = await this._installRouteMounts(immediateCheckouts, providerFailures);
    const changed = [
      ...projectInstall.changed,
      ...checkoutInstall.changed,
      ...this._adoptRoutes(this._projectRoutes, projectInstall.mounted),
      ...this._adoptRoutes(this._checkoutRoutes, checkoutInstall.mounted),
    ];
    if (
      this._discoveryRoots.length !== stagedRoots.length ||
      this._discoveryRoots.some((current, index) => {
        const next = stagedRoots[index];
        return next === undefined || current.storageRootKey !== next.storageRootKey;
      })
    ) {
      /* Same reason as `disposeStorageRoot`: a changed discovery-root set can
       * have moved any route's physical bytes, so no index is trustworthy. */
      changed.push('/');
    }
    this._discoveryRoots = stagedRoots;
    this._rootEntries = rootEntries;
    this._stagedRoutes = { projects: stagedInputs, checkouts: stagedCheckoutInputs };
    if (changed.length > 0) {
      this._resetTopologyState(changed);
    }
    await this._externalChanges.syncRoots(stagedRoots);
    await this._reconcileRouteMounts();
    for (const { kind, prefix, config, storageRootKey } of [...stagedInputs, ...stagedCheckoutInputs]) {
      const state = this._externalChanges.rootState(storageRootKey);
      if (this._projectRoutes.has(prefix) || this._checkoutRoutes.has(prefix)) {
        continue;
      }
      if (providerFailures.has(prefix)) {
        skipped.push(
          skippedRoute({ kind, reason: 'provider-unavailable', storageRootKey, projectId: config.projectId }),
        );
      } else if (state !== undefined && state !== 'available') {
        skipped.push(skippedRoute({ kind, reason: 'root-unavailable', storageRootKey, projectId: config.projectId }));
      }
    }
    const roots = this._publishedRootStatuses();
    this._publishRootStatusesIfChanged();
    const home = roots[0];
    if (home !== undefined && home.state !== 'available') {
      const cause = rootEntries[0]?.error ?? this._externalChanges.rootError(home.storageRootKey);
      throw homeRootUnavailable(cause);
    }
    return { roots, skipped };
  }

  /**
   * Stage the discovery roots one configuration names. A duplicate root, or one
   * that cannot be staged, is skipped with a status instead of failing the call;
   * Home, the first root, cannot be skipped.
   *
   * @param roots - Persisted discovery roots.
   * @param skipped - Skipped entries of this pass; extended in place.
   * @returns Staged roots in configuration order, the webaccess handle index, and every configured root's entry.
   */
  private _stageDiscoveryRoots(
    roots: ProjectRootConfiguration['roots'],
    skipped: SkippedConfigurationEntry[],
  ): {
    stagedRoots: StagedDiscoveryRoot[];
    webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>;
    rootEntries: ConfiguredRootEntry[];
  } {
    const physicalRoots = new Set<string>();
    const webAccessRoots = new Map<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>();
    const stagedRoots: StagedDiscoveryRoot[] = [];
    const rootEntries: ConfiguredRootEntry[] = [];
    for (const [index, root] of roots.entries()) {
      let scope: WorkspaceScope;
      let storageRootKey: string;
      try {
        scope = toScope(root);
        storageRootKey = this._registry.resolveStorageRootKey(scope);
      } catch (error) {
        if (index === 0) {
          throw homeRootUnavailable(error);
        }
        const key = 'workspaceId' in root ? `webaccess:${root.workspaceId}` : `${root.backend}:${String(index)}`;
        rootEntries.push({
          status: { storageRootKey: key, backend: root.backend, ...rootStateForError(error) },
          error,
        });
        continue;
      }
      if (physicalRoots.has(storageRootKey)) {
        skipped.push({ kind: 'root', reason: 'duplicate-root', storageRootKey });
        rootEntries.push({
          status: { storageRootKey, backend: root.backend, state: 'conflict', code: 'DUPLICATE_ROOT' },
        });
        continue;
      }
      physicalRoots.add(storageRootKey);
      if ('workspaceId' in root) {
        webAccessRoots.set(root.workspaceId, root);
      }
      stagedRoots.push({ root, scope, storageRootKey });
      rootEntries.push({ storageRootKey });
    }
    return { stagedRoots, webAccessRoots, rootEntries };
  }

  /**
   * Stage the project routes one configuration names, skipping each invalid one.
   *
   * @param projects - Persisted project routes.
   * @param pass - Webaccess handles, claimed physical routes and skipped entries of this pass.
   * @returns One staged mount per valid project route, in configuration order.
   */
  private _stageProjectRoutes(
    projects: ProjectRootConfiguration['projects'],
    pass: RouteStagingPass,
  ): StagedRouteMount[] {
    const { skipped } = pass;
    const stagedPrefixes = new Set<string>();
    const staged: StagedRouteMount[] = [];
    for (const config of projects) {
      const skip = (reason: SkippedConfigurationEntry['reason']): void => {
        skipped.push({ kind: 'project', reason, projectId: config.projectId });
      };
      if (!projectIdSchema.safeParse(config.projectId).success) {
        skip('invalid-project-id');
        continue;
      }
      const prefix = projectRoute(config.projectId);
      if (resolveAuthorityPath(prefix) !== prefix || stagedPrefixes.has(prefix)) {
        skip('duplicate-route');
        continue;
      }
      const providerBasePath = canonicalProviderPath(config.providerBasePath);
      if (providerBasePath === undefined || !isProjectDirectoryPath(providerBasePath)) {
        skip('non-canonical-path');
        continue;
      }
      stagedPrefixes.add(prefix);
      const entry = this._stageRouteMount({ prefix, config, providerBasePath, kind: 'project' }, pass);
      if (entry !== undefined) {
        staged.push(entry);
      }
    }
    return staged;
  }

  /**
   * Stage the linked-checkout routes one configuration names, skipping each invalid one.
   *
   * @param checkouts - Persisted checkout routes.
   * @param pass - Webaccess handles, claimed physical routes and skipped entries of this pass.
   * @returns One staged mount per valid checkout route, in configuration order.
   */
  private _stageCheckoutRoutes(checkouts: readonly CheckoutRootConfig[], pass: RouteStagingPass): StagedRouteMount[] {
    const { skipped } = pass;
    const stagedPrefixes = new Set<string>();
    const staged: StagedRouteMount[] = [];
    for (const config of checkouts) {
      const skip = (reason: SkippedConfigurationEntry['reason']): void => {
        skipped.push({ kind: 'checkout', reason });
      };
      /* `/checkouts/a/b` canonicalizes to itself, so a slashed id would install
       * a route nested under another checkout's prefix. */
      if (config.checkoutId.includes('/')) {
        skip('checkout-rule');
        continue;
      }
      const prefix = checkoutRoute(config.checkoutId);
      const canonicalPrefix = canonicalRoute(prefix);
      if (canonicalPrefix === undefined) {
        skip('checkout-rule');
        continue;
      }
      if (canonicalPrefix !== prefix || stagedPrefixes.has(prefix)) {
        skip('duplicate-route');
        continue;
      }
      const providerBasePath = canonicalProviderPath(config.providerBasePath);
      if (providerBasePath === undefined) {
        skip('non-canonical-path');
        continue;
      }
      /* A linked checkout lives in the workspace's host-private area, which is
       * exactly the dot-prefixed space project discovery never scans (D4). */
      if (!providerBasePath.startsWith('.tau/checkouts/')) {
        skip('checkout-rule');
        continue;
      }
      stagedPrefixes.add(prefix);
      const entry = this._stageRouteMount({ prefix, config, providerBasePath, kind: 'checkout' }, pass);
      if (entry !== undefined) {
        staged.push(entry);
      }
    }
    return staged;
  }

  /**
   * Resolve one staged route's storage scope and claim its physical route.
   *
   * @param route - Validated route prefix, configuration, provider directory and kind.
   * @param pass - Webaccess handles, claimed physical routes and skipped entries of this pass.
   * @returns The staged mount, or `undefined` when the route was skipped.
   */
  private _stageRouteMount(
    route: {
      readonly prefix: string;
      readonly config: ProjectRootConfig;
      readonly providerBasePath: string;
      readonly kind: 'project' | 'checkout';
    },
    pass: RouteStagingPass,
  ): StagedRouteMount | undefined {
    const { prefix, config, providerBasePath, kind } = route;
    const { webAccessRoots, physicalRoutes, skipped } = pass;
    const { projectId } = config;
    let scope: WorkspaceScope;
    let storageRootKey: string;
    try {
      scope = scopeForRouteConfig(config, webAccessRoots);
      storageRootKey = this._registry.resolveStorageRootKey(scope);
    } catch {
      skipped.push(skippedRoute({ kind, reason: 'root-unavailable', projectId }));
      return undefined;
    }
    const physicalRoute = `${storageRootKey}\0${providerBasePath}`;
    if (physicalRoutes.has(physicalRoute)) {
      skipped.push(skippedRoute({ kind, reason: 'duplicate-physical-route', storageRootKey, projectId }));
      return undefined;
    }
    physicalRoutes.add(physicalRoute);
    return { kind, prefix, config, scope, storageRootKey, providerBasePath };
  }

  /**
   * Install one staged route family, leaving a mount that already matches
   * untouched. Each provider settles on its own: a route whose provider
   * rejects is left unmounted and recorded, and the others still mount.
   *
   * A project route is the user's authored tree by definition, and a checkout
   * route is the same authored tree in another place (D4); the derived and
   * authority-metadata families inside either are named by the revision path
   * policy, not by a second mount (RC6 / S5 work 2).
   *
   * @param staged - Staged mounts for one route family.
   * @param providerFailures - Prefixes whose provider rejected; extended in place.
   * @returns The prefixes whose mount changed, and every prefix now mounted.
   */
  private async _installRouteMounts(
    staged: readonly StagedRouteMount[],
    providerFailures: Set<string>,
  ): Promise<{ changed: string[]; mounted: Set<string> }> {
    const resolved = await Promise.allSettled(staged.map(async (entry) => this._registry.getProvider(entry.scope)));
    const changed: string[] = [];
    const mounted = new Set<string>();
    for (const [index, outcome] of resolved.entries()) {
      const entry = staged[index]!;
      if (outcome.status === 'rejected') {
        providerFailures.add(entry.prefix);
        continue;
      }
      if (this._mountRoute(entry, outcome.value)) {
        changed.push(entry.prefix);
      }
      mounted.add(entry.prefix);
    }
    return { changed, mounted };
  }

  /**
   * Note, without waiting, the routes whose provider rejects: their roots are
   * admitted under the deadline, and a provider that never settles is never
   * awaited here.
   *
   * @param staged - Routes whose roots are still being admitted.
   * @param providerFailures - Prefixes whose provider rejected; extended in place when one does.
   */
  private _recordProviderFailures(staged: readonly StagedRouteMount[], providerFailures: Set<string>): void {
    for (const entry of staged) {
      const record = async (): Promise<void> => {
        try {
          await this._registry.getProvider(entry.scope);
        } catch {
          providerFailures.add(entry.prefix);
        }
      };
      // async-iife: bootstrap -- the configuration reads the outcome after its roots settle; it never waits on it.
      void record();
    }
  }

  /** Mount one staged route on its provider unless an identical mount is already there. */
  private _mountRoute(entry: StagedRouteMount, provider: FileSystemProvider): boolean {
    const { prefix, config, storageRootKey, providerBasePath } = entry;
    const existing = this._mountTable.getExactMount(prefix);
    if (
      existing?.provider === provider &&
      existing.backend === config.backend &&
      existing.storageRootKey === storageRootKey &&
      existing.providerBasePath === providerBasePath
    ) {
      return false;
    }
    this._mountTable.mount(prefix, provider, {
      backend: config.backend,
      storageRootKey,
      providerBasePath,
      class: 'authored',
    });
    return true;
  }

  /**
   * Bring mounted routes in line with root statuses: unmount every route whose
   * root is not available. Runs after the roots settle.
   */
  private async _reconcileRouteMounts(): Promise<void> {
    const changed: string[] = [];
    for (const [entries, live] of [
      [this._stagedRoutes.projects, this._projectRoutes],
      [this._stagedRoutes.checkouts, this._checkoutRoutes],
    ] as const) {
      for (const { prefix, storageRootKey } of entries) {
        const state = this._externalChanges.rootState(storageRootKey);
        if (state !== undefined && state !== 'available' && live.has(prefix)) {
          this._mountTable.unmount(prefix);
          live.delete(prefix);
          changed.push(prefix);
        }
      }
    }
    await this._mountAvailableRoutes(changed);
  }

  /**
   * Mount the staged routes of every root that is available now and whose
   * routes are not mounted: a root that a re-check or a late admission brought
   * back (blueprint D1).
   *
   * @param changed - Prefixes already changed by the caller; their topology resets with these.
   */
  private async _mountAvailableRoutes(changed: string[] = []): Promise<void> {
    const pending: Array<Promise<void>> = [];
    for (const [entries, live] of [
      [this._stagedRoutes.projects, this._projectRoutes],
      [this._stagedRoutes.checkouts, this._checkoutRoutes],
    ] as const) {
      for (const entry of entries) {
        const provider = this._registry.getOwnedProvider(entry.storageRootKey);
        /* A provider that failed earlier is no exclusion: a root admitted since
         * owns a working provider again, and its routes mount. */
        if (
          provider === undefined ||
          live.has(entry.prefix) ||
          this._externalChanges.rootState(entry.storageRootKey) !== 'available'
        ) {
          continue;
        }
        live.add(entry.prefix);
        pending.push(this._mountLateRoute(entry, provider, live, changed));
      }
    }
    await Promise.all(pending);
    if (changed.length > 0) {
      this._resetTopologyState(changed);
    }
  }

  /** Mount one route of a root that came back, once its provider settles. */
  // oxlint-disable-next-line max-params -- the route, its provider, its live set and the pass's changed list.
  private async _mountLateRoute(
    entry: StagedRouteMount,
    provider: Promise<FileSystemProvider>,
    live: Set<string>,
    changed: string[],
  ): Promise<void> {
    try {
      const resolved = await provider;
      /* The staged entry must still own its prefix: a configuration that
       * replaced the topology meanwhile owns the route now. */
      const stillStaged = this._stagedRoutes.projects.includes(entry) || this._stagedRoutes.checkouts.includes(entry);
      if (stillStaged && live.has(entry.prefix) && this._mountRoute(entry, resolved)) {
        changed.push(entry.prefix);
      }
    } catch {
      live.delete(entry.prefix);
    }
  }

  /** Mount the routes of roots a late admission brought back, then publish the statuses. */
  private async _attachLateRoots(): Promise<void> {
    try {
      await this._mountAvailableRoutes();
    } finally {
      this._publishRootStatusesIfChanged();
    }
  }

  /** Every configured root's status, staged roots from the ingest and skipped roots from staging. */
  private _publishedRootStatuses(): RootStatus[] {
    const settled = new Map(
      this._externalChanges.rootStatuses().map((status) => [status.storageRootKey, status] as const),
    );
    return this._rootEntries.flatMap((entry) => {
      if (entry.status !== undefined) {
        return [entry.status];
      }
      const status = settled.get(entry.storageRootKey);
      return status === undefined ? [] : [status];
    });
  }

  /** Tell every root-status listener the full list when it differs from the last one published. */
  private _publishRootStatusesIfChanged(): void {
    const roots = this._publishedRootStatuses();
    const fingerprint = JSON.stringify(roots);
    if (fingerprint === this._publishedRootFingerprint) {
      return;
    }
    this._publishedRootFingerprint = fingerprint;
    for (const listener of this._rootStatusListeners) {
      try {
        listener(roots);
      } catch (error) {
        console.error('[filesystem] A root-status listener threw.', error);
      }
    }
  }

  /**
   * Unmount the routes a configuration no longer names and adopt the staged set
   * as the live one.
   *
   * @param live - Route prefixes currently installed for one kind; replaced in place.
   * @param staged - Route prefixes this configuration names.
   * @returns The prefixes that were unmounted.
   */
  private _adoptRoutes(live: Set<string>, staged: ReadonlySet<string>): string[] {
    const unmounted: string[] = [];
    for (const prefix of live) {
      if (!staged.has(prefix)) {
        this._mountTable.unmount(prefix);
        unmounted.push(prefix);
      }
    }
    live.clear();
    for (const prefix of staged) {
      live.add(prefix);
    }
    return unmounted;
  }

  private _previewInstance(prefix: string): string | undefined {
    const route = parseRoute(prefix);
    return route.kind === 'preview' && route.rest === '' ? route.id : undefined;
  }

  private _revokeProjectRoute(path: string, notifyPeers: boolean): void {
    const mount = this._mountTable.getExactMount(path);
    const hadRoute = mount !== undefined || this._projectRoutes.has(path);
    if (hadRoute) {
      this._mountTable.unmount(path);
      this._projectRoutes.delete(path);
      this._resetTopologyState([path]);
    }
    if (mount !== undefined) {
      this._pipeline.emitChangeEvent({ type: 'directoryDeleted', path, backend: mount.backend });
    }
    if (notifyPeers) {
      const projectId = parseRoute(path).id;
      if (projectId && mount?.storageRootKey !== undefined) {
        this._crossTabCoordinator.notifyProjectUnavailable(projectId, {
          storageRootKey: mount.storageRootKey,
          providerBasePath: mount.providerBasePath,
        });
      }
    }
  }

  /**
   * Publish one topology change: the cached reads it invalidates and the reset
   * every watcher of a moved route needs.
   *
   * @param prefixes - The mount prefixes that changed. Each evicts its own index
   * and the one that now covers it; every other root stays warm (W7c).
   */
  private _resetTopologyState(prefixes: readonly string[]): void {
    for (const prefix of prefixes) {
      this._projectIndexes.evict(prefix);
    }
    this._watchRegistry.emitResetAll();
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
        : {
            id: fullPath,
            name,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
            ...fileMetadataFields(stat),
          };
    } catch {
      return undefined;
    }
  }

  /**
   * How the Project Indexes reach one root: its provider and provider path,
   * and — for a durable mount of exactly this root on a provider whose mtime
   * can key facts — where its snapshot lives and the lock it is written under.
   *
   * @param root - Absolute index root.
   * @returns The resolution.
   */
  private _indexRoot(root: string): {
    provider: FileSystemProvider;
    path: string;
    persist?: { lockName: string };
  } {
    const { provider, path, entry } = this._resolveProvider(root);
    const persists =
      entry !== undefined &&
      entry.prefix === root &&
      entry.storageRootKey !== undefined &&
      provider.capabilities.persistent &&
      provider.capabilities.trustworthyMtime === true;
    return {
      provider,
      path,
      ...(persists ? { persist: { lockName: `tau-index:${entry.storageRootKey}:${path}` } } : {}),
    };
  }

  private _treeEntriesToNodes(entries: Map<string, TreeEntry>): FileTreeNode[] {
    const nodes: FileTreeNode[] = [];
    for (const [, entry] of entries) {
      if (entry.type === 'dir') {
        nodes.push({ id: entry.name, name: entry.name, size: entry.size, mtimeMs: entry.mtimeMs, children: [] });
      } else {
        nodes.push({
          id: entry.name,
          name: entry.name,
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ...fileMetadataFields(entry),
        });
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
    this._assertBoundProjectRoute(path);
    return this._mountTable.resolve(path);
  }

  /**
   * Resolve the provider for an FS operation. When `options.scope` is
   * supplied the standalone provider for that scope is returned and the
   * authority path is translated to the selected provider's rooted namespace.
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
      const provider = await this._registry.getProvider(options.scope);
      const authorityPath = resolveAuthorityPath(path);
      return {
        provider,
        path: authorityPath === '/' ? '' : assertRootedPath(authorityPath.slice(1)),
        backend: options.scope.backend,
      };
    }
    this._assertBoundProjectRoute(path);
    const resolution = this._mountTable.resolve(path);
    return { provider: resolution.provider, path: resolution.path, backend: resolution.backend };
  }

  private _assertBoundProjectRoute(path: string): void {
    const route = parseRoute(resolveAuthorityPath(path));
    if (route.kind !== 'project' || route.id === undefined) {
      return;
    }
    if (this._mountTable.getExactMount(projectRoute(route.id))?.kind !== 'project') {
      throw new UnboundProjectRouteError(route.id);
    }
  }

  private _assertGenericMutationPath(path: string, target?: string): void {
    if (isUnderNodeModulesRoute(path)) {
      throw new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', path, target === undefined ? undefined : { target });
    }
  }
}
