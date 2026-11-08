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
 * inside them, mutate, then record the completion — per-root
 * Project Index, one summary change event, cross-tab notification — or, on a
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

import type {
  CheckedFileWriteResult,
  CheckedWritePrecondition,
  FileDigestPrecondition,
  FileStat,
  FileSystemBackend,
} from '@taucad/types';
import { sha256Bytes } from '@taucad/utils/hash';
import { isDigestPrecondition } from '#checked-write-precondition.js';
import {
  assertRootedPath,
  joinPath,
  joinRelativePath,
  normalizePath,
  parentDirectory,
  resolveAuthorityPath,
} from '@taucad/utils/path';
import type {
  ChangeEvent,
  ChangeSetEvent,
  DirectoryEntry,
  FileSystemProvider,
  MkdirOptions,
  PathChangeEvent,
  WorkspaceMutationContext,
} from '#types.js';
import type { MountResolution, MountTable } from '#mount-table.js';
import type { ChangeEventBus } from '#change-event-bus.js';
import type { ResourceQueue, ResourceQueueClaim } from '#resource-queue.js';
import type { ChangeNotification, CrossTabCoordinator, LockClaim, PhysicalAuthority } from '#cross-tab-coordinator.js';
import { normalizeLockClaims } from '#cross-tab-coordinator.js';
import type { ProjectIndexes } from '#project-index/project-indexes.js';
import type { WalkOptions } from '#content-ops/walk.js';
import { MissingWorkspaceHandleError, WorkspaceMutationError } from '#workspace-errors.js';
import { getFileContentMetadata } from '#content-metadata.js';
import { readDirectoryEntries } from '#backend/directory-entries.js';
import { tagEventAuthorities, tagEventOrigin } from '#event-origin-registry.js';
import { parseRoute } from '#project-routes.js';
import { applyBatchWithPrimitives, mapRolling } from '#backend/batch.js';
import type {
  AppendFence,
  BatchEntry,
  BatchReceipt,
  ChangesetEntry,
  ChangesetEntryReceipt,
  ChangesetReceipt,
} from '#changeset.js';
import {
  changesetReceipt,
  inHandBytes,
  isBoundedChangeset,
  maximumChangesetBytes,
  maximumChangesetEntries,
  splitChangeset,
} from '#changeset.js';
import { PhaseAdmission } from '#changeset-admission.js';
import {
  assertBoundedChangeset,
  isStreamData,
  occupancyOf as batchOccupancy,
  toBatchEntry,
} from '#changeset-provider.js';
import type { Occupancy } from '#changeset-admission.js';
import { workerTimings } from '#worker-timings.js';

const maximumCheckedWritePreconditions = 32;
const maximumCheckedWriteBytes = 8 * 1024 * 1024;

const asBytes = (value: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);

/**
 * One changeset entry, spelled in logical paths, with the mounts its paths
 * resolved to: `resolution` for `path` (a move's `from`), `targetResolution`
 * for a move's `to`.
 *
 * @public
 */
export type ResolvedChangesetEntry = Readonly<{
  entry: ChangesetEntry;
  resolution: MountResolution;
  targetResolution?: MountResolution;
}>;

/** A changeset whose entries are resolved. @public */
export type ResolvedChangeset = Readonly<{
  entries: readonly ResolvedChangesetEntry[];
  lifecycle?: boolean;
  signal?: AbortSignal;
}>;

/** One admitted entry: its logical paths, its resolutions and its provider batch entry. */
type PreparedEntry = Readonly<{
  entry: ChangesetEntry;
  phase: number;
  path: string;
  target?: string;
  resolution: MountResolution;
  targetResolution?: MountResolution;
  batch: BatchEntry;
  /** The bytes a write or append carries, when they are in hand. */
  bytes?: Uint8Array<ArrayBuffer>;
}>;

/** One change event and the resolved paths that attribute it. @public */
export type AttributedChangeEvent = Readonly<{
  event: PathChangeEvent;
  operations: ReadonlyArray<{ path: string; resolution: MountResolution }>;
  globallyVisible?: boolean;
}>;

/** Per-provider identity, so admission and batching never confuse two providers' identical paths. */
const providerSpaces = new WeakMap<FileSystemProvider, string>();
let nextProviderSpace = 0;
const providerSpace = (provider: FileSystemProvider): string => {
  let space = providerSpaces.get(provider);
  if (space === undefined) {
    nextProviderSpace += 1;
    space = String(nextProviderSpace);
    providerSpaces.set(provider, space);
  }
  return space;
};

const errnoError = (code: string, message: string): Error => Object.assign(new Error(`${code}: ${message}`), { code });

const abortError = (signal: AbortSignal | undefined): unknown =>
  signal?.reason ?? new DOMException('The operation was aborted.', 'AbortError');

const toQueueClaims = (claims: readonly LockClaim[]): ResourceQueueClaim[] =>
  claims.map(({ token, shared }) => (shared === true ? { key: token, shared } : { key: token }));

/**
 * The footprint one prepared entry leaves on its provider paths.
 *
 * @param prepared - The entry.
 * @returns Its occupancies.
 */
const occupancyOf = (prepared: Pick<PreparedEntry, 'batch' | 'resolution' | 'targetResolution'>): Occupancy[] =>
  batchOccupancy(
    prepared.batch,
    providerSpace(prepared.resolution.provider),
    providerSpace((prepared.targetResolution ?? prepared.resolution).provider),
  );

const bytesEqual = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);

/** One checked-write precondition as the pipeline holds it: owned bytes or absence, or a digest. */
type OwnedPrecondition = Readonly<{
  path: string;
  resolution: MountResolution;
  // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
  expected?: Uint8Array<ArrayBuffer> | null;
  sha256?: string;
}>;

/** One path a checked write found changed, as its result reports it. */
type CheckedWriteConflict = Extract<CheckedFileWriteResult, { status: 'conflict' }>['conflicts'][number];

const sha256Pattern = /^[\da-f]{64}$/u;

const ownedDigest = (precondition: FileDigestPrecondition): string => {
  if (!sha256Pattern.test(precondition.expectedSha256)) {
    throw new TypeError(`Checked write digest for '${precondition.path}' is not a lowercase SHA-256.`);
  }
  return precondition.expectedSha256;
};

/** Whether two preconditions on one physical path expect the same thing; a digest and bytes never agree. */
const sameExpectation = (left: OwnedPrecondition, right: OwnedPrecondition): boolean => {
  if (left.sha256 !== undefined || right.sha256 !== undefined) {
    return left.sha256 === right.sha256;
  }
  return left.expected === null || left.expected === undefined
    ? right.expected === null || right.expected === undefined
    : right.expected !== null && right.expected !== undefined && bytesEqual(left.expected, right.expected);
};

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

type ResolvedMoveEdit = {
  readonly edit: BulkMoveEdit;
  readonly source: string;
  readonly target: string;
  readonly sourceResolution: MountResolution;
  readonly targetResolution: MountResolution;
};

export { causeToMutationError, isProjectDirectoryPath };

/** Convenience entries one origin is coalescing into one changeset (D22). */
type PendingChangeset = {
  entries: ResolvedChangesetEntry[];
  admission: PhaseAdmission;
  /** Close the changeset to new entries and start it. */
  open: () => void;
  /** The changeset's receipt once it applied. */
  receipt: Promise<ChangesetReceipt>;
};

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
  private readonly _projectIndexes: ProjectIndexes;
  /** Convenience entries this task is coalescing into one changeset, per origin (D22). */
  private readonly _pending = new Map<string, PendingChangeset>();
  /**
   * The highest fencing token applied per record-log path (D23); a lower one is a stale writer.
   *
   * Limits: the map lives in this authority's memory only. It is not
   * persisted, so a restarted authority (a reload, a new worker) forgets every
   * token and accepts the first token it sees per path again; it is not shared
   * between authorities, so two tabs each with their own authority do not see
   * each other's tokens. Across both, the expected-length check still refuses
   * an append that would interleave, since it stats the file's current size
   * (metadata only, I3). Entries are never evicted: one number per log path
   * fenced in this authority's lifetime, which is one per chat segment opened,
   * not per append.
   */
  private readonly _appendFences = new Map<string, number>();

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
    projectIndexes: ProjectIndexes;
  }) {
    this._mountTable = options.mountTable;
    this._resourceQueue = options.resourceQueue;
    this._eventBus = options.eventBus;
    this._crossTabCoordinator = options.crossTabCoordinator;
    this._projectIndexes = options.projectIndexes;
  }

  /**
   * Apply one changeset: the one mutation primitive (charter D2, D3, I1, I4).
   *
   * Every entry is admitted before the first I/O; streamed bytes are staged
   * before any lock is requested; one lock set covers every path (ancestors
   * shared, written paths exclusive, the project token exclusive only for a
   * lifecycle changeset); each phase goes to its providers' batches, a later
   * phase only after every entry of the earlier one applied; every entry's
   * outcome is reported; and the whole changeset publishes one change event and
   * one cross-tab notice.
   *
   * @param changeset - Resolved entries, the lifecycle fence and an abort signal.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns Every entry's outcome.
   */
  public async apply(changeset: ResolvedChangeset, context?: WorkspaceMutationContext): Promise<ChangesetReceipt> {
    const { entries, signal } = changeset;
    if (entries.length === 0) {
      return changesetReceipt([]);
    }
    assertBoundedChangeset(entries.map(({ entry }) => entry));
    signal?.throwIfAborted();
    const staged = entries.some(({ entry }) => entry.op === 'write' && isStreamData(entry.data))
      ? await this._stageStreams(entries)
      : entries;
    const prepared = this._admit(staged);
    const claims = this.lockClaims(
      prepared.flatMap(({ path, target, resolution, targetResolution }) => [
        { path, resolution },
        ...(target === undefined ? [] : [{ path: target, resolution: targetResolution ?? resolution }]),
      ]),
      { lifecycle: changeset.lifecycle === true },
    );
    return this._withClaims(claims, async () => this._applyLocked(prepared, signal, context));
  }

  /**
   * Queue one convenience entry into the changeset its caller's task is
   * building (D22): entries issued in one task coalesce into one changeset,
   * flushed on the next microtask, when the bound is reached, or when an entry
   * would race one already pending.
   *
   * @param resolved - The entry and its resolutions.
   * @param context - Optional mutation source metadata; entries coalesce only with the same origin.
   * @returns The entry's receipt and the provider's own receipt for it.
   */
  public async enqueue(
    resolved: ResolvedChangesetEntry,
    context?: WorkspaceMutationContext,
  ): Promise<ChangesetEntryReceipt> {
    const origin = context?.originClientId ?? '';
    let prepared: PreparedEntry;
    try {
      /* A refusal of this entry alone is its own receipt: it never joins, and so
       * never fails, the changeset its neighbours coalesce into. */
      prepared = this._prepare(resolved);
      this._assertEntryAdmissible(prepared);
    } catch (error) {
      return { index: 0, outcome: 'failed', error };
    }
    const occupancy = occupancyOf(prepared);
    let pending = this._pending.get(origin);
    if (
      pending !== undefined &&
      (pending.admission.conflict(occupancy) !== undefined ||
        !isBoundedChangeset([...pending.entries.map(({ entry }) => entry), resolved.entry]))
    ) {
      this._flush(origin);
      pending = undefined;
    }
    if (pending === undefined) {
      const opened = Promise.withResolvers<void>();
      const entries: ResolvedChangesetEntry[] = [];
      pending = {
        entries,
        admission: new PhaseAdmission(),
        open: opened.resolve,
        receipt: this._applyWhenOpened(entries, opened.promise, context),
      };
      this._pending.set(origin, pending);
      const scheduled = pending;
      queueMicrotask(() => {
        if (this._pending.get(origin) === scheduled) {
          this._flush(origin);
        }
      });
    }
    pending.admission.admit(occupancy);
    const index = pending.entries.push(resolved) - 1;
    const receipt = await pending.receipt;
    return receipt.entries[index]!;
  }

  /**
   * Run one provider batch outside the pipeline's locks, in bounded chunks —
   * for a caller that already holds a lifecycle fence over the whole subtree
   * and publishes its own invalidation (a pending project commit).
   *
   * A chunk with an entry that did not apply ends the run: its callers treat
   * any failure as the whole operation's, so the entries after it are
   * answered `failed`, never attempted, rather than written into an operation already lost.
   *
   * @param provider - The provider.
   * @param entries - Entries in provider paths, in order; each chunk is one batch.
   * @returns One receipt per entry.
   */
  public async applyUnlocked(provider: FileSystemProvider, entries: readonly BatchEntry[]): Promise<BatchReceipt[]> {
    const receipts: BatchReceipt[] = [];
    let start = 0;
    while (start < entries.length) {
      let end = start + 1;
      let bytes = inHandBytes(entries[start]!);
      while (
        end < entries.length &&
        end - start < maximumChangesetEntries &&
        bytes + inHandBytes(entries[end]!) <= maximumChangesetBytes
      ) {
        bytes += inHandBytes(entries[end]!);
        end += 1;
      }
      const chunk = entries.slice(start, end);
      // oxlint-disable-next-line no-await-in-loop -- each bounded chunk is one batch, in order.
      const chunkReceipts = await (provider.applyBatch?.(chunk) ?? applyBatchWithPrimitives(provider, chunk));
      receipts.push(...chunkReceipts);
      start = end;
      if (chunkReceipts.some(({ outcome }) => outcome !== 'applied')) {
        break;
      }
    }
    const notAttempted = new Error('Not attempted: an earlier batch of this run did not apply.');
    for (let index = start; index < entries.length; index += 1) {
      receipts.push({ outcome: 'failed', error: notAttempted });
    }
    return receipts;
  }

  /**
   * Move many paths and report every completed and failed edit. Independent
   * edits share one changeset; an edit that depends on an earlier one (its
   * source is an earlier target) starts the next. Completed edits are never
   * rolled back over newer peer data.
   *
   * @param edits - Resolved source → target pairs.
   * @param context - Optional mutation source metadata for change-bus subscribers.
   * @returns The {@link BulkMoveResult} describing successes + the failures.
   */
  public async bulkMove(
    edits: readonly ResolvedMoveEdit[],
    context?: WorkspaceMutationContext,
  ): Promise<BulkMoveResult> {
    const moved: Array<{ edit: BulkMoveEdit; stat: FileStat }> = [];
    const failed: Array<{ edit: BulkMoveEdit; error: WorkspaceMutationError }> = [];
    const chunks: ResolvedMoveEdit[][] = [];
    let current: ResolvedMoveEdit[] = [];
    let admission = new PhaseAdmission();
    for (const edit of edits) {
      const occupancy = occupancyOf({
        resolution: edit.sourceResolution,
        targetResolution: edit.targetResolution,
        batch: { op: 'move', from: edit.sourceResolution.path, to: edit.targetResolution.path },
      });
      if (current.length >= maximumChangesetEntries || admission.conflict(occupancy) !== undefined) {
        chunks.push(current);
        current = [];
        admission = new PhaseAdmission();
      }
      admission.admit(occupancy);
      current.push(edit);
    }
    if (current.length > 0) {
      chunks.push(current);
    }
    for (const chunk of chunks) {
      let receipt: ChangesetReceipt;
      try {
        // oxlint-disable-next-line no-await-in-loop -- a dependent edit's chunk follows the one it depends on.
        receipt = await this.apply(
          {
            entries: chunk.map(({ source, target, sourceResolution, targetResolution }) => ({
              entry: { op: 'move', from: source, to: target },
              resolution: sourceResolution,
              targetResolution,
            })),
          },
          context,
        );
      } catch (error) {
        failed.push(
          ...chunk.map(({ edit }) => ({ edit, error: causeToMutationError(error, edit.source, edit.target) })),
        );
        continue;
      }
      const applied = chunk.filter((_, index) => receipt.entries[index]!.outcome === 'applied');
      for (const [index, { edit }] of chunk.entries()) {
        const entry = receipt.entries[index]!;
        if (entry.outcome !== 'applied') {
          failed.push({ edit, error: causeToMutationError(entry.error, edit.source, edit.target) });
        }
      }
      // oxlint-disable-next-line no-await-in-loop -- each chunk's stats follow its own apply.
      const stats = await mapRolling(applied, 8, async ({ targetResolution }) =>
        targetResolution.provider.stat(targetResolution.path).then(
          (stat) => stat,
          () => undefined,
        ),
      );
      for (const [index, { edit }] of applied.entries()) {
        const stat = stats[index];
        if (stat === undefined) {
          failed.push({
            edit,
            error: causeToMutationError(
              errnoError('ENOENT', `moved target vanished '${edit.target}'`),
              edit.source,
              edit.target,
            ),
          });
        } else {
          moved.push({ edit, stat });
        }
      }
    }
    return { moved, failed };
  }

  /**
   * Recursively copy one resolved subtree onto another: the source is read
   * once, then the copy lands as bounded changesets — one lock set and one
   * change event each — followed by one `directoryCopied` summary (Rule 5a).
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
    /** Stops the copy before its next bounded changeset; one already applying settles. */
    signal?: AbortSignal;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    const { source, target: destination, sourceResolution, targetResolution, admits, signal, context } = operands;
    signal?.throwIfAborted();
    this._assertNoDescendantMounts(source, 'copy');
    this._assertNoDescendantMounts(destination, 'copy');
    const snapshot = await this._withClaims(
      this.lockClaims([{ path: source, resolution: sourceResolution }]),
      async () => {
        await this._refreshScoped([sourceResolution]);
        return this.directoryContents(sourceResolution.provider, sourceResolution.path, { admits });
      },
    );
    const at = (relativePath: string): { path: string; resolution: MountResolution } => ({
      path: relativePath === '' ? destination : joinPath(destination, relativePath),
      resolution: {
        ...targetResolution,
        path: relativePath === '' ? targetResolution.path : joinRelativePath(targetResolution.path, relativePath),
      },
    });
    const entries: ResolvedChangesetEntry[] = [
      ...['', ...snapshot.directories].map((relativePath) => {
        const { path, resolution } = at(relativePath);
        return { entry: { op: 'mkdir', path, recursive: true } as const, resolution };
      }),
      ...Object.entries(snapshot.files).map(([relativePath, data]) => {
        const { path, resolution } = at(relativePath);
        return { entry: { op: 'write', path, data } as const, resolution };
      }),
    ];
    const byEntry = new Map(entries.map((resolved) => [resolved.entry, resolved]));
    for (const changeset of splitChangeset(entries.map(({ entry }) => entry))) {
      // oxlint-disable-next-line no-await-in-loop -- bounded changesets land in order.
      const receipt = await this.apply({ entries: changeset.map((entry) => byEntry.get(entry)!), signal }, context);
      const failure = receipt.entries.find(({ outcome }) => outcome !== 'applied');
      if (failure !== undefined) {
        throw failure.error instanceof Error ? failure.error : errnoError('EIO', `copy to '${destination}' failed`);
      }
    }
    this.emitChangeEvent(
      { type: 'directoryCopied', sourcePath: source, targetPath: destination, backend: targetResolution.backend },
      context,
      { operations: [{ path: destination, resolution: targetResolution }] },
    );
  }

  /**
   * Write many already-resolved files as bounded changesets: every write
   * settles, the rejected paths alone lose their derivatives, and the first
   * failure is rethrown (Rule 5a).
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
    const entries: ResolvedChangesetEntry[] = ownedFiles.map(({ path, resolution, content }) => ({
      entry: { op: 'write', path, data: content },
      resolution,
    }));
    const byEntry = new Map(entries.map((resolved) => [resolved.entry, resolved]));
    let firstFailure: unknown;
    let failed = false;
    for (const changeset of splitChangeset(entries.map(({ entry }) => entry))) {
      // oxlint-disable-next-line no-await-in-loop -- bounded changesets land in order.
      const receipt = await this.apply({ entries: changeset.map((entry) => byEntry.get(entry)!) }, context);
      const failure = receipt.entries.find(({ outcome }) => outcome !== 'applied');
      if (failure !== undefined && !failed) {
        failed = true;
        firstFailure = failure.error;
      }
    }
    if (failed) {
      if (firstFailure instanceof Error) {
        throw firstFailure;
      }
      throw new Error('Batch write failed with a non-Error rejection.', { cause: firstFailure });
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
    this._tagEvent(event, context, attribution);
    this._eventBus.emit(event);
  }

  /**
   * Publish one changeset's facts as one bus event (I4): a single fact as
   * itself, more as one `changeSet` envelope in entry order. Each fact carries
   * its own origin and authority tags, so a subscriber that expands the
   * envelope filters every fact as it would have filtered it alone.
   *
   * @param events - The facts and the resolved paths that attribute each.
   * @param context - Optional mutation source metadata.
   */
  public emitChangeEvents(events: readonly AttributedChangeEvent[], context?: WorkspaceMutationContext): void {
    const [only] = events;
    if (only === undefined) {
      return;
    }
    if (events.length === 1) {
      this.emitChangeEvent(
        only.event,
        context,
        only.operations.length === 0
          ? undefined
          : {
              operations: only.operations,
              ...(only.globallyVisible === undefined ? {} : { globallyVisible: only.globallyVisible }),
            },
      );
      return;
    }
    const authorities = new Set<WeakKey>();
    let globallyVisible = false;
    for (const { event, operations, globallyVisible: visible } of events) {
      this._tagEvent(
        event,
        context,
        operations.length === 0
          ? undefined
          : { operations, ...(visible === undefined ? {} : { globallyVisible: visible }) },
      );
      for (const { resolution } of operations) {
        if (resolution.entry !== undefined) {
          authorities.add(resolution.entry);
        }
      }
      globallyVisible ||=
        visible ?? operations.every(({ path, resolution }) => this.isCurrentResolution(path, resolution));
    }
    const envelope: ChangeSetEvent = { type: 'changeSet', entries: events.map(({ event }) => event) };
    if (context?.originClientId !== undefined) {
      tagEventOrigin(envelope, context.originClientId);
    }
    if (authorities.size > 0) {
      tagEventAuthorities(envelope, [...authorities], globallyVisible);
    }
    this._eventBus.emit(envelope);
  }

  /**
   * Publish the files a storage root removed as it opened — the empty files of
   * creates a crashed realm left (I1) — as one ordinary change: a
   * `fileDeleted` per path a mount routes, one bus event and one cross-tab
   * notice. A path no mount routes yet makes the root's projections reset
   * instead, with one `backendChanged` and a root-wide notice.
   *
   * @param storageRootKey - The root that recovered.
   * @param backend - Its backend, named by a reset when no mount routes a path.
   * @param providerPaths - The provider paths it removed.
   */
  public publishRecoveredRemovals(
    storageRootKey: string,
    backend: FileSystemBackend,
    providerPaths: readonly string[],
  ): void {
    const events: AttributedChangeEvent[] = [];
    const notices: ChangeNotification[] = [];
    let unrouted = false;
    for (const providerPath of providerPaths) {
      const path = this._logicalPathFor(storageRootKey, providerPath);
      if (path === undefined) {
        unrouted = true;
        continue;
      }
      const resolution = this._mountTable.resolve(path);
      this._projectIndexes.removeFile(path);
      events.push({
        event: { type: 'fileDeleted', path, backend: resolution.backend },
        operations: [{ path, resolution }],
      });
      notices.push({ type: 'delete', path, authority: this.physicalAuthority(resolution) });
    }
    if (unrouted) {
      this._projectIndexes.invalidate('/');
      events.push({ event: { type: 'backendChanged', backend }, operations: [] });
      notices.push({ type: 'directory-change', path: '/', authority: { storageRootKey, providerBasePath: '' } });
    }
    this.emitChangeEvents(events);
    this._crossTabCoordinator.notifyChanges(notices);
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
    await this._settle(this.enqueue({ entry: { op: 'write', path, data }, resolution }, context));
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
    preconditions: ReadonlyArray<CheckedWritePrecondition & { resolution: MountResolution }>;
    signal?: AbortSignal;
    context?: WorkspaceMutationContext;
  }): Promise<CheckedFileWriteResult> {
    if (preconditions.length === 0 || preconditions.length > maximumCheckedWritePreconditions) {
      throw new TypeError(`Checked writes require 1-${String(maximumCheckedWritePreconditions)} preconditions.`);
    }
    const ownedData = asBytes(data);
    const ownedPreconditions = preconditions.map(
      (precondition): OwnedPrecondition =>
        isDigestPrecondition(precondition)
          ? { path: precondition.path, resolution: precondition.resolution, sha256: ownedDigest(precondition) }
          : {
              path: precondition.path,
              resolution: precondition.resolution,
              expected: precondition.expected === null ? null : asBytes(precondition.expected),
            },
    );
    const digested = ownedPreconditions.some((precondition) => precondition.sha256 !== undefined);
    const expectedBytes = ownedPreconditions.reduce(
      (total, precondition) => total + (precondition.expected?.byteLength ?? 0),
      0,
    );
    /* A byte precondition carries the file it expects, so the request is bounded; a digest
     * carries 64 characters, and the authority reads the bytes it names under the locks (D17). */
    if (expectedBytes + (digested ? 0 : ownedData.byteLength) > maximumCheckedWriteBytes) {
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
    const physical = new Map<string, OwnedPrecondition>();
    for (const precondition of ownedPreconditions) {
      const previous = physical.get(precondition.resolution.path);
      if (previous === undefined) {
        physical.set(precondition.resolution.path, precondition);
      } else if (!sameExpectation(previous, precondition)) {
        throw new TypeError(`Checked write aliases disagree for '${precondition.path}'.`);
      }
    }
    if (!physical.has(resolution.path)) {
      throw new TypeError('Checked writes require a destination precondition.');
    }
    const throwIfAborted = (): void => {
      if (signal?.aborted) {
        throw checkedWriteFailure(
          'known-not-applied',
          signal.reason instanceof Error ? signal.reason : new DOMException('The operation was aborted.', 'AbortError'),
        );
      }
    };
    throwIfAborted();

    const operations = [
      { path, resolution },
      ...ownedPreconditions.map(({ path, resolution }) => ({ path, resolution })),
    ];
    const locks = this.lockClaims(operations);
    const digestOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<string | undefined> =>
      digested ? sha256Bytes(bytes) : undefined;
    const withDigest = async (
      status: 'applied' | 'unchanged',
      content: Uint8Array<ArrayBuffer>,
    ): Promise<CheckedFileWriteResult> => {
      const sha256 = await digestOf(content);
      return sha256 === undefined ? { status, content } : { status, content, sha256 };
    };
    const run = async (): Promise<CheckedFileWriteResult> =>
      this._resourceQueue.queueForClaims(toQueueClaims(locks), async () => {
        await this._refreshScoped(operations.map(({ resolution }) => resolution));
        throwIfAborted();
        /* Each digest is checked here, under the locks, from one read of the file it names:
         * the bytes it resolves to are what a provider's own check then compares (D17). */
        // oxlint-disable-next-line typescript/no-restricted-types -- `null` is the public checked-write absence sentinel.
        const resolved = new Map<string, Uint8Array<ArrayBuffer> | null>();
        const digestConflicts: CheckedWriteConflict[] = [];
        for (const [physicalPath, precondition] of physical) {
          if (precondition.sha256 === undefined) {
            resolved.set(physicalPath, precondition.expected ?? null);
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- at most 32 preconditions, each one read under the locks.
          const actual = await readFileOrAbsent(precondition.resolution.provider, physicalPath);
          // oxlint-disable-next-line no-await-in-loop -- the digest of the read just taken.
          const actualSha256 = actual === null ? undefined : await sha256Bytes(actual);
          if (actualSha256 === precondition.sha256) {
            resolved.set(physicalPath, actual);
          } else {
            digestConflicts.push({
              path: precondition.path,
              actual,
              ...(actualSha256 === undefined ? {} : { sha256: actualSha256 }),
            });
          }
        }
        if (digestConflicts.length > 0) {
          return { status: 'conflict', conflicts: digestConflicts };
        }
        const resolvedBytes = [...resolved.values()].reduce((total, bytes) => total + (bytes?.byteLength ?? 0), 0);
        if (
          resolution.provider.writeFileChecked !== undefined &&
          resolvedBytes + ownedData.byteLength <= maximumCheckedWriteBytes
        ) {
          let result: CheckedFileWriteResult;
          try {
            result = await resolution.provider.writeFileChecked({
              path: resolution.path,
              data: ownedData,
              preconditions: [...resolved].map(([preconditionPath, expected]) => ({
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
          if (result.status === 'conflict') {
            return {
              status: 'conflict',
              conflicts: result.conflicts.map((conflict) => ({
                ...conflict,
                path: physical.get(conflict.path)?.path ?? conflict.path,
              })),
            };
          }
          return withDigest(result.status, result.content);
        }
        /* No provider check, or one past the provider's own byte bound: compare here, under
         * the same locks. A digest was compared above from a read taken under them. */
        const compared = await Promise.all(
          [...physical].map(async ([physicalPath, precondition]) => {
            if (precondition.sha256 !== undefined) {
              return undefined;
            }
            const actual = await readFileOrAbsent(precondition.resolution.provider, physicalPath);
            const matches =
              actual === null
                ? precondition.expected === null
                : precondition.expected !== null && bytesEqual(actual, precondition.expected!);
            return matches ? undefined : { path: precondition.path, actual };
          }),
        );
        const conflicts = compared.filter((conflict) => conflict !== undefined);
        if (conflicts.length > 0) {
          return { status: 'conflict', conflicts };
        }
        // The destination is always a precondition and every precondition matched, so it holds the expected bytes.
        const current = resolved.get(resolution.path) ?? null;
        if (current !== null && bytesEqual(current, ownedData)) {
          return withDigest('unchanged', current);
        }
        throwIfAborted();
        try {
          await resolution.provider.writeFile(resolution.path, ownedData);
          this._recordCompletedWrite({ path, resolution, bytes: ownedData, context });
        } catch (error) {
          throw checkedWriteFailure('potentially-applied', error);
        }
        return withDigest('applied', ownedData);
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

  /** Delete under the same multi-path authority fence as a checked write. */
  public async deleteFileCheckedResolved({
    path,
    resolution,
    preconditions,
    signal,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    preconditions: ReadonlyArray<{
      path: string;
      // oxlint-disable-next-line typescript/no-restricted-types -- absence is the checked-write sentinel.
      expected: Uint8Array<ArrayBuffer> | string | null;
      resolution: MountResolution;
    }>;
    signal?: AbortSignal;
    context?: WorkspaceMutationContext;
  }): Promise<CheckedFileWriteResult> {
    if (preconditions.length === 0 || preconditions.length > maximumCheckedWritePreconditions) {
      throw new TypeError(`Checked deletes require 1-${String(maximumCheckedWritePreconditions)} preconditions.`);
    }
    const ownedPreconditions = preconditions.map((precondition) => ({
      ...precondition,
      expected: precondition.expected === null ? null : asBytes(precondition.expected),
    }));
    if (
      ownedPreconditions.reduce((total, precondition) => total + (precondition.expected?.byteLength ?? 0), 0) >
      maximumCheckedWriteBytes
    ) {
      throw new TypeError(`Checked delete request exceeds ${String(maximumCheckedWriteBytes)} bytes.`);
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
      throw new TypeError('Checked delete paths must share one admitted physical authority.');
    }
    // oxlint-disable-next-line typescript/no-restricted-types -- absence is the checked-write sentinel.
    const physical = new Map<string, Uint8Array<ArrayBuffer> | null>();
    const logicalByPhysical = new Map<string, string>();
    for (const precondition of ownedPreconditions) {
      const previous = physical.get(precondition.resolution.path);
      if (physical.has(precondition.resolution.path)) {
        if (
          previous === null
            ? precondition.expected !== null
            : precondition.expected === null || !bytesEqual(previous!, precondition.expected)
        ) {
          throw new TypeError(`Checked delete aliases disagree for '${precondition.path}'.`);
        }
      } else {
        physical.set(precondition.resolution.path, precondition.expected);
        logicalByPhysical.set(precondition.resolution.path, precondition.path);
      }
    }
    if (!physical.has(resolution.path)) {
      throw new TypeError('Checked deletes require a destination precondition.');
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
    const locks = this.lockClaims(operations);
    const run = async (): Promise<CheckedFileWriteResult> =>
      this._resourceQueue.queueForClaims(toQueueClaims(locks), async () => {
        await this._refreshScoped(operations.map(({ resolution }) => resolution));
        if (signal?.aborted) {
          throw checkedWriteFailure(
            'known-not-applied',
            signal.reason instanceof Error
              ? signal.reason
              : new DOMException('The operation was aborted.', 'AbortError'),
          );
        }
        let result: CheckedFileWriteResult;
        const nativeDelete = resolution.provider.deleteFileChecked;
        if (nativeDelete) {
          try {
            result = await nativeDelete.call(resolution.provider, {
              path: resolution.path,
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
        } else {
          const compared = await Promise.all(
            ownedPreconditions.map(async (precondition) => {
              const actual = await readFileOrAbsent(precondition.resolution.provider, precondition.resolution.path);
              return actual === null
                ? precondition.expected === null
                  ? undefined
                  : { path: precondition.path, actual }
                : precondition.expected !== null && bytesEqual(actual, precondition.expected)
                  ? undefined
                  : { path: precondition.path, actual };
            }),
          );
          const conflicts = compared.filter((conflict) => conflict !== undefined);
          if (conflicts.length > 0) {
            return { status: 'conflict', conflicts };
          }
          if (physical.get(resolution.path) === null) {
            return { status: 'unchanged', content: new Uint8Array() };
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
            await resolution.provider.unlink(resolution.path);
          } catch (error) {
            throw checkedWriteFailure('potentially-applied', error);
          }
          result = { status: 'applied', content: new Uint8Array() };
        }
        if (result.status === 'applied') {
          if (this.isCurrentResolution(path, resolution)) {
            this._projectIndexes.removeFile(path);
          }
          this.emitChangeEvent({ type: 'fileDeleted', path, backend: resolution.backend }, context, { operations });
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
      });
    const result = await (resolution.provider.deleteFileChecked === undefined
      ? this._crossTabCoordinator.withRequiredLocks(locks, run)
      : this._crossTabCoordinator.withLocks(locks, run));
    if (result.status === 'applied') {
      this._crossTabCoordinator.notifyMutation({ type: 'delete', path, authority: this.physicalAuthority(resolution) });
    }
    return result;
  }

  public async appendFileResolved({
    path,
    resolution,
    data,
    fence,
    context,
  }: {
    path: string;
    resolution: MountResolution;
    data: Uint8Array<ArrayBuffer> | string;
    /** Refuse the append unless the file is still `expectedLength` bytes and `token` is current (D23). */
    fence?: AppendFence;
    context?: WorkspaceMutationContext;
  }): Promise<void> {
    await this._settle(
      this.enqueue(
        { entry: { op: 'append', path, data, ...(fence === undefined ? {} : { fence }) }, resolution },
        context,
      ),
    );
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
    await this._settle(
      this.enqueue(
        { entry: { op: 'move', from: source, to: target }, resolution: sourceResolution, targetResolution },
        context,
      ),
    );
    return targetResolution.provider.stat(targetResolution.path);
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
    await this._settle(
      this.enqueue(
        { entry: { op: 'mkdir', path, ...(options?.recursive === true ? { recursive: true } : {}) }, resolution },
        context,
      ),
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
    await this._settle(this.enqueue({ entry: { op: 'delete', path, kind: 'file' }, resolution }, context));
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
    await this._settle(
      this.enqueue(
        {
          entry: { op: 'delete', path, kind: 'dir', ...(options?.recursive === true ? { recursive: true } : {}) },
          resolution,
        },
        context,
      ),
    );
  }

  /**
   * The locks a mutation over `operations` holds (D3): for each path its
   * physical hierarchy up to its provider base path — the path exclusive,
   * every ancestor shared — and its logical hierarchy up to its mount prefix,
   * all shared (exclusive at the path only for a mount with no physical
   * identity), plus the owning project's token: shared, or exclusive for a
   * lifecycle changeset.
   *
   * @param operations - Every resolved path the mutation touches.
   * @param options - `lifecycle` takes the project token exclusively.
   * @returns The lock claims, one per token, exclusive winning.
   */
  public lockClaims(
    operations: ReadonlyArray<{ path: string; resolution: MountResolution }>,
    options?: Readonly<{ lifecycle?: boolean }>,
  ): LockClaim[] {
    const claims: LockClaim[] = [];
    const claim = (token: string, shared: boolean): void => {
      claims.push(shared ? { token, shared } : { token });
    };
    const addAuthorityHierarchy = (path: string, boundary: string, exactShared: boolean): void => {
      let current = resolveAuthorityPath(path);
      const root = resolveAuthorityPath(boundary);
      if (current !== root && !current.startsWith(`${root === '/' ? '' : root}/`)) {
        throw new Error(`Mutation path '${current}' is outside its authority root '${root}'.`);
      }
      let shared = exactShared;
      while (current !== '/') {
        claim(current, shared);
        shared = true;
        if (current === root) {
          return;
        }
        current = parentDirectory(current);
      }
    };
    const addRootedHierarchy = (path: string, boundary: string, storageRootKey: string): void => {
      let current = assertRootedPath(path);
      const root = assertRootedPath(boundary);
      if (current !== root && !(root === '' ? current !== '' : current.startsWith(`${root}/`))) {
        throw new Error(`Mutation path '${current}' is outside its authority root '${root}'.`);
      }
      let shared = false;
      for (;;) {
        claim(`${storageRootKey}:${current}`, shared);
        shared = true;
        if (current === root) {
          return;
        }
        const separator = current.lastIndexOf('/');
        current = separator === -1 ? '' : current.slice(0, separator);
      }
    };

    for (const { path, resolution } of operations) {
      const normalized = resolveAuthorityPath(path);
      /* The physical token excludes every alias of the bytes, so the logical
       * path itself needs no exclusive token of its own when there is one; its
       * logical ancestors are still held shared, so a holder of a route lock
       * (a project route held exclusively) still fences the write. */
      addAuthorityHierarchy(
        normalized,
        resolution.entry?.prefix ?? normalized,
        resolution.entry?.storageRootKey !== undefined,
      );
      const projectId = this._projectLockOwner(normalized, resolution);
      if (projectId !== undefined) {
        claim(`project:${projectId}`, options?.lifecycle !== true);
      }
      const { entry } = resolution;
      if (entry?.storageRootKey !== undefined) {
        addRootedHierarchy(resolution.path, entry.providerBasePath, entry.storageRootKey);
      }
    }
    return normalizeLockClaims(claims);
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

  /**
   * Hold `claims` across tabs and in this realm's queue while `operation` runs.
   *
   * @param claims - Normalized lock claims.
   * @param operation - The work.
   * @returns Its result.
   */
  private async _withClaims<T>(claims: readonly LockClaim[], operation: () => Promise<T>): Promise<T> {
    return this._crossTabCoordinator.withLocks(claims, async () =>
      this._resourceQueue.queueForClaims(toQueueClaims(claims), operation),
    );
  }

  /**
   * Re-read what each provider projects for the paths a mutation touches,
   * inside its locks: a peer tab's committed write is part of what admits ours
   * (the EISDIR and EEXIST rows in `workspace-file-service-cross-tab.test.ts`).
   * One refresh per provider, scoped to the mutation's own paths — never the
   * whole provider.
   *
   * @param resolutions - Every resolution the mutation touches.
   */
  private async _refreshScoped(resolutions: readonly MountResolution[]): Promise<void> {
    const byProvider = Map.groupBy(resolutions, ({ provider }) => provider);
    await Promise.all(
      [...byProvider].map(async ([provider, group]) => provider.refresh?.([...new Set(group.map(({ path }) => path))])),
    );
  }

  /**
   * Resolve a convenience's receipt into its result: applied resolves, any
   * other outcome rejects with the provider's own error.
   *
   * @param pending - The entry's queued receipt.
   */
  private async _settle(pending: Promise<ChangesetEntryReceipt>): Promise<void> {
    const receipt = await pending;
    if (receipt.outcome === 'applied') {
      return;
    }
    throw receipt.error instanceof Error
      ? receipt.error
      : new Error(`Mutation ${receipt.outcome}.`, { cause: receipt.error });
  }

  /**
   * Start the pending changeset for one origin now.
   *
   * @param origin - The coalescing key.
   */
  private _flush(origin: string): void {
    const pending = this._pending.get(origin);
    if (pending === undefined) {
      return;
    }
    this._pending.delete(origin);
    pending.open();
  }

  /**
   * Apply a pending changeset once it is flushed; every entry's caller awaits it.
   *
   * @param entries - The entries being coalesced; complete once `opened` settles.
   * @param opened - Settles when {@link _flush} closes it to new entries.
   * @param context - Its callers' shared mutation context.
   * @returns Its receipt.
   */
  private async _applyWhenOpened(
    entries: ResolvedChangesetEntry[],
    opened: Promise<void>,
    context: WorkspaceMutationContext | undefined,
  ): Promise<ChangesetReceipt> {
    await opened;
    return this.apply({ entries }, context);
  }

  /**
   * Resolve one entry's write data and batch entry.
   *
   * @param resolved - The entry and its resolutions.
   * @returns The prepared entry.
   */
  private _prepare(resolved: ResolvedChangesetEntry): PreparedEntry {
    const { entry, resolution, targetResolution } = resolved;
    const batch = toBatchEntry(entry, resolution.path, targetResolution?.path);
    const bytes =
      (batch.op === 'write' || batch.op === 'append') && batch.data instanceof Uint8Array ? batch.data : undefined;
    return {
      entry,
      phase: entry.phase ?? 0,
      path: entry.op === 'move' ? entry.from : entry.path,
      ...(entry.op === 'move' ? { target: entry.to } : {}),
      resolution,
      ...(targetResolution === undefined ? {} : { targetResolution }),
      batch,
      ...(bytes === undefined ? {} : { bytes }),
    };
  }

  /**
   * Admit every entry before the first I/O: no two entries of one phase race
   * (one path twice, or one inside another's subtree), and no removal or move
   * crosses a mount boundary.
   *
   * @param entries - The resolved entries, streams staged.
   * @returns The prepared entries.
   */
  private _admit(entries: readonly ResolvedChangesetEntry[]): PreparedEntry[] {
    const phases = new Map<number, PhaseAdmission>();
    return entries.map((resolved) => {
      const prepared = this._prepare(resolved);
      let admission = phases.get(prepared.phase);
      if (admission === undefined) {
        admission = new PhaseAdmission();
        phases.set(prepared.phase, admission);
      }
      const occupancy = occupancyOf(prepared);
      const conflict = admission.conflict(occupancy);
      if (conflict !== undefined) {
        throw errnoError('EINVAL', `changeset entries of one phase overlap at '${conflict}'`);
      }
      admission.admit(occupancy);
      this._assertEntryAdmissible(prepared);
      return prepared;
    });
  }

  /**
   * Refuse one entry on its own grounds, before it joins a changeset: a
   * recursive delete or a move that would cross a mount boundary, or a path its
   * lock claims cannot name (outside its authority root, or not rooted).
   *
   * @param prepared - The entry.
   */
  private _assertEntryAdmissible(prepared: PreparedEntry): void {
    if (prepared.batch.op === 'delete' && prepared.batch.recursive === true) {
      this._assertNoDescendantMounts(prepared.path, 'recursive remove');
    }
    if (prepared.batch.op === 'move') {
      this._assertNoDescendantMounts(prepared.path, 'move');
      this._assertNoDescendantMounts(prepared.target!, 'move');
    }
    this.lockClaims([
      { path: prepared.path, resolution: prepared.resolution },
      ...(prepared.target === undefined
        ? []
        : [{ path: prepared.target, resolution: prepared.targetResolution ?? prepared.resolution }]),
    ]);
  }

  /**
   * Stage every streamed write into a `Blob` before any lock is requested (I11).
   *
   * @param entries - The resolved entries.
   * @returns The same entries, streams replaced by their staged bytes.
   */
  private async _stageStreams(entries: readonly ResolvedChangesetEntry[]): Promise<ResolvedChangesetEntry[]> {
    return Promise.all(
      entries.map(async (resolved) => {
        const { entry } = resolved;
        if (entry.op !== 'write' || !isStreamData(entry.data)) {
          return resolved;
        }
        return { ...resolved, entry: { ...entry, data: await new Response(entry.data).blob() } };
      }),
    );
  }

  /**
   * The body of {@link apply} once its locks are held.
   *
   * @param prepared - Admitted entries.
   * @param signal - Abort stops later phases.
   * @param context - Optional mutation source metadata.
   * @returns Every entry's outcome.
   */
  private async _applyLocked(
    prepared: readonly PreparedEntry[],
    signal: AbortSignal | undefined,
    context: WorkspaceMutationContext | undefined,
  ): Promise<ChangesetReceipt> {
    workerTimings.count('changesets');
    const receipts = Array.from<ChangesetEntryReceipt>({ length: prepared.length });
    const batches = Array.from<BatchReceipt | undefined>({ length: prepared.length });
    let refreshFailure: unknown;
    try {
      await this._refreshScoped(
        prepared.flatMap(({ resolution, targetResolution }) =>
          targetResolution === undefined ? [resolution] : [resolution, targetResolution],
        ),
      );
    } catch (error) {
      refreshFailure = error;
    }
    let halted = refreshFailure !== undefined;
    for (const phase of [...new Set(prepared.map((entry) => entry.phase))].sort((left, right) => left - right)) {
      const indexes = prepared.flatMap((entry, index) => (entry.phase === phase ? [index] : []));
      if (halted || signal?.aborted === true) {
        const error = refreshFailure ?? (signal?.aborted === true ? abortError(signal) : undefined);
        for (const index of indexes) {
          receipts[index] = { index, outcome: 'skipped', ...(error === undefined ? {} : { error }) };
        }
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- a later phase starts only once the earlier one is durable.
      await this._runPhase(prepared, indexes, signal, receipts, batches);
      halted = indexes.some((index) => receipts[index]!.outcome !== 'applied');
    }
    this._recordChangeset(prepared, receipts, batches, context);
    return changesetReceipt(receipts);
  }

  /**
   * Run one phase: each provider's entries as one batch, the providers side by
   * side; a move between two providers as a copy and a removal.
   *
   * @param prepared - Every admitted entry.
   * @param indexes - This phase's entries.
   * @param signal - The changeset's abort signal.
   * @param receipts - Filled with each entry's receipt.
   * @param batches - Filled with each entry's provider receipt.
   */
  // oxlint-disable-next-line max-params -- the phase runner fills the caller's two receipt arrays in place.
  private async _runPhase(
    prepared: readonly PreparedEntry[],
    indexes: readonly number[],
    signal: AbortSignal | undefined,
    receipts: ChangesetEntryReceipt[],
    batches: Array<BatchReceipt | undefined>,
  ): Promise<void> {
    const settle = (index: number, result: BatchReceipt): void => {
      batches[index] = result;
      const { batch, resolution } = prepared[index]!;
      const durability =
        batch.op === 'append' && result.outcome === 'applied' ? resolution.provider.capabilities.durability : undefined;
      receipts[index] = {
        index,
        outcome: result.outcome,
        ...(result.error === undefined ? {} : { error: result.error }),
        ...(result.kind === undefined ? {} : { kind: result.kind }),
        ...(durability === undefined ? {} : { durability }),
      };
    };
    const fenceRefusals = await this._checkAppendFences(prepared, indexes);
    for (const [index, refusal] of fenceRefusals) {
      settle(index, refusal);
    }
    const isCrossProvider = (index: number): boolean => {
      const { batch, resolution, targetResolution } = prepared[index]!;
      return batch.op === 'move' && targetResolution !== undefined && targetResolution.provider !== resolution.provider;
    };
    const byProvider = Map.groupBy(
      indexes.filter((index) => !isCrossProvider(index) && !fenceRefusals.has(index)),
      (index) => prepared[index]!.resolution.provider,
    );
    const options = signal === undefined ? undefined : { signal };
    await Promise.all([
      ...[...byProvider].map(async ([provider, group]) => {
        const entries = group.map((index) => prepared[index]!.batch);
        let results: BatchReceipt[];
        try {
          results = await (provider.applyBatch?.(entries, options) ??
            applyBatchWithPrimitives(provider, entries, options));
        } catch (error) {
          results = entries.map(() => ({ outcome: 'uncertain', error }));
        }
        for (const [position, index] of group.entries()) {
          settle(
            index,
            results[position] ?? { outcome: 'uncertain', error: new Error('Provider batch lost a receipt.') },
          );
        }
      }),
      ...indexes
        .filter((index) => isCrossProvider(index))
        .map(async (index) => {
          settle(index, await this._moveAcrossProviders(prepared[index]!));
        }),
    ]);
    for (const index of indexes) {
      const { entry, path } = prepared[index]!;
      if (entry.op === 'append' && entry.fence?.token !== undefined && receipts[index]!.outcome === 'applied') {
        this._appendFences.set(path, Math.max(this._appendFences.get(path) ?? entry.fence.token, entry.fence.token));
      }
    }
  }

  /**
   * Check every fenced append of one phase under the changeset's lock set (D23):
   * the writer's token must not be older than one already applied to the
   * path, and the file must still be the length the writer last knew. The
   * check reads metadata only; the exclusive token on the path keeps it true
   * until the append lands.
   *
   * Appends to one path are judged in entry order against a running length
   * and token, not each against the length before the changeset: two appends
   * that both fence at L cannot both pass, and a pipelined append at L then
   * one at L + n both can. An append that is refused adds nothing to the
   * running length, so whatever was built on it is refused too.
   *
   * @param prepared - Every admitted entry.
   * @param indexes - This phase's entries.
   * @returns A refusal per fenced append whose condition does not hold.
   */
  private async _checkAppendFences(
    prepared: readonly PreparedEntry[],
    indexes: readonly number[],
  ): Promise<Map<number, BatchReceipt>> {
    const refusals = new Map<number, BatchReceipt>();
    const byPath = Map.groupBy(
      indexes.toSorted((left, right) => left - right),
      (index) => prepared[index]!.path,
    );
    await Promise.all(
      [...byPath.values()].map(async (group) => {
        if (!group.some((index) => prepared[index]!.entry.op === 'append' && prepared[index]!.entry.fence)) {
          return;
        }
        const { path, resolution } = prepared[group[0]!]!;
        let length: number | undefined;
        try {
          const stat = await resolution.provider.stat(resolution.path);
          length = stat.size;
        } catch (error) {
          const { code } = error as { code?: unknown };
          if (code !== 'ENOENT' && code !== 'ENOTDIR') {
            for (const index of group) {
              if (prepared[index]!.entry.op === 'append' && prepared[index]!.entry.fence !== undefined) {
                refusals.set(index, { outcome: 'failed', error });
              }
            }
            return;
          }
          length = 0;
        }
        let highest = this._appendFences.get(path);
        for (const index of group) {
          const { entry, batch } = prepared[index]!;
          if (entry.op !== 'append') {
            /* Any other change to the path in this phase leaves its length unknown to the appends after it. */
            length = undefined;
            continue;
          }
          const added = batch.op === 'append' ? batch.data.byteLength : 0;
          if (entry.fence === undefined) {
            length = length === undefined ? undefined : length + added;
            continue;
          }
          const { expectedLength, token } = entry.fence;
          if (token !== undefined && highest !== undefined && token < highest) {
            refusals.set(index, {
              outcome: 'failed',
              error: Object.assign(
                errnoError('EFENCED', `append to '${path}' from fence ${String(token)} after ${String(highest)}`),
                { token, highest },
              ),
            });
            continue;
          }
          if (length !== expectedLength) {
            const actualLength = length ?? Number.NaN;
            refusals.set(index, {
              outcome: 'failed',
              error: Object.assign(
                errnoError('EAPPENDSTALE', `'${path}' is ${String(actualLength)} bytes, not ${String(expectedLength)}`),
                { expectedLength, actualLength },
              ),
            });
            continue;
          }
          length += added;
          if (token !== undefined) {
            highest = Math.max(highest ?? token, token);
          }
        }
      }),
    );
    return refusals;
  }

  /**
   * Move one path between two providers: copy, then remove the source. A
   * directory copy that fails is removed again; anything after the copy began
   * is uncertain.
   *
   * @param prepared - The move entry.
   * @returns Its receipt; never rejects.
   */
  private async _moveAcrossProviders(prepared: PreparedEntry): Promise<BatchReceipt> {
    const { resolution: sourceResolution } = prepared;
    const target = prepared.targetResolution!;
    let began = false;
    let incompleteDirectoryCopy = false;
    try {
      const sourceStat = await sourceResolution.provider.stat(sourceResolution.path);
      if (await target.provider.exists(target.path)) {
        return { outcome: 'failed', error: errnoError('EEXIST', `target already exists '${prepared.target!}'`) };
      }
      began = true;
      if (sourceStat.type === 'dir') {
        incompleteDirectoryCopy = true;
        await this._copyDirectoryAcrossProviders(
          sourceResolution.provider,
          sourceResolution.path,
          target.provider,
          target.path,
        );
        incompleteDirectoryCopy = false;
        await this.removeRecursive(sourceResolution.provider, sourceResolution.path);
      } else {
        const data = await sourceResolution.provider.readFile(sourceResolution.path);
        await target.provider.writeFile(target.path, data);
        await sourceResolution.provider.unlink(sourceResolution.path);
      }
      return { outcome: 'applied', kind: sourceStat.type };
    } catch (error) {
      if (incompleteDirectoryCopy) {
        try {
          if (await target.provider.exists(target.path)) {
            await this.removeRecursive(target.provider, target.path);
          }
        } catch {
          // The receipt below is already uncertain.
        }
      }
      return began ? { outcome: 'uncertain', error } : { outcome: 'failed', error };
    }
  }

  /**
   * The logical path a mount routes to one provider path of a storage root,
   * when the mount that routes it is the one that resolves it.
   *
   * @param storageRootKey - The storage root.
   * @param providerPath - The provider path.
   * @returns The logical path, or `undefined` when no current mount routes it.
   */
  private _logicalPathFor(storageRootKey: string, providerPath: string): string | undefined {
    for (const entry of this._mountTable.listMounts()) {
      if (entry.storageRootKey !== storageRootKey) {
        continue;
      }
      const base = entry.providerBasePath;
      const suffix =
        base === ''
          ? providerPath
          : providerPath === base
            ? ''
            : providerPath.startsWith(`${base}/`)
              ? providerPath.slice(base.length + 1)
              : undefined;
      if (suffix === undefined) {
        continue;
      }
      const path = suffix === '' ? entry.prefix : entry.prefix === '/' ? `/${suffix}` : `${entry.prefix}/${suffix}`;
      try {
        const resolution = this._mountTable.resolve(path);
        if (resolution.entry === entry && resolution.path === providerPath) {
          return path;
        }
      } catch {
        // Not routable: try the next mount.
      }
    }
    return undefined;
  }

  /**
   * Record what one changeset did: the derivatives each applied entry
   * changes, one bus event and one cross-tab notice (I4). An uncertain entry
   * turns the event into one scoped `backendChanged` per backend instead of
   * exact facts — never both.
   *
   * @param prepared - Every admitted entry.
   * @param receipts - Every entry's receipt.
   * @param batches - Every entry's provider receipt.
   * @param context - Optional mutation source metadata.
   */
  // oxlint-disable-next-line max-params -- the recorder reads the three parallel arrays one apply produced.
  private _recordChangeset(
    prepared: readonly PreparedEntry[],
    receipts: readonly ChangesetEntryReceipt[],
    batches: ReadonlyArray<BatchReceipt | undefined>,
    context: WorkspaceMutationContext | undefined,
  ): void {
    const events: AttributedChangeEvent[] = [];
    const notices: ChangeNotification[] = [];
    const notify = (type: ChangeNotification['type'], path: string, resolution: MountResolution): void => {
      if (resolution.entry?.storageRootKey !== undefined) {
        notices.push({ type, path, authority: this.physicalAuthority(resolution) });
      }
    };
    const uncertain: PreparedEntry[] = [];
    for (const [index, entry] of prepared.entries()) {
      const { outcome, kind } = receipts[index]!;
      if (outcome === 'uncertain') {
        uncertain.push(entry);
        continue;
      }
      if (outcome !== 'applied') {
        continue;
      }
      const { batch, path, resolution } = entry;
      const { backend } = resolution;
      const current = this.isCurrentResolution(path, resolution);
      const operations = [{ path, resolution }];
      switch (batch.op) {
        case 'write':
        case 'append': {
          if (current) {
            if (batch.op === 'write' && entry.bytes !== undefined) {
              /* The write path is where content facts are recorded: the bytes are in hand (D4). */
              this._projectIndexes.addFile(path, {
                size: entry.bytes.byteLength,
                facts: getFileContentMetadata(entry.bytes),
              });
            } else {
              this._projectIndexes.invalidate(path);
            }
          }
          if (resolution.entry !== undefined) {
            events.push({ event: { type: 'fileWritten', path, backend }, operations });
          }
          notify('write', path, resolution);
          break;
        }
        case 'mkdir': {
          if (batches[index]?.created === false) {
            break;
          }
          if (current) {
            this._projectIndexes.addDirectory(path);
          }
          events.push({ event: { type: 'directoryCreated', path, backend }, operations });
          notify('mkdir', path, resolution);
          break;
        }
        case 'delete': {
          if (kind === 'dir') {
            if (current) {
              this._projectIndexes.removeDirectory(path);
            }
            events.push({ event: { type: 'directoryDeleted', path, backend }, operations });
            notify('rmdir', path, resolution);
          } else {
            if (current) {
              this._projectIndexes.removeFile(path);
            }
            events.push({ event: { type: 'fileDeleted', path, backend }, operations });
            notify('delete', path, resolution);
          }
          break;
        }
        case 'move': {
          const target = entry.target!;
          const targetResolution = entry.targetResolution ?? resolution;
          const targetIsCurrent = this.isCurrentResolution(target, targetResolution);
          if (current && targetIsCurrent) {
            this._projectIndexes.rename(path, target);
          } else if (current || targetIsCurrent) {
            this._projectIndexes.invalidate(path);
            this._projectIndexes.invalidate(target);
          }
          events.push({
            event:
              kind === 'dir'
                ? { type: 'directoryRenamed', oldPath: path, newPath: target, backend }
                : { type: 'fileRenamed', oldPath: path, newPath: target, backend },
            operations: [...operations, { path: target, resolution: targetResolution }],
          });
          notify(kind === 'dir' ? 'rmdir' : 'delete', path, resolution);
          notify(kind === 'dir' ? 'directory-change' : 'write', target, targetResolution);
          break;
        }
      }
    }
    if (uncertain.length > 0) {
      const touched = uncertain.flatMap(({ path, resolution, target, targetResolution }) => [
        { path, resolution },
        ...(target === undefined ? [] : [{ path: target, resolution: targetResolution ?? resolution }]),
      ]);
      const globallyVisible = touched.some(({ path, resolution }) => this.isCurrentResolution(path, resolution));
      for (const { path, resolution } of uncertain) {
        if (!this.isCurrentResolution(path, resolution)) {
          continue;
        }
        /* An entry that may have landed leaves its path unknown, never the whole root (D5). */
        this._projectIndexes.invalidate(path);
      }
      for (const { batch, target } of uncertain) {
        if (batch.op === 'move' && target !== undefined) {
          this._projectIndexes.invalidate(target);
        }
      }
      /* A half-finished recursive mkdir or removal may have changed anything up
       * to its mount root; any other entry, only its parent directory. */
      for (const { batch, path, resolution, target, targetResolution } of uncertain) {
        const recursive = (batch.op === 'mkdir' || batch.op === 'delete') && batch.recursive === true;
        notify('directory-change', recursive ? (resolution.entry?.prefix ?? path) : parentDirectory(path), resolution);
        if (target !== undefined) {
          notify('directory-change', parentDirectory(target), targetResolution ?? resolution);
        }
      }
      events.length = 0;
      const all = prepared.map(({ path, resolution }) => ({ path, resolution }));
      for (const [backend, group] of Map.groupBy(all, ({ resolution }) => resolution.backend)) {
        events.push({ event: { type: 'backendChanged', backend }, operations: group, globallyVisible });
      }
    }
    this.emitChangeEvents(events, context);
    this._crossTabCoordinator.notifyChanges(notices);
  }

  /**
   * Tag one event with its origin and the authorities that attribute it.
   *
   * @param event - The event.
   * @param context - Optional mutation source metadata.
   * @param attribution - The resolved paths behind it.
   */
  private _tagEvent(
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
      this._projectIndexes.addFile(path, { size: bytes.byteLength, facts: getFileContentMetadata(bytes) });
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
        // oxlint-disable-next-line no-await-in-loop, tau-lint/no-awaited-mutation-in-loop -- a provider primitive, not a convenience: one read in memory at a time across providers.
        await targetProvider.writeFile(targetEntry, data);
      }
    }
  }
}
