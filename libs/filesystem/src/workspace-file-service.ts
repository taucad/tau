import { z } from 'zod';
import {
  parseAdoptableProjectManifestBytes,
  parseProjectManifestBytes,
  projectIdSchema,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { generatePrefixedId } from '@taucad/utils/id';
import type {
  AdoptableProjectManifest,
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileStat,
  FileStatEntry,
  FileSystemBackend,
  ProjectManifest,
} from '@taucad/types';
import type {
  ChangeEvent,
  FileSystemProvider,
  FileTreeNode,
  FileReadStreamOptions,
  MkdirOptions,
  TreeEntry,
  WatchRequest,
  WatchEvent,
  WorkspaceMutationContext,
} from '#types.js';
import { MutationPipeline, isProjectDirectoryPath } from '#mutation-pipeline.js';
import type { BulkMoveEdit, BulkMoveResult } from '#mutation-pipeline.js';
import { RootedViews } from '#rooted-views.js';
import type { RootedFileSystem } from '#rooted-views.js';
import type { ProviderRegistry } from '#provider-registry.js';
import type { ResourceQueue } from '#resource-queue.js';
import type { ChangeEventBus } from '#change-event-bus.js';
import { TreeIndexes } from '#tree-index.js';
import type { TreeIndex } from '#tree-index.js';
import { WatchRegistry } from '#watch-registry.js';
import type { NodeFsWatchEvent } from '#backend/node/protocol.js';
import { bufferToStream, validateFileReadStreamOptions } from '#backend/stream-utils.js';
import { isChromiumSwapArtifactName } from '#backend/fs-access-provider.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import type { ChangeNotification, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { SharedPool } from '@taucad/memory';
import type {
  CheckoutRootConfig,
  MountTable,
  MountConfig,
  MountEntry,
  MountResolution,
  ProjectRootConfig,
  ProjectRootConfiguration,
  ProjectDiscoveryEntry,
  ProjectDiscoveryResult,
  CommitPendingProjectDirectoryInput,
  CommitPendingProjectDirectoryResult,
  PermanentDeleteProjectDirectoryInput,
  PermanentDeleteProjectDirectoryResult,
  ProjectLocator,
  ProjectRootDiscoveryStatus,
  StorageRootConfig,
  WorkspaceScope,
} from '#mount-table.js';
import {
  assertRootedPath,
  isSafeRelativePath,
  joinRelativePath,
  parentDirectory,
  resolveAuthorityPath,
} from '@taucad/utils/path';
import { MissingWorkspaceHandleError, WorkspaceMutationError } from '#workspace-errors.js';
import { fileMetadataFields } from '#content-metadata.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';
import { archive } from '#content-ops/archive.js';
import { checkoutRoute, nodeModulesRoute, parseRoute, projectRoute } from '#project-routes.js';

/** Milliseconds. */
const kernelCoalescingWindow = 75;

/**
 * Absolute prefix of the read-only synthetic mount that hosts the
 * bundled `.d.ts` payloads (see {@link populateBundledTypesMount}).
 * Mirrored by the UI-side `bundledTypesWorkspaceRootSegment` constant.
 */
const bundledTypesAbsolutePrefix = nodeModulesRoute;

/** Concurrent `getFile()` calls per directory while walking an external snapshot. */
const externalSnapshotConcurrency = 16;

/** Concurrent `tau.json` probes while scanning a discovery root. */
const manifestProbeConcurrency = 16;

/**
 * Changed-path budget above which a snapshot diff stops being worth scoping:
 * past this many entries the per-path cache sweeps cost more than one full drop.
 */
const maxLocalizedExternalChanges = 64;

/** Snapshot body published when the walked physical root is absent. */
const missingExternalSnapshot = '<missing>';
type NativeFileSystemChangeRecord = {
  readonly type: 'appeared' | 'disappeared' | 'modified' | 'moved' | 'unknown' | 'errored';
  readonly changedHandle?: { readonly kind: FileSystemHandle['kind'] };
  readonly relativePathComponents: readonly string[];
  readonly relativePathMovedFrom?: readonly string[];
};

type NativeFileSystemObserver = {
  observe(handle: FileSystemDirectoryHandle, options: { recursive: boolean }): Promise<void> | void;
  disconnect(): void;
};

type NativeFileSystemObserverConstructor = new (
  callback: (records: readonly NativeFileSystemChangeRecord[]) => void,
) => NativeFileSystemObserver;

type ObservedExternalRoot = {
  readonly storageRootKey: string;
  readonly backend: FileSystemBackend;
  /** Present for `webaccess` roots only; node roots are addressed by host path. */
  readonly directoryHandle?: FileSystemDirectoryHandle;
  readonly provider: FileSystemProvider;
  observer?: NativeFileSystemObserver;
  /** Releases a node root's host-side watch subscription. */
  unwatch?: () => void;
  nativeActive: boolean;
  readonly pollSnapshots: Map<string, string>;
  tail: Promise<void>;
};

/**
 * A provider that reports its own external changes. Node roots do; browser
 * roots are observed through `FileSystemObserver` plus snapshot polling.
 */
type SelfObservingProvider = FileSystemProvider & {
  watch(request: WatchRequest, handler: (event: NodeFsWatchEvent) => void): Promise<() => void>;
};

const isSelfObserving = (provider: FileSystemProvider): provider is SelfObservingProvider =>
  typeof (provider as Partial<SelfObservingProvider>).watch === 'function';

/** The kernel's own cache burst must never reach the tree (blueprint Q-R3). */
const externalWatchExcludes = ['.tau/cache/**'];

/** Translate one host watch event into the record shape the emitters consume. */
const toExternalRecord = (event: Exclude<NodeFsWatchEvent, { type: 'reset' }>): NativeFileSystemChangeRecord => {
  const relativePathComponents = event.path === '' ? [] : event.path.split('/');
  return event.type === 'delete'
    ? { type: 'disappeared', relativePathComponents }
    : {
        type: 'modified',
        changedHandle: { kind: event.kind === 'dir' ? 'directory' : 'file' },
        relativePathComponents,
      };
};

type ExternalLogicalMapping = {
  readonly path: string;
  readonly resolution: MountResolution;
};

/** One discovery root staged by {@link WorkspaceFileService.configureProjectRoots}. */
type StagedDiscoveryRoot = {
  readonly root: ProjectRootConfiguration['roots'][number];
  readonly scope: WorkspaceScope;
  readonly storageRootKey: string;
};

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

const directoryHandleSchema = z.custom<FileSystemDirectoryHandle>(
  (value) => value !== null && typeof value === 'object' && !Array.isArray(value),
);
const pendingProjectScopeSchema = z
  .discriminatedUnion('backend', [
    z.object({ backend: z.literal('webaccess'), directoryHandle: directoryHandleSchema, workspaceId: z.string() }),
    z.object({ backend: z.literal('indexeddb') }),
    z.object({ backend: z.literal('opfs') }),
    z.object({ backend: z.literal('node'), path: z.string() }),
    z.object({ backend: z.literal('memory'), storageRootKey: z.string() }),
  ])
  .superRefine((scope, context) => {
    if (scope.backend === 'memory') {
      context.addIssue({ code: 'custom', message: 'Pending project commits require durable storage.' });
    }
  })
  .transform((scope): StorageRootConfig => scope as unknown as StorageRootConfig);
const pendingProjectFileDescriptorSchema = z.object({
  content: z.instanceof(Uint8Array),
  mode: z.enum(['100644', '100755']).optional(),
});

/** Complete runtime boundary for direct and bridged pending-project commits. @public */
export const pendingProjectCommitInputSchema: z.ZodType<CommitPendingProjectDirectoryInput> = z
  .object({
    providerBasePath: z.string(),
    scope: pendingProjectScopeSchema,
    files: z.record(z.string(), pendingProjectFileDescriptorSchema),
    manifest: z.instanceof(Uint8Array),
  })
  .superRefine((input, context) => {
    try {
      if (
        assertRootedPath(input.providerBasePath) !== input.providerBasePath ||
        !isProjectDirectoryPath(input.providerBasePath)
      ) {
        context.addIssue({
          code: 'custom',
          path: ['providerBasePath'],
          message: 'Pending project target must be a canonical project directory',
        });
      }
    } catch {
      context.addIssue({
        code: 'custom',
        path: ['providerBasePath'],
        message: 'Pending project target must be a canonical project directory',
      });
    }

    const treePaths = new Set(['tau.json']);
    for (const relativePath of Object.keys(input.files)) {
      if (!isSafeRelativePath(relativePath)) {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project file path is unsafe',
        });
        continue;
      }
      try {
        assertRootedPath(relativePath);
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project file path must be canonical',
        });
        continue;
      }
      if (relativePath === 'tau.json' || relativePath.endsWith('/tau.json')) {
        context.addIssue({
          code: 'custom',
          path: ['files', relativePath],
          message: 'Pending project files cannot contain a manifest',
        });
      }
      treePaths.add(relativePath);
    }
    for (const treePath of treePaths) {
      let parent = treePath.slice(0, treePath.lastIndexOf('/'));
      while (parent.length > 0) {
        if (treePaths.has(parent)) {
          context.addIssue({
            code: 'custom',
            path: ['files', treePath],
            message: 'Pending project file path collides with an ancestor',
          });
          break;
        }
        parent = parent.slice(0, parent.lastIndexOf('/'));
      }
    }
  });

/**
 * Manifest bytes whose *only* defect is the identity — the exact condition
 * discovery reports as `adoption-required` and the Adopt action re-validates
 * before it writes (R11). Anything else stays quarantined.
 *
 * @param bytes - Encoded `tau.json`.
 * @returns The identity-less manifest, or `undefined` when adoption is unsafe.
 */
function readAdoptableManifest(bytes: Uint8Array<ArrayBuffer>): AdoptableProjectManifest | undefined {
  const parsed = parseProjectManifestBytes(bytes);
  if (parsed.success) {
    return undefined;
  }
  const idOnlyInvalid =
    parsed.issue.code === 'manifest-invalid' && parsed.issue.issues.every((issue) => issue.path[0] === 'id');
  const adoptable = idOnlyInvalid ? parseAdoptableProjectManifestBytes(bytes) : undefined;
  return adoptable?.success === true ? adoptable.data : undefined;
}

/**
 * Workspace app state (`<root>/.tau/**`, `.git/**`, …): never a project, never
 * an input to discovery, and never worth an external-change fan-out.
 *
 * @param physicalPath - Canonical provider-relative path.
 * @returns Whether the path lives under a dot-prefixed root child.
 */
function isWorkspaceStatePath(physicalPath: string): boolean {
  return physicalPath.split('/')[0]?.startsWith('.') === true;
}

function isUnderBundledTypesMount(absolutePath: string): boolean {
  return absolutePath === bundledTypesAbsolutePrefix || absolutePath.startsWith(`${bundledTypesAbsolutePrefix}/`);
}

function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const { code, name } = error as NodeJS.ErrnoException;
  return code === 'ENOENT' || code === 'ENOTDIR' || name === 'NotFoundError';
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

/** Fully materialized files for one package-root replacement. @public */
export type BundledTypePackageReplacement = Readonly<{
  packageDirectory: string;
  files: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;

/**
 * Layer 3a UI-side workspace orchestrator.
 *
 * Composes routing and watch primitives with workspace-only concerns: in-memory file index for fast
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
  private readonly _treeIndexes = new TreeIndexes();
  private readonly _projectRoutes = new Set<string>();
  private readonly _checkoutRoutes = new Set<string>();
  private _projectConfigurationTail: Promise<void> = Promise.resolve();
  private _remoteChangeTail: Promise<void> = Promise.resolve();
  private _discoveryRoots: ReadonlyArray<{
    root: ProjectRootConfiguration['roots'][number];
    scope: WorkspaceScope;
    storageRootKey: string;
  }> = [];
  private readonly _observedExternalRoots = new Map<string, ObservedExternalRoot>();
  private readonly _pipeline: MutationPipeline;
  private readonly _rootedViews: RootedViews;

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
    this._pipeline = new MutationPipeline({
      mountTable: this._mountTable,
      resourceQueue: this._resourceQueue,
      eventBus: this._eventBus,
      crossTabCoordinator: this._crossTabCoordinator,
      treeIndexes: this._treeIndexes,
      filePool: () => this._filePool,
    });
    this._rootedViews = new RootedViews({
      mountTable: this._mountTable,
      pipeline: this._pipeline,
      watchRegistry: this._watchRegistry,
      treeIndexFor: async (root) => this._treeIndexFor(root),
    });
    this._crossTabCoordinator.onRemoteChange((notification) => {
      const predecessor = this._remoteChangeTail;
      const applyInOrder = async (): Promise<void> => {
        try {
          await predecessor;
          await this._applyRemoteChange(notification);
        } catch {
          this._handleRemoteFailure(notification);
        }
      };
      this._remoteChangeTail = applyInOrder();
    });
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

  /**
   * Capture one exact mount selected by trusted composition as a fully
   * writable filesystem whose entire visible namespace has root `''`.
   *
   * @param authorityRoot - Exact authority-global mount path to capture.
   * @param mutationContext - Optional origin metadata for echo suppression.
   * @returns A writable filesystem whose root is the captured mount.
   */
  public createRootedFileSystem(authorityRoot: string, mutationContext?: WorkspaceMutationContext): RootedFileSystem {
    return this._rootedViews.create(authorityRoot, mutationContext);
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

    const data = await provider.readFile(resolvedPath);
    if (optionsObject?.scope === undefined) {
      this._filePool?.store(canonicalPath, data);
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
    return this._pipeline.bulkMove(async (source, target) => this.move(source, target, context), edits);
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
   * Copy a single file to a new location, creating parent directories as needed.
   *
   * Kept under I2 while the Files pane's duplicate gesture still reaches it
   * through `client.duplicateFile`. The rooted surface serves the same
   * operation as `duplicate`, mask-checked by the view above it (charter D4);
   * W12 moves the caller and this method goes with it.
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
    const destination = resolveAuthorityPath(destinationPath);
    this._assertGenericMutationPath(destination, resolveAuthorityPath(sourcePath));
    const data = await this.readFile(sourcePath);
    await this.writeFile(destination, data, context);
  }

  /**
   * Recursively copy an entire directory tree to a new location.
   *
   * Unmasked, which is exactly what W0 pin (d) records: the Files pane's folder
   * copy still reaches it through `client.copyDirectory`. The rooted surface
   * serves the same batch as `copyTree`, where the view supplies its mask as
   * the entry filter (charter D4); W12 moves the caller and closes the bypass.
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
    const source = resolveAuthorityPath(sourcePath);
    const target = resolveAuthorityPath(destinationPath);
    this._assertGenericMutationPath(target, source);
    return this._pipeline.copyTree({
      source,
      target,
      sourceResolution: this._resolveProvider(source),
      targetResolution: this._resolveProvider(target),
      context,
    });
  }

  /**
   * Replace complete bundled declaration package roots under `/node_modules`.
   * The caller must materialize and validate every output before admission; this
   * method supplies the one package-set mutation boundary shared by all callers.
   *
   * @param packages - Complete package roots and their already-materialized files.
   * @returns Promise fulfilled after every package root is replaced.
   */
  public async replaceBundledTypePackages(packages: readonly BundledTypePackageReplacement[]): Promise<void> {
    if (packages.length === 0) {
      return;
    }

    const packageDirectories = new Set<string>();
    const operations: Array<{
      packageDirectory: string;
      packageResolution: MountResolution;
      files: Array<{ path: string; content: string; resolution: MountResolution }>;
    }> = [];
    for (const replacement of packages) {
      const packageDirectory = resolveAuthorityPath(replacement.packageDirectory);
      if (
        packageDirectory !== replacement.packageDirectory ||
        !packageDirectory.startsWith(`${bundledTypesAbsolutePrefix}/`) ||
        packageDirectories.has(packageDirectory)
      ) {
        throw new TypeError(`Invalid bundled type package root: ${replacement.packageDirectory}`);
      }
      packageDirectories.add(packageDirectory);
      const packageResolution = this._resolveProvider(packageDirectory);
      const seenFiles = new Set<string>();
      const files = replacement.files.map(({ path: rawPath, content }) => {
        const path = resolveAuthorityPath(rawPath);
        if (
          path !== rawPath ||
          !path.startsWith(`${packageDirectory}/`) ||
          seenFiles.has(path) ||
          typeof content !== 'string'
        ) {
          throw new TypeError(`Invalid bundled type package file: ${rawPath}`);
        }
        seenFiles.add(path);
        const resolution = this._resolveProvider(path);
        if (resolution.entry !== packageResolution.entry) {
          throw new TypeError(`Bundled type package crosses a mount boundary: ${path}`);
        }
        return { path, content, resolution };
      });
      operations.push({ packageDirectory, packageResolution, files });
    }

    const rootResolution = this._resolveProvider(bundledTypesAbsolutePrefix);
    const locks = this._pipeline.mutationLockPaths([{ path: bundledTypesAbsolutePrefix, resolution: rootResolution }]);
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        let mutationBegan = false;
        try {
          await this._pipeline.refreshMutationProviders([
            rootResolution,
            ...operations.flatMap(({ packageResolution, files }) => [
              packageResolution,
              ...files.map(({ resolution }) => resolution),
            ]),
          ]);
          for (const { packageDirectory, packageResolution, files } of operations) {
            // oxlint-disable-next-line no-await-in-loop -- Package replacements are intentionally serialized as complete generations under one lock.
            if (await packageResolution.provider.exists(packageResolution.path)) {
              mutationBegan = true;
              // oxlint-disable-next-line no-await-in-loop -- Package replacement is intentionally ordered under one lock.
              await this._pipeline.rmdirRecursive(packageResolution.provider, packageResolution.path);
            }
            this._filePool?.invalidate(packageDirectory);
            this._treeIndexes.removeDirectory(packageDirectory);
            for (const { path, content, resolution } of files) {
              mutationBegan = true;
              // oxlint-disable-next-line no-await-in-loop -- A package root becomes visible as one ordered generation.
              await this._pipeline.writeFileUnlocked({ path, resolution, data: content });
            }
          }
          if (mutationBegan) {
            this._pipeline.emitChangeEvent(
              { type: 'directoryChanged', path: bundledTypesAbsolutePrefix, backend: rootResolution.backend },
              undefined,
              { operations: [{ path: bundledTypesAbsolutePrefix, resolution: rootResolution }] },
            );
            this._crossTabCoordinator.notifyDirectoryChange(
              bundledTypesAbsolutePrefix,
              this._pipeline.physicalAuthority(rootResolution),
            );
          }
        } catch (error) {
          if (mutationBegan) {
            this._filePool?.clear();
            this._treeIndexes.clear();
            this._pipeline.emitChangeEvent({ type: 'backendChanged', backend: rootResolution.backend });
            this._crossTabCoordinator.notifyDirectoryChange(
              bundledTypesAbsolutePrefix,
              this._pipeline.physicalAuthority(rootResolution),
            );
          }
          throw error;
        }
      }),
    );
  }

  /**
   * Recursively read all files under a directory as raw bytes.
   *
   * Its one remaining consumer is project duplication, which reads
   * `/projects/<id>` through the workspace-rooted file manager and so has no
   * rooted view to read instead. It leaves with `transfer` (charter D11, W7) or
   * with the per-project rooted handles (W12); until then this walk is unmasked,
   * which is what W0 pin (d) records.
   *
   * @param path - Absolute directory path.
   * @returns Map of relative paths to file contents.
   */
  public async getDirectoryContents(path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    const contents = await this._pipeline.directoryContents(provider, resolvedPath);
    return contents.files;
  }

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
   * @param path    - Absolute directory path.
   * @param options - The `{ scope }` discriminator; a routed path has a view to serve it instead.
   * @returns ZIP archive as a `Blob`.
   */
  public async getZippedDirectory(path: string, options: { scope: WorkspaceScope }): Promise<Blob> {
    const { provider, path: resolvedPath } = await this._resolve(path, options);
    return archive(provider, resolvedPath);
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

  /**
   * Recursively collect stat information for every file under a directory.
   *
   * Unmasked, and therefore not the surface a project consumer reads any more:
   * a path inside a composed view's root is served by {@link RootedFileSystem.statTree}
   * through that view (charter D3, W4). What is left here is the paths no rooted
   * handle covers yet — the global `/node_modules` alias the workspace path
   * resolver keeps addressable — which W12 retires along with the rest of the
   * absolute-path client surface (D12).
   *
   * @param path - Absolute directory path to walk.
   * @param options - Optional abort signal for long walks.
   * @returns Flat array of file stat entries with relative paths.
   */
  public async getDirectoryStat(path: string, options?: { signal?: AbortSignal }): Promise<FileStatEntry[]> {
    const normalizedPath = resolveAuthorityPath(path);

    const warm = this._treeIndexes.statTree(normalizedPath);
    if (warm !== undefined) {
      return warm;
    }

    const { provider, path: resolvedPath } = this._resolveProvider(normalizedPath);
    const fileStats = await this._collectDirectoryStatsFromProvider(
      provider,
      { walkPath: resolvedPath, basePath: resolvedPath },
      options,
    );

    this._treeIndexes.build(normalizedPath, fileStats);

    return fileStats;
  }

  /**
   * Search one exact directory root for entries whose paths contain the query substring.
   *
   * Unmasked, like {@link getDirectoryStat}: a search inside a composed view's
   * root is served by {@link RootedFileSystem.search} over that view's index
   * (charter D3, W4), and this stays only for a root no rooted handle covers
   * until W12 (D12).
   *
   * @param root - Absolute directory root to search.
   * @param query - Case-insensitive substring to match against relative file paths.
   * @param options - Search options: `maxResults` (default 100), `includeDirectories` (default false).
   * @returns Matching entries with paths relative to the tree root.
   */
  public async searchFiles(
    root: string,
    query: string,
    options?: { maxResults?: number; includeDirectories?: boolean },
  ): Promise<FileStatEntry[]> {
    const index = await this._treeIndexFor(resolveAuthorityPath(root));
    return index.searchFiles(query, options);
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
   * Safety-reconcile one routed project, or every configured webaccess root when omitted.
   *
   * @param root - Optional routed project root.
   * @returns `true` when every root this call covered is under live `FileSystemObserver`
   *          delivery, which lets the caller poll on a slow safety-net cadence instead.
   */
  public async pollExternalChanges(root?: string): Promise<boolean> {
    if (root === undefined) {
      const states = [...this._observedExternalRoots.values()];
      await Promise.all(states.map(async (state) => this._pollExternalRoot(state)));
      return states.length > 0 && states.every(({ nativeActive }) => nativeActive);
    }
    const resolution = this._mountTable.resolve(root);
    const { entry } = resolution;
    if (entry?.storageRootKey === undefined) {
      return false;
    }
    const state = [...this._observedExternalRoots.values()].find(
      (candidate) => candidate.provider === resolution.provider && candidate.storageRootKey === entry.storageRootKey,
    );
    if (state === undefined) {
      return false;
    }
    await this._pollExternalRoot(state, entry.providerBasePath);
    return state.nativeActive;
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
    const discovered: ProjectDiscoveryEntry[] = [];
    const roots: ProjectRootDiscoveryStatus[] = [];
    /* oxlint-disable eslint/no-await-in-loop -- Root scans are deliberately serialized to bound filesystem-handle and IndexedDB pressure. */
    for (const resolvedRoot of this._discoveryRoots) {
      const { root, scope, storageRootKey } = resolvedRoot;
      let provider: FileSystemProvider;
      try {
        // Out-of-band writes reach the provider through the external-change path
        // (native observer, safety poll, or a sibling-tab notification), so a scan
        // never has to drop the handle cache to see them.
        provider = await this._registry.getProvider(scope);
      } catch (error) {
        roots.push({ status: 'inaccessible', root, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      let directories: string[];
      try {
        // The workspace root exists by definition; a project is any immediate
        // child directory carrying `tau.json`. Entry kinds come from the listing
        // so files never cost a `stat`, and dotdirs are excluded by name alone.
        const entries = await readDirectoryEntries(provider, '');
        directories = entries
          .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.'))
          .map((entry) => entry.name)
          .sort();
      } catch (error) {
        roots.push({ status: 'inaccessible', root, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const probe = async (directory: string): Promise<ProjectDiscoveryEntry | undefined> => {
        const relativeDirectory = assertRootedPath(directory);
        const locator: ProjectLocator =
          root.backend === 'webaccess'
            ? {
                backend: root.backend,
                storageRootKey,
                relativeDirectory,
                workspaceId: root.workspaceId,
              }
            : root.backend === 'node'
              ? { backend: root.backend, storageRootKey, relativeDirectory, path: root.path }
              : { backend: root.backend, storageRootKey, relativeDirectory };
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          bytes = await provider.readFile(joinRelativePath(relativeDirectory, 'tau.json'));
        } catch (error) {
          if (isNotFoundError(error)) {
            return undefined;
          }
          // One unreadable child must not blank an otherwise readable root:
          // report it in place and keep scanning. `inaccessible` stays
          // reserved for failures of the root listing or its provider.
          return {
            status: 'invalid',
            locator,
            issue: { code: 'manifest-unreadable', message: error instanceof Error ? error.message : String(error) },
          };
        }
        const parsed = parseProjectManifestBytes(bytes);
        if (parsed.success) {
          return { status: 'valid', manifest: parsed.data, locator };
        }
        const adoptable = readAdoptableManifest(bytes);
        return adoptable === undefined
          ? { status: 'invalid', locator, issue: parsed.issue }
          : { status: 'adoption-required', manifest: adoptable, locator, issue: parsed.issue };
      };
      // Chunked awaits bound the probe concurrency; the pre-sorted input keeps
      // the result order independent of completion order.
      for (let offset = 0; offset < directories.length; offset += manifestProbeConcurrency) {
        const chunk = await Promise.all(
          directories.slice(offset, offset + manifestProbeConcurrency).map(async (directory) => probe(directory)),
        );
        discovered.push(...chunk.filter((entry) => entry !== undefined));
      }
      roots.push({ status: 'complete', root });
    }
    /* oxlint-enable eslint/no-await-in-loop -- End bounded serial root scan. */

    const priority: Record<Exclude<FileSystemBackend, 'memory'>, number> = {
      indexeddb: 0,
      opfs: 1,
      webaccess: 2,
      // Disk beats every browser engine: on desktop it is the only real root.
      node: 3,
    };
    discovered.sort((left, right) => {
      const backendOrder = priority[left.locator.backend] - priority[right.locator.backend];
      if (backendOrder !== 0) {
        return backendOrder;
      }
      const rootOrder = left.locator.storageRootKey.localeCompare(right.locator.storageRootKey);
      if (rootOrder !== 0) {
        return rootOrder;
      }
      return left.locator.relativeDirectory.localeCompare(right.locator.relativeDirectory);
    });

    const occurrenceCount = new Map<string, number>();
    for (const entry of discovered) {
      if (entry.status === 'valid') {
        occurrenceCount.set(entry.manifest.id, (occurrenceCount.get(entry.manifest.id) ?? 0) + 1);
      }
    }
    const entries = discovered.map(
      (entry): ProjectDiscoveryEntry =>
        entry.status === 'valid' && (occurrenceCount.get(entry.manifest.id) ?? 0) > 1
          ? { ...entry, status: 'duplicate-id' }
          : entry,
    );
    return { entries, roots };
  }

  /**
   * Give an `adoption-required` project directory a fresh Tau identity in
   * place. Service-side because the write must re-validate adoptability under
   * the same physical lock every other project mutation takes — a UI-side
   * read/modify/write could adopt a directory a sibling tab just repaired.
   *
   * @param locator - Discovery locator of the directory to adopt.
   * @returns The manifest now on disk, identity included.
   */
  public async adoptProjectDirectory(locator: ProjectLocator): Promise<ProjectManifest> {
    const path = assertRootedPath(locator.relativeDirectory);
    if (path !== locator.relativeDirectory || !isProjectDirectoryPath(path)) {
      throw new TypeError(`Adoption target must be a canonical project directory: ${locator.relativeDirectory}`);
    }
    const root = this._discoveryRoots.find((candidate) => candidate.storageRootKey === locator.storageRootKey);
    if (root === undefined) {
      throw new TypeError(`Adoption target is not a configured discovery root: ${locator.storageRootKey}`);
    }
    const provider = await this._registry.getProvider(root.scope);
    const physicalLock = `${locator.storageRootKey}:${path}`;
    return this._crossTabCoordinator.withLocks([physicalLock], async () =>
      this._resourceQueue.queueForMany([physicalLock], async () => {
        const manifestPath = `${path}/tau.json`;
        const adoptable = readAdoptableManifest(await provider.readFile(manifestPath));
        if (adoptable === undefined) {
          throw new TypeError(`Project directory is not adoptable: ${path}`);
        }
        const manifest = projectToManifest({ ...adoptable, id: generatePrefixedId(idPrefix.project) });
        await provider.writeFile(manifestPath, serializeProjectManifest(manifest));
        // Ponytail: no logical route to invalidate — an unadopted project was
        // never mounted, so the caller's discovery refetch is the only reader.
        this._crossTabCoordinator.notifyDirectoryChange('/', this._scopedPhysicalAuthority(root.scope, ''));
        return manifest;
      }),
    );
  }

  /**
   * Permanently remove one exact physical project directory. Identity is
   * re-established under the same project-wide lock that all logical project
   * mutations acquire, so no write can race the verification/delete window.
   *
   * @param input - Exact project identity, physical path, and storage scope.
   * @returns Identity-safe deletion outcome.
   */
  public async permanentlyDeleteProjectDirectory(
    input: PermanentDeleteProjectDirectoryInput,
  ): Promise<PermanentDeleteProjectDirectoryResult> {
    const { projectId } = input;
    if (!projectIdSchema.safeParse(projectId).success) {
      throw new TypeError(`Invalid project id: ${JSON.stringify(projectId)}`);
    }
    const path = assertRootedPath(input.providerBasePath);
    if (path !== input.providerBasePath) {
      throw new TypeError('Permanent delete target must already be canonical.');
    }
    if (!isProjectDirectoryPath(path)) {
      throw new TypeError('Permanent delete target must be an immediate child of the workspace root.');
    }
    const uncheckedScope = input.scope as WorkspaceScope;
    if (uncheckedScope.backend === 'memory') {
      throw new TypeError('Permanent project deletion requires durable storage.');
    }
    const scope: StorageRootConfig = { ...input.scope };
    const provider = await this._registry.getProvider(scope);
    const logicalRoot = projectRoute(projectId);
    const physicalLock = `${this._registry.resolveStorageRootKey(scope)}:${path}`;
    const locks = [`project:${projectId}`, physicalLock];
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        await provider.refresh?.();
        if (!(await provider.exists(path))) {
          return { status: 'absent' };
        }

        const manifestPath = `${path}/tau.json`;
        if (!(await provider.exists(manifestPath))) {
          return { status: 'unidentifiable' };
        }
        const manifest = await provider.readFile(manifestPath);
        const parsed = parseProjectManifestBytes(manifest);
        if (!parsed.success) {
          return { status: 'unidentifiable' };
        }
        if (parsed.data.id !== projectId) {
          return { status: 'identity-mismatch', actualProjectId: parsed.data.id };
        }

        this._revokeProjectRoute(logicalRoot, true);
        const separator = path.lastIndexOf('/');
        const physicalParent = separator === -1 ? '' : path.slice(0, separator);
        const authorityParent = physicalParent === '' ? '/' : `/${physicalParent}`;
        const parentAuthority = this._scopedPhysicalAuthority(scope, physicalParent);
        try {
          await this._deleteProjectDirectory(provider, path, manifest);
        } finally {
          this._filePool?.clear();
          this._treeIndexes.clear();
          this._pipeline.emitChangeEvent({ type: 'directoryChanged', path: authorityParent, backend: scope.backend });
          this._crossTabCoordinator.notifyDirectoryChange(authorityParent, parentAuthority);
        }
        if (await provider.exists(path)) {
          throw new Error(`Permanent delete did not remove ${path}`);
        }
        return { status: 'deleted' };
      }),
    );
  }

  /**
   * Commit one durable pending-operation snapshot to its exact physical
   * project directory. The manifest is the commit marker and is always
   * written last.
   *
   * @param input - Owned journal snapshot and exact target locator.
   * @param context - Optional mutation origin metadata.
   * @returns Replay-safe commit outcome.
   */
  public async commitPendingProjectDirectory(
    input: CommitPendingProjectDirectoryInput,
    context?: WorkspaceMutationContext,
  ): Promise<CommitPendingProjectDirectoryResult> {
    const { path, files, manifest, scope, storageRootKey, projectId } = this._validatePendingProjectCommit(input);
    const provider = await this._registry.getProvider(scope);
    const logicalRoot = projectRoute(projectId);
    const physicalLock = `${storageRootKey}:${path}`;
    const locks = [`project:${projectId}`, physicalLock];

    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        let mutationBegan = false;
        try {
          await provider.refresh?.();
          if (await provider.exists(path)) {
            const targetStat = await provider.stat(path);
            if (targetStat.type !== 'dir') {
              throw new TypeError(`Pending project target is not a directory: ${path}`);
            }
            const existingManifestPath = `${path}/tau.json`;
            if (await provider.exists(existingManifestPath)) {
              const existing = parseProjectManifestBytes(await provider.readFile(existingManifestPath));
              if (!existing.success) {
                return { status: 'unidentifiable-manifest' };
              }
              if (existing.data.id !== projectId) {
                return { status: 'identity-mismatch', actualProjectId: existing.data.id };
              }
              return { status: 'already-committed' };
            }
            mutationBegan = true;
            await this._pipeline.rmdirRecursive(provider, path);
          }

          mutationBegan = true;
          await provider.mkdir(path, { recursive: true });
          this._filePool?.clear();
          this._treeIndexes.removeDirectory(logicalRoot);

          for (const [relativePath, descriptor] of files) {
            const logicalPath = `${logicalRoot}/${relativePath}`;
            const providerPath = `${path}/${relativePath}`;
            // oxlint-disable-next-line no-await-in-loop -- deterministic manifest-last transaction
            await this._pipeline.writeFileUnlocked({
              path: logicalPath,
              resolution: { provider, path: providerPath, backend: scope.backend },
              data: descriptor.content,
              context,
            });
            if (descriptor.mode !== undefined) {
              // oxlint-disable-next-line no-await-in-loop -- mode belongs to the file just written.
              await provider.setFileMode?.(providerPath, descriptor.mode);
            }
          }

          await this._pipeline.writeFileUnlocked({
            path: `${logicalRoot}/tau.json`,
            resolution: { provider, path: `${path}/tau.json`, backend: scope.backend },
            data: manifest,
            context,
          });
          const committed = parseProjectManifestBytes(await provider.readFile(`${path}/tau.json`));
          if (!committed.success || committed.data.id !== projectId) {
            throw new Error(`Pending project manifest verification failed for ${projectId}`);
          }

          this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          return { status: 'committed' };
        } catch (error) {
          if (mutationBegan) {
            this._filePool?.clear();
            this._treeIndexes.removeDirectory(logicalRoot);
            this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._scopedPhysicalAuthority(scope, path));
          }
          throw error;
        }
      }),
    );
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
    if (previewInstance === undefined && canonicalPrefix !== bundledTypesAbsolutePrefix) {
      throw new TypeError(`Dynamic mount prefix is not admitted: ${prefix}`);
    }
    if (
      (previewInstance !== undefined &&
        (config.backend !== 'memory' || config.storageRootKey !== `memory:preview:${previewInstance}`)) ||
      (canonicalPrefix === bundledTypesAbsolutePrefix && config.backend !== 'opfs')
    ) {
      throw new TypeError(`Dynamic mount configuration does not match its protected prefix: ${prefix}`);
    }
    const providerBasePath = assertRootedPath(config.providerBasePath ?? '');
    if (providerBasePath !== (config.providerBasePath ?? '')) {
      throw new TypeError(`Dynamic provider path must already be canonical: ${config.providerBasePath}`);
    }
    const scope = this._toScope(config);
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
    this._resetTopologyState();
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
      (this._previewInstance(canonicalPrefix) === undefined && canonicalPrefix !== bundledTypesAbsolutePrefix)
    ) {
      throw new TypeError(`Dynamic mount prefix is not admitted: ${prefix}`);
    }
    if (this._mountTable.getExactMount(canonicalPrefix) === undefined) {
      return;
    }
    this._mountTable.unmount(canonicalPrefix);
    this._projectRoutes.delete(canonicalPrefix);
    this._resetTopologyState();
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
    this._disconnectExternalRoot(storageRootKey);
    let topologyChanged = false;
    for (const mount of this._mountTable.listMounts()) {
      if (mount.storageRootKey === storageRootKey) {
        this._mountTable.unmount(mount.prefix);
        this._projectRoutes.delete(mount.prefix);
        topologyChanged = true;
      }
    }
    const retainedDiscoveryRoots = this._discoveryRoots.filter((root) => root.storageRootKey !== storageRootKey);
    if (retainedDiscoveryRoots.length !== this._discoveryRoots.length) {
      this._discoveryRoots = retainedDiscoveryRoots;
      topologyChanged = true;
    }
    if (topologyChanged) {
      this._resetTopologyState();
    }
    this._registry.disposeRoot(storageRootKey);
  }

  /** Release all resources: watches, providers, caches, and event bus. */
  public dispose(): void {
    for (const storageRootKey of this._observedExternalRoots.keys()) {
      this._disconnectExternalRoot(storageRootKey);
    }
    this._filePool?.clear();
    this._filePool = undefined;
    this._treeIndexes.clear();
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

    await this._evictReplacedWebAccessRoots(stagedRoots);

    let topologyChanged = await this._installRouteMounts(stagedInputs);
    topologyChanged = (await this._installRouteMounts(stagedCheckoutInputs)) || topologyChanged;
    topologyChanged = this._adoptRoutes(this._projectRoutes, stagedPrefixes) || topologyChanged;
    topologyChanged = this._adoptRoutes(this._checkoutRoutes, stagedCheckoutPrefixes) || topologyChanged;
    if (
      this._discoveryRoots.length !== configuration.roots.length ||
      this._discoveryRoots.some((current, index) => {
        const next = stagedRoots[index];
        return next === undefined || current.storageRootKey !== next.storageRootKey;
      })
    ) {
      topologyChanged = true;
    }
    this._discoveryRoots = stagedRoots;
    if (topologyChanged) {
      this._resetTopologyState();
    }
    await this._syncExternalRoots(stagedRoots);
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
      const scope = this._toScope(root);
      const storageRootKey = this._registry.resolveStorageRootKey(scope);
      if (physicalRoots.has(storageRootKey)) {
        throw new Error(`Duplicate project discovery root: ${storageRootKey}`);
      }
      physicalRoots.add(storageRootKey);
      if (root.backend === 'webaccess') {
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
    const scope = this._scopeForRouteConfig(config, webAccessRoots);
    const storageRootKey = this._registry.resolveStorageRootKey(scope);
    const physicalRoute = `${storageRootKey}\0${providerBasePath}`;
    if (physicalRoutes.has(physicalRoute)) {
      throw new Error(`Duplicate physical ${noun} route: ${providerBasePath}`);
    }
    physicalRoutes.add(physicalRoute);
    return { prefix, config, scope, storageRootKey, providerBasePath };
  }

  /**
   * Drop a cached webaccess provider whose root the user re-picked, so staging
   * never retains a handle for a different directory entry.
   *
   * @param stagedRoots - Discovery roots this pass staged.
   */
  private async _evictReplacedWebAccessRoots(stagedRoots: readonly StagedDiscoveryRoot[]): Promise<void> {
    for (const staged of stagedRoots) {
      if (staged.root.backend !== 'webaccess') {
        continue;
      }
      const observed = this._observedExternalRoots.get(staged.storageRootKey);
      const observedHandle = observed?.directoryHandle;
      if (observed === undefined || observedHandle === undefined || observedHandle === staged.root.directoryHandle) {
        continue;
      }
      let sameEntry = false;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Provider staging must not retain a handle for a different entry.
        sameEntry = await observedHandle.isSameEntry(staged.root.directoryHandle);
      } catch {
        // A failed identity check cannot prove that the cached provider still owns this root.
      }
      if (!sameEntry && this._observedExternalRoots.get(staged.storageRootKey) === observed) {
        this._disconnectExternalRoot(staged.storageRootKey);
        // oxlint-disable-next-line no-await-in-loop -- Do not dispose a provider while an admitted root operation uses it.
        await observed.tail;
        this.disposeStorageRoot(staged.storageRootKey);
      }
    }
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
   * @returns Whether any mount changed.
   */
  private async _installRouteMounts(staged: readonly StagedRouteMount[]): Promise<boolean> {
    const resolved = await Promise.all(
      staged.map(async (entry) => ({ ...entry, provider: await this._registry.getProvider(entry.scope) })),
    );
    let topologyChanged = false;
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
        topologyChanged = true;
      }
    }
    return topologyChanged;
  }

  /**
   * Unmount the routes a configuration no longer names and adopt the staged set
   * as the live one.
   *
   * @param live - Route prefixes currently installed for one kind; replaced in place.
   * @param staged - Route prefixes this configuration names.
   * @returns Whether any route was unmounted.
   */
  private _adoptRoutes(live: Set<string>, staged: ReadonlySet<string>): boolean {
    let topologyChanged = false;
    for (const prefix of live) {
      if (!staged.has(prefix)) {
        this._mountTable.unmount(prefix);
        topologyChanged = true;
      }
    }
    live.clear();
    for (const prefix of staged) {
      live.add(prefix);
    }
    return topologyChanged;
  }

  /** The storage scope one persisted route names, project or checkout alike. */
  private _scopeForRouteConfig(
    config: ProjectRootConfig,
    webAccessRoots: ReadonlyMap<string, Extract<StorageRootConfig, { backend: 'webaccess' }>>,
  ): WorkspaceScope {
    if (config.backend === 'webaccess') {
      const root = webAccessRoots.get(config.workspaceId);
      if (root === undefined) {
        throw new MissingWorkspaceHandleError({ workspaceId: config.workspaceId });
      }
      return this._toScope(root);
    }
    if (config.backend === 'memory') {
      return this._toScope({ backend: 'memory', storageRootKey: config.storageRootKey });
    }
    return config.backend === 'node'
      ? this._toScope({ backend: 'node', path: config.path })
      : this._toScope({ backend: config.backend });
  }

  private _toScope(config: WorkspaceScope | MountConfig): WorkspaceScope {
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
    if (config.backend === 'memory') {
      return { backend: 'memory', storageRootKey: config.storageRootKey };
    }
    return config.backend === 'node' ? { backend: 'node', path: config.path } : { backend: config.backend };
  }

  private _previewInstance(prefix: string): string | undefined {
    const route = parseRoute(prefix);
    return route.kind === 'preview' && route.rest === '' ? route.id : undefined;
  }

  private async _syncExternalRoots(
    roots: ReadonlyArray<{
      root: ProjectRootConfiguration['roots'][number];
      scope: WorkspaceScope;
      storageRootKey: string;
    }>,
  ): Promise<void> {
    const webRoots = roots.filter(
      (
        entry,
      ): entry is typeof entry & {
        root: Extract<StorageRootConfig, { backend: 'webaccess' }>;
        scope: Extract<WorkspaceScope, { backend: 'webaccess' }>;
      } => entry.root.backend === 'webaccess' && entry.scope.backend === 'webaccess',
    );
    const nodeRoots = roots.filter(
      (
        entry,
      ): entry is typeof entry & {
        root: Extract<StorageRootConfig, { backend: 'node' }>;
        scope: Extract<WorkspaceScope, { backend: 'node' }>;
      } => entry.root.backend === 'node' && entry.scope.backend === 'node',
    );
    const retainedKeys = new Set([...webRoots, ...nodeRoots].map(({ storageRootKey }) => storageRootKey));
    for (const storageRootKey of this._observedExternalRoots.keys()) {
      if (!retainedKeys.has(storageRootKey)) {
        this._disconnectExternalRoot(storageRootKey);
      }
    }
    await this._observeNodeRoots(nodeRoots);

    const additions = await Promise.all(
      webRoots
        .filter(({ storageRootKey }) => !this._observedExternalRoots.has(storageRootKey))
        .map(async ({ root, scope, storageRootKey }) => {
          try {
            return { root, storageRootKey, provider: await this._registry.getProvider(scope) };
          } catch {
            return undefined;
          }
        }),
    );
    for (const addition of additions) {
      if (addition === undefined) {
        continue;
      }
      const { root, storageRootKey, provider } = addition;
      const state: ObservedExternalRoot = {
        storageRootKey,
        backend: 'webaccess',
        directoryHandle: root.directoryHandle,
        provider,
        nativeActive: false,
        pollSnapshots: new Map(),
        tail: Promise.resolve(),
      };
      this._observedExternalRoots.set(storageRootKey, state);
      const pendingRecords: NativeFileSystemChangeRecord[] = [];
      const observer = this._createNativeFileSystemObserver((records) => {
        if (this._observedExternalRoots.get(storageRootKey) !== state) {
          return;
        }
        if (!state.nativeActive) {
          pendingRecords.push(...records);
          return;
        }
        const activeObserver = state.observer;
        if (activeObserver === undefined) {
          return;
        }
        // async-iife: Browser observer callbacks cannot await their handler.
        void this._handleNativeExternalRecords(state, activeObserver, records);
      });
      if (observer === undefined) {
        continue;
      }
      state.observer = observer;
      const observation = async (): Promise<void> => {
        try {
          if (this._observedExternalRoots.get(storageRootKey) !== state) {
            return;
          }
          try {
            await observer.observe(root.directoryHandle, { recursive: true });
          } catch {
            observer.disconnect();
            state.observer = undefined;
            return;
          }
          await this._queueExternalRootOperation(state, async () => {
            if (this._observedExternalRoots.get(storageRootKey) !== state) {
              observer.disconnect();
              return;
            }
            state.nativeActive = true;
            if (pendingRecords.length > 0) {
              await this._applyNativeExternalRecords(state, pendingRecords.splice(0));
            }
          });
          await this._pollExternalRoot(state);
        } catch {
          this._disableNativeObservation(state);
        }
      };
      // async-iife: Browser observers are started after async provider discovery.
      void observation();
    }
  }

  /**
   * Attach every new node root to its host-side watcher.
   *
   * The watcher lives with the bytes in the services utility (substrate
   * invariant 3); its events land on the same `ChangeEventBus` path the
   * browser's `FileSystemObserver` records take, so the file tree, the file
   * pool, and cross-tab coordination need no node-specific arm.
   */
  private async _observeNodeRoots(
    entries: ReadonlyArray<{ scope: Extract<WorkspaceScope, { backend: 'node' }>; storageRootKey: string }>,
  ): Promise<void> {
    const additions = await Promise.all(
      entries
        .filter(({ storageRootKey }) => !this._observedExternalRoots.has(storageRootKey))
        .map(async ({ scope, storageRootKey }) => {
          try {
            return { storageRootKey, provider: await this._registry.getProvider(scope) };
          } catch {
            return undefined;
          }
        }),
    );
    for (const addition of additions) {
      if (addition === undefined || !isSelfObserving(addition.provider)) {
        continue;
      }
      const { storageRootKey, provider } = addition;
      const state: ObservedExternalRoot = {
        storageRootKey,
        backend: 'node',
        provider,
        nativeActive: true,
        pollSnapshots: new Map(),
        tail: Promise.resolve(),
      };
      this._observedExternalRoots.set(storageRootKey, state);
      // async-iife: bootstrap — arming crosses a process boundary; mounting must not block on it.
      void (async () => {
        try {
          const unwatch = await provider.watch(
            { paths: [''], recursive: true, excludes: externalWatchExcludes },
            (event) => {
              if (this._observedExternalRoots.get(storageRootKey) !== state) {
                return;
              }
              if (event.type === 'reset') {
                // The host lost a watcher: drop every derivative and resummarize,
                // exactly as a lost browser observer does.
                this._disableNativeObservation(state);
                return;
              }
              // async-iife: bootstrap — a watch callback cannot await its own serialization.
              void (async () => {
                try {
                  await this._queueExternalRootOperation(state, async () => {
                    await this._applyNativeExternalRecords(state, [toExternalRecord(event)]);
                  });
                } catch {
                  this._disableNativeObservation(state);
                }
              })();
            },
          );
          if (this._observedExternalRoots.get(storageRootKey) === state) {
            state.unwatch = unwatch;
          } else {
            unwatch();
          }
        } catch {
          this._disableNativeObservation(state);
        }
      })();
    }
  }

  private _createNativeFileSystemObserver(
    callback: (records: readonly NativeFileSystemChangeRecord[]) => void,
  ): NativeFileSystemObserver | undefined {
    const browser = globalThis as typeof globalThis & {
      FileSystemObserver?: NativeFileSystemObserverConstructor;
    };
    return typeof browser.FileSystemObserver === 'function' ? new browser.FileSystemObserver(callback) : undefined;
  }

  private _disconnectExternalRoot(storageRootKey: string): void {
    const state = this._observedExternalRoots.get(storageRootKey);
    this._observedExternalRoots.delete(storageRootKey);
    state?.unwatch?.();
    state?.observer?.disconnect();
    if (state !== undefined) {
      state.pollSnapshots.clear();
    }
  }

  private async _handleNativeExternalRecords(
    state: ObservedExternalRoot,
    observer: NativeFileSystemObserver,
    records: readonly NativeFileSystemChangeRecord[],
  ): Promise<void> {
    try {
      await this._queueExternalRootOperation(state, async () => {
        if (state.observer !== observer || !state.nativeActive) {
          return;
        }
        await this._applyNativeExternalRecords(state, records);
      });
    } catch {
      this._disableNativeObservation(state);
    }
  }

  private async _queueExternalRootOperation(
    state: ObservedExternalRoot,
    operation: () => Promise<void>,
  ): Promise<void> {
    const predecessor = state.tail;
    let release: () => void;
    state.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      try {
        await predecessor;
      } catch {
        // A rejected record must not strand later native or polling facts.
      }
      if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
        return;
      }
      await operation();
    } finally {
      release!();
    }
  }

  private async _pollExternalRoot(state: ObservedExternalRoot, providerBasePath?: string): Promise<void> {
    const scope = providerBasePath ?? '*';
    const snapshot = await this._createExternalSnapshot(state, providerBasePath);
    await this._queueExternalRootOperation(state, async () => {
      await this._applyExternalSnapshot(state, scope, snapshot);
    });
  }

  private async _applyNativeExternalRecords(
    state: ObservedExternalRoot,
    records: readonly NativeFileSystemChangeRecord[],
  ): Promise<void> {
    const admittedRecords = records.filter(
      (record) =>
        !this._isChromiumSwapOnlyRecord(record) &&
        !isWorkspaceStatePath(this._physicalPath(record.relativePathComponents)),
    );
    if (admittedRecords.length === 0) {
      return;
    }
    if (admittedRecords.some(({ type }) => type === 'errored')) {
      this._disableNativeObservation(state);
      return;
    }
    if (admittedRecords.some(({ type }) => type === 'unknown')) {
      await this._reconcileUnknownExternalRecords(state, admittedRecords);
      return;
    }

    const prepared = admittedRecords.map((record) => {
      const physicalPath = this._physicalPath(record.relativePathComponents);
      const oldPhysicalPath = Array.isArray(record.relativePathMovedFrom)
        ? this._physicalPath(record.relativePathMovedFrom)
        : undefined;
      const mappings = this._logicalMappingsForPhysicalPath(state, physicalPath);
      const knownKinds = new Map(
        mappings.map(({ path, resolution }) => [resolution.entry, this._treeIndexes.statType(path)] as const),
      );
      return { record, physicalPath, oldPhysicalPath, mappings, knownKinds };
    });

    const physicalPaths = prepared.flatMap(({ physicalPath, oldPhysicalPath }) =>
      oldPhysicalPath === undefined ? [physicalPath] : [physicalPath, oldPhysicalPath],
    );
    await state.provider.refresh?.(physicalPaths);
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    this._invalidateExternalDerivatives({ state, physicalPaths });
    let discoveryChanged = false;
    for (const change of prepared) {
      const { record, physicalPath, mappings, knownKinds } = change;
      discoveryChanged ||=
        mappings.length === 0 ||
        this._isDiscoveryRelevantPhysicalPath(physicalPath) ||
        (record.type === 'moved' &&
          change.oldPhysicalPath !== undefined &&
          this._isDiscoveryRelevantPhysicalPath(change.oldPhysicalPath));
      switch (record.type) {
        case 'appeared': {
          if (mappings.length === 0 && !this._isDiscoveryRelevantPhysicalPath(physicalPath)) {
            this._emitExternalRootSummaries(state);
          }
          for (const mapping of mappings) {
            this._emitExternalCreation(mapping, record.changedHandle?.kind);
          }
          break;
        }
        case 'modified': {
          if (mappings.length === 0 && !this._isDiscoveryRelevantPhysicalPath(physicalPath)) {
            this._emitExternalRootSummaries(state);
          }
          for (const mapping of mappings) {
            if (record.changedHandle?.kind === 'file') {
              this._emitExternalFileWrite(mapping);
            } else {
              this._emitExternalDirectorySummary(mapping, mapping.path);
            }
          }
          break;
        }
        case 'disappeared': {
          if (mappings.length === 0) {
            this._emitExternalRootSummaries(state);
          }
          for (const mapping of mappings) {
            const kind = knownKinds.get(mapping.resolution.entry);
            if (kind === 'file' || kind === 'dir') {
              this._emitExternalDeletion(mapping, kind);
            } else {
              this._emitExternalDirectorySummary(mapping, parentDirectory(mapping.path));
            }
          }
          break;
        }
        case 'moved': {
          this._emitExternalRootSummaries(state);
          break;
        }
        default: {
          throw new Error(`Unexpected admitted native record: ${record.type}`);
        }
      }
    }
    if (discoveryChanged) {
      this._emitGlobalDiscoveryChange(state);
    }
  }

  private _physicalPath(components: readonly string[]): string {
    return assertRootedPath(components.join('/'));
  }

  private _isChromiumSwapOnlyRecord(record: NativeFileSystemChangeRecord): boolean {
    if (record.type === 'unknown' || record.type === 'errored') {
      return false;
    }
    const current = record.relativePathComponents.at(-1);
    if (current === undefined || !isChromiumSwapArtifactName(current)) {
      return false;
    }
    if (record.type !== 'moved' || record.relativePathMovedFrom === undefined) {
      return true;
    }
    const previous = record.relativePathMovedFrom.at(-1);
    return previous !== undefined && isChromiumSwapArtifactName(previous);
  }

  private _logicalMappingsForPhysicalPath(state: ObservedExternalRoot, physicalPath: string): ExternalLogicalMapping[] {
    const mappings: ExternalLogicalMapping[] = [];
    for (const entry of this._mountTable.listMounts()) {
      if (entry.provider !== state.provider || entry.storageRootKey !== state.storageRootKey) {
        continue;
      }
      const base = entry.providerBasePath;
      if (physicalPath !== base && !(base === '' ? physicalPath !== '' : physicalPath.startsWith(`${base}/`))) {
        continue;
      }
      const suffix = base === '' ? physicalPath : physicalPath === base ? '' : physicalPath.slice(base.length + 1);
      const path =
        suffix === ''
          ? entry.prefix
          : entry.prefix === '/'
            ? resolveAuthorityPath(`/${suffix}`)
            : resolveAuthorityPath(`${entry.prefix}/${suffix}`);
      mappings.push({
        path,
        resolution: { provider: state.provider, path: physicalPath, backend: entry.backend, entry },
      });
    }
    return mappings;
  }

  private _emitExternalCreation(mapping: ExternalLogicalMapping, kind: FileSystemHandle['kind'] | undefined): void {
    if (kind === 'file') {
      this._emitExternalFileWrite(mapping);
      return;
    }
    if (kind === 'directory') {
      this._pipeline.emitChangeEvent(
        { type: 'directoryCreated', path: mapping.path, backend: mapping.resolution.backend },
        undefined,
        { operations: [mapping] },
      );
      this._crossTabCoordinator.notifyMutation({
        type: 'mkdir',
        path: mapping.path,
        authority: this._pipeline.physicalAuthority(mapping.resolution),
      });
      return;
    }
    this._emitExternalDirectorySummary(mapping, parentDirectory(mapping.path));
  }

  private _emitExternalFileWrite(mapping: ExternalLogicalMapping): void {
    this._pipeline.emitChangeEvent(
      { type: 'fileWritten', path: mapping.path, backend: mapping.resolution.backend },
      undefined,
      {
        operations: [mapping],
      },
    );
    this._crossTabCoordinator.notifyMutation({
      type: 'write',
      path: mapping.path,
      authority: this._pipeline.physicalAuthority(mapping.resolution),
    });
  }

  private _emitExternalDeletion(mapping: ExternalLogicalMapping, kind: 'file' | 'dir'): void {
    this._pipeline.emitChangeEvent(
      kind === 'file'
        ? { type: 'fileDeleted', path: mapping.path, backend: mapping.resolution.backend }
        : { type: 'directoryDeleted', path: mapping.path, backend: mapping.resolution.backend },
      undefined,
      { operations: [mapping] },
    );
    this._crossTabCoordinator.notifyMutation({
      type: kind === 'file' ? 'delete' : 'rmdir',
      path: mapping.path,
      authority: this._pipeline.physicalAuthority(mapping.resolution),
    });
  }

  private _emitExternalDirectorySummary(mapping: ExternalLogicalMapping, logicalPath: string): void {
    const separator = mapping.resolution.path.lastIndexOf('/');
    const physicalPath =
      logicalPath === mapping.path
        ? mapping.resolution.path
        : separator === -1
          ? ''
          : mapping.resolution.path.slice(0, separator);
    const resolution = { ...mapping.resolution, path: physicalPath };
    this._pipeline.emitChangeEvent(
      { type: 'directoryChanged', path: logicalPath, backend: mapping.resolution.backend },
      undefined,
      { operations: [{ path: logicalPath, resolution }] },
    );
    this._crossTabCoordinator.notifyDirectoryChange(logicalPath, this._pipeline.physicalAuthority(mapping.resolution));
  }

  private _emitExternalRootSummaries(state: ObservedExternalRoot, providerBasePath?: string): void {
    for (const entry of this._mountTable.listMounts()) {
      if (
        entry.provider !== state.provider ||
        entry.storageRootKey !== state.storageRootKey ||
        (providerBasePath !== undefined && entry.providerBasePath !== providerBasePath)
      ) {
        continue;
      }
      this._emitExternalDirectorySummary(
        {
          path: entry.prefix,
          resolution: {
            provider: state.provider,
            path: entry.providerBasePath,
            backend: entry.backend,
            entry,
          },
        },
        entry.prefix,
      );
    }
  }

  private _disableNativeObservation(state: ObservedExternalRoot): void {
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    state.observer?.disconnect();
    state.observer = undefined;
    state.nativeActive = false;
    // async-iife: bootstrap — observer callbacks cannot await recovery, but reset facts
    // must remain serialized behind any native/poll operation already in flight.
    void (async (): Promise<void> => {
      try {
        await this._queueExternalRootOperation(state, async () => {
          await state.provider.refresh?.();
          if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
            return;
          }
          this._invalidateExternalDerivatives();
          this._emitExternalRootSummaries(state);
          this._emitGlobalDiscoveryChange(state);
        });
      } catch {
        // Polling remains active and can retry after a provider refresh failure.
      }
    })();
  }

  /**
   * Drop the derivatives an external change invalidated.
   *
   * @param scoped - Root and provider-physical paths whose subtrees changed. Omit
   *                 for a full drop when the change cannot be localized.
   */
  private _invalidateExternalDerivatives(scoped?: {
    state: ObservedExternalRoot;
    physicalPaths: readonly string[];
  }): void {
    if (scoped === undefined) {
      this._filePool?.clear();
    } else {
      for (const physicalPath of scoped.physicalPaths) {
        for (const { path } of this._logicalMappingsForPhysicalPath(scoped.state, physicalPath)) {
          this._filePool?.invalidate(path);
        }
      }
    }
    // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
    // ponytail: the tree is dropped whole even for a localized change — TreeIndex
    // cannot express "this subtree is unknown", and a scoped removal would publish a
    // stale absence. Give it a subtree-invalidation state if the rebuild scan shows up hot.
    this._treeIndexes.clear();
  }

  /**
   * Provider-physical paths whose subtrees differ between two snapshots.
   *
   * @param previous - Snapshot captured on the last pass.
   * @param next - Snapshot captured on this pass.
   * @returns Changed paths, or `undefined` when the diff cannot be localized.
   */
  private _diffExternalSnapshot(previous: string, next: string): string[] | undefined {
    if (previous === missingExternalSnapshot || next === missingExternalSnapshot) {
      return undefined;
    }
    const rowsByPath = (snapshot: string): Map<string, string> =>
      new Map(snapshot === '' ? [] : snapshot.split('\n').map((row) => [row.slice(0, row.indexOf('\0')), row]));
    const previousRows = rowsByPath(previous);
    const nextRows = rowsByPath(next);
    // Every snapshot row is relative to the workspace root, rooted or discovery-wide.
    const changed: string[] = [];
    for (const [relative, row] of previousRows) {
      if (nextRows.get(relative) !== row) {
        changed.push(relative);
      }
    }
    for (const relative of nextRows.keys()) {
      if (!previousRows.has(relative)) {
        changed.push(relative);
      }
    }
    return changed.length > maxLocalizedExternalChanges ? undefined : changed;
  }

  private _emitGlobalDiscoveryChange(state: ObservedExternalRoot): void {
    this._pipeline.emitChangeEvent({ type: 'directoryChanged', path: '/', backend: state.backend });
    this._crossTabCoordinator.notifyDirectoryChange('/', {
      storageRootKey: state.storageRootKey,
      providerBasePath: '',
    });
  }

  private _isDiscoveryRelevantPhysicalPath(path: string): boolean {
    if (isWorkspaceStatePath(path)) {
      return false;
    }
    const [, child, ...deeper] = path.split('/').filter(Boolean);
    return child === undefined || (deeper.length === 0 && child === 'tau.json');
  }

  private async _createExternalSnapshot(state: ObservedExternalRoot, providerBasePath?: string): Promise<string> {
    const rows: string[] = [];
    type EntryHandle = FileSystemDirectoryHandle | FileSystemFileHandle;
    type IterableDirectoryHandle = FileSystemDirectoryHandle & {
      entries(): AsyncIterableIterator<[string, EntryHandle]>;
    };
    const admittedEntries = async (handle: FileSystemDirectoryHandle): Promise<Array<[string, EntryHandle]>> => {
      const entries: Array<[string, EntryHandle]> = [];
      for await (const entry of (handle as IterableDirectoryHandle).entries()) {
        if (!isChromiumSwapArtifactName(entry[0])) {
          entries.push(entry);
        }
      }
      return entries.toSorted(([left], [right]) => left.localeCompare(right));
    };
    // Resolve one row per name in chunks, so metadata reads overlap without unbounded handle pressure.
    const resolveRows = async <T>(
      names: readonly T[],
      toRow: (item: T) => Promise<[name: string, row: string | undefined]>,
    ): Promise<Map<string, string>> => {
      const resolved = new Map<string, string>();
      for (let offset = 0; offset < names.length; offset += externalSnapshotConcurrency) {
        // oxlint-disable-next-line no-await-in-loop -- Chunked awaits are what bound concurrency to externalSnapshotConcurrency.
        const chunk = await Promise.all(
          names.slice(offset, offset + externalSnapshotConcurrency).map(async (item) => toRow(item)),
        );
        for (const [name, row] of chunk) {
          if (row !== undefined) {
            resolved.set(name, row);
          }
        }
      }
      return resolved;
    };
    const fileRow = async (name: string, relative: string, handle: FileSystemFileHandle): Promise<[string, string]> => {
      const file = await handle.getFile();
      return [name, `${relative}\0file\0${file.size}\0${file.lastModified}`];
    };
    const walk = async (handle: FileSystemDirectoryHandle, relative: string): Promise<void> => {
      const entries = await admittedEntries(handle);
      const childRelative = (name: string): string => (relative === '' ? name : `${relative}/${name}`);
      const fileRows = await resolveRows(
        entries.filter((entry): entry is [string, FileSystemFileHandle] => entry[1].kind === 'file'),
        async ([name, child]) => fileRow(name, childRelative(name), child),
      );
      for (const [name, child] of entries) {
        if (child.kind === 'directory') {
          rows.push([childRelative(name), 'dir', 0, 0].join('\0'));
          // oxlint-disable-next-line no-await-in-loop -- Recursive fallback polling is intentionally sequential.
          await walk(child, childRelative(name));
        } else {
          rows.push(fileRows.get(name)!);
        }
      }
    };
    const rootHandle = state.directoryHandle;
    if (rootHandle === undefined) {
      // Snapshot polling exists to cover a browser observer that cannot be
      // trusted. A node root reports its own changes and never reaches here.
      throw new Error(`Snapshot polling is unavailable for a ${state.backend} root.`);
    }
    try {
      if (providerBasePath !== undefined) {
        const parts = providerBasePath.split('/').filter(Boolean);
        let handle = rootHandle;
        for (const part of parts) {
          // oxlint-disable-next-line no-await-in-loop -- Directory-handle traversal is necessarily ordered.
          handle = await handle.getDirectoryHandle(part);
        }
        await walk(handle, parts.join('/'));
        return rows.join('\n');
      }
      // App state under a dot-prefixed root child never feeds discovery (F1).
      const rootEntries = await admittedEntries(rootHandle);
      const entries = rootEntries.filter(([name]) => !name.startsWith('.'));
      const topLevelRows = await resolveRows(entries, async ([name, child]) => {
        if (child.kind === 'file') {
          return fileRow(name, name, child);
        }
        try {
          // Project discovery only depends on the immediate directory and its manifest.
          const manifestHandle = await child.getFileHandle('tau.json');
          const manifest = await manifestHandle.getFile();
          return [name, `${name}/tau.json\0file\0${manifest.size}\0${manifest.lastModified}`];
        } catch (error) {
          if (!isNotFoundError(error)) {
            throw error;
          }
          return [name, undefined];
        }
      });
      for (const [name, child] of entries) {
        if (child.kind === 'file') {
          rows.push(topLevelRows.get(name)!);
          continue;
        }
        rows.push([name, 'dir', 0, 0].join('\0'));
        const manifestRow = topLevelRows.get(name);
        if (manifestRow !== undefined) {
          rows.push(manifestRow);
        }
      }
    } catch (error) {
      if (isNotFoundError(error)) {
        return missingExternalSnapshot;
      }
      throw error;
    }
    return rows.join('\n');
  }

  private async _reconcileUnknownExternalRecords(
    state: ObservedExternalRoot,
    records: readonly NativeFileSystemChangeRecord[],
  ): Promise<void> {
    const providerBasePaths = new Set<string>();
    for (const record of records) {
      const mappings = this._logicalMappingsForPhysicalPath(state, this._physicalPath(record.relativePathComponents));
      for (const { resolution } of mappings) {
        const providerBasePath = resolution.entry?.providerBasePath;
        if (providerBasePath) {
          providerBasePaths.add(providerBasePath);
        }
      }
    }
    if (providerBasePaths.size !== 1) {
      const next = await this._createExternalSnapshot(state);
      await this._applyExternalSnapshot(state, '*', next);
      return;
    }
    const providerBasePath = [...providerBasePaths][0]!;
    const next = await this._createExternalSnapshot(state, providerBasePath);
    await this._applyExternalSnapshot(state, providerBasePath, next);
  }

  private async _applyExternalSnapshot(state: ObservedExternalRoot, scope: string, next: string): Promise<void> {
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    const previous = state.pollSnapshots.get(scope);
    if (previous === undefined) {
      if (state.nativeActive) {
        await state.provider.refresh?.();
        if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
          return;
        }
        this._invalidateExternalDerivatives();
        this._emitExternalRootSummaries(state, scope === '*' ? undefined : scope);
        this._emitGlobalDiscoveryChange(state);
      }
      state.pollSnapshots.set(scope, next);
      return;
    }
    if (previous === next) {
      return;
    }
    const physicalPaths = this._diffExternalSnapshot(previous, next);
    await state.provider.refresh?.(physicalPaths);
    if (this._observedExternalRoots.get(state.storageRootKey) !== state) {
      return;
    }
    this._invalidateExternalDerivatives(physicalPaths === undefined ? undefined : { state, physicalPaths });
    this._emitExternalRootSummaries(state, scope === '*' ? undefined : scope);
    this._emitGlobalDiscoveryChange(state);
    state.pollSnapshots.set(scope, next);
  }

  private async _applyRemoteChange(notification: ChangeNotification): Promise<void> {
    if (notification.type === 'project-unavailable') {
      const current = this._mountTable.getExactMount(notification.path);
      if (
        current?.storageRootKey !== notification.authority.storageRootKey ||
        current.providerBasePath !== notification.authority.providerBasePath
      ) {
        return;
      }
      this._revokeProjectRoute(notification.path, false);
      return;
    }
    const pendingProvider = this._registry.getOwnedProvider(notification.authority.storageRootKey);
    if (pendingProvider === undefined) {
      return;
    }
    const provider = await pendingProvider;
    if (this._registry.getOwnedProvider(notification.authority.storageRootKey) !== pendingProvider) {
      return;
    }
    const entry = this._findMountForPhysicalAuthority(notification.path, notification.authority, provider);
    const isDiscoveryRootChange =
      notification.type === 'directory-change' &&
      notification.path === '/' &&
      notification.authority.providerBasePath === '' &&
      this._discoveryRoots.some((root) => root.storageRootKey === notification.authority.storageRootKey);
    if (entry === undefined && !isDiscoveryRootChange) {
      return;
    }
    const backend = this._backendForPhysicalAuthority(notification.authority);
    try {
      await provider.refresh?.();
    } catch {
      this._handleRemoteFailure(notification, backend);
      return;
    }

    const resolution =
      entry === undefined
        ? undefined
        : this._remoteResolution({ path: notification.path, authority: notification.authority, provider, entry });
    const isCurrent = resolution !== undefined && this._pipeline.isCurrentResolution(notification.path, resolution);
    if (!isCurrent && !isDiscoveryRootChange) {
      return;
    }

    if (isCurrent || isDiscoveryRootChange) {
      this._filePool?.clear();
      this._treeIndexes.clear();
    }

    if (notification.type === 'directory-change') {
      this._pipeline.emitChangeEvent(
        { type: 'directoryChanged', path: notification.path, backend },
        undefined,
        resolution === undefined ? undefined : { operations: [{ path: notification.path, resolution }] },
      );
      return;
    }
    if (resolution === undefined) {
      return;
    }

    const event: ChangeEvent =
      notification.type === 'write'
        ? { type: 'fileWritten', path: notification.path, backend }
        : notification.type === 'mkdir'
          ? { type: 'directoryCreated', path: notification.path, backend }
          : notification.type === 'delete'
            ? { type: 'fileDeleted', path: notification.path, backend }
            : { type: 'directoryDeleted', path: notification.path, backend };
    this._pipeline.emitChangeEvent(event, undefined, {
      operations: [{ path: notification.path, resolution }],
    });
  }

  private _findMountForPhysicalAuthority(
    path: string,
    authority: PhysicalAuthority,
    provider: FileSystemProvider,
  ): MountEntry | undefined {
    try {
      const current = this._mountTable.resolve(path).entry;
      if (
        current?.provider === provider &&
        current.storageRootKey === authority.storageRootKey &&
        current.providerBasePath === authority.providerBasePath
      ) {
        return current;
      }
    } catch {
      // An unroutable notification cannot identify a live projection.
    }
    return undefined;
  }

  private _remoteResolution(options: {
    path: string;
    authority: PhysicalAuthority;
    provider: FileSystemProvider;
    entry: MountEntry;
  }): MountResolution {
    const { path, authority, provider, entry } = options;
    try {
      const current = this._mountTable.resolve(path);
      if (current.entry === entry) {
        return current;
      }
    } catch {
      // The captured physical entry may no longer be globally routable.
    }
    return { provider, path: authority.providerBasePath, backend: entry.backend, entry };
  }

  private _backendForPhysicalAuthority(authority: PhysicalAuthority): FileSystemBackend {
    const entry = this._mountTable
      .listMounts()
      .find(
        (mount) =>
          mount.storageRootKey === authority.storageRootKey && mount.providerBasePath === authority.providerBasePath,
      );
    if (entry !== undefined) {
      return entry.backend;
    }
    if (authority.storageRootKey.startsWith('indexeddb:')) {
      return 'indexeddb';
    }
    if (authority.storageRootKey.startsWith('opfs:')) {
      return 'opfs';
    }
    if (authority.storageRootKey.startsWith('webaccess:')) {
      return 'webaccess';
    }
    return 'memory';
  }

  private _handleRemoteFailure(notification: ChangeNotification, backend?: FileSystemBackend): void {
    this._filePool?.clear();
    this._treeIndexes.clear();
    if (notification.type === 'project-unavailable') {
      this._watchRegistry.emitResetAll();
      return;
    }
    this._pipeline.emitChangeEvent({
      type: 'backendChanged',
      backend: backend ?? this._backendForPhysicalAuthority(notification.authority),
    });
  }

  private _revokeProjectRoute(path: string, notifyPeers: boolean): void {
    const mount = this._mountTable.getExactMount(path);
    const hadRoute = mount !== undefined || this._projectRoutes.has(path);
    if (hadRoute) {
      this._mountTable.unmount(path);
      this._projectRoutes.delete(path);
      this._resetTopologyState();
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

  private _resetTopologyState(): void {
    this._filePool?.clear();
    this._treeIndexes.clear();
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

          const fullPath = joinRelativePath(currentPath, entry.name);
          if (entry.type === 'file') {
            const relativePath = innerBasePath === '' ? fullPath : fullPath.slice(innerBasePath.length + 1);
            const segments = relativePath.split('/');
            const filename = segments.at(-1) ?? relativePath;
            fileStats.push({
              path: relativePath,
              name: filename,
              type: 'file',
              size: entry.size,
              mtimeMs: entry.mtimeMs,
              ...fileMetadataFields(entry),
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

          const fullPath = joinRelativePath(currentPath, entry);
          // oxlint-disable-next-line no-await-in-loop -- Sequential stat required for recursive tree walk
          const stat = await provider.stat(fullPath);
          if (stat.type === 'file') {
            const relativePath = innerBasePath === '' ? fullPath : fullPath.slice(innerBasePath.length + 1);
            const segments = relativePath.split('/');
            const filename = segments.at(-1) ?? relativePath;
            fileStats.push({
              path: relativePath,
              name: filename,
              type: 'file',
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              ...fileMetadataFields(stat),
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

  /**
   * One root's index, scanned from its provider only when cold (D3).
   *
   * @param root - Absolute authority root the index is keyed by.
   * @returns The warm index for that root.
   */
  private async _treeIndexFor(root: string): Promise<TreeIndex> {
    const warm = this._treeIndexes.get(root);
    if (warm !== undefined) {
      return warm;
    }
    const { provider, path } = this._resolveProvider(root);
    const stats = await this._collectDirectoryStatsFromProvider(provider, { walkPath: path, basePath: path });
    return this._treeIndexes.build(root, stats);
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

  private _validatePendingProjectCommit(input: CommitPendingProjectDirectoryInput): {
    path: string;
    files: Array<readonly [string, { readonly content: Uint8Array<ArrayBuffer>; readonly mode?: '100644' | '100755' }]>;
    manifest: Uint8Array<ArrayBuffer>;
    scope: StorageRootConfig;
    storageRootKey: string;
    projectId: string;
  } {
    const parsedInput = pendingProjectCommitInputSchema.safeParse(input);
    if (!parsedInput.success) {
      throw new TypeError(parsedInput.error.issues[0]?.message ?? 'Pending project commit input is invalid');
    }
    const manifest = new Uint8Array(parsedInput.data.manifest);
    const parsedManifest = parseProjectManifestBytes(manifest);
    if (!parsedManifest.success) {
      throw new TypeError('Pending project commit manifest is invalid');
    }
    const projectId = parsedManifest.data.id;
    const scope: StorageRootConfig = { ...parsedInput.data.scope };
    const storageRootKey = this._registry.resolveStorageRootKey(scope);
    const path = parsedInput.data.providerBasePath;
    const files: Array<
      readonly [string, { readonly content: Uint8Array<ArrayBuffer>; readonly mode?: '100644' | '100755' }]
    > = [];
    for (const [relativePath, { content, mode }] of Object.entries(parsedInput.data.files)) {
      const ownedContent = new Uint8Array(content);
      files.push([relativePath, { content: ownedContent, ...(mode === undefined ? {} : { mode }) }]);
    }

    return {
      path,
      files: files.sort(([left], [right]) => left.localeCompare(right)),
      manifest,
      scope,
      storageRootKey,
      projectId,
    };
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

  private _scopedPhysicalAuthority(scope: WorkspaceScope, providerBasePath: string): PhysicalAuthority {
    return {
      storageRootKey: this._registry.resolveStorageRootKey(scope),
      providerBasePath: assertRootedPath(providerBasePath),
    };
  }

  private _assertGenericMutationPath(path: string, target?: string): void {
    if (isUnderBundledTypesMount(path)) {
      throw new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', path, target === undefined ? undefined : { target });
    }
  }

  private async _deleteProjectDirectory(
    provider: FileSystemProvider,
    directoryPath: string,
    manifest: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const manifestPath = joinRelativePath(directoryPath, 'tau.json');
    const entries = await provider.readdir(directoryPath);
    for (const entry of entries) {
      if (entry === 'tau.json') {
        continue;
      }
      const fullPath = joinRelativePath(directoryPath, entry);
      // oxlint-disable-next-line no-await-in-loop -- Preserve the manifest until every sibling is gone.
      await this._pipeline.removeRecursive(provider, fullPath);
    }
    await provider.unlink(manifestPath);
    try {
      await provider.rmdir(directoryPath);
    } catch (error) {
      try {
        if ((await provider.exists(directoryPath)) && !(await provider.exists(manifestPath))) {
          await provider.writeFile(manifestPath, manifest);
        }
      } catch {
        // Best effort only: preserve the original directory-removal failure.
      }
      throw error;
    }
  }
}
