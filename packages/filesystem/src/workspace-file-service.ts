import { projectIdSchema } from '@taucad/types';
import type {
  CheckedFileWrite,
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
import type {
  CheckoutRootConfig,
  MountTable,
  MountConfig,
  MountResolution,
  ProjectRootConfig,
  ProjectRootConfiguration,
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
import type { ProjectDiscoveryResult, ResolvedDiscoveryRoot } from '#project-directories.js';
import { assertRootedPath, joinRelativePath, parentDirectory, resolveAuthorityPath } from '@taucad/utils/path';
import { MissingWorkspaceHandleError, WorkspaceMutationError } from '#workspace-errors.js';
import { fileMetadataFields } from '#content-metadata.js';
import { archive } from '#content-ops/archive.js';
import { pendingObjectOf, readThroughPending } from '#pending-content.js';
import type { PendingObjectSource } from '#pending-content.js';
import { checkoutRoute, nodeModulesRoute, parseRoute, projectRoute } from '#project-routes.js';

/** Milliseconds. */
const kernelCoalescingWindow = 75;

/** One project or checkout route staged for installation, before its provider is resolved. */
type StagedRouteMount = {
  readonly prefix: string;
  readonly config: ProjectRootConfig;
  readonly scope: WorkspaceScope;
  readonly storageRootKey: string;
  readonly providerBasePath: string;
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
  private _discoveryRoots: readonly ResolvedDiscoveryRoot[] = [];
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

    const read = await provider.readFile(resolvedPath);
    /* A pending entry reads as its object, never its pointer (D9). */
    const object = pendingObjectOf(read);
    let data = read;
    if (object !== undefined) {
      this._projectIndexes.markPending(canonicalPath, object);
      /* The source answers by mount, as a rooted view's read asks it. */
      const root =
        optionsObject?.scope === undefined ? this._mountTable.resolve(canonicalPath).entry?.prefix : undefined;
      const local = root === undefined ? canonicalPath : canonicalPath.slice(root === '/' ? 1 : root.length + 1);
      data = await readThroughPending(
        this._pendingSource,
        { authorityPath: canonicalPath, root: root ?? canonicalPath, path: local, object },
        {
          pointer: read,
          ...(signal === undefined ? {} : { signal }),
          stallMilliseconds: this._pendingStallMilliseconds,
        },
      );
    }
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

    const { provider, path: resolvedPath } = this._resolveProvider(resolveAuthorityPath(filepath));

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
    input: CheckedFileWrite,
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
   * @param options - The `{ scope }` discriminator; a routed path has a view to serve it instead.
   * @returns ZIP archive as a `Blob`.
   */
  public async getZippedDirectory(path: string, options: { scope: WorkspaceScope }): Promise<Blob> {
    const { provider, path: resolvedPath } = await this._resolve(path, options);
    return archive(provider, resolvedPath, {
      admits: (relativePath) => this._policy?.classify(relativePath).agentAccess !== 'hidden',
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
   * Atomically replace logical project routes and physical discovery roots.
   *
   * @param configuration - Complete next authority topology.
   * @returns Promise fulfilled after the topology is installed in invocation order.
   */
  public async configureProjectRoots(configuration: ProjectRootConfiguration): Promise<void> {
    const predecessor = this._projectConfigurationTail;
    const applyInOrder = async (): Promise<void> => {
      await predecessor;
      await this._configureProjectRoots(configuration);
    };
    const scheduled = applyInOrder();
    const settle = async (): Promise<void> => {
      try {
        await scheduled;
      } catch {
        // Keep the configuration queue live after a rejected predecessor.
      }
    };
    this._projectConfigurationTail = settle();
    return scheduled;
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

  /** Release all resources: watches, providers, caches, and event bus. */
  public dispose(): void {
    this._projectDirectories.dispose();
    this._externalChanges.dispose();
    this._projectIndexes.clear();
    this._projectRoutes.clear();
    this._discoveryRoots = [];
    this._mountTable.dispose();
    this._watchRegistry.emitResetAll();
    this._crossTabCoordinator.dispose();
    this._watchRegistry.dispose();
    this._registry.disposeAll();
    this._eventBus.dispose();
  }

  private async _configureProjectRoots(configuration: ProjectRootConfiguration): Promise<void> {
    const { stagedRoots, webAccessRoots } = this._stageDiscoveryRoots(configuration.roots);
    /* Project and checkout routes share the physical-route set: two logical
     * routes may not name the same physical directory, whichever kind they are. */
    const physicalRoutes = new Set<string>();
    const stagedInputs = this._stageProjectRoutes(configuration.projects, webAccessRoots, physicalRoutes);
    const stagedCheckoutInputs = this._stageCheckoutRoutes(
      configuration.checkouts ?? [],
      webAccessRoots,
      physicalRoutes,
    );
    const stagedPrefixes = new Set(stagedInputs.map(({ prefix }) => prefix));
    const stagedCheckoutPrefixes = new Set(stagedCheckoutInputs.map(({ prefix }) => prefix));

    await this._externalChanges.evictReplacedRoots(stagedRoots);

    const changed = [
      ...(await this._installRouteMounts(stagedInputs)),
      ...(await this._installRouteMounts(stagedCheckoutInputs)),
      ...this._adoptRoutes(this._projectRoutes, stagedPrefixes),
      ...this._adoptRoutes(this._checkoutRoutes, stagedCheckoutPrefixes),
    ];
    if (
      this._discoveryRoots.length !== configuration.roots.length ||
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
    if (changed.length > 0) {
      this._resetTopologyState(changed);
    }
    await this._externalChanges.syncRoots(stagedRoots);
  }

  /**
   * Stage the discovery roots one configuration names, refusing a duplicate
   * physical root and indexing the webaccess handles its routes reference.
   *
   * @param roots - Persisted discovery roots.
   * @returns Staged roots in configuration order and the webaccess handle index.
   */
  private _stageDiscoveryRoots(roots: ProjectRootConfiguration['roots']): {
    stagedRoots: StagedDiscoveryRoot[];
    webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>;
  } {
    const physicalRoots = new Set<string>();
    const webAccessRoots = new Map<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>();
    const stagedRoots = roots.map((root) => {
      const scope = toScope(root);
      const storageRootKey = this._registry.resolveStorageRootKey(scope);
      if (physicalRoots.has(storageRootKey)) {
        throw new Error(`Duplicate project discovery root: ${storageRootKey}`);
      }
      physicalRoots.add(storageRootKey);
      if ('workspaceId' in root) {
        webAccessRoots.set(root.workspaceId, root);
      }
      return { root, scope, storageRootKey };
    });
    return { stagedRoots, webAccessRoots };
  }

  /**
   * Stage the project routes one configuration names.
   *
   * @param projects - Persisted project routes.
   * @param webAccessRoots - Webaccess handles the routes reference by workspace id.
   * @param physicalRoutes - Physical routes already claimed by this pass; extended in place.
   * @returns One staged mount per project route, in configuration order.
   */
  private _stageProjectRoutes(
    projects: ProjectRootConfiguration['projects'],
    webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>,
    physicalRoutes: Set<string>,
  ): StagedRouteMount[] {
    const stagedPrefixes = new Set<string>();
    return projects.map((config) => {
      if (!projectIdSchema.safeParse(config.projectId).success) {
        throw new TypeError(`Invalid project id: ${JSON.stringify(config.projectId)}`);
      }
      const prefix = projectRoute(config.projectId);
      if (resolveAuthorityPath(prefix) !== prefix || stagedPrefixes.has(prefix)) {
        throw new Error(`Duplicate project route: ${prefix}`);
      }
      stagedPrefixes.add(prefix);
      const providerBasePath = assertRootedPath(config.providerBasePath);
      if (providerBasePath !== config.providerBasePath) {
        throw new TypeError(`Project provider path must already be canonical: ${config.providerBasePath}`);
      }
      if (!isProjectDirectoryPath(providerBasePath)) {
        throw new TypeError(
          `Project provider path must be an immediate child of the workspace root: ${providerBasePath}`,
        );
      }
      return this._stageRouteMount(
        { prefix, config, providerBasePath, noun: 'project' },
        webAccessRoots,
        physicalRoutes,
      );
    });
  }

  /**
   * Stage the linked-checkout routes one configuration names.
   *
   * @param checkouts - Persisted checkout routes.
   * @param webAccessRoots - Webaccess handles the routes reference by workspace id.
   * @param physicalRoutes - Physical routes already claimed by this pass; extended in place.
   * @returns One staged mount per checkout route, in configuration order.
   */
  private _stageCheckoutRoutes(
    checkouts: readonly CheckoutRootConfig[],
    webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>,
    physicalRoutes: Set<string>,
  ): StagedRouteMount[] {
    const stagedPrefixes = new Set<string>();
    return checkouts.map((config) => {
      /* `/checkouts/a/b` canonicalizes to itself, so a slashed id would install
       * a route nested under another checkout's prefix. */
      if (config.checkoutId.includes('/')) {
        throw new TypeError(`Checkout id must be one path segment: ${config.checkoutId}`);
      }
      const prefix = checkoutRoute(config.checkoutId);
      if (resolveAuthorityPath(prefix) !== prefix || stagedPrefixes.has(prefix)) {
        throw new Error(`Duplicate checkout route: ${prefix}`);
      }
      stagedPrefixes.add(prefix);
      const providerBasePath = assertRootedPath(config.providerBasePath);
      if (providerBasePath !== config.providerBasePath) {
        throw new TypeError(`Checkout provider path must already be canonical: ${config.providerBasePath}`);
      }
      /* A linked checkout lives in the workspace's host-private area, which is
       * exactly the dot-prefixed space project discovery never scans (D4). */
      if (!providerBasePath.startsWith('.tau/checkouts/')) {
        throw new TypeError(`Checkout provider path must live under .tau/checkouts: ${providerBasePath}`);
      }
      return this._stageRouteMount(
        { prefix, config, providerBasePath, noun: 'checkout' },
        webAccessRoots,
        physicalRoutes,
      );
    });
  }

  /**
   * Resolve one staged route's storage scope and claim its physical route.
   *
   * @param route - Validated route prefix, configuration, provider directory and kind noun.
   * @param webAccessRoots - Webaccess handles the routes reference by workspace id.
   * @param physicalRoutes - Physical routes already claimed by this pass; extended in place.
   * @returns The staged mount.
   */
  private _stageRouteMount(
    route: {
      readonly prefix: string;
      readonly config: ProjectRootConfig;
      readonly providerBasePath: string;
      readonly noun: 'project' | 'checkout';
    },
    webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>,
    physicalRoutes: Set<string>,
  ): StagedRouteMount {
    const { prefix, config, providerBasePath, noun } = route;
    const scope = scopeForRouteConfig(config, webAccessRoots);
    const storageRootKey = this._registry.resolveStorageRootKey(scope);
    const physicalRoute = `${storageRootKey}\0${providerBasePath}`;
    if (physicalRoutes.has(physicalRoute)) {
      throw new Error(`Duplicate physical ${noun} route: ${providerBasePath}`);
    }
    physicalRoutes.add(physicalRoute);
    return { prefix, config, scope, storageRootKey, providerBasePath };
  }

  /**
   * Install one staged route family, leaving a mount that already matches
   * untouched.
   *
   * A project route is the user's authored tree by definition, and a checkout
   * route is the same authored tree in another place (D4); the derived and
   * authority-metadata families inside either are named by the revision path
   * policy, not by a second mount (RC6 / S5 work 2).
   *
   * @param staged - Staged mounts for one route family.
   * @returns The prefixes whose mount changed.
   */
  private async _installRouteMounts(staged: readonly StagedRouteMount[]): Promise<string[]> {
    const resolved = await Promise.all(
      staged.map(async (entry) => ({ ...entry, provider: await this._registry.getProvider(entry.scope) })),
    );
    const changed: string[] = [];
    for (const { prefix, provider, config, storageRootKey, providerBasePath } of resolved) {
      const existing = this._mountTable.getExactMount(prefix);
      if (
        existing?.provider !== provider ||
        existing.backend !== config.backend ||
        existing.storageRootKey !== storageRootKey ||
        existing.providerBasePath !== providerBasePath
      ) {
        this._mountTable.mount(prefix, provider, {
          backend: config.backend,
          storageRootKey,
          providerBasePath,
          class: 'authored',
        });
        changed.push(prefix);
      }
    }
    return changed;
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
