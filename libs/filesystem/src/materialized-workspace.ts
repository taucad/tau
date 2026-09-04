import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { ResourceQueue } from '#resource-queue.js';
import type { RootedFileSystem } from '#workspace-file-service.js';
import type { FileStat, WatchEvent, WatchRequest } from '#types.js';
import { ImmutableRevisionTree, revisionId } from '#revision-tree.js';
import type { MaterializedWorkspaceId } from '#workspace-identity.js';

type RevisionId = ReturnType<typeof revisionId>;

/** Immutable identity binding a writable root to its exact base revision. @public */
export type MaterializedWorkspaceIdentity = Readonly<{
  workspaceId: MaterializedWorkspaceId;
  baseRevisionId: RevisionId;
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

type PersistedWorkspaceIdentity = Readonly<{
  version: 1;
  workspaceId: string;
  baseRevisionId: string;
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
    },
    readFile,
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
  const children = await filesystem.readdir(path);
  await Promise.all(
    children.map(async (child) => {
      await removeTree(filesystem, joinRelativePath(path, child));
    }),
  );
  await filesystem.rmdir(path);
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
        const state: WorkspaceCapabilityState = { active: true, inFlight: new Set(), watches: new Set() };
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
      const state: WorkspaceCapabilityState = { active: true, inFlight: new Set(), watches: new Set() };
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
        await Promise.allSettled(state.inFlight);
        this.#states.delete(workspaceId);
      }
      await removeTree(this.#filesystem, workspaceDirectory);
      return true;
    });
  }
}

/** Capture a rooted filesystem as an immutable file-only revision tree. @public */
export const captureRevisionTree = async (filesystem: RootedFileSystem): Promise<ImmutableRevisionTree> => {
  const entries: Array<readonly [string, Uint8Array<ArrayBuffer>]> = [];
  const visit = async (path: string): Promise<void> => {
    const children = await filesystem.readdir(path);
    await Promise.all(
      children.map(async (child) => {
        const childPath = joinRelativePath(path, child);
        const stat = await filesystem.stat(childPath);
        if (stat.type === 'dir') {
          await visit(childPath);
          return;
        }
        entries.push([childPath, await filesystem.readFile(childPath)]);
      }),
    );
  };
  await visit('');
  return new ImmutableRevisionTree(entries);
};
