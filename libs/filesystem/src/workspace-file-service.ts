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
  FileContentMetadata,
  FileStat,
  FileStatEntry,
  FileSystemBackend,
  ProjectManifest,
} from '@taucad/types';
import type {
  ChangeEvent,
  DirectoryEntry,
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
import { bufferToStream, validateFileReadStreamOptions } from '#backend/stream-utils.js';
import { isChromiumSwapArtifactName } from '#backend/fs-access-provider.js';
import { CrossTabCoordinator } from '#cross-tab-coordinator.js';
import type { ChangeNotification, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { SharedPool } from '@taucad/memory';
import type {
  MountTable,
  MountConfig,
  MountEntry,
  MountResolution,
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
import { getEventOrigin, tagEventAuthorities, tagEventOrigin } from '#event-origin-registry.js';
import { isSafeRelativePath, parentDirectory, joinPath, normalizePath, resolveVirtualPath } from '@taucad/utils/path';
import { MissingWorkspaceHandleError, RootedFileSystemError, WorkspaceMutationError } from '#workspace-errors.js';
import { fileMetadataFields, getFileContentMetadata } from '#content-metadata.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';

/** Milliseconds. */
const kernelCoalescingWindow = 75;

/**
 * Absolute prefix of the read-only synthetic mount that hosts the
 * bundled `.d.ts` payloads (see {@link populateBundledTypesMount}).
 * Mirrored by the UI-side `bundledTypesWorkspaceRootSegment` constant.
 */
const bundledTypesAbsolutePrefix = '/node_modules';

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
  readonly changedHandle?: FileSystemHandle;
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

type ObservedWebAccessRoot = {
  readonly storageRootKey: string;
  readonly directoryHandle: FileSystemDirectoryHandle;
  readonly provider: FileSystemProvider;
  observer?: NativeFileSystemObserver;
  nativeActive: boolean;
  readonly pollSnapshots: Map<string, string>;
  tail: Promise<void>;
};

type ExternalLogicalMapping = {
  readonly path: string;
  readonly resolution: MountResolution;
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
 * A physical project directory is an immediate, non-dot-prefixed child of the
 * workspace root: `<root>/<slug>`. Dot-prefixed children (`.tau`, `.git`) hold
 * app state and are never projects.
 *
 * @param path - Canonical provider-relative path.
 * @returns Whether the path names a project directory.
 */
function isProjectDirectoryPath(path: string): boolean {
  const segments = path.split('/').filter(Boolean);
  return segments.length === 1 && !segments[0]!.startsWith('.');
}

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
  return physicalPath.split('/')[1]?.startsWith('.') === true;
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
 * Map an arbitrary thrown value into a {@link WorkspaceMutationError}
 * by best-effort sniffing of well-known shapes (`EEXIST`, `ENOENT`,
 * {@link MissingWorkspaceHandleError}). Unknown causes retain a truthful
 * generic failure instead of being mislabeled as absence.
 *
 * @param cause - The thrown value to translate. Typically a node-style
 *                `ErrnoException`, a {@link MissingWorkspaceHandleError},
 *                or an existing {@link WorkspaceMutationError}.
 * @param source - Source path of the failing mutation (used for the
 *                 fall-through `OPERATION_FAILED` carrier).
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
  return new WorkspaceMutationError('OPERATION_FAILED', source, { target, cause });
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
    return resolveVirtualPath(path) === path;
  } catch {
    return false;
  }
}

/**
 * Options for {@link WorkspaceFileService.mkdir}.
 * @public
 */
export type MkdirOptions = {
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

/** Fully materialized files for one package-root replacement. @public */
export type BundledTypePackageReplacement = Readonly<{
  packageDirectory: string;
  files: ReadonlyArray<Readonly<{ path: string; content: string }>>;
}>;

/**
 * Filesystem provider surface issued for one captured mount.
 * @public
 */
export type RootedFileSystem = FileSystemProvider & {
  watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
};

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
  private _inMemoryTree = new InMemoryFileTree();
  private readonly _projectRoutes = new Set<string>();
  private _projectConfigurationTail: Promise<void> = Promise.resolve();
  private _remoteChangeTail: Promise<void> = Promise.resolve();
  private _discoveryRoots: ReadonlyArray<{
    root: ProjectRootConfiguration['roots'][number];
    scope: WorkspaceScope;
    storageRootKey: string;
  }> = [];
  private readonly _observedWebAccessRoots = new Map<string, ObservedWebAccessRoot>();
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
   * writable filesystem whose entire visible namespace is local `/`.
   *
   * @param authorityRoot - Exact authority-global mount path to capture.
   * @param mutationContext - Optional origin metadata for echo suppression.
   * @returns A writable filesystem whose root is the captured mount.
   */
  public createRootedFileSystem(authorityRoot: string, mutationContext?: WorkspaceMutationContext): RootedFileSystem {
    const root = resolveVirtualPath(authorityRoot);
    const captured = this._mountTable.getExactMount(root);
    if (captured === undefined) {
      throw new RootedFileSystemError('ROOT_UNAVAILABLE');
    }

    const assertCurrent = (): void => {
      if (this._mountTable.getExactMount(root) !== captured) {
        throw new RootedFileSystemError('ESTALE');
      }
    };
    const assertMutableRoot = (localPath: string): void => {
      if (localPath === '/') {
        throw new Error('Cannot remove or rename the rooted filesystem root.');
      }
    };
    const resolveLocal = (
      localPath: string,
    ): { authorityPath: string; resolution: MountResolution; localPath: string } => {
      const canonicalLocalPath = resolveVirtualPath(localPath);
      assertCurrent();
      const authorityPath = root === '/' ? canonicalLocalPath : resolveVirtualPath(`${root}${canonicalLocalPath}`);
      const providerPath =
        captured.providerBasePath === '/'
          ? canonicalLocalPath
          : resolveVirtualPath(`${captured.providerBasePath}${canonicalLocalPath}`);
      return {
        authorityPath,
        localPath: canonicalLocalPath,
        resolution: { provider: captured.provider, path: providerPath, backend: captured.backend, entry: captured },
      };
    };
    const toLocalPath = (authorityPath: string): string | undefined => {
      if (root === '/') {
        return authorityPath.startsWith('/') ? authorityPath : undefined;
      }
      if (authorityPath === root) {
        return '/';
      }
      if (!authorityPath.startsWith(`${root}/`)) {
        return undefined;
      }
      return authorityPath.slice(root.length);
    };
    const prefixGlob = (pattern: string): string => {
      const rootPrefix = root === '/' ? '' : root;
      return pattern.startsWith('/') ? `${rootPrefix}${pattern}` : pattern;
    };

    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const { resolution } = resolveLocal(path);
      return encoding === 'utf8'
        ? resolution.provider.readFile(resolution.path, 'utf8')
        : resolution.provider.readFile(resolution.path);
    }

    const readdir = async (path: string): Promise<string[]> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.readdir(resolution.path);
    };
    const stat = async (path: string): Promise<FileStat> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.stat(resolution.path);
    };
    const writeFile = async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._writeFileResolved({ path: authorityPath, resolution, data, context: mutationContext });
    };
    const mkdir = async (path: string, options?: MkdirOptions): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._mkdirResolved({ path: authorityPath, resolution, options, context: mutationContext });
    };
    const unlink = async (path: string): Promise<void> => {
      const { authorityPath, resolution, localPath } = resolveLocal(path);
      assertMutableRoot(localPath);
      await this._unlinkResolved({ path: authorityPath, resolution, context: mutationContext });
    };
    const rmdir = async (path: string): Promise<void> => {
      const { authorityPath, resolution, localPath } = resolveLocal(path);
      assertMutableRoot(localPath);
      await this._rmdirResolved({ path: authorityPath, resolution, context: mutationContext });
    };
    const rename = async (from: string, to: string): Promise<void> => {
      const source = resolveLocal(from);
      const target = resolveLocal(to);
      assertMutableRoot(source.localPath);
      assertMutableRoot(target.localPath);
      await this._moveResolved({
        source: source.authorityPath,
        target: target.authorityPath,
        sourceResolution: source.resolution,
        targetResolution: target.resolution,
        context: mutationContext,
      });
    };
    const exists = async (path: string): Promise<boolean> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.exists(resolution.path);
    };
    const lstat = async (path: string): Promise<FileStat> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.lstat(resolution.path);
    };
    const watch = (request: WatchRequest, handler: (event: WatchEvent) => void): (() => void) => {
      assertCurrent();
      if (request.paths.length === 0) {
        throw new TypeError('A rooted watch requires at least one path.');
      }
      const paths = request.paths.map((path) => resolveLocal(path).authorityPath);
      let active = true;
      let unsubscribe = (): void => undefined;
      const stop = (): void => {
        if (!active) {
          return;
        }
        active = false;
        unsubscribe();
      };
      unsubscribe = this._watchRegistry.watch(
        {
          ...request,
          paths,
          includes: request.includes?.map(prefixGlob),
          excludes: request.excludes?.map(prefixGlob),
        },
        (event) => {
          if (!active) {
            return;
          }
          try {
            assertCurrent();
          } catch (error) {
            if (error instanceof RootedFileSystemError && error.code === 'ESTALE') {
              stop();
              handler({ type: 'reset' });
              return;
            }
            throw error;
          }
          if (
            mutationContext?.originClientId !== undefined &&
            mutationContext.originClientId === getEventOrigin(event)
          ) {
            return;
          }
          if (event.type === 'reset') {
            handler(event);
            return;
          }
          if (event.type === 'rename') {
            const oldPath = toLocalPath(event.oldPath);
            const newPath = toLocalPath(event.newPath);
            if (oldPath !== undefined && newPath !== undefined) {
              handler({ ...event, oldPath, newPath });
            } else if (oldPath !== undefined) {
              handler({ type: 'delete', path: oldPath });
            } else if (newPath !== undefined) {
              handler({ type: 'change', path: newPath });
            }
            return;
          }
          const path = toLocalPath(event.path);
          if (path !== undefined) {
            handler({ ...event, path });
          }
        },
        { authority: captured },
      );
      return stop;
    };
    return {
      id: 'workspace-root',
      capabilities: captured.provider.capabilities,
      dispose() {
        // The provider and rooted view lifetime remain owned by WorkspaceFileService.
      },
      readFile,
      writeFile,
      readdir,
      stat,
      mkdir,
      unlink,
      rmdir,
      rename,
      exists,
      lstat,
      watch,
    };
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

    const canonicalPath = resolveVirtualPath(filepath);
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

    const { provider, path: resolvedPath } = this._resolveProvider(resolveVirtualPath(filepath));

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
    const canonicalPath = resolveVirtualPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    const ownedData = typeof data === 'string' ? data : new Uint8Array(data);
    return this._writeFileResolved({ path: canonicalPath, resolution, data: ownedData, context });
  }

  /**
   * Write multiple files through the canonical mutation path.
   *
   * @param files - Map of absolute path to content.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when all writes complete.
   */
  public async writeFiles(
    files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    const ownedFiles = Object.entries(files).map(([path, file]) => {
      const canonicalPath = resolveVirtualPath(path);
      this._assertGenericMutationPath(canonicalPath);
      return {
        path: canonicalPath,
        resolution: this._resolveProvider(canonicalPath),
        content: typeof file.content === 'string' ? file.content : new Uint8Array(file.content),
      };
    });
    const results = await Promise.allSettled(
      ownedFiles.map(async ({ path, resolution, content }) =>
        this._writeFileResolved({ path, resolution, data: content, context }),
      ),
    );
    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (firstFailure !== undefined) {
      // Every settled write already recorded itself; only the rejected paths hold
      // untrustworthy derivatives, so the batch's successes keep their cached state.
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          const { path } = ownedFiles[index]!;
          this._filePool?.invalidate(path);
          this._inMemoryTreeRemoveFile(path);
        }
      }
      const operationsByBackend = Map.groupBy(
        ownedFiles.map(({ path, resolution }) => ({ path, resolution })),
        ({ resolution }) => resolution.backend,
      );
      for (const [backend, operations] of operationsByBackend) {
        this._emitChangeEvent({ type: 'backendChanged', backend }, context, {
          operations,
          globallyVisible: operations.some(({ path, resolution }) => this._isCurrentResolution(path, resolution)),
        });
      }
      const notifiedParents = new Set<string>();
      for (const { path, resolution } of ownedFiles) {
        const parent = parentDirectory(path);
        const authority = this._physicalAuthority(resolution);
        const key = `${authority.storageRootKey}\0${authority.providerBasePath}\0${parent}`;
        if (!notifiedParents.has(key)) {
          notifiedParents.add(key);
          this._crossTabCoordinator.notifyDirectoryChange(parent, authority);
        }
      }
      if (firstFailure.reason instanceof Error) {
        throw firstFailure.reason;
      }
      throw new Error('Batch write failed with a non-Error rejection.', { cause: firstFailure.reason });
    }
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
    const canonicalPath = resolveVirtualPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    return this._mkdirResolved({ path: canonicalPath, resolution, options, context });
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
    const canonicalSource = resolveVirtualPath(source);
    const canonicalTarget = resolveVirtualPath(target);
    this._assertGenericMutationPath(canonicalSource, canonicalTarget);
    this._assertGenericMutationPath(canonicalTarget, canonicalSource);
    const sourceResolution = this._resolveProvider(canonicalSource);
    const targetResolution = this._resolveProvider(canonicalTarget);
    return this._moveResolved({
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
    const canonicalPath = resolveVirtualPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    return this._unlinkResolved({
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
    const canonicalPath = resolveVirtualPath(path);
    this._assertGenericMutationPath(canonicalPath);
    const resolution = this._resolveProvider(canonicalPath);
    return this._rmdirResolved({
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
   * @param edits - Source → target pairs.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns The {@link BulkMoveResult} describing successes + the failure (if any).
   */
  public async bulkMove(
    edits: ReadonlyArray<{ source: string; target: string }>,
    context?: WorkspaceMutationContext,
  ): Promise<{
    moved: ReadonlyArray<{ edit: { source: string; target: string }; stat: FileStat }>;
    failed: ReadonlyArray<{ edit: { source: string; target: string }; error: WorkspaceMutationError }>;
  }> {
    if (edits.length === 0) {
      return { moved: [], failed: [] };
    }

    const completed: Array<{ edit: { source: string; target: string }; stat: FileStat }> = [];
    const failed: Array<{ edit: { source: string; target: string }; error: WorkspaceMutationError }> = [];

    for (const edit of edits) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Result order and dependent edits require sequential moves.
        const stat = await this.move(edit.source, edit.target, context);
        completed.push({ edit, stat });
      } catch (error) {
        const mutationError = causeToMutationError(error, edit.source, edit.target);
        failed.push({ edit, error: mutationError });
      }
    }

    return { moved: completed, failed };
  }

  // --- Preflight checks (R6) ---

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
    const destination = resolveVirtualPath(destinationPath);
    this._assertGenericMutationPath(destination, resolveVirtualPath(sourcePath));
    const data = await this.readFile(sourcePath);
    await this.writeFile(destination, data, context);
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
    const source = resolveVirtualPath(sourcePath);
    const destination = resolveVirtualPath(destinationPath);
    this._assertGenericMutationPath(destination, source);
    const sourceResolution = this._resolveProvider(source);
    const destinationResolution = this._resolveProvider(destination);
    const lockPaths = this._mutationLockPaths([
      { path: source, resolution: sourceResolution },
      { path: destination, resolution: destinationResolution },
    ]);
    let mutationBegan = false;
    return this._crossTabCoordinator.withLocks(lockPaths, async () =>
      this._resourceQueue.queueForMany(lockPaths, async () => {
        try {
          await this._refreshMutationProviders([sourceResolution, destinationResolution]);
          this._assertNoDescendantMounts(source, 'copy');
          this._assertNoDescendantMounts(destination, 'copy');
          const snapshot = await this._getDirectoryContentsInternal(sourceResolution.provider, sourceResolution.path);
          const destinationEntries = ['', ...snapshot.directories].map((relativePath) => {
            const path = relativePath === '' ? destination : joinPath(destination, relativePath);
            const resolvedPath =
              relativePath === '' ? destinationResolution.path : joinPath(destinationResolution.path, relativePath);
            return { path, resolution: { ...destinationResolution, path: resolvedPath } };
          });
          for (const { path, resolution } of destinationEntries) {
            // oxlint-disable-next-line no-await-in-loop -- Preserve source directory order so parents exist before children.
            const existed = await resolution.provider.exists(resolution.path);
            mutationBegan = true;
            // oxlint-disable-next-line no-await-in-loop -- Preserve source directory order so parents exist before children.
            await resolution.provider.mkdir(resolution.path, { recursive: true });
            if (!existed) {
              if (this._isCurrentResolution(path, resolution)) {
                this._inMemoryTreeAddDirectory(path);
              }
              this._emitChangeEvent({ type: 'directoryCreated', path, backend: resolution.backend }, context, {
                operations: [{ path, resolution }],
              });
            }
          }
          const destinationFiles = Object.entries(snapshot.files).map(([relativePath, content]) => {
            const path = joinPath(destination, relativePath);
            const resolvedPath = joinPath(destinationResolution.path, relativePath);
            return { path, content, resolution: { ...destinationResolution, path: resolvedPath } };
          });
          for (const { path, content, resolution } of destinationFiles) {
            mutationBegan = true;
            // oxlint-disable-next-line no-await-in-loop -- Preserve deterministic local write ordering.
            await this._writeFileUnlocked({ path, resolution, data: content, context });
          }
          this._emitChangeEvent(
            {
              type: 'directoryCopied',
              sourcePath: source,
              targetPath: destination,
              backend: destinationResolution.backend,
            },
            context,
            { operations: [{ path: destination, resolution: destinationResolution }] },
          );
          this._crossTabCoordinator.notifyDirectoryChange(destination, this._physicalAuthority(destinationResolution));
        } catch (error) {
          if (mutationBegan) {
            const globallyVisible = this._isCurrentResolution(destination, destinationResolution);
            if (globallyVisible) {
              this._filePool?.clear();
              this._inMemoryTree.clear();
              this._directoryStatRoot = undefined;
            }
            this._emitChangeEvent({ type: 'backendChanged', backend: destinationResolution.backend }, context, {
              operations: [{ path: destination, resolution: destinationResolution }],
              globallyVisible,
            });
            this._crossTabCoordinator.notifyDirectoryChange(
              destination,
              this._physicalAuthority(destinationResolution),
            );
          }
          throw error;
        }
      }),
    );
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
      const packageDirectory = resolveVirtualPath(replacement.packageDirectory);
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
        const path = resolveVirtualPath(rawPath);
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
    const locks = this._mutationLockPaths([{ path: bundledTypesAbsolutePrefix, resolution: rootResolution }]);
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        let mutationBegan = false;
        try {
          await this._refreshMutationProviders([
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
              await this._rmdirRecursive(packageResolution.provider, packageResolution.path);
            }
            this._filePool?.invalidate(packageDirectory);
            this._inMemoryTreeRemoveDirectory(packageDirectory);
            for (const { path, content, resolution } of files) {
              mutationBegan = true;
              // oxlint-disable-next-line no-await-in-loop -- A package root becomes visible as one ordered generation.
              await this._writeFileUnlocked({ path, resolution, data: content });
            }
          }
          if (mutationBegan) {
            this._emitChangeEvent(
              { type: 'directoryChanged', path: bundledTypesAbsolutePrefix, backend: rootResolution.backend },
              undefined,
              { operations: [{ path: bundledTypesAbsolutePrefix, resolution: rootResolution }] },
            );
            this._crossTabCoordinator.notifyDirectoryChange(
              bundledTypesAbsolutePrefix,
              this._physicalAuthority(rootResolution),
            );
          }
        } catch (error) {
          if (mutationBegan) {
            this._filePool?.clear();
            this._inMemoryTreeRemoveDirectory(bundledTypesAbsolutePrefix);
            this._directoryStatRoot = undefined;
            this._emitChangeEvent({ type: 'backendChanged', backend: rootResolution.backend });
            this._crossTabCoordinator.notifyDirectoryChange(
              bundledTypesAbsolutePrefix,
              this._physicalAuthority(rootResolution),
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
   * @param path - Absolute directory path.
   * @returns Map of relative paths to file contents.
   */
  public async getDirectoryContents(path: string): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    const { provider, path: resolvedPath } = this._resolveProvider(path);
    const contents = await this._getDirectoryContentsInternal(provider, resolvedPath);
    return contents.files;
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
    const { files } = await this._getDirectoryContentsInternal(provider, resolvedPath);
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
        const fullPath = joinPath(resolvedPath, entry);
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
   * @param path - Absolute directory path to walk.
   * @param options - Optional abort signal for long walks.
   * @returns Flat array of file stat entries with relative paths.
   */
  public async getDirectoryStat(path: string, options?: { signal?: AbortSignal }): Promise<FileStatEntry[]> {
    const normalizedPath = resolveVirtualPath(path);

    if (this._inMemoryTree.isBuilt && this._directoryStatRoot !== undefined) {
      const treeRelativePath = this._toTreeRelative(normalizedPath);
      if (treeRelativePath !== undefined) {
        return this._inMemoryTree.getDirectoryStat(treeRelativePath);
      }
    }

    const { provider, path: resolvedPath } = this._resolveProvider(normalizedPath);
    const fileStats = await this._collectDirectoryStatsFromProvider(
      provider,
      { walkPath: resolvedPath, basePath: resolvedPath },
      options,
    );

    const nextTree = this._createInMemoryTree(fileStats);
    this._directoryStatRoot = normalizedPath;
    this._inMemoryTree = nextTree;

    return fileStats;
  }

  /**
   * Search one exact directory root for entries whose paths contain the query substring.
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
    const normalizedRoot = resolveVirtualPath(root);
    if (this._inMemoryTree.isBuilt && this._directoryStatRoot === normalizedRoot) {
      return this._inMemoryTree.searchFiles(query, options);
    }
    const { provider, path } = this._resolveProvider(normalizedRoot);
    const stats = await this._collectDirectoryStatsFromProvider(provider, { walkPath: path, basePath: path });
    const nextTree = this._createInMemoryTree(stats);
    this._directoryStatRoot = normalizedRoot;
    this._inMemoryTree = nextTree;
    return nextTree.searchFiles(query, options);
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
      const states = [...this._observedWebAccessRoots.values()];
      await Promise.all(states.map(async (state) => this._pollExternalRoot(state)));
      return states.length > 0 && states.every(({ nativeActive }) => nativeActive);
    }
    const resolution = this._mountTable.resolve(root);
    const { entry } = resolution;
    if (entry?.storageRootKey === undefined) {
      return false;
    }
    const state = [...this._observedWebAccessRoots.values()].find(
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
        const entries = await readDirectoryEntries(provider, '/');
        directories = entries
          .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.'))
          .map((entry) => entry.name)
          .sort();
      } catch (error) {
        roots.push({ status: 'inaccessible', root, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      const probe = async (directory: string): Promise<ProjectDiscoveryEntry | undefined> => {
        const relativeDirectory = `/${directory}`;
        const locator: ProjectLocator =
          root.backend === 'webaccess'
            ? {
                backend: root.backend,
                storageRootKey,
                relativeDirectory,
                workspaceId: root.workspaceId,
              }
            : { backend: root.backend, storageRootKey, relativeDirectory };
        let bytes: Uint8Array<ArrayBuffer>;
        try {
          bytes = await provider.readFile(`${relativeDirectory}/tau.json`);
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
    const path = resolveVirtualPath(locator.relativeDirectory);
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
        this._crossTabCoordinator.notifyDirectoryChange(path, this._scopedPhysicalAuthority(root.scope, path));
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
    const path = resolveVirtualPath(input.providerBasePath);
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
    const logicalRoot = `/projects/${projectId}`;
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
        const physicalParent = parentDirectory(path);
        const parentAuthority = this._scopedPhysicalAuthority(scope, physicalParent);
        try {
          await this._deleteProjectDirectory(provider, path, manifest);
        } finally {
          this._filePool?.clear();
          this._inMemoryTree.clear();
          this._directoryStatRoot = undefined;
          this._emitChangeEvent({ type: 'directoryChanged', path: physicalParent, backend: scope.backend });
          this._crossTabCoordinator.notifyDirectoryChange(physicalParent, parentAuthority);
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
    const logicalRoot = `/projects/${projectId}`;
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
            await this._rmdirRecursive(provider, path);
          }

          mutationBegan = true;
          await provider.mkdir(path, { recursive: true });
          this._filePool?.clear();
          this._inMemoryTreeRemoveDirectory(logicalRoot);

          for (const [relativePath, descriptor] of files) {
            const logicalPath = `${logicalRoot}/${relativePath}`;
            const providerPath = `${path}/${relativePath}`;
            // oxlint-disable-next-line no-await-in-loop -- deterministic manifest-last transaction
            await this._writeFileUnlocked({
              path: logicalPath,
              resolution: { provider, path: providerPath, backend: scope.backend },
              data: descriptor.content,
              context,
            });
          }

          await this._writeFileUnlocked({
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
            this._inMemoryTreeRemoveDirectory(logicalRoot);
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
    const canonicalPrefix = resolveVirtualPath(prefix);
    if (canonicalPrefix !== prefix) {
      throw new TypeError(`Dynamic mount prefix must already be canonical: ${prefix}`);
    }
    const previewInstance = this._previewInstance(canonicalPrefix);
    if (previewInstance === undefined && canonicalPrefix !== '/node_modules') {
      throw new TypeError(`Dynamic mount prefix is not admitted: ${prefix}`);
    }
    if (
      (previewInstance !== undefined &&
        (config.backend !== 'memory' || config.storageRootKey !== `memory:preview:${previewInstance}`)) ||
      (canonicalPrefix === '/node_modules' && config.backend !== 'opfs')
    ) {
      throw new TypeError(`Dynamic mount configuration does not match its protected prefix: ${prefix}`);
    }
    const providerBasePath = resolveVirtualPath(config.providerBasePath ?? '/');
    if (providerBasePath !== (config.providerBasePath ?? '/')) {
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
    this._mountTable.mount(canonicalPrefix, provider, { backend: config.backend, storageRootKey, providerBasePath });
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
    const canonicalPrefix = resolveVirtualPath(prefix);
    if (
      canonicalPrefix !== prefix ||
      (this._previewInstance(canonicalPrefix) === undefined && canonicalPrefix !== '/node_modules')
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
    for (const storageRootKey of this._observedWebAccessRoots.keys()) {
      this._disconnectExternalRoot(storageRootKey);
    }
    this._filePool?.clear();
    this._filePool = undefined;
    this._inMemoryTree.clear();
    this._directoryStatRoot = undefined;
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
    const stagedPrefixes = new Set<string>();
    const physicalRoutes = new Set<string>();
    const stagedInputs = configuration.projects.map((config) => {
      if (!projectIdSchema.safeParse(config.projectId).success) {
        throw new TypeError(`Invalid project id: ${JSON.stringify(config.projectId)}`);
      }
      const prefix = `/projects/${config.projectId}`;
      if (resolveVirtualPath(prefix) !== prefix || stagedPrefixes.has(prefix)) {
        throw new Error(`Duplicate project route: ${prefix}`);
      }
      stagedPrefixes.add(prefix);
      const providerBasePath = resolveVirtualPath(config.providerBasePath);
      if (providerBasePath !== config.providerBasePath) {
        throw new TypeError(`Project provider path must already be canonical: ${config.providerBasePath}`);
      }
      if (!isProjectDirectoryPath(providerBasePath)) {
        throw new TypeError(
          `Project provider path must be an immediate child of the workspace root: ${providerBasePath}`,
        );
      }
      const scope = this._toScope(config);
      const storageRootKey = this._registry.resolveStorageRootKey(scope);
      const physicalRoute = `${storageRootKey}\0${providerBasePath}`;
      if (physicalRoutes.has(physicalRoute)) {
        throw new Error(`Duplicate physical project route: ${providerBasePath}`);
      }
      physicalRoutes.add(physicalRoute);
      return { prefix, config, scope, storageRootKey, providerBasePath };
    });

    const physicalRoots = new Set<string>();
    const stagedRoots = configuration.roots.map((root) => {
      const scope = this._toScope(root);
      const storageRootKey = this._registry.resolveStorageRootKey(scope);
      if (physicalRoots.has(storageRootKey)) {
        throw new Error(`Duplicate project discovery root: ${storageRootKey}`);
      }
      physicalRoots.add(storageRootKey);
      return { root, scope, storageRootKey };
    });

    const canonicalWebAccessHandles = new Map<string, FileSystemDirectoryHandle>();
    for (const staged of [...stagedRoots, ...stagedInputs]) {
      if (staged.scope.backend !== 'webaccess') {
        continue;
      }
      const canonical = canonicalWebAccessHandles.get(staged.storageRootKey);
      if (canonical === undefined) {
        canonicalWebAccessHandles.set(staged.storageRootKey, staged.scope.directoryHandle);
        continue;
      }
      if (canonical === staged.scope.directoryHandle) {
        continue;
      }
      let sameEntry = false;
      try {
        // oxlint-disable-next-line no-await-in-loop -- One workspace id must resolve to one physical directory.
        sameEntry = await canonical.isSameEntry(staged.scope.directoryHandle);
      } catch {
        throw new TypeError(`WebAccess workspace ${staged.scope.workspaceId} handle identity could not be verified`);
      }
      if (!sameEntry) {
        throw new TypeError(`WebAccess workspace ${staged.scope.workspaceId} resolves to different directories`);
      }
    }

    for (const staged of stagedRoots) {
      if (staged.root.backend !== 'webaccess') {
        continue;
      }
      const observed = this._observedWebAccessRoots.get(staged.storageRootKey);
      if (observed === undefined || observed.directoryHandle === staged.root.directoryHandle) {
        continue;
      }
      let sameEntry = false;
      try {
        // oxlint-disable-next-line no-await-in-loop -- Provider staging must not retain a handle for a different entry.
        sameEntry = await observed.directoryHandle.isSameEntry(staged.root.directoryHandle);
      } catch {
        // A failed identity check cannot prove that the cached provider still owns this root.
      }
      if (!sameEntry && this._observedWebAccessRoots.get(staged.storageRootKey) === observed) {
        this._disconnectExternalRoot(staged.storageRootKey);
        // oxlint-disable-next-line no-await-in-loop -- Do not dispose a provider while an admitted root operation uses it.
        await observed.tail;
        this.disposeStorageRoot(staged.storageRootKey);
      }
    }

    const stagedRoutes = await Promise.all(
      stagedInputs.map(async (staged) => ({
        ...staged,
        provider: await this._registry.getProvider(staged.scope),
      })),
    );

    let topologyChanged = false;
    for (const { prefix, provider, config, storageRootKey, providerBasePath } of stagedRoutes) {
      const existing = this._mountTable.getExactMount(prefix);
      if (
        existing?.provider !== provider ||
        existing.backend !== config.backend ||
        existing.storageRootKey !== storageRootKey ||
        existing.providerBasePath !== providerBasePath
      ) {
        this._mountTable.mount(prefix, provider, { backend: config.backend, storageRootKey, providerBasePath });
        topologyChanged = true;
      }
    }
    for (const prefix of this._projectRoutes) {
      if (!stagedPrefixes.has(prefix)) {
        this._mountTable.unmount(prefix);
        topologyChanged = true;
      }
    }
    this._projectRoutes.clear();
    for (const prefix of stagedPrefixes) {
      this._projectRoutes.add(prefix);
    }
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
    return config.backend === 'memory'
      ? { backend: 'memory', storageRootKey: config.storageRootKey }
      : { backend: config.backend };
  }

  private _previewInstance(prefix: string): string | undefined {
    const parts = prefix.split('/').filter(Boolean);
    return parts.length === 2 && parts[0] === 'previews' && parts[1] !== undefined ? parts[1] : undefined;
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
    const retainedKeys = new Set(webRoots.map(({ storageRootKey }) => storageRootKey));
    for (const storageRootKey of this._observedWebAccessRoots.keys()) {
      if (!retainedKeys.has(storageRootKey)) {
        this._disconnectExternalRoot(storageRootKey);
      }
    }

    for (const { root, scope, storageRootKey } of webRoots) {
      const existing = this._observedWebAccessRoots.get(storageRootKey);
      if (existing !== undefined) {
        continue;
      }
      this._disconnectExternalRoot(storageRootKey);
      try {
        // oxlint-disable-next-line no-await-in-loop -- Root observation is installed in configuration order.
        const provider = await this._registry.getProvider(scope);
        const state: ObservedWebAccessRoot = {
          storageRootKey,
          directoryHandle: root.directoryHandle,
          provider,
          nativeActive: false,
          pollSnapshots: new Map(),
          tail: Promise.resolve(),
        };
        this._observedWebAccessRoots.set(storageRootKey, state);
        // oxlint-disable-next-line no-await-in-loop -- Root observation is installed in configuration order.
        await this._queueExternalRootOperation(state, async () => {
          if (this._observedWebAccessRoots.get(storageRootKey) !== state) {
            return;
          }
          const observer = this._createNativeFileSystemObserver((records) => {
            if (observer === undefined || this._observedWebAccessRoots.get(storageRootKey) !== state) {
              return;
            }
            // async-iife: Browser observer callbacks cannot await their handler.
            void this._handleNativeExternalRecords(state, observer, records);
          });
          if (observer === undefined) {
            return;
          }
          state.observer = observer;
          try {
            await observer.observe(root.directoryHandle, { recursive: true });
          } catch {
            observer.disconnect();
            state.observer = undefined;
            return;
          }
          if (this._observedWebAccessRoots.get(storageRootKey) !== state) {
            observer.disconnect();
            return;
          }
          state.nativeActive = true;
        });
      } catch {
        // Provider/observer setup is progressive enhancement; normal reads surface permission failures.
      }
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
    const state = this._observedWebAccessRoots.get(storageRootKey);
    this._observedWebAccessRoots.delete(storageRootKey);
    state?.observer?.disconnect();
    if (state !== undefined) {
      state.pollSnapshots.clear();
    }
  }

  private async _handleNativeExternalRecords(
    state: ObservedWebAccessRoot,
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
    state: ObservedWebAccessRoot,
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
      if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
        return;
      }
      await operation();
    } finally {
      release!();
    }
  }

  private async _pollExternalRoot(state: ObservedWebAccessRoot, providerBasePath?: string): Promise<void> {
    const scope = providerBasePath ?? '*';
    const snapshot = await this._createExternalSnapshot(state, providerBasePath);
    await this._queueExternalRootOperation(state, async () => {
      await this._applyExternalSnapshot(state, scope, snapshot);
    });
  }

  private async _applyNativeExternalRecords(
    state: ObservedWebAccessRoot,
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
      await this._reconcileExternalSnapshot(state);
      return;
    }

    const prepared = admittedRecords.map((record) => {
      const physicalPath = this._physicalPath(record.relativePathComponents);
      const oldPhysicalPath = Array.isArray(record.relativePathMovedFrom)
        ? this._physicalPath(record.relativePathMovedFrom)
        : undefined;
      const mappings = this._logicalMappingsForPhysicalPath(state, physicalPath);
      const knownKinds = new Map(
        mappings.map(({ path, resolution }) => {
          const relative = this._toTreeRelative(path);
          return [
            resolution.entry,
            relative === undefined ? undefined : this._inMemoryTree.stat(relative)?.type,
          ] as const;
        }),
      );
      return { record, physicalPath, oldPhysicalPath, mappings, knownKinds };
    });

    const physicalPaths = prepared.flatMap(({ physicalPath, oldPhysicalPath }) =>
      oldPhysicalPath === undefined ? [physicalPath] : [physicalPath, oldPhysicalPath],
    );
    await state.provider.refresh?.(physicalPaths);
    if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
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
    return resolveVirtualPath(`/${components.join('/')}`);
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

  private _logicalMappingsForPhysicalPath(
    state: ObservedWebAccessRoot,
    physicalPath: string,
  ): ExternalLogicalMapping[] {
    const mappings: ExternalLogicalMapping[] = [];
    for (const entry of this._mountTable.listMounts()) {
      if (entry.provider !== state.provider || entry.storageRootKey !== state.storageRootKey) {
        continue;
      }
      const base = entry.providerBasePath;
      if (
        physicalPath !== base &&
        !(base === '/' ? physicalPath.startsWith('/') : physicalPath.startsWith(`${base}/`))
      ) {
        continue;
      }
      const suffix = base === '/' ? physicalPath : physicalPath.slice(base.length) || '/';
      const path =
        entry.prefix === '/' ? suffix : suffix === '/' ? entry.prefix : resolveVirtualPath(`${entry.prefix}${suffix}`);
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
      this._emitChangeEvent(
        { type: 'directoryCreated', path: mapping.path, backend: mapping.resolution.backend },
        undefined,
        { operations: [mapping] },
      );
      this._crossTabCoordinator.notifyMutation({
        type: 'mkdir',
        path: mapping.path,
        authority: this._physicalAuthority(mapping.resolution),
      });
      return;
    }
    this._emitExternalDirectorySummary(mapping, parentDirectory(mapping.path));
  }

  private _emitExternalFileWrite(mapping: ExternalLogicalMapping): void {
    this._emitChangeEvent({ type: 'fileWritten', path: mapping.path, backend: mapping.resolution.backend }, undefined, {
      operations: [mapping],
    });
    this._crossTabCoordinator.notifyMutation({
      type: 'write',
      path: mapping.path,
      authority: this._physicalAuthority(mapping.resolution),
    });
  }

  private _emitExternalDeletion(mapping: ExternalLogicalMapping, kind: 'file' | 'dir'): void {
    this._emitChangeEvent(
      kind === 'file'
        ? { type: 'fileDeleted', path: mapping.path, backend: mapping.resolution.backend }
        : { type: 'directoryDeleted', path: mapping.path, backend: mapping.resolution.backend },
      undefined,
      { operations: [mapping] },
    );
    this._crossTabCoordinator.notifyMutation({
      type: kind === 'file' ? 'delete' : 'rmdir',
      path: mapping.path,
      authority: this._physicalAuthority(mapping.resolution),
    });
  }

  private _emitExternalDirectorySummary(mapping: ExternalLogicalMapping, logicalPath: string): void {
    const physicalPath =
      logicalPath === mapping.path ? mapping.resolution.path : parentDirectory(mapping.resolution.path);
    const resolution = { ...mapping.resolution, path: physicalPath };
    this._emitChangeEvent(
      { type: 'directoryChanged', path: logicalPath, backend: mapping.resolution.backend },
      undefined,
      { operations: [{ path: logicalPath, resolution }] },
    );
    this._crossTabCoordinator.notifyDirectoryChange(logicalPath, this._physicalAuthority(mapping.resolution));
  }

  private _emitExternalRootSummaries(state: ObservedWebAccessRoot, providerBasePath?: string): void {
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

  private _disableNativeObservation(state: ObservedWebAccessRoot): void {
    if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
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
          if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
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
    state: ObservedWebAccessRoot;
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
    // ponytail: the tree is dropped whole even for a localized change — InMemoryFileTree
    // cannot express "this subtree is unknown", and a scoped removal would publish a
    // stale absence. Give it a subtree-invalidation state if the rebuild scan shows up hot.
    this._inMemoryTree.clear();
    this._directoryStatRoot = undefined;
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
        changed.push(`/${relative}`);
      }
    }
    for (const relative of nextRows.keys()) {
      if (!previousRows.has(relative)) {
        changed.push(`/${relative}`);
      }
    }
    return changed.length > maxLocalizedExternalChanges ? undefined : changed;
  }

  private _emitGlobalDiscoveryChange(state: ObservedWebAccessRoot): void {
    this._emitChangeEvent({ type: 'directoryChanged', path: '/', backend: 'webaccess' });
    this._crossTabCoordinator.notifyDirectoryChange('/', {
      storageRootKey: state.storageRootKey,
      providerBasePath: '/',
    });
  }

  private _isDiscoveryRelevantPhysicalPath(path: string): boolean {
    if (isWorkspaceStatePath(path)) {
      return false;
    }
    const segments = path.split('/').filter(Boolean);
    return segments.length <= 1 || (segments.length === 2 && segments[1] === 'tau.json');
  }

  private async _createExternalSnapshot(state: ObservedWebAccessRoot, providerBasePath?: string): Promise<string> {
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
    const mountedProjectDirectories = new Set(
      this._mountTable
        .listMounts()
        .filter((entry) => entry.provider === state.provider && entry.storageRootKey === state.storageRootKey)
        .map(({ providerBasePath }) => providerBasePath)
        .filter((providerPath) => isProjectDirectoryPath(providerPath))
        .map((providerPath) => providerPath.slice(1)),
    );
    try {
      if (providerBasePath !== undefined) {
        const parts = providerBasePath.split('/').filter(Boolean);
        let handle = state.directoryHandle;
        for (const part of parts) {
          // oxlint-disable-next-line no-await-in-loop -- Directory-handle traversal is necessarily ordered.
          handle = await handle.getDirectoryHandle(part);
        }
        await walk(handle, parts.join('/'));
        return rows.join('\n');
      }
      // App state under a dot-prefixed root child never feeds discovery (F1).
      const rootEntries = await admittedEntries(state.directoryHandle);
      const entries = rootEntries.filter(([name]) => !name.startsWith('.'));
      const topLevelRows = await resolveRows(entries, async ([name, child]) => {
        if (child.kind === 'file') {
          return fileRow(name, name, child);
        }
        if (mountedProjectDirectories.has(name)) {
          return [name, undefined];
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
        if (mountedProjectDirectories.has(name)) {
          // oxlint-disable-next-line no-await-in-loop -- Recursive fallback polling is intentionally sequential.
          await walk(child, name);
          continue;
        }
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

  private async _reconcileExternalSnapshot(state: ObservedWebAccessRoot): Promise<void> {
    const next = await this._createExternalSnapshot(state);
    await this._applyExternalSnapshot(state, '*', next);
  }

  private async _applyExternalSnapshot(state: ObservedWebAccessRoot, scope: string, next: string): Promise<void> {
    if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
      return;
    }
    const previous = state.pollSnapshots.get(scope);
    if (previous === undefined) {
      if (state.nativeActive) {
        await state.provider.refresh?.();
        if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
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
    if (this._observedWebAccessRoots.get(state.storageRootKey) !== state) {
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
    const backend = this._backendForPhysicalAuthority(notification.authority);
    try {
      await provider.refresh?.();
    } catch {
      this._handleRemoteFailure(notification, backend);
      return;
    }

    const entry = this._findMountForPhysicalAuthority(notification.path, notification.authority, provider);
    const resolution =
      entry === undefined
        ? undefined
        : this._remoteResolution({ path: notification.path, authority: notification.authority, provider, entry });
    const isCurrent = resolution !== undefined && this._isCurrentResolution(notification.path, resolution);

    if (isCurrent || notification.type === 'directory-change') {
      this._filePool?.clear();
      this._inMemoryTree.clear();
      this._directoryStatRoot = undefined;
    }

    if (notification.type === 'directory-change') {
      this._emitChangeEvent(
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
    this._emitChangeEvent(event, undefined, {
      operations: [{ path: notification.path, resolution }],
    });
  }

  private _findMountForPhysicalAuthority(
    path: string,
    authority: PhysicalAuthority,
    provider: FileSystemProvider,
  ): MountEntry | undefined {
    const matches = this._mountTable
      .listMounts()
      .filter(
        (entry) =>
          entry.provider === provider &&
          entry.storageRootKey === authority.storageRootKey &&
          entry.providerBasePath === authority.providerBasePath,
      );
    try {
      const current = this._mountTable.resolve(path).entry;
      if (current !== undefined && matches.includes(current)) {
        return current;
      }
    } catch {
      // Fall back to a matching physical projection when the logical route is unavailable.
    }
    return matches[0];
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
    this._inMemoryTree.clear();
    this._directoryStatRoot = undefined;
    if (notification.type === 'project-unavailable') {
      this._watchRegistry.emitResetAll();
      return;
    }
    this._emitChangeEvent({
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
      this._emitChangeEvent({ type: 'directoryDeleted', path, backend: mount.backend });
    }
    if (notifyPeers) {
      const projectId = path.split('/')[2];
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
    this._inMemoryTree.clear();
    this._directoryStatRoot = undefined;
    this._watchRegistry.emitResetAll();
  }

  private _notifyMoveParents(options: {
    source: string;
    target: string;
    sourceResolution: MountResolution;
    targetResolution: MountResolution;
  }): void {
    const { source, target, sourceResolution, targetResolution } = options;
    const notifications = [
      { path: parentDirectory(source), authority: this._physicalAuthority(sourceResolution) },
      { path: parentDirectory(target), authority: this._physicalAuthority(targetResolution) },
    ];
    const delivered = new Set<string>();
    for (const { path, authority } of notifications) {
      const key = `${authority.storageRootKey}\0${authority.providerBasePath}\0${path}`;
      if (!delivered.has(key)) {
        delivered.add(key);
        this._crossTabCoordinator.notifyDirectoryChange(path, authority);
      }
    }
  }

  private _isCurrentResolution(path: string, resolution: MountResolution): boolean {
    if (resolution.entry === undefined) {
      return false;
    }
    try {
      const current = this._mountTable.resolve(path);
      return (
        current.entry === resolution.entry &&
        current.provider === resolution.provider &&
        current.path === resolution.path
      );
    } catch {
      return false;
    }
  }

  private _emitChangeEvent(
    event: ChangeEvent,
    context?: WorkspaceMutationContext,
    attribution?: {
      operations: ReadonlyArray<{ path: string; resolution: MountResolution }>;
      globallyVisible?: boolean;
    },
  ): void {
    if (context?.originClientId !== undefined) {
      tagEventOrigin(event, context.originClientId);
    }
    if (attribution !== undefined) {
      const authorities = [
        ...new Set(
          attribution.operations.flatMap(({ resolution }) =>
            resolution.entry === undefined ? [] : [resolution.entry],
          ),
        ),
      ];
      if (authorities.length > 0) {
        const globallyVisible =
          attribution.globallyVisible ??
          attribution.operations.every(({ path, resolution }) => this._isCurrentResolution(path, resolution));
        tagEventAuthorities(event, authorities, globallyVisible);
      }
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

  private _inMemoryTreeAddFile(absolutePath: string, metadata: { size: number } & FileContentMetadata): void {
    const treeRelativePath = this._toTreeRelative(normalizePath(absolutePath));
    if (treeRelativePath !== undefined) {
      this._inMemoryTree.addFile(treeRelativePath, metadata);
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

  private async _writeFileResolved({
    path,
    resolution,
    data,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    data: Uint8Array<ArrayBuffer> | string;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const locks = this._mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'write', path, authority: this._physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          await this._refreshMutationProviders([resolution]);
          await this._writeFileUnlocked({ path, resolution, data, context });
        }),
    );
  }

  private async _writeFileUnlocked({
    path,
    resolution,
    data,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    data: Uint8Array<ArrayBuffer> | string;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const { provider, path: resolvedPath } = resolution;
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await provider.writeFile(resolvedPath, bytes);

    this._recordCompletedWrite({ path, resolution, bytes, context });
  }

  private _recordCompletedWrite({
    path,
    resolution,
    bytes,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    bytes: Uint8Array<ArrayBuffer>;
    context?: WorkspaceMutationContext;
  }): void {
    const { backend: resolvedBackend } = resolution;
    if (this._isCurrentResolution(path, resolution)) {
      this._filePool?.invalidate(path);
      this._inMemoryTreeAddFile(path, {
        size: bytes.byteLength,
        ...getFileContentMetadata(bytes),
      });
    }
    if (resolution.entry !== undefined) {
      this._emitChangeEvent(
        {
          type: 'fileWritten',
          path,
          backend: resolvedBackend,
        },
        context,
        { operations: [{ path, resolution }] },
      );
    }
  }

  private async _moveResolved({
    source,
    target,
    sourceResolution,
    targetResolution,
    context,
  }: {
    source: string;
    target: string;
    sourceResolution: MountResolution;
    targetResolution: MountResolution;
    context?: WorkspaceMutationContext;
  }): Promise<FileStat> {
    const lockPaths = this._mutationLockPaths([
      { path: source, resolution: sourceResolution },
      { path: target, resolution: targetResolution },
    ]);
    return this._crossTabCoordinator.withLocks(lockPaths, async () =>
      this._resourceQueue.queueForMany(lockPaths, async () => {
        let mutationBegan = false;
        try {
          await this._refreshMutationProviders([sourceResolution, targetResolution]);
          this._assertNoDescendantMounts(source, 'move');
          this._assertNoDescendantMounts(target, 'move');
          const sourceStat = await sourceResolution.provider.stat(sourceResolution.path);
          const targetExists = await targetResolution.provider.exists(targetResolution.path);
          if (targetExists) {
            const error = new Error(`EEXIST: target already exists '${target}'`);
            (error as NodeJS.ErrnoException).code = 'EEXIST';
            throw error;
          }

          mutationBegan = true;
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
            await targetResolution.provider.writeFile(targetResolution.path, data);
            await sourceResolution.provider.unlink(sourceResolution.path);
          }

          const sourceIsCurrent = this._isCurrentResolution(source, sourceResolution);
          const targetIsCurrent = this._isCurrentResolution(target, targetResolution);
          if (sourceIsCurrent && targetIsCurrent) {
            this._filePool?.invalidate(source);
            this._filePool?.invalidate(target);
            this._inMemoryTreeRename(source, target);
          } else if (sourceIsCurrent || targetIsCurrent) {
            this._filePool?.clear();
            this._inMemoryTree.clear();
            this._directoryStatRoot = undefined;
          }

          const resultingStat = await targetResolution.provider.stat(targetResolution.path);
          this._emitChangeEvent(
            sourceStat.type === 'dir'
              ? {
                  type: 'directoryRenamed',
                  oldPath: source,
                  newPath: target,
                  backend: sourceResolution.backend,
                }
              : {
                  type: 'fileRenamed',
                  oldPath: source,
                  newPath: target,
                  backend: sourceResolution.backend,
                },
            context,
            {
              operations: [
                { path: source, resolution: sourceResolution },
                { path: target, resolution: targetResolution },
              ],
            },
          );
          this._notifyMoveParents({ source, target, sourceResolution, targetResolution });

          return resultingStat;
        } catch (error) {
          if (mutationBegan) {
            const operations = [
              { path: source, resolution: sourceResolution },
              { path: target, resolution: targetResolution },
            ];
            const globallyVisible = operations.some((operation) =>
              this._isCurrentResolution(operation.path, operation.resolution),
            );
            if (globallyVisible) {
              this._filePool?.clear();
              this._inMemoryTree.clear();
              this._directoryStatRoot = undefined;
            }
            for (const backend of new Set([sourceResolution.backend, targetResolution.backend])) {
              this._emitChangeEvent({ type: 'backendChanged', backend }, context, { operations, globallyVisible });
            }
            this._notifyMoveParents({ source, target, sourceResolution, targetResolution });
          }
          throw error;
        }
      }),
    );
  }

  private async _mkdirResolved({
    path,
    resolution,
    options,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    options?: MkdirOptions;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const locks = this._mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        const { provider, path: resolvedPath, backend: resolvedBackend } = resolution;
        await this._refreshMutationProviders([resolution]);
        const alreadyExisted = options?.recursive === true && (await provider.exists(resolvedPath));
        try {
          await provider.mkdir(resolvedPath, options?.recursive ? { recursive: true } : undefined);
        } catch (error) {
          if (options?.recursive === true) {
            this._handlePartialMutationFailure(path, resolution, context);
          }
          throw error;
        }
        if (alreadyExisted) {
          return;
        }

        if (this._isCurrentResolution(path, resolution)) {
          this._inMemoryTreeAddDirectory(path);
        }
        this._emitChangeEvent(
          {
            type: 'directoryCreated',
            path,
            backend: resolvedBackend,
          },
          context,
          { operations: [{ path, resolution }] },
        );
        this._crossTabCoordinator.notifyMutation({
          type: 'mkdir',
          path,
          authority: this._physicalAuthority(resolution),
        });
      }),
    );
  }

  private async _unlinkResolved({
    path,
    resolution,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const locks = this._mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'delete', path, authority: this._physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          const { provider, path: resolvedPath, backend: resolvedBackend } = resolution;
          await this._refreshMutationProviders([resolution]);
          await provider.unlink(resolvedPath);

          if (this._isCurrentResolution(path, resolution)) {
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
            { operations: [{ path, resolution }] },
          );
        }),
    );
  }

  private async _rmdirResolved({
    path,
    resolution,
    options,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    options?: { recursive?: boolean };
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const locks = this._mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'rmdir', path, authority: this._physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          const { provider, path: resolvedPath, backend: resolvedBackend } = resolution;
          await this._refreshMutationProviders([resolution]);

          if (options?.recursive === true) {
            this._assertNoDescendantMounts(path, 'recursive remove');
            try {
              await this._rmdirRecursive(provider, resolvedPath);
            } catch (error) {
              this._handlePartialMutationFailure(path, resolution, context);
              throw error;
            }
          } else {
            await provider.rmdir(resolvedPath);
          }

          if (this._isCurrentResolution(path, resolution)) {
            this._inMemoryTreeRemoveDirectory(path);
          }
          this._emitChangeEvent(
            {
              type: 'directoryDeleted',
              path,
              backend: resolvedBackend,
            },
            context,
            { operations: [{ path, resolution }] },
          );
        }),
    );
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
      const provider = await this._registry.getProvider(options.scope);
      return { provider, path: resolveVirtualPath(path), backend: options.scope.backend };
    }
    this._assertBoundProjectRoute(path);
    const resolution = this._mountTable.resolve(path);
    return { provider: resolution.provider, path: resolution.path, backend: resolution.backend };
  }

  private _validatePendingProjectCommit(input: CommitPendingProjectDirectoryInput): {
    path: string;
    files: Array<readonly [string, { readonly content: Uint8Array<ArrayBuffer> }]>;
    manifest: Uint8Array<ArrayBuffer>;
    scope: StorageRootConfig;
    storageRootKey: string;
    projectId: string;
  } {
    if (!(input.manifest instanceof Uint8Array)) {
      throw new TypeError('Pending project commit manifest must be a Uint8Array');
    }
    const manifest = new Uint8Array(input.manifest.byteLength);
    manifest.set(input.manifest);
    const parsedManifest = parseProjectManifestBytes(manifest);
    if (!parsedManifest.success) {
      throw new TypeError('Pending project commit manifest is invalid');
    }
    const projectId = parsedManifest.data.id;
    const uncheckedScope = input.scope as WorkspaceScope;
    if (uncheckedScope.backend === 'memory') {
      throw new TypeError('Pending project commits require durable storage.');
    }
    const scope: StorageRootConfig = { ...input.scope };
    const storageRootKey = this._registry.resolveStorageRootKey(scope);

    const path = resolveVirtualPath(input.providerBasePath);
    if (path !== input.providerBasePath) {
      throw new TypeError('Pending project target must already be canonical');
    }
    // The pending operation carries its own allocated directory name; identity
    // is established by the post-commit manifest read-back and the replay
    // checks, not by parsing the id back out of the basename.
    if (!isProjectDirectoryPath(path)) {
      throw new TypeError('Pending project target is not a project directory');
    }
    const rawFiles: unknown = input.files;
    if (rawFiles === null || typeof rawFiles !== 'object' || Array.isArray(rawFiles)) {
      throw new TypeError('Pending project commit files must be an object');
    }

    const canonicalPaths = new Set<string>();
    const files: Array<readonly [string, { readonly content: Uint8Array<ArrayBuffer> }]> = [];
    for (const [relativePath, descriptor] of Object.entries(rawFiles)) {
      if (!isSafeRelativePath(relativePath)) {
        throw new TypeError(`Pending project file path is unsafe: ${relativePath}`);
      }
      const canonicalPath = resolveVirtualPath(`/${relativePath}`).slice(1);
      if (canonicalPath !== relativePath || canonicalPaths.has(canonicalPath)) {
        throw new TypeError(`Pending project file path is not unique and canonical: ${relativePath}`);
      }
      if (relativePath === 'tau.json' || relativePath.endsWith('/tau.json')) {
        throw new TypeError(`Pending project files cannot contain a manifest: ${relativePath}`);
      }
      const content: unknown =
        descriptor !== null && typeof descriptor === 'object' && 'content' in descriptor
          ? descriptor.content
          : undefined;
      if (!(content instanceof Uint8Array)) {
        throw new TypeError(`Pending project file content must be a Uint8Array: ${relativePath}`);
      }
      canonicalPaths.add(canonicalPath);
      const ownedContent = new Uint8Array(content.byteLength);
      ownedContent.set(content);
      files.push([relativePath, { content: ownedContent }]);
    }

    const treePaths = new Set([...canonicalPaths, 'tau.json']);
    for (const treePath of treePaths) {
      let parent = treePath.slice(0, treePath.lastIndexOf('/'));
      while (parent.length > 0) {
        if (treePaths.has(parent)) {
          throw new TypeError(`Pending project file path collides with an ancestor: ${treePath}`);
        }
        parent = parent.slice(0, parent.lastIndexOf('/'));
      }
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
    const normalized = resolveVirtualPath(path);
    const segments = normalized.split('/');
    if (segments[1] !== 'projects' || !segments[2]) {
      return;
    }
    const projectId = segments[2];
    if (this._mountTable.getExactMount(`/projects/${projectId}`) === undefined) {
      throw new UnboundProjectRouteError(projectId);
    }
  }

  /**
   * Project whose lock a mutation must hold. A logical `/projects/<id>` path
   * names its project directly; otherwise the mutation may still land inside a
   * project's physical directory, because flat-layout project directories are
   * ordinary root children reachable through the workspace-root mount.
   *
   * @param logicalPath - Canonical logical mutation path.
   * @param resolution - Mount resolution carrying the physical target.
   * @returns Owning project id, or `undefined` when no project owns the bytes.
   */
  private _projectLockOwner(logicalPath: string, resolution: MountResolution): string | undefined {
    const segments = logicalPath.split('/');
    if (segments[1] === 'projects' && segments[2]) {
      return segments[2];
    }
    const storageRootKey = resolution.entry?.storageRootKey;
    if (storageRootKey === undefined) {
      return undefined;
    }
    const physicalPath = resolveVirtualPath(resolution.path);
    // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
    // ponytail: linear over mounts, which is one entry per open project. Index
    // by storage root if a workspace ever mounts projects by the hundred.
    for (const mount of this._mountTable.listMounts()) {
      const base = mount.providerBasePath;
      if (
        mount.storageRootKey !== storageRootKey ||
        !isProjectDirectoryPath(base) ||
        (physicalPath !== base && !physicalPath.startsWith(`${base}/`))
      ) {
        continue;
      }
      const owner = mount.prefix.split('/');
      if (owner[1] === 'projects' && owner[2]) {
        return owner[2];
      }
    }
    return undefined;
  }

  private _mutationLockPaths(operations: ReadonlyArray<{ path: string; resolution: MountResolution }>): string[] {
    const locks = new Set<string>();
    const addHierarchy = (path: string, boundary: string, format: (value: string) => string): void => {
      let current = resolveVirtualPath(path);
      const root = resolveVirtualPath(boundary);
      if (current !== root && !current.startsWith(`${root === '/' ? '' : root}/`)) {
        throw new Error(`Mutation path '${current}' is outside its authority root '${root}'.`);
      }
      while (current !== '/') {
        locks.add(format(current));
        if (current === root) {
          return;
        }
        current = parentDirectory(current);
      }
    };

    for (const { path, resolution } of operations) {
      const normalized = resolveVirtualPath(path);
      addHierarchy(normalized, resolution.entry?.prefix ?? normalized, (value) => value);
      const projectId = this._projectLockOwner(normalized, resolution);
      if (projectId !== undefined) {
        locks.add(`project:${projectId}`);
      }
      const { entry } = resolution;
      if (entry?.storageRootKey !== undefined) {
        addHierarchy(resolution.path, entry.providerBasePath, (value) => `${entry.storageRootKey}:${value}`);
      }
    }
    return [...locks];
  }

  private _physicalAuthority(resolution: MountResolution): PhysicalAuthority {
    if (resolution.entry?.storageRootKey === undefined) {
      throw new Error('Mounted mutation is missing canonical physical authority metadata.');
    }
    return {
      storageRootKey: resolution.entry.storageRootKey,
      providerBasePath: resolution.entry.providerBasePath,
    };
  }

  private _scopedPhysicalAuthority(scope: WorkspaceScope, providerBasePath: string): PhysicalAuthority {
    return {
      storageRootKey: this._registry.resolveStorageRootKey(scope),
      providerBasePath: resolveVirtualPath(providerBasePath),
    };
  }

  private _assertGenericMutationPath(path: string, target?: string): void {
    if (isUnderBundledTypesMount(path)) {
      throw new WorkspaceMutationError('BUNDLED_TYPES_WORKSPACE', path, target === undefined ? undefined : { target });
    }
  }

  private _assertNoDescendantMounts(path: string, operation: string): void {
    const normalized = normalizePath(path);
    const prefix = normalized === '/' ? '/' : `${normalized}/`;
    for (const mount of this._mountTable.listMounts()) {
      if (mount.prefix === '/' || mount.prefix === normalized) {
        continue;
      }
      if (normalized === '/' || mount.prefix.startsWith(prefix)) {
        throw new Error(`[WorkspaceFileService] ${operation} would cross mount boundary at '${mount.prefix}'.`);
      }
    }
  }

  private async _refreshMutationProviders(resolutions: readonly MountResolution[]): Promise<void> {
    const providers = new Set(resolutions.map(({ provider }) => provider));
    // Ponytail: DirectIDB refresh is O(number of keys); add a durable revision only if measurement shows this lock boundary is hot.
    await Promise.all([...providers].map(async (provider) => provider.refresh?.()));
  }

  private _handlePartialMutationFailure(
    path: string,
    resolution: MountResolution,
    context?: WorkspaceMutationContext,
  ): void {
    // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
    // ponytail: full drop, not the path-scoped one `writeFiles` uses. Both callers are
    // half-finished *recursive* directory mutations, so everything under `path` is
    // untrustworthy — and neither SharedPool nor InMemoryFileTree can drop a subtree.
    // Scope it once SharedPool grows a prefix invalidation, if this error path is ever hot.
    this._filePool?.clear();
    this._inMemoryTree.clear();
    this._directoryStatRoot = undefined;
    const logicalRoot = resolution.entry?.prefix ?? path;
    const rootResolution =
      resolution.entry === undefined ? resolution : { ...resolution, path: resolution.entry.providerBasePath };
    this._emitChangeEvent({ type: 'backendChanged', backend: resolution.backend }, context, {
      operations: [{ path: logicalRoot, resolution: rootResolution }],
    });
    if (resolution.entry !== undefined) {
      this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this._physicalAuthority(resolution));
    }
  }

  private _createInMemoryTree(fileStats: readonly FileStatEntry[]): InMemoryFileTree {
    const tree = new InMemoryFileTree();
    tree.build(
      fileStats.map((entry) =>
        entry.type === 'dir'
          ? { path: entry.path, type: 'dir', size: entry.size, mtimeMs: entry.mtimeMs }
          : {
              path: entry.path,
              type: 'file',
              size: entry.size,
              mtimeMs: entry.mtimeMs,
              ...fileMetadataFields(entry),
            },
      ),
    );
    return tree;
  }

  private async _rmdirRecursive(provider: FileSystemProvider, directoryPath: string): Promise<void> {
    const entries = await readDirectoryEntries(provider, directoryPath);
    for (const entry of entries) {
      const fullPath = joinPath(directoryPath, entry.name);
      // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive deletion
      await (entry.kind === 'dir' ? this._rmdirRecursive(provider, fullPath) : provider.unlink(fullPath));
    }
    await provider.rmdir(directoryPath);
  }

  private async _deleteProjectDirectory(
    provider: FileSystemProvider,
    directoryPath: string,
    manifest: Uint8Array<ArrayBuffer>,
  ): Promise<void> {
    const manifestPath = joinPath(directoryPath, 'tau.json');
    const entries = await provider.readdir(directoryPath);
    for (const entry of entries) {
      if (entry === 'tau.json') {
        continue;
      }
      const fullPath = joinPath(directoryPath, entry);
      // oxlint-disable-next-line no-await-in-loop -- Preserve the manifest until every sibling is gone.
      await this._removeRecursive(provider, fullPath);
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

  /**
   * Remove either a file or a directory recursively from `provider`. Used to
   * clear a successfully copied cross-provider move source and to remove
   * project-directory contents while preserving the manifest until last.
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
    await targetProvider.mkdir(targetPath, { recursive: true });
    const entries = await readDirectoryEntries(sourceProvider, sourcePath);
    for (const entry of entries) {
      const sourceEntry = joinPath(sourcePath, entry.name);
      const targetEntry = joinPath(targetPath, entry.name);
      if (entry.kind === 'dir') {
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
      readdirEntries?(path: string): Promise<DirectoryEntry[]>;
      readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    },
    path: string,
  ): Promise<{
    files: Record<string, Uint8Array<ArrayBuffer>>;
    directories: string[];
  }> {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};
    const directories: string[] = [];

    const collect = async (currentPath: string, basePath: string): Promise<void> => {
      const entries = await readDirectoryEntries(provider, currentPath);
      for (const entry of entries) {
        const fullPath = joinPath(currentPath, entry.name);
        if (entry.kind === 'file') {
          const relativePath = basePath === '/' ? fullPath.slice(1) : fullPath.slice(basePath.length + 1);
          // oxlint-disable-next-line no-await-in-loop -- Sequential reads required for recursive collection
          files[relativePath] = await provider.readFile(fullPath);
        } else {
          directories.push(basePath === '/' ? fullPath.slice(1) : fullPath.slice(basePath.length + 1));
          // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive collection
          await collect(fullPath, basePath);
        }
      }
    };

    await collect(path, path);
    return { files, directories };
  }
}
