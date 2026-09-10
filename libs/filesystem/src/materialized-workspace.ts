import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { bufferToStream } from '#backend/stream-utils.js';
import { ResourceQueue } from '#resource-queue.js';
import type { RootedFileSystem } from '#workspace-file-service.js';
import type { FileReadStreamOptions, FileStat, WatchEvent, WatchRequest } from '#types.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import type { MaterializedWorkspaceId } from '#workspace-identity.js';

type RevisionId = ReturnType<typeof revisionId>;

/**
 * How a workspace holds its writable tree: `local` binds a caller-owned root in
 * place, `branch` owns a complete materialized copy. @public
 */
export type MaterializedWorkspaceMode = 'local' | 'branch';

/**
 * Immutable identity binding a writable root to its exact base revision.
 *
 * `mode` is the non-reference marker for "bound in place": `bindInPlace` returns
 * a confining wrapper around the caller's root, never the root object itself, so
 * no consumer can recognise a local workspace by comparing filesystem
 * references. @public
 */
export type MaterializedWorkspaceIdentity = Readonly<{
  workspaceId: MaterializedWorkspaceId;
  baseRevisionId: RevisionId;
  mode: MaterializedWorkspaceMode;
}>;

/** Measured materialization result for one isolated root. @public */
export type MaterializedWorkspaceMetrics = Readonly<{
  files: number;
  bytes: number;
  durationMs: number;
}>;

/** One isolated writable workspace capability and its immutable origin. @public */
export type MaterializedWorkspace = Readonly<{
  identity: MaterializedWorkspaceIdentity;
  /** Original immutable base captured at materialization time. */
  baseTree: ImmutableRevisionTree;
  filesystem: RootedFileSystem;
  /** Durable workspace-private metadata excluded from revision tree captures. */
  metadata: RootedFileSystem;
  metrics: MaterializedWorkspaceMetrics;
}>;

/** Stable failures raised by the materialized workspace authority. @public */
export type MaterializedWorkspaceErrorCode = 'WORKSPACE_EXISTS' | 'WORKSPACE_DISPOSED';

/** Typed materialized-workspace lifecycle failure. @public */
export class MaterializedWorkspaceError extends Error {
  public readonly code: MaterializedWorkspaceErrorCode;

  public constructor(code: MaterializedWorkspaceErrorCode, message: string) {
    super(message);
    this.name = 'MaterializedWorkspaceError';
    this.code = code;
  }
}

type WorkspaceCapabilityState = {
  active: boolean;
  readonly inFlight: Set<Promise<unknown>>;
  readonly streams: Set<Readonly<{ cancel(reason?: unknown): Promise<void> }>>;
  readonly watches: Set<() => void>;
};

type MaterializeWorkspaceInput = Readonly<{
  workspaceId: MaterializedWorkspaceId;
  baseRevisionId: RevisionId;
  tree: ImmutableRevisionTree;
}>;

type MaterializedWorkspaceAuthorityOptions = Readonly<{
  filesystem: RootedFileSystem;
  resourceQueue?: ResourceQueue;
  storageDirectory?: string;
  materializationConcurrency?: number;
  now?: () => number;
}>;

const defaultStorageDirectory = '.tau/workspaces';
const defaultMaterializationConcurrency = 16;

const cleanupDisposedStream = async (stream: Readonly<{ cancel(reason?: unknown): Promise<void> }>): Promise<void> => {
  try {
    await stream.cancel();
  } catch {
    // Synchronous capability disposal is best-effort; destroy awaits and reports no cleanup aggregate.
  }
};

type PersistedWorkspaceIdentity = Readonly<{
  version: 1;
  workspaceId: string;
  baseRevisionId: string;
  /** `local` workspaces bind a caller-owned root and materialize no tree. */
  mode?: 'local';
  metrics?: MaterializedWorkspaceMetrics;
}>;

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as { name?: unknown }).name === 'NotFoundError');

const assertMutableWorkspacePath = (path: string): void => {
  if (path === '') {
    throw new Error('Cannot remove or rename the materialized workspace root.');
  }
};

const localPathWithin = (prefix: string, path: string): string | undefined => {
  if (path === prefix) {
    return '';
  }
  return path.startsWith(`${prefix}/`) ? path.slice(prefix.length + 1) : undefined;
};

const prefixWatchPattern = (prefix: string, pattern: string): string => {
  if (pattern.startsWith('/')) {
    throw new TypeError('A rooted watch glob must not begin with a slash.');
  }
  return pattern === '' ? prefix : `${prefix}/${pattern}`;
};

type CreateWorkspaceFileSystemOptions = Readonly<{
  source: RootedFileSystem;
  prefix: string;
  identity: MaterializedWorkspaceIdentity;
  state: WorkspaceCapabilityState;
}>;

const createWorkspaceFileSystem = (options: CreateWorkspaceFileSystemOptions): RootedFileSystem => {
  const { source, prefix, identity, state } = options;
  const fallbackAppendQueue = new ResourceQueue();
  const assertActive = (): void => {
    if (!state.active) {
      throw new MaterializedWorkspaceError(
        'WORKSPACE_DISPOSED',
        `Workspace capability is disposed: ${identity.workspaceId}`,
      );
    }
  };
  const resolve = (path: string): string => joinRelativePath(prefix, assertRootedPath(path));
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    assertActive();
    const pending = operation();
    state.inFlight.add(pending);
    try {
      return await pending;
    } finally {
      state.inFlight.delete(pending);
    }
  };

  function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  function readFile(path: string, encoding: 'utf8'): Promise<string>;
  // oxlint-disable-next-line typescript-eslint/promise-function-async -- overload implementation delegates its promise to the tracked operation.
  function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const resolved = resolve(path);
    return encoding === 'utf8'
      ? run(async () => source.readFile(resolved, 'utf8'))
      : run(async () => source.readFile(resolved));
  }

  /**
   * Chunk a whole-file read for a source that cannot stream natively.
   *
   * ponytail: the browser's fs-client-backed rooted view has no streaming read,
   * so it buffers each file whole on first pull and the workspace advertises
   * streaming it cannot deliver chunk-by-chunk. The bytes and the lifecycle are
   * identical; only the peak per-file memory is not. Upgrade path:
   * `readFileStream` over the fs-bridge into `FileSystemClient` and its facade,
   * then delete this fallback.
   */
  const bufferedSourceStream = (
    resolvedPath: string,
    readOptions?: FileReadStreamOptions,
  ): ReadableStream<Uint8Array<ArrayBuffer>> => {
    let buffered: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    return new ReadableStream(
      {
        async pull(controller) {
          buffered ??= bufferToStream(await source.readFile(resolvedPath), readOptions).getReader();
          const result = await buffered.read();
          if (result.done) {
            controller.close();
          } else {
            controller.enqueue(result.value);
          }
        },
        cancel: async (reason) => buffered?.cancel(reason),
      },
      { highWaterMark: 0 },
    );
  };

  const readFileStream = (
    path: string,
    readOptions?: FileReadStreamOptions,
  ): ReadableStream<Uint8Array<ArrayBuffer>> => {
    assertActive();
    const resolved = resolve(path);
    const sourceStream = source.readFileStream?.(resolved, readOptions) ?? bufferedSourceStream(resolved, readOptions);
    const reader = sourceStream.getReader();
    let cancellation: Promise<void> | undefined;
    const activeStream = {
      async cancel(reason?: unknown): Promise<void> {
        cancellation ??= (async () => {
          await reader.cancel(reason);
          state.streams.delete(activeStream);
        })();
        await cancellation;
      },
    };
    const cleanup = async (reason?: unknown): Promise<void> => {
      await activeStream.cancel(reason);
    };
    const cleanupAfterFailure = async (reason: unknown): Promise<void> => {
      try {
        await cleanup(reason);
      } catch {
        // Preserve the read or revocation failure that required cleanup.
      }
    };
    state.streams.add(activeStream);
    return new ReadableStream(
      {
        async pull(controller) {
          try {
            const result = await run(async () => reader.read());
            assertActive();
            if (result.done) {
              state.streams.delete(activeStream);
              controller.close();
            } else {
              controller.enqueue(result.value);
            }
          } catch (error) {
            await cleanupAfterFailure(error);
            throw error;
          }
        },
        cancel: cleanup,
      },
      { highWaterMark: 0 },
    );
  };

  const watch = (request: WatchRequest, handler: (event: WatchEvent) => void): (() => void) => {
    assertActive();
    if (request.paths.length === 0) {
      throw new TypeError('A rooted watch requires at least one path.');
    }
    let active = true;
    const stopSource = source.watch(
      {
        ...request,
        paths: request.paths.map(resolve),
        includes: request.includes?.map((pattern) => prefixWatchPattern(prefix, pattern)),
        excludes: request.excludes?.map((pattern) => prefixWatchPattern(prefix, pattern)),
      },
      (event) => {
        if (!active || !state.active) {
          return;
        }
        if (event.type === 'reset') {
          handler(event);
          return;
        }
        if (event.type === 'rename') {
          const oldPath = localPathWithin(prefix, event.oldPath);
          const newPath = localPathWithin(prefix, event.newPath);
          if (oldPath !== undefined && newPath !== undefined) {
            handler({ type: 'rename', oldPath, newPath });
          }
          return;
        }
        const path = localPathWithin(prefix, event.path);
        if (path !== undefined) {
          handler({ type: event.type, path });
        }
      },
    );
    const stop = (): void => {
      if (!active) {
        return;
      }
      active = false;
      state.watches.delete(stop);
      stopSource();
    };
    state.watches.add(stop);
    return stop;
  };

  return {
    id: `materialized-workspace:${identity.workspaceId}`,
    capabilities: source.capabilities,
    dispose(): void {
      if (!state.active) {
        return;
      }
      state.active = false;
      for (const stop of state.watches) {
        stop();
      }
      for (const stream of state.streams) {
        void cleanupDisposedStream(stream);
      }
    },
    readFile,
    readFileStream,
    writeFile: async (path, data) => run(async () => source.writeFile(resolve(path), data)),
    appendFile: async (path, data) => {
      const resolved = resolve(path);
      return run(async () =>
        fallbackAppendQueue.queueFor(resolved, async () => {
          if (source.appendFile !== undefined) {
            await source.appendFile(resolved, data);
            return;
          }
          let existing: Uint8Array<ArrayBuffer>;
          try {
            existing = await source.readFile(resolved);
          } catch (error) {
            if (!isNotFoundError(error)) {
              throw error;
            }
            existing = new Uint8Array();
          }
          const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
          const combined = new Uint8Array(existing.byteLength + bytes.byteLength);
          combined.set(existing);
          combined.set(bytes, existing.byteLength);
          await source.writeFile(resolved, combined);
        }),
      );
    },
    readdir: async (path) => run(async () => source.readdir(resolve(path))),
    stat: async (path) => run(async () => source.stat(resolve(path))),
    mkdir: async (path, options) => run(async () => source.mkdir(resolve(path), options)),
    unlink: async (path) => {
      const canonical = assertRootedPath(path);
      assertMutableWorkspacePath(canonical);
      return run(async () => source.unlink(resolve(canonical)));
    },
    rmdir: async (path) => {
      const canonical = assertRootedPath(path);
      assertMutableWorkspacePath(canonical);
      return run(async () => source.rmdir(resolve(canonical)));
    },
    rename: async (from, to) => {
      const canonicalFrom = assertRootedPath(from);
      const canonicalTo = assertRootedPath(to);
      assertMutableWorkspacePath(canonicalFrom);
      assertMutableWorkspacePath(canonicalTo);
      return run(async () => source.rename(resolve(canonicalFrom), resolve(canonicalTo)));
    },
    exists: async (path) => run(async () => source.exists(resolve(path))),
    lstat: async (path) => run(async () => source.lstat(resolve(path))),
    watch,
  };
};

const mapConcurrent = async <T>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> => {
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < values.length) {
      const value = values[nextIndex++]!;
      // oxlint-disable-next-line eslint/no-await-in-loop -- each worker must claim only one bounded-concurrency item at a time.
      await operation(value);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
};

/**
 * A workspace directory can gain children between its listing and its removal:
 * the kernel keeps writing geometry cache entries into a workspace tree while
 * the tree is being torn down, so `rmdir` fails `ENOTEMPTY` against a listing
 * that was already stale. Re-list and retry a bounded number of passes before
 * surfacing the failure.
 */
const removeTreePasses = 3;

const removeTree = async (filesystem: RootedFileSystem, path: string): Promise<void> => {
  let stat: FileStat;
  try {
    stat = await filesystem.stat(path);
  } catch (error) {
    if (isNotFoundError(error)) {
      return;
    }
    throw error;
  }
  if (stat.type === 'file') {
    await filesystem.unlink(path);
    return;
  }
  for (let pass = 1; ; pass++) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each pass must observe the previous pass's result.
    const children = await filesystem.readdir(path);
    // oxlint-disable-next-line eslint/no-await-in-loop -- late arrivals are only visible after the prior pass drains.
    await Promise.all(
      children.map(async (child) => {
        await removeTree(filesystem, joinRelativePath(path, child));
      }),
    );
    try {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the retry exists precisely to re-attempt this call.
      await filesystem.rmdir(path);
      return;
    } catch (error) {
      if (isNotFoundError(error)) {
        return;
      }
      if (pass >= removeTreePasses) {
        throw error;
      }
    }
  }
};

/**
 * Materializes immutable revision trees into disjoint writable directories
 * owned by one existing rooted filesystem authority. The implementation is the
 * C0 correctness control: complete copies, no union/overlay semantics.
 *
 * @public
 */
export class MaterializedWorkspaceAuthority {
  readonly #filesystem: RootedFileSystem;
  readonly #resourceQueue: ResourceQueue;
  readonly #storageDirectory: string;
  readonly #materializationConcurrency: number;
  readonly #now: () => number;
  readonly #states = new Map<MaterializedWorkspaceId, WorkspaceCapabilityState>();

  public constructor(options: MaterializedWorkspaceAuthorityOptions) {
    this.#filesystem = options.filesystem;
    this.#resourceQueue = options.resourceQueue ?? new ResourceQueue();
    this.#storageDirectory = assertRootedPath(options.storageDirectory ?? defaultStorageDirectory);
    this.#materializationConcurrency = options.materializationConcurrency ?? defaultMaterializationConcurrency;
    this.#now = options.now ?? (() => performance.now());
    if (!Number.isSafeInteger(this.#materializationConcurrency) || this.#materializationConcurrency < 1) {
      throw new TypeError('materializationConcurrency must be a positive safe integer.');
    }
  }

  /** Materialize one complete isolated copy of an immutable base tree. */
  public async materialize(input: MaterializeWorkspaceInput): Promise<MaterializedWorkspace> {
    return this.#resourceQueue.queueFor(`materialized-workspace:${input.workspaceId}`, async () => {
      const workspaceDirectory = joinRelativePath(this.#storageDirectory, input.workspaceId);
      if (await this.#filesystem.exists(workspaceDirectory)) {
        throw new MaterializedWorkspaceError('WORKSPACE_EXISTS', `Workspace already exists: ${input.workspaceId}`);
      }

      const treeDirectory = joinRelativePath(workspaceDirectory, 'tree');
      const baseDirectory = joinRelativePath(workspaceDirectory, 'base');
      const metadataDirectory = joinRelativePath(workspaceDirectory, 'metadata');
      const startedAt = this.#now();
      await this.#filesystem.mkdir(treeDirectory, { recursive: true });
      await this.#filesystem.mkdir(baseDirectory, { recursive: true });
      await this.#filesystem.mkdir(metadataDirectory, { recursive: true });
      try {
        await mapConcurrent(input.tree.entries(), this.#materializationConcurrency, async ({ path, content }) => {
          await Promise.all([
            this.#filesystem.writeFile(joinRelativePath(treeDirectory, path), content),
            this.#filesystem.writeFile(joinRelativePath(baseDirectory, path), content),
          ]);
        });
        const identity: MaterializedWorkspaceIdentity = Object.freeze({
          workspaceId: input.workspaceId,
          baseRevisionId: input.baseRevisionId,
          mode: 'branch',
        });
        const metrics = Object.freeze({
          files: input.tree.size,
          bytes: input.tree.byteLength,
          durationMs: Math.max(0, this.#now() - startedAt),
        });
        await this.#filesystem.writeFile(
          joinRelativePath(workspaceDirectory, 'identity.json'),
          JSON.stringify({
            version: 1,
            workspaceId: input.workspaceId,
            baseRevisionId: input.baseRevisionId,
            metrics,
          } satisfies PersistedWorkspaceIdentity),
        );
        const state: WorkspaceCapabilityState = {
          active: true,
          inFlight: new Set(),
          streams: new Set(),
          watches: new Set(),
        };
        this.#states.set(input.workspaceId, state);
        return Object.freeze({
          identity,
          baseTree: input.tree,
          filesystem: createWorkspaceFileSystem({ source: this.#filesystem, prefix: treeDirectory, identity, state }),
          metadata: createWorkspaceFileSystem({
            source: this.#filesystem,
            prefix: metadataDirectory,
            identity,
            state,
          }),
          metrics,
        });
      } catch (error) {
        await removeTree(this.#filesystem, workspaceDirectory);
        throw error;
      }
    });
  }

  /**
   * Bind a caller-owned writable root as this workspace's tree instead of
   * copying one. Only `identity.json` and `metadata/` are materialized, so the
   * workspace writes straight through to the caller's filesystem and
   * finalization's three-way merge degenerates to a no-op. Idempotent: an
   * existing identity record is adopted (not rewritten), which is how a claim
   * reclaims its binding after a reload with the base tree recovered from the
   * revision authority.
   */
  public async bindInPlace(
    input: MaterializeWorkspaceInput & { readonly filesystem: RootedFileSystem },
  ): Promise<MaterializedWorkspace> {
    return this.#resourceQueue.queueFor(`materialized-workspace:${input.workspaceId}`, async () => {
      if (this.#states.get(input.workspaceId)?.active) {
        throw new MaterializedWorkspaceError('WORKSPACE_EXISTS', `Workspace is already open: ${input.workspaceId}`);
      }
      const workspaceDirectory = joinRelativePath(this.#storageDirectory, input.workspaceId);
      const identityPath = joinRelativePath(workspaceDirectory, 'identity.json');
      const metadataDirectory = joinRelativePath(workspaceDirectory, 'metadata');
      const startedAt = this.#now();
      const persisted = (await this.#filesystem.exists(identityPath))
        ? (JSON.parse(await this.#filesystem.readFile(identityPath, 'utf8')) as Partial<PersistedWorkspaceIdentity>)
        : undefined;
      if (persisted !== undefined && (persisted.version !== 1 || persisted.workspaceId !== input.workspaceId)) {
        throw new MaterializedWorkspaceError(
          'WORKSPACE_DISPOSED',
          `Workspace identity is invalid: ${input.workspaceId}`,
        );
      }
      await this.#filesystem.mkdir(metadataDirectory, { recursive: true });
      const identity: MaterializedWorkspaceIdentity = Object.freeze({
        workspaceId: input.workspaceId,
        baseRevisionId:
          persisted?.baseRevisionId === undefined ? input.baseRevisionId : revisionId(persisted.baseRevisionId),
        mode: 'local',
      });
      const metrics = Object.freeze(
        persisted?.metrics ?? {
          files: input.tree.size,
          bytes: input.tree.byteLength,
          durationMs: Math.max(0, this.#now() - startedAt),
        },
      );
      if (persisted === undefined) {
        await this.#filesystem.writeFile(
          identityPath,
          JSON.stringify({
            version: 1,
            workspaceId: input.workspaceId,
            baseRevisionId: input.baseRevisionId,
            mode: 'local',
            metrics,
          } satisfies PersistedWorkspaceIdentity),
        );
      }
      const state: WorkspaceCapabilityState = {
        active: true,
        inFlight: new Set(),
        streams: new Set(),
        watches: new Set(),
      };
      this.#states.set(input.workspaceId, state);
      return Object.freeze({
        identity,
        baseTree: input.tree,
        filesystem: createWorkspaceFileSystem({ source: input.filesystem, prefix: '', identity, state }),
        metadata: createWorkspaceFileSystem({
          source: this.#filesystem,
          prefix: metadataDirectory,
          identity,
          state,
        }),
        metrics,
      });
    });
  }

  /**
   * Reopen the exact persistent workspace identity without copying or
   * replacing its mutable tree. A live capability must be disposed before a
   * second capability can reclaim the same root.
   */
  public async reopen(workspaceId: MaterializedWorkspaceId): Promise<MaterializedWorkspace> {
    return this.#resourceQueue.queueFor(`materialized-workspace:${workspaceId}`, async () => {
      const existingState = this.#states.get(workspaceId);
      if (existingState?.active) {
        throw new MaterializedWorkspaceError('WORKSPACE_EXISTS', `Workspace is already open: ${workspaceId}`);
      }
      const workspaceDirectory = joinRelativePath(this.#storageDirectory, workspaceId);
      const identityPath = joinRelativePath(workspaceDirectory, 'identity.json');
      if (!(await this.#filesystem.exists(identityPath))) {
        throw new MaterializedWorkspaceError('WORKSPACE_DISPOSED', `Workspace does not exist: ${workspaceId}`);
      }
      const persisted = JSON.parse(
        await this.#filesystem.readFile(identityPath, 'utf8'),
      ) as Partial<PersistedWorkspaceIdentity>;
      if (
        persisted.version !== 1 ||
        persisted.workspaceId !== workspaceId ||
        typeof persisted.baseRevisionId !== 'string'
      ) {
        throw new MaterializedWorkspaceError('WORKSPACE_DISPOSED', `Workspace identity is invalid: ${workspaceId}`);
      }
      const identity: MaterializedWorkspaceIdentity = Object.freeze({
        workspaceId,
        baseRevisionId: revisionId(persisted.baseRevisionId),
        mode: persisted.mode === 'local' ? 'local' : 'branch',
      });
      const treeDirectory = joinRelativePath(workspaceDirectory, 'tree');
      const baseDirectory = joinRelativePath(workspaceDirectory, 'base');
      const metadataDirectory = joinRelativePath(workspaceDirectory, 'metadata');
      if (!(await this.#filesystem.exists(treeDirectory))) {
        throw new MaterializedWorkspaceError('WORKSPACE_DISPOSED', `Workspace tree is missing: ${workspaceId}`);
      }
      if (!(await this.#filesystem.exists(baseDirectory))) {
        throw new MaterializedWorkspaceError('WORKSPACE_DISPOSED', `Workspace base tree is missing: ${workspaceId}`);
      }
      await this.#filesystem.mkdir(metadataDirectory, { recursive: true });
      const state: WorkspaceCapabilityState = {
        active: true,
        inFlight: new Set(),
        streams: new Set(),
        watches: new Set(),
      };
      this.#states.set(workspaceId, state);
      const filesystem = createWorkspaceFileSystem({
        source: this.#filesystem,
        prefix: treeDirectory,
        identity,
        state,
      });
      const baseFilesystem = createWorkspaceFileSystem({
        source: this.#filesystem,
        prefix: baseDirectory,
        identity,
        state,
      });
      const baseTree = await captureRevisionTree(baseFilesystem);
      let { metrics } = persisted;
      if (!metrics) {
        const tree = await captureRevisionTree(filesystem);
        metrics = { files: tree.size, bytes: tree.byteLength, durationMs: 0 };
      }
      return Object.freeze({
        identity,
        baseTree,
        filesystem,
        metadata: createWorkspaceFileSystem({
          source: this.#filesystem,
          prefix: metadataDirectory,
          identity,
          state,
        }),
        metrics: Object.freeze(metrics),
      });
    });
  }

  /** Revoke any live capability and permanently delete its materialized bytes. */
  public async destroy(workspaceId: MaterializedWorkspaceId): Promise<boolean> {
    return this.#resourceQueue.queueFor(`materialized-workspace:${workspaceId}`, async () => {
      const workspaceDirectory = joinRelativePath(this.#storageDirectory, workspaceId);
      if (!(await this.#filesystem.exists(workspaceDirectory))) {
        return false;
      }
      const state = this.#states.get(workspaceId);
      if (state !== undefined) {
        state.active = false;
        for (const stop of state.watches) {
          stop();
        }
        const cancellations = await Promise.allSettled(
          [...state.streams].map(async (stream) => {
            await stream.cancel();
          }),
        );
        const failures: unknown[] = [];
        for (const result of cancellations) {
          if (result.status === 'rejected') {
            failures.push(result.reason as unknown);
          }
        }
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Cannot destroy a workspace before every stream is closed.');
        }
        await Promise.allSettled(state.inFlight);
        this.#states.delete(workspaceId);
      }
      await removeTree(this.#filesystem, workspaceDirectory);
      return true;
    });
  }
}

/** Options for {@link captureRevisionTree}. @public */
export type CaptureRevisionTreeOptions = Readonly<{
  /** Rooted paths the walk must not descend into or record. */
  exclude?: (path: string) => boolean;
  /** File paths that must be present in the completed capture. */
  requiredPaths?: readonly string[];
  /** Maximum number of file streams read at once. Defaults to 16. */
  concurrency?: number;
  /** Maximum aggregate file payload. Defaults to 1 GiB. */
  maximumTotalBytes?: number;
  /** Cancels traversal and all active file streams. */
  signal?: AbortSignal;
}>;

const defaultCaptureConcurrency = 16;
const defaultCaptureMaximumTotalBytes = 1024 * 1024 * 1024;

const assertCaptureLimit = (value: number, label: string, maximum: number): number => {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be a positive safe integer no greater than ${maximum}.`);
  }
  return value;
};

const captureAbortError = (signal: AbortSignal): unknown =>
  signal.reason ?? new DOMException('The revision tree capture was aborted.', 'AbortError');

/**
 * Capture a rooted filesystem as an immutable file-only revision tree.
 *
 * A listing is a snapshot, not a lock: on a real filesystem an entry can be
 * gone before the `stat`/`readFile` that follows it — an atomic write's temp
 * file is renamed over its target, a workspace sweep removes a run directory.
 * An undeclared vanished entry is therefore *skipped*, never a failed capture
 * (which is how a `.<name>.<pid>.<uuid>.tmp` sibling took down workspace
 * admission). A path declared in `requiredPaths` remains fail-closed.
 * Callers that require a coherent process checkpoint must quiesce its writers;
 * this bounded filesystem walk does not create an atomic snapshot or a lock.
 *
 * @public
 */
export const captureRevisionTree = async (
  filesystem: RootedFileSystem,
  options?: CaptureRevisionTreeOptions,
): Promise<ImmutableRevisionTree> => {
  const concurrency = assertCaptureLimit(options?.concurrency ?? defaultCaptureConcurrency, 'concurrency', 256);
  const maximumTotalBytes = assertCaptureLimit(
    options?.maximumTotalBytes ?? defaultCaptureMaximumTotalBytes,
    'maximumTotalBytes',
    Number.MAX_SAFE_INTEGER,
  );
  const excluded = options?.exclude;
  const requiredPaths = new Set(
    (options?.requiredPaths ?? []).map((path) => {
      const requiredPath = assertRootedPath(path);
      if (requiredPath === '') {
        throw new TypeError('A required capture path must name a file, not the tree root.');
      }
      return requiredPath;
    }),
  );
  const abortController = new AbortController();
  const abortFromCaller = (): void => {
    abortController.abort(captureAbortError(options?.signal ?? abortController.signal));
  };
  if (options?.signal?.aborted === true) {
    abortFromCaller();
  } else {
    options?.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }
  const throwIfAborted = (): void => {
    if (abortController.signal.aborted) {
      throw captureAbortError(abortController.signal);
    }
  };
  const skipIfVanished = async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await operation();
    } catch (error) {
      if (isNotFoundError(error)) {
        return undefined;
      }
      throw error;
    }
  };
  const filePaths: string[] = [];
  const visit = async (path: string): Promise<void> => {
    throwIfAborted();
    const children = await skipIfVanished(async () => filesystem.readdir(path));
    for (const child of children ?? []) {
      throwIfAborted();
      const childPath = joinRelativePath(path, child);
      if (excluded?.(childPath) === true) {
        continue;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential traversal avoids a second nested concurrency pool.
      const stat = await skipIfVanished(async () => filesystem.stat(childPath));
      if (stat === undefined) {
        continue;
      }
      if (stat.type === 'dir') {
        // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential traversal avoids deadlocking nested bounded pools.
        await visit(childPath);
      } else {
        filePaths.push(childPath);
      }
    }
  };
  try {
    await visit('');
    const entries = Array.from<readonly [string, Uint8Array<ArrayBuffer>] | undefined>({
      length: filePaths.length,
    });
    let nextIndex = 0;
    let capturedBytes = 0;
    let firstFailure: unknown;
    const captureFile = async (path: string, index: number): Promise<void> => {
      let reservedBytes = 0;
      let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
      let cancellation: Promise<void> | undefined;
      let captureFailure: unknown;
      let failed = false;
      let vanished = false;
      const containCancellationRejection = async (pending: Promise<void>): Promise<void> => {
        try {
          await pending;
        } catch {
          // The worker joins and reports this same promise before it settles.
        }
      };
      const cancelReader = (reason: unknown = captureAbortError(abortController.signal)): void => {
        if (reader !== undefined) {
          cancellation ??= reader.cancel(reason);
          void containCancellationRejection(cancellation);
        }
      };
      const cancelReaderAfterAbort = (): void => {
        cancelReader();
      };
      try {
        throwIfAborted();
        const streamOptions = { signal: abortController.signal };
        /*
         * A rooted view that cannot stream natively buffers each file whole.
         *
         * ponytail: the browser's fs-client adapter, the file-manager worker and
         * the runtime worker proxy have no streaming read, so only the aggregate
         * `maximumTotalBytes` bound holds for them — a single file larger than
         * the bound is resident before the RangeError, exactly as it was before
         * this walk became streaming. Upgrade path: `readFileStream` over the
         * fs-bridge into `FileSystemClient` and its facade, then delete this.
         */
        const stream =
          filesystem.readFileStream?.(path, streamOptions) ??
          bufferToStream(await filesystem.readFile(path), streamOptions);
        reader = stream.getReader();
        abortController.signal.addEventListener('abort', cancelReaderAfterAbort, { once: true });
        const chunks: Array<Uint8Array<ArrayBuffer>> = [];
        let complete = false;
        while (!complete) {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Stream chunks must be consumed in source order.
          const result = await reader.read();
          throwIfAborted();
          if (result.done) {
            complete = true;
            continue;
          }
          if (capturedBytes + result.value.byteLength > maximumTotalBytes) {
            throw new RangeError(`Revision tree capture exceeds maximumTotalBytes (${maximumTotalBytes}).`);
          }
          capturedBytes += result.value.byteLength;
          reservedBytes += result.value.byteLength;
          chunks.push(result.value);
        }
        const content = new Uint8Array(reservedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          content.set(chunk, offset);
          offset += chunk.byteLength;
        }
        entries[index] = [path, content];
      } catch (error) {
        capturedBytes -= reservedBytes;
        if (!requiredPaths.has(path) && isNotFoundError(error)) {
          vanished = true;
        } else {
          failed = true;
          captureFailure = error;
        }
      } finally {
        abortController.signal.removeEventListener('abort', cancelReaderAfterAbort);
        if (failed || vanished || abortController.signal.aborted) {
          cancelReader(captureFailure);
        }
        if (cancellation !== undefined) {
          try {
            await cancellation;
          } catch (error) {
            captureFailure = failed
              ? new AggregateError(
                  [captureFailure, error],
                  `Revision capture failed and stream cleanup failed: ${path}`,
                )
              : error;
            failed = true;
          }
        }
        reader?.releaseLock();
      }
      if (failed) {
        throw captureFailure instanceof Error
          ? captureFailure
          : new Error(`Revision capture failed: ${path}`, { cause: captureFailure });
      }
    };
    const worker = async (): Promise<void> => {
      while (!abortController.signal.aborted) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= filePaths.length) {
          return;
        }
        try {
          // oxlint-disable-next-line eslint/no-await-in-loop -- Each worker owns one sequential lane in the shared pool.
          await captureFile(filePaths[index]!, index);
        } catch (error) {
          firstFailure ??= error;
          abortController.abort(error);
        }
      }
    };
    await Promise.allSettled(Array.from({ length: Math.min(concurrency, filePaths.length) }, async () => worker()));
    if (firstFailure !== undefined) {
      throw firstFailure instanceof Error
        ? firstFailure
        : new Error('Revision tree capture failed.', { cause: firstFailure });
    }
    throwIfAborted();
    const completeEntries = entries.filter(
      (entry): entry is readonly [string, Uint8Array<ArrayBuffer>] => entry !== undefined,
    );
    const capturedPaths = new Set(completeEntries.map(([path]) => path));
    const missingRequired = [...requiredPaths].filter((path) => !capturedPaths.has(path));
    if (missingRequired.length > 0) {
      throw new Error(`Required capture paths were not captured: ${missingRequired.join(', ')}`);
    }
    return new ImmutableRevisionTree(completeEntries);
  } finally {
    options?.signal?.removeEventListener('abort', abortFromCaller);
  }
};
