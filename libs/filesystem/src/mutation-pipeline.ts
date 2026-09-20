/**
 * The mutation pipeline: the one place a workspace write happens (charter D4, D14).
 *
 * Extracted from `WorkspaceFileService` unchanged. Every mutation — a single
 * write, a checked write, an append, a mkdir, an unlink, an rmdir, a move, and
 * the batch porcelain built from them — arrives here already *resolved*: the
 * caller (the authority for a global path, a rooted view for a root-relative
 * one) has decided which provider owns the bytes, and this class owns
 * everything after that decision.
 *
 * "Everything after" is one sequence, and it is the reason there is a class
 * here rather than a function per operation (authority Rule 5a): acquire the
 * cross-tab and queue locks for the whole operation, refresh the providers
 * inside them, mutate, then record the completion — shared file pool, per-root
 * tree index, one summary change event, cross-tab notification — or, on a
 * half-finished mutation, drop exactly the derivatives that became
 * untrustworthy. A tree copy does that once for the copy; a batch write
 * settles per file, so a rejected path costs only its own derivatives.
 *
 * It knows nothing about path classes, routes or project manifests: the mask is
 * the caller's (`admits` is the only filter it takes, and the composed view
 * above supplies it), and the namespace is whatever the resolved operands
 * already speak.
 *
 * @module
 */

import type { CheckedFileWriteResult, FileStat } from '@taucad/types';
import {
  assertRootedPath,
  joinPath,
  joinRelativePath,
  normalizePath,
  parentDirectory,
  resolveAuthorityPath,
} from '@taucad/utils/path';
import type { SharedPool } from '@taucad/memory';
import type {
  ChangeEvent,
  DirectoryEntry,
  FileSystemProvider,
  MkdirOptions,
  WorkspaceMutationContext,
} from '#types.js';
import type { MountResolution, MountTable } from '#mount-table.js';
import type { ChangeEventBus } from '#change-event-bus.js';
import type { ResourceQueue } from '#resource-queue.js';
import type { CrossTabCoordinator, PhysicalAuthority } from '#cross-tab-coordinator.js';
import type { TreeIndexes } from '#tree-index.js';
import type { WalkOptions } from '#content-ops/walk.js';
import { MissingWorkspaceHandleError, WorkspaceMutationError } from '#workspace-errors.js';
import { getFileContentMetadata } from '#content-metadata.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';
import { tagEventAuthorities, tagEventOrigin } from '#event-origin-registry.js';
import { parseRoute } from '#project-routes.js';
import { mapConcurrent } from '#concurrency.js';

const maximumCheckedWritePreconditions = 32;
const maximumCheckedWriteBytes = 8 * 1024 * 1024;

const asBytes = (value: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);

/** Deepest path every given path lies at or inside, by segment. */
const commonAncestorPath = (paths: readonly string[]): string => {
  let segments = paths[0]!.split('/');
  for (const path of paths.slice(1)) {
    const other = path.split('/');
    let shared = 0;
    while (shared < segments.length && shared < other.length && segments[shared] === other[shared]) {
      shared += 1;
    }
    segments = segments.slice(0, shared);
  }
  return segments.join('/');
};

/**
 * Writes one batch may have in flight.
 *
 * A provider that coalesces writes into its own batched commit takes the whole
 * batch at once — that is what lets IndexedDB drain a bulk import in one native
 * transaction. Any other provider takes them one at a time, as the per-file
 * lock sets used to make it do: a handle per file in flight is how a thousand
 * of them exhaust a descriptor limit.
 */
const batchWriteConcurrency = (ownedFiles: ReadonlyArray<{ resolution: Pick<MountResolution, 'provider'> }>): number =>
  ownedFiles.every(({ resolution }) => resolution.provider.capabilities.coalescesWrites === true)
    ? ownedFiles.length
    : 1;

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

const readFileOrAbsent = async (
  provider: FileSystemProvider,
  path: string,
  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
): Promise<Uint8Array<ArrayBuffer> | null> => {
  try {
    return await provider.readFile(path);
  } catch (error) {
    const code = (error as { code?: unknown } | undefined)?.code;
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
};

const checkedWriteFailure = (
  state: 'known-not-applied' | 'potentially-applied',
  error: unknown,
): Error & { applicationState: typeof state } => {
  const result = error instanceof Error ? error : new Error(String(error));
  const candidateMetadata = (result as { metadata?: unknown }).metadata;
  const metadata =
    candidateMetadata !== null && typeof candidateMetadata === 'object' && !Array.isArray(candidateMetadata)
      ? candidateMetadata
      : {};
  return Object.assign(result, { applicationState: state, metadata: { ...metadata, applicationState: state } });
};

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
 * Whether the resolved target exists, or the refusal a missing workspace handle
 * makes the truthful answer.
 *
 * @param target - The path as its own boundary spells it, and its resolution.
 * @returns Existence, or a {@link WorkspaceMutationError} the preflight returns verbatim.
 */
const existsForPreflight = async (target: {
  path: string;
  resolution: MountResolution;
}): Promise<boolean | WorkspaceMutationError> => {
  try {
    return await target.resolution.provider.exists(target.resolution.path);
  } catch (error) {
    if (error instanceof MissingWorkspaceHandleError) {
      return new WorkspaceMutationError('MISSING_WORKSPACE_HANDLE', target.path, { cause: error });
    }
    throw error;
  }
};

/**
 * The existence half of the move preflight — the half that is the same at every
 * boundary. Path syntax, reserved routes and the namespace itself belong to the
 * caller; only the provider probes are here.
 *
 * @param source - Resolved source, spelled in its caller's namespace.
 * @param target - Resolved destination, spelled in its caller's namespace.
 * @returns `true` when the move is safe to issue, otherwise the typed refusal.
 * @public
 */
export const preflightMove = async (
  source: { path: string; resolution: MountResolution },
  target: { path: string; resolution: MountResolution },
): Promise<true | WorkspaceMutationError> => {
  const sourceExists = await existsForPreflight(source);
  if (sourceExists instanceof WorkspaceMutationError) {
    return sourceExists;
  }
  if (!sourceExists) {
    return new WorkspaceMutationError('NOT_FOUND', source.path);
  }
  const targetExists = await existsForPreflight(target);
  if (targetExists instanceof WorkspaceMutationError) {
    return targetExists;
  }
  if (targetExists) {
    return new WorkspaceMutationError('NAME_EXISTS', target.path, { target: target.path });
  }
  return true;
};

/**
 * The existence half of the create preflight.
 *
 * @param target - Resolved destination, spelled in its caller's namespace.
 * @returns `true` when nothing occupies the path, otherwise the typed refusal.
 * @public
 */
export const preflightCreate = async (target: {
  path: string;
  resolution: MountResolution;
}): Promise<true | WorkspaceMutationError> => {
  const exists = await existsForPreflight(target);
  if (exists instanceof WorkspaceMutationError) {
    return exists;
  }
  return exists ? new WorkspaceMutationError('NAME_EXISTS', target.path) : true;
};

/**
 * The existence half of the delete preflight.
 *
 * @param target - Resolved path, spelled in its caller's namespace.
 * @returns `true` when the path exists, otherwise the typed refusal.
 * @public
 */
export const preflightDelete = async (target: {
  path: string;
  resolution: MountResolution;
}): Promise<true | WorkspaceMutationError> => {
  const exists = await existsForPreflight(target);
  if (exists instanceof WorkspaceMutationError) {
    return exists;
  }
  return exists ? true : new WorkspaceMutationError('NOT_FOUND', target.path);
};

/** One source → target pair a bulk move carries. @public */
export type BulkMoveEdit = { source: string; target: string };

/** Every completed and failed edit of one bulk move. @public */
export type BulkMoveResult = {
  moved: ReadonlyArray<{ edit: BulkMoveEdit; stat: FileStat }>;
  failed: ReadonlyArray<{ edit: BulkMoveEdit; error: WorkspaceMutationError }>;
};

export { causeToMutationError, isProjectDirectoryPath };

/**
 * The resolved-mutation half of the filesystem authority.
 *
 * Constructed once by {@link WorkspaceFileService}, which keeps ownership of
 * the queue it is handed (Core Principle 1) and of every routing decision above
 * it.
 *
 * @public
 */
export class MutationPipeline {
  private readonly _mountTable: MountTable;
  private readonly _resourceQueue: ResourceQueue;
  private readonly _eventBus: ChangeEventBus;
  private readonly _crossTabCoordinator: CrossTabCoordinator;
  private readonly _treeIndexes: TreeIndexes;
  /**
   * Read through a function, not a field: the writer-side pool arrives after
   * construction (`setFilePool`) and stays owned by the composition root.
   */
  private readonly _filePool: () => SharedPool | undefined;

  /**
   * Create the pipeline over the authority's own collaborators.
   *
   * @param options - The mount table, queue, event bus, cross-tab coordinator, per-root indexes and pool accessor the authority owns.
   */
  public constructor(options: {
    mountTable: MountTable;
    resourceQueue: ResourceQueue;
    eventBus: ChangeEventBus;
    crossTabCoordinator: CrossTabCoordinator;
    treeIndexes: TreeIndexes;
    filePool: () => SharedPool | undefined;
  }) {
    this._mountTable = options.mountTable;
    this._resourceQueue = options.resourceQueue;
    this._eventBus = options.eventBus;
    this._crossTabCoordinator = options.crossTabCoordinator;
    this._treeIndexes = options.treeIndexes;
    this._filePool = options.filePool;
  }

  /**
   * Move many paths sequentially and report every completed and failed edit.
   * Completed edits are never rolled back over newer peer data.
   *
   * @param move - The single-path move its own boundary resolves; the authority's and a rooted view's differ only there.
   * @param edits - Source → target pairs.
   * @returns The {@link BulkMoveResult} describing successes + the failure (if any).
   */
  public async bulkMove(
    move: (source: string, target: string) => Promise<FileStat>,
    edits: readonly BulkMoveEdit[],
  ): Promise<BulkMoveResult> {
    if (edits.length === 0) {
      return { moved: [], failed: [] };
    }

    const completed: Array<{ edit: BulkMoveEdit; stat: FileStat }> = [];
    const failed: Array<{ edit: BulkMoveEdit; error: WorkspaceMutationError }> = [];

    for (const edit of edits) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Result order and dependent edits require sequential moves.
        const stat = await move(edit.source, edit.target);
        completed.push({ edit, stat });
      } catch (error) {
        const mutationError = causeToMutationError(error, edit.source, edit.target);
        failed.push({ edit, error: mutationError });
      }
    }

    return { moved: completed, failed };
  }

  /**
   * Recursively copy one resolved subtree onto another as a single batch: one
   * lock set, one `directoryCopied` summary, targeted invalidation (Rule 5a).
   *
   * @param operands - Both resolved endpoints, the caller's own entry filter, and the mutation context.
   * @returns Resolves when the copy completes.
   */
  public async copyTree(operands: {
    source: string;
    target: string;
    sourceResolution: MountResolution;
    targetResolution: MountResolution;
    /** The caller's own filter, asked before every read and every descent. */
    admits?: WalkOptions['admits'];
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const {
      source,
      target: destination,
      sourceResolution,
      targetResolution: destinationResolution,
      admits,
      context,
    } = operands;
    const lockPaths = this.mutationLockPaths([
      { path: source, resolution: sourceResolution },
      { path: destination, resolution: destinationResolution },
    ]);
    let mutationBegan = false;
    return this._crossTabCoordinator.withLocks(lockPaths, async () =>
      this._resourceQueue.queueForMany(lockPaths, async () => {
        try {
          await this.refreshMutationProviders([sourceResolution, destinationResolution]);
          this._assertNoDescendantMounts(source, 'copy');
          this._assertNoDescendantMounts(destination, 'copy');
          const snapshot = await this.directoryContents(sourceResolution.provider, sourceResolution.path, {
            admits,
          });
          const destinationEntries = ['', ...snapshot.directories].map((relativePath) => {
            const path = relativePath === '' ? destination : joinPath(destination, relativePath);
            const resolvedPath =
              relativePath === ''
                ? destinationResolution.path
                : joinRelativePath(destinationResolution.path, relativePath);
            return { path, resolution: { ...destinationResolution, path: resolvedPath } };
          });
          for (const { path, resolution } of destinationEntries) {
            // oxlint-disable-next-line no-await-in-loop -- Preserve source directory order so parents exist before children.
            const existed = await resolution.provider.exists(resolution.path);
            mutationBegan = true;
            // oxlint-disable-next-line no-await-in-loop -- Preserve source directory order so parents exist before children.
            await resolution.provider.mkdir(resolution.path, { recursive: true });
            if (!existed) {
              if (this.isCurrentResolution(path, resolution)) {
                this._treeIndexes.addDirectory(path);
              }
              this.emitChangeEvent({ type: 'directoryCreated', path, backend: resolution.backend }, context, {
                operations: [{ path, resolution }],
              });
            }
          }
          const destinationFiles = Object.entries(snapshot.files).map(([relativePath, content]) => {
            const path = joinPath(destination, relativePath);
            const resolvedPath = joinRelativePath(destinationResolution.path, relativePath);
            return { path, content, resolution: { ...destinationResolution, path: resolvedPath } };
          });
          for (const { path, content, resolution } of destinationFiles) {
            mutationBegan = true;
            // oxlint-disable-next-line no-await-in-loop -- Preserve deterministic local write ordering.
            await this.writeFileUnlocked({ path, resolution, data: content, context });
          }
          this.emitChangeEvent(
            {
              type: 'directoryCopied',
              sourcePath: source,
              targetPath: destination,
              backend: destinationResolution.backend,
            },
            context,
            { operations: [{ path: destination, resolution: destinationResolution }] },
          );
          this._crossTabCoordinator.notifyDirectoryChange(destination, this.physicalAuthority(destinationResolution));
        } catch (error) {
          if (mutationBegan) {
            const globallyVisible = this.isCurrentResolution(destination, destinationResolution);
            if (globallyVisible) {
              this._filePool()?.clear();
              this._treeIndexes.evict(destination);
            }
            this.emitChangeEvent({ type: 'backendChanged', backend: destinationResolution.backend }, context, {
              operations: [{ path: destination, resolution: destinationResolution }],
              globallyVisible,
            });
            this._crossTabCoordinator.notifyDirectoryChange(destination, this.physicalAuthority(destinationResolution));
          }
          throw error;
        }
      }),
    );
  }

  /**
   * Write many already-resolved files as one batch: every write settles, then
   * the rejected paths alone lose their derivatives (Rule 5a).
   *
   * The batch holds one lock set and one queue entry covering every path, so a
   * provider that coalesces writes commits the whole batch natively (Rule 34)
   * instead of once per file. Nothing else about the contract moves: each path
   * keeps its own commit, cache and index bookkeeping, its own `fileWritten`
   * and its own cross-tab notification, and a partial failure still leaves the
   * settled writes durable while only the rejected paths lose derivatives.
   *
   * @param ownedFiles - Resolved targets whose bytes the caller already owns.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Resolves when all writes complete.
   */
  public async writeFiles(
    ownedFiles: ReadonlyArray<{
      path: string;
      resolution: MountResolution;
      content: Uint8Array<ArrayBuffer> | string;
    }>,
    context?: WorkspaceMutationContext,
  ): Promise<void> {
    if (ownedFiles.length === 0) {
      return;
    }
    const operations = ownedFiles.map(({ path, resolution }) => ({ path, resolution }));
    const locks = this.batchLockPaths(operations);
    const results = await this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        await this.refreshMutationProviders(operations.map(({ resolution }) => resolution));
        const settled = await mapConcurrent(
          ownedFiles,
          batchWriteConcurrency(ownedFiles),
          async ({ path, resolution, content }): Promise<PromiseSettledResult<void>> => {
            try {
              await this.writeFileUnlocked({ path, resolution, data: content, context });
              return { status: 'fulfilled', value: undefined };
            } catch (error) {
              return { status: 'rejected', reason: error };
            }
          },
        );
        for (const [index, result] of settled.entries()) {
          if (result.status === 'fulfilled') {
            const { path, resolution } = operations[index]!;
            this._crossTabCoordinator.notifyMutation({
              type: 'write',
              path,
              authority: this.physicalAuthority(resolution),
            });
          }
        }
        return settled;
      }),
    );
    const firstFailure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    if (firstFailure !== undefined) {
      // Every settled write already recorded itself; only the rejected paths hold
      // untrustworthy derivatives, so the batch's successes keep their cached state.
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          const { path } = ownedFiles[index]!;
          this._filePool()?.invalidate(path);
          this._treeIndexes.removeFile(path);
        }
      }
      const operationsByBackend = Map.groupBy(operations, ({ resolution }) => resolution.backend);
      for (const [backend, operations] of operationsByBackend) {
        this.emitChangeEvent({ type: 'backendChanged', backend }, context, {
          operations,
          globallyVisible: operations.some(({ path, resolution }) => this.isCurrentResolution(path, resolution)),
        });
      }
      const notifiedParents = new Set<string>();
      for (const { path, resolution } of ownedFiles) {
        const parent = parentDirectory(path);
        const authority = this.physicalAuthority(resolution);
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

  public isCurrentResolution(path: string, resolution: MountResolution): boolean {
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

  public emitChangeEvent(
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
          attribution.operations.every(({ path, resolution }) => this.isCurrentResolution(path, resolution));
        tagEventAuthorities(event, authorities, globallyVisible);
      }
    }
    this._eventBus.emit(event);
  }

  public async writeFileResolved({
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
    const locks = this.mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'write', path, authority: this.physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          await this.refreshMutationProviders([resolution]);
          await this.writeFileUnlocked({ path, resolution, data, context });
        }),
    );
  }

  public async writeFileCheckedResolved({
    path,
    resolution,
    data,
    preconditions,
    signal,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    data: Uint8Array<ArrayBuffer> | string;
    preconditions: ReadonlyArray<{
      path: string;
      // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
      expected: Uint8Array<ArrayBuffer> | string | null;
      resolution: MountResolution;
    }>;
    signal?: AbortSignal;
    context?: WorkspaceMutationContext;
  }): Promise<CheckedFileWriteResult> {
    if (preconditions.length === 0 || preconditions.length > maximumCheckedWritePreconditions) {
      throw new TypeError(`Checked writes require 1-${String(maximumCheckedWritePreconditions)} preconditions.`);
    }
    const ownedData = asBytes(data);
    const ownedPreconditions = preconditions.map((precondition) => ({
      ...precondition,
      expected: precondition.expected === null ? null : asBytes(precondition.expected),
    }));
    const expectedBytes = ownedPreconditions.reduce(
      (total, precondition) => total + (precondition.expected?.byteLength ?? 0),
      ownedData.byteLength,
    );
    if (expectedBytes > maximumCheckedWriteBytes) {
      throw new TypeError(`Checked write request exceeds ${String(maximumCheckedWriteBytes)} bytes.`);
    }
    const targetAuthority = resolution.entry;
    if (
      targetAuthority?.storageRootKey === undefined ||
      ownedPreconditions.some(
        (precondition) =>
          precondition.resolution.provider !== resolution.provider ||
          precondition.resolution.entry?.storageRootKey !== targetAuthority.storageRootKey,
      )
    ) {
      throw new TypeError('Checked write paths must share one admitted physical authority.');
    }
    // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
    const physical = new Map<string, Uint8Array<ArrayBuffer> | null>();
    const logicalByPhysical = new Map<string, string>();
    for (const precondition of ownedPreconditions) {
      const previous = physical.get(precondition.resolution.path);
      if (previous !== undefined || physical.has(precondition.resolution.path)) {
        const same =
          previous === null
            ? precondition.expected === null
            : precondition.expected !== null && bytesEqual(previous!, precondition.expected);
        if (!same) {
          throw new TypeError(`Checked write aliases disagree for '${precondition.path}'.`);
        }
      } else {
        physical.set(precondition.resolution.path, precondition.expected);
        logicalByPhysical.set(precondition.resolution.path, precondition.path);
      }
    }
    if (!physical.has(resolution.path)) {
      throw new TypeError('Checked writes require a destination precondition.');
    }
    if (signal?.aborted) {
      throw checkedWriteFailure(
        'known-not-applied',
        signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError'),
      );
    }

    const operations = [
      { path, resolution },
      ...ownedPreconditions.map(({ path, resolution }) => ({ path, resolution })),
    ];
    const locks = this.mutationLockPaths(operations);
    const run = async (): Promise<CheckedFileWriteResult> =>
      this._resourceQueue.queueForMany(locks, async () => {
        await this.refreshMutationProviders(operations.map(({ resolution }) => resolution));
        if (signal?.aborted) {
          throw checkedWriteFailure(
            'known-not-applied',
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('The operation was aborted.', 'AbortError'),
          );
        }
        if (resolution.provider.writeFileChecked !== undefined) {
          let result: CheckedFileWriteResult;
          try {
            result = await resolution.provider.writeFileChecked({
              path: resolution.path,
              data: ownedData,
              preconditions: [...physical].map(([preconditionPath, expected]) => ({
                path: preconditionPath,
                expected,
              })),
            });
          } catch (error) {
            if ((error as { applicationState?: unknown }).applicationState !== undefined) {
              throw error;
            }
            throw checkedWriteFailure('potentially-applied', error);
          }
          if (result.status === 'applied') {
            this._recordCompletedWrite({ path, resolution, bytes: result.content, context });
          }
          return result.status === 'conflict'
            ? {
                status: 'conflict',
                conflicts: result.conflicts.map((conflict) => ({
                  ...conflict,
                  path: logicalByPhysical.get(conflict.path) ?? conflict.path,
                })),
              }
            : result;
        }
        const checkedPaths = [
          ...new Map(ownedPreconditions.map((precondition) => [precondition.path, precondition])).values(),
        ];
        const compared = await Promise.all(
          checkedPaths.map(async (precondition) => {
            const actual = await readFileOrAbsent(precondition.resolution.provider, precondition.resolution.path);
            const matches =
              actual === null
                ? precondition.expected === null
                : precondition.expected !== null && bytesEqual(actual, precondition.expected);
            return matches ? undefined : { path: precondition.path, actual };
          }),
        );
        const conflicts = compared.filter((conflict) => conflict !== undefined);
        if (conflicts.length > 0) {
          return { status: 'conflict', conflicts };
        }
        const current = await readFileOrAbsent(resolution.provider, resolution.path);
        if (current !== null && bytesEqual(current, ownedData)) {
          return { status: 'unchanged', content: current };
        }
        if (signal?.aborted) {
          throw checkedWriteFailure(
            'known-not-applied',
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('The operation was aborted.', 'AbortError'),
          );
        }
        try {
          await resolution.provider.writeFile(resolution.path, ownedData);
          this._recordCompletedWrite({ path, resolution, bytes: ownedData, context });
        } catch (error) {
          throw checkedWriteFailure('potentially-applied', error);
        }
        return { status: 'applied', content: ownedData };
      });
    const result = await (resolution.provider.writeFileChecked === undefined
      ? this._crossTabCoordinator.withRequiredLocks(locks, run)
      : this._crossTabCoordinator.withLocks(locks, run));
    if (result.status === 'applied') {
      this._crossTabCoordinator.notifyMutation({
        type: 'write',
        path,
        authority: this.physicalAuthority(resolution),
      });
    }
    return result;
  }

  public async appendFileResolved({
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
    const locks = this.mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'write', path, authority: this.physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          await this.refreshMutationProviders([resolution]);
          await this._appendFileUnlocked({ path, resolution, data, context });
        }),
    );
  }

  public async writeFileUnlocked({
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

  public async moveResolved({
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
    const lockPaths = this.mutationLockPaths([
      { path: source, resolution: sourceResolution },
      { path: target, resolution: targetResolution },
    ]);
    return this._crossTabCoordinator.withLocks(lockPaths, async () =>
      this._resourceQueue.queueForMany(lockPaths, async () => {
        let mutationBegan = false;
        try {
          await this.refreshMutationProviders([sourceResolution, targetResolution]);
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
            await this.removeRecursive(sourceResolution.provider, sourceResolution.path);
          } else {
            const data = await sourceResolution.provider.readFile(sourceResolution.path);
            await targetResolution.provider.writeFile(targetResolution.path, data);
            await sourceResolution.provider.unlink(sourceResolution.path);
          }

          const sourceIsCurrent = this.isCurrentResolution(source, sourceResolution);
          const targetIsCurrent = this.isCurrentResolution(target, targetResolution);
          if (sourceIsCurrent && targetIsCurrent) {
            this._filePool()?.invalidate(source);
            this._filePool()?.invalidate(target);
            this._treeIndexes.rename(source, target);
          } else if (sourceIsCurrent || targetIsCurrent) {
            this._filePool()?.clear();
            this._treeIndexes.evict(source);
            this._treeIndexes.evict(target);
          }

          const resultingStat = await targetResolution.provider.stat(targetResolution.path);
          this.emitChangeEvent(
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
              this.isCurrentResolution(operation.path, operation.resolution),
            );
            if (globallyVisible) {
              this._filePool()?.clear();
              this._treeIndexes.evict(source);
              this._treeIndexes.evict(target);
            }
            for (const backend of new Set([sourceResolution.backend, targetResolution.backend])) {
              this.emitChangeEvent({ type: 'backendChanged', backend }, context, { operations, globallyVisible });
            }
            this._notifyMoveParents({ source, target, sourceResolution, targetResolution });
          }
          throw error;
        }
      }),
    );
  }

  public async mkdirResolved({
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
    const locks = this.mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withLocks(locks, async () =>
      this._resourceQueue.queueForMany(locks, async () => {
        const { provider, path: resolvedPath, backend: resolvedBackend } = resolution;
        await this.refreshMutationProviders([resolution]);
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

        if (this.isCurrentResolution(path, resolution)) {
          this._treeIndexes.addDirectory(path);
        }
        this.emitChangeEvent(
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
          authority: this.physicalAuthority(resolution),
        });
      }),
    );
  }

  public async unlinkResolved({
    path,
    resolution,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const locks = this.mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'delete', path, authority: this.physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          const { provider, path: resolvedPath, backend: resolvedBackend } = resolution;
          await this.refreshMutationProviders([resolution]);
          await provider.unlink(resolvedPath);

          if (this.isCurrentResolution(path, resolution)) {
            this._filePool()?.invalidate(path);
            this._treeIndexes.removeFile(path);
          }
          this.emitChangeEvent(
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

  public async rmdirResolved({
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
    const locks = this.mutationLockPaths([{ path, resolution }]);
    return this._crossTabCoordinator.withMutationLocks(
      locks,
      { type: 'rmdir', path, authority: this.physicalAuthority(resolution) },
      async () =>
        this._resourceQueue.queueForMany(locks, async () => {
          const { provider, path: resolvedPath, backend: resolvedBackend } = resolution;
          await this.refreshMutationProviders([resolution]);

          if (options?.recursive === true) {
            this._assertNoDescendantMounts(path, 'recursive remove');
            try {
              await this.rmdirRecursive(provider, resolvedPath);
            } catch (error) {
              this._handlePartialMutationFailure(path, resolution, context);
              throw error;
            }
          } else {
            await provider.rmdir(resolvedPath);
          }

          if (this.isCurrentResolution(path, resolution)) {
            this._treeIndexes.removeDirectory(path);
          }
          this.emitChangeEvent(
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

  public mutationLockPaths(operations: ReadonlyArray<{ path: string; resolution: MountResolution }>): string[] {
    const locks = new Set<string>();
    const addAuthorityHierarchy = (path: string, boundary: string, format: (value: string) => string): void => {
      let current = resolveAuthorityPath(path);
      const root = resolveAuthorityPath(boundary);
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
    const addRootedHierarchy = (path: string, boundary: string, format: (value: string) => string): void => {
      let current = assertRootedPath(path);
      const root = assertRootedPath(boundary);
      if (current !== root && !(root === '' ? current !== '' : current.startsWith(`${root}/`))) {
        throw new Error(`Mutation path '${current}' is outside its authority root '${root}'.`);
      }
      for (;;) {
        locks.add(format(current));
        if (current === root) {
          return;
        }
        const separator = current.lastIndexOf('/');
        current = separator === -1 ? '' : current.slice(0, separator);
      }
    };

    for (const { path, resolution } of operations) {
      const normalized = resolveAuthorityPath(path);
      addAuthorityHierarchy(normalized, resolution.entry?.prefix ?? normalized, (value) => value);
      const projectId = this._projectLockOwner(normalized, resolution);
      if (projectId !== undefined) {
        locks.add(`project:${projectId}`);
      }
      const { entry } = resolution;
      if (entry?.storageRootKey !== undefined) {
        addRootedHierarchy(resolution.path, entry.providerBasePath, (value) => `${entry.storageRootKey}:${value}`);
      }
    }
    return [...locks];
  }

  /**
   * The locks one batch holds: per mount, the hierarchy of the deepest path
   * that every operation in it lies at or inside.
   *
   * Exclusion is what a per-file set gave. Every mutation's own set carries its
   * ancestors up to its mount prefix and its storage root's own token, so a peer
   * writing any path inside the batch still conflicts on the tokens held here —
   * while a thousand-file batch requests a handful of locks instead of nesting
   * one `navigator.locks` request per file (the recursion in
   * {@link withCrossTabLocks}, which a bulk import overflowed).
   *
   * @param operations - Every resolved path the batch writes.
   * @returns Lock tokens covering the whole batch.
   */
  public batchLockPaths(operations: ReadonlyArray<{ path: string; resolution: MountResolution }>): string[] {
    const byMount = Map.groupBy(operations, ({ resolution }) => resolution.entry);
    return [
      ...new Set(
        [...byMount.values()].flatMap((group) =>
          this.mutationLockPaths([
            {
              path: commonAncestorPath(group.map(({ path }) => path)) || '/',
              resolution: {
                ...group[0]!.resolution,
                path: commonAncestorPath(group.map(({ resolution }) => resolution.path)),
              },
            },
          ]),
        ),
      ),
    ];
  }

  public physicalAuthority(resolution: MountResolution): PhysicalAuthority {
    if (resolution.entry?.storageRootKey === undefined) {
      throw new Error('Mounted mutation is missing canonical physical authority metadata.');
    }
    return {
      storageRootKey: resolution.entry.storageRootKey,
      providerBasePath: resolution.entry.providerBasePath,
    };
  }

  public async refreshMutationProviders(resolutions: readonly MountResolution[]): Promise<void> {
    const providers = new Set(resolutions.map(({ provider }) => provider));
    /* Not cache hygiene: this runs *before* the write, inside the mutation lock,
     * so a peer tab's committed write is part of what admits ours (the EISDIR and
     * EEXIST rows in `workspace-file-service-cross-tab.test.ts`). Every provider
     * that implements `refresh` is one whose projections another writer of the
     * same bytes can stale, so there is nobody here to skip. The cost — DirectIDB
     * re-reads its whole key index — is a case for refreshing the mutation's own
     * key range, which needs its own pin. */
    await Promise.all([...providers].map(async (provider) => provider.refresh?.()));
  }

  public async rmdirRecursive(provider: FileSystemProvider, directoryPath: string): Promise<void> {
    const entries = await readDirectoryEntries(provider, directoryPath);
    for (const entry of entries) {
      const fullPath = joinRelativePath(directoryPath, entry.name);
      // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive deletion
      await (entry.kind === 'dir' ? this.rmdirRecursive(provider, fullPath) : provider.unlink(fullPath));
    }
    await provider.rmdir(directoryPath);
  }

  /**
   * Remove either a file or a directory recursively from `provider`. Used to
   * clear a successfully copied cross-provider move source and to remove
   * project-directory contents while preserving the manifest until last.
   *
   * @param provider - Provider that owns the path being removed.
   * @param path     - Provider-relative absolute path.
   */
  public async removeRecursive(provider: FileSystemProvider, path: string): Promise<void> {
    const targetStat = await provider.stat(path);
    // oxlint-disable-next-line unicorn/prefer-ternary -- explicit if/else preserves the dir-vs-file branch order so call sites can reason about the recursive walk symmetrically.
    if (targetStat.type === 'dir') {
      await this.rmdirRecursive(provider, path);
    } else {
      await provider.unlink(path);
    }
  }

  /**
   * Walk a directory into its files and directories, keyed relative to it.
   *
   * @param provider - Provider to enumerate and read through.
   * @param path     - Provider-relative directory path.
   * @returns File bytes keyed by relative path, and the relative directories walked.
   */
  public async directoryContents(
    provider: {
      readdir(path: string): Promise<string[]>;
      stat(path: string): Promise<FileStat>;
      readdirEntries?(path: string): Promise<DirectoryEntry[]>;
      readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    },
    path: string,
    options?: Pick<WalkOptions, 'admits'>,
  ): Promise<{
    files: Record<string, Uint8Array<ArrayBuffer>>;
    directories: string[];
  }> {
    const files: Record<string, Uint8Array<ArrayBuffer>> = {};
    const directories: string[] = [];

    const collect = async (currentPath: string, basePath: string): Promise<void> => {
      const entries = await readDirectoryEntries(provider, currentPath);
      for (const entry of entries) {
        const fullPath = joinRelativePath(currentPath, entry.name);
        const relativePath = basePath === '' ? fullPath : fullPath.slice(basePath.length + 1);
        if (options?.admits?.(relativePath, entry.kind) === false) {
          continue;
        }
        if (entry.kind === 'file') {
          // oxlint-disable-next-line no-await-in-loop -- Sequential reads required for recursive collection
          files[relativePath] = await provider.readFile(fullPath);
        } else {
          directories.push(relativePath);
          // oxlint-disable-next-line no-await-in-loop -- Sequential traversal required for recursive collection
          await collect(fullPath, basePath);
        }
      }
    };

    await collect(path, path);
    return { files, directories };
  }

  private _notifyMoveParents(options: {
    source: string;
    target: string;
    sourceResolution: MountResolution;
    targetResolution: MountResolution;
  }): void {
    const { source, target, sourceResolution, targetResolution } = options;
    const notifications = [
      { path: parentDirectory(source), authority: this.physicalAuthority(sourceResolution) },
      { path: parentDirectory(target), authority: this.physicalAuthority(targetResolution) },
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

  private async _appendFileUnlocked({
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
    const { provider, path: resolvedPath, backend } = resolution;
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    if (provider.appendFile === undefined) {
      let existing: Uint8Array<ArrayBuffer>;
      try {
        existing = await provider.readFile(resolvedPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        existing = new Uint8Array();
      }
      const combined = new Uint8Array(existing.byteLength + bytes.byteLength);
      combined.set(existing);
      combined.set(bytes, existing.byteLength);
      await provider.writeFile(resolvedPath, combined);
    } else {
      await provider.appendFile(resolvedPath, bytes);
    }

    if (this.isCurrentResolution(path, resolution)) {
      this._filePool()?.invalidate(path);
      this._treeIndexes.removeFile(path);
    }
    if (resolution.entry !== undefined) {
      this.emitChangeEvent({ type: 'fileWritten', path, backend }, context, { operations: [{ path, resolution }] });
    }
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
    if (this.isCurrentResolution(path, resolution)) {
      this._filePool()?.invalidate(path);
      this._treeIndexes.addFile(path, {
        size: bytes.byteLength,
        ...getFileContentMetadata(bytes),
      });
    }
    if (resolution.entry !== undefined) {
      this.emitChangeEvent(
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
    const route = parseRoute(logicalPath);
    if (route.kind === 'project' && route.id !== undefined) {
      return route.id;
    }
    const storageRootKey = resolution.entry?.storageRootKey;
    if (storageRootKey === undefined) {
      return undefined;
    }
    const physicalPath = assertRootedPath(resolution.path);
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
      if (mount.kind === 'project' && mount.routeId !== undefined) {
        return mount.routeId;
      }
    }
    return undefined;
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

  private _handlePartialMutationFailure(
    path: string,
    resolution: MountResolution,
    context?: WorkspaceMutationContext,
  ): void {
    // oxlint-disable-next-line capitalized-comments -- Ponytail debt markers intentionally use the lowercase `ponytail:` tag.
    // ponytail: the pool takes a full drop, not the path-scoped one `writeFiles`
    // uses. Both callers are half-finished *recursive* directory mutations, so
    // everything under `path` is untrustworthy and SharedPool cannot drop a
    // subtree. Scope it once SharedPool grows a prefix invalidation.
    this._filePool()?.clear();
    this._treeIndexes.evict(path);
    const logicalRoot = resolution.entry?.prefix ?? path;
    const rootResolution =
      resolution.entry === undefined ? resolution : { ...resolution, path: resolution.entry.providerBasePath };
    this.emitChangeEvent({ type: 'backendChanged', backend: resolution.backend }, context, {
      operations: [{ path: logicalRoot, resolution: rootResolution }],
    });
    if (resolution.entry !== undefined) {
      this._crossTabCoordinator.notifyDirectoryChange(logicalRoot, this.physicalAuthority(resolution));
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
      const sourceEntry = joinRelativePath(sourcePath, entry.name);
      const targetEntry = joinRelativePath(targetPath, entry.name);
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
}
