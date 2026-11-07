/**
 * Rooted views: one captured mount, issued as an ordinary filesystem (authority Rule 15).
 *
 * Extracted from `WorkspaceFileService` unchanged. `create` resolves its
 * argument to one *exact* mount, captures that entry, and returns the full
 * read/write/watch surface rebased to the root-relative namespace — so runtime,
 * agent and UI code operate inside an already-selected checkout without ever
 * spelling an authority-global path (Rule 4).
 *
 * Two rules make it a boundary rather than a convenience:
 *
 * - **Confinement.** Every public path goes through `resolveLocal`, which
 *   canonicalises it and joins it under the captured mount's provider base. A
 *   view never falls through to a broader mount, and the root itself cannot be
 *   renamed or removed.
 * - **Staleness.** A mount replacement invalidates the captured view instead of
 *   retargeting it: `assertCurrent` throws `ESTALE`, and a live watch stops and
 *   reports one `reset` rather than delivering another route's events.
 *
 * It is unmasked on purpose. The mask belongs to `composeView` above it, which
 * is also where the consumer-facing porcelain refuses a hidden path before any
 * provider I/O (charter D4, authority Rule 16).
 *
 * @module
 */

import type {
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileWritePrecondition,
  FileStat,
  FileStatEntry,
} from '@taucad/types';
import { assertRootedPath, joinRelativePath, resolveAuthorityPath } from '@taucad/utils/path';
import type {
  ContentFacts,
  DirectoryEntry,
  DirectoryStatRow,
  FileReadStreamOptions,
  FileSystemProvider,
  MkdirOptions,
  WatchEvent,
  WatchRequest,
  WorkspaceMutationContext,
} from '#types.js';
import type { MountResolution, MountTable } from '#mount-table.js';
import type { ProjectIndexes, IndexFactsOptions } from '#project-index/project-indexes.js';
import type {
  ExpectedEntry,
  IndexAdmits,
  IndexChanges,
  IndexCompareResult,
  IndexSearchOptions,
} from '#project-index/project-index.js';
import type { WalkOptions } from '#content-ops/walk.js';
import { causeToMutationError, preflightCreate, preflightDelete, preflightMove } from '#mutation-pipeline.js';
import type { BulkMoveEdit, BulkMoveResult, MutationPipeline, ResolvedChangesetEntry } from '#mutation-pipeline.js';
import type { AppendFence, Changeset, ChangesetReceipt } from '#changeset.js';
import type { ChangeSetWatchRequest, WatchRegistry } from '#watch-registry.js';
import type { ChangeSet, ChangeSetEntry } from '#change-event-bus.js';
import { RootedFileSystemError, WorkspaceMutationError, isNotFoundError } from '#workspace-errors.js';
import { mapConcurrent, statConcurrency } from '#concurrency.js';
import { bufferToStream, validateFileReadStreamOptions } from '#backend/stream-utils.js';
import { getEventOrigin } from '#event-origin-registry.js';
import { PendingContentError, pendingObjectOf, readThroughPending } from '#pending-content.js';
import type { PendingObject, PendingObjectRequest, PendingObjectSource } from '#pending-content.js';

/* A provider's own utf8 read keeps a byte-order mark; so does this one. */
// eslint-disable-next-line @typescript-eslint/naming-convention -- `ignoreBOM` is the native TextDecoder option name.
const utf8 = new TextDecoder('utf-8', { ignoreBOM: true });

/** The control plane a rooted view serves outside the mutation pipeline. */
const privateStoreDirectory = '.git';

/**
 * A Git store's control plane, served by a rooted view outside the mutation
 * pipeline (see {@link RootedPorcelain.privateStore}).
 *
 * The provider's own primitives, confined to `.git/**`, plus a range read
 * where the provider streams ranges, so a pack is read one object at a time
 * and never as a whole.
 *
 * @public
 */
export type PrivateStore = Pick<
  FileSystemProvider,
  'readFile' | 'writeFile' | 'writeFileStream' | 'readdir' | 'stat' | 'exists' | 'mkdir' | 'unlink' | 'rmdir' | 'rename'
> & {
  /**
   * Bytes `[offset, offset + length)` of one file, clamped to its end: a
   * non-exclusive slice of the file. Present only where the provider streams
   * ranges; a store without it reads a pack whole.
   *
   * @param path - The file, under `.git`.
   * @param offset - First byte.
   * @param length - Bytes wanted.
   * @returns The bytes read.
   */
  readRange?(path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>>;
};

/**
 * The mutating porcelain a rooted view serves (charter D4).
 *
 * Batch operations, not sugar over N port writes: each one runs in the mutation
 * pipeline with today's semantics (authority Rule 5a) — a copy takes one lock
 * set and emits one summary event; a batch write settles per file and drops
 * only the rejected paths' derivatives — and is confined to the captured mount.
 *
 * Unmasked here, like every other rooted primitive. `composeView` mirrors this
 * surface and is where a hidden operand is refused before provider I/O and
 * where a copy inherits the consumer's mask as its entry filter (Rule 16).
 *
 * @public
 */
export type RootedPorcelain = {
  /**
   * This root's Git control plane — `.git` and everything under it — straight
   * on the captured provider, outside the mutation pipeline (charter D7, I6).
   *
   * No resource-queue or cross-tab claim, no change event, no index entry and
   * no content metadata: objects, packs, refs and the store's own records are
   * not project files, nothing watches, captures or indexes them, and taking
   * the project's claims for them serialized every object write behind every
   * checkout write. The store's writer keeps its own discipline — content is
   * addressed by its hash and lands by rename, refs move by compare-and-set
   * under the revision lock, a repack takes its own fence.
   *
   * Every path must be `.git` or lie under it; any other is refused with a
   * `TypeError` before provider I/O.
   */
  readonly privateStore: PrivateStore;
  /**
   * Apply one changeset of this root's paths: every entry admitted before the
   * first I/O, one lock set, phases in order, every entry's outcome reported,
   * one change event and one cross-tab notice (charter D2).
   */
  apply(changeset: Changeset): Promise<ChangesetReceipt>;
  /** Recursively copy one subtree of this root onto another. */
  copyTree(
    source: string,
    target: string,
    options?: { admits?: WalkOptions['admits']; signal?: AbortSignal },
  ): Promise<void>;
  /** Copy one file of this root to a new path. */
  duplicate(source: string, target: string, options?: { signal?: AbortSignal }): Promise<void>;
  /** Move one path of this root, answering with the resulting stat. */
  move(source: string, target: string): Promise<FileStat>;
  /** Move many paths sequentially, reporting each completed and failed edit. */
  bulkMove(edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult>;
  /** Write many files of this root as one batch. */
  writeFiles(files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>): Promise<void>;
  canMove(source: string, target: string): Promise<true | WorkspaceMutationError>;
  canRename(source: string, newName: string): Promise<true | WorkspaceMutationError>;
  canCreate(path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError>;
  canDelete(path: string): Promise<true | WorkspaceMutationError>;
};

/**
 * Filesystem provider surface issued for one captured mount.
 * @public
 */
export type RootedFileSystem = Omit<FileSystemProvider, 'writeFileChecked' | 'deleteFileChecked' | 'rmdir'> &
  Partial<RootedPorcelain> & {
    writeFileChecked(input: CheckedFileWrite): Promise<CheckedFileWriteResult>;
    deleteFileChecked(input: {
      path: string;
      preconditions: readonly FileWritePrecondition[];
      signal?: AbortSignal;
    }): Promise<CheckedFileWriteResult>;
    /**
     * Remove one directory of this root, recursively when asked.
     *
     * The port's own `rmdir` empties one directory; the authority's has always
     * taken `{ recursive: true }`, and a rooted view is the same surface issued
     * for one mount, so it carries the option rather than silently dropping it.
     */
    rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
    /**
     * Append only while the file is still `fence.expectedLength` bytes and no
     * newer `fence.token` has appended (D23); a refusal (`EAPPENDSTALE`,
     * `EFENCED`) writes nothing. Optional: only the authority's own view fences.
     */
    appendFileFenced?(path: string, data: Uint8Array<ArrayBuffer> | string, fence: AppendFence): Promise<void>;
    watch(request: WatchRequest, handler: (event: WatchEvent) => void): () => void;
    /**
     * Watch in the change-set form (charter D6): one {@link ChangeSet} per
     * committed changeset that reaches the request, in this root's namespace.
     * Optional: a rooted surface that is not the authority's own may only offer `watch`.
     */
    watchChangeSets?(request: ChangeSetWatchRequest, handler: (set: ChangeSet) => void): () => void;
    /**
     * Search this root's own index, which no other root's queries evict (D3).
     *
     * Unmasked here, like every other rooted primitive: the mask belongs to the
     * composed view above, which passes its policy's answer as `admits` so a
     * hidden subtree is never descended into and `maxResults` counts only the
     * rows its consumer may see.
     *
     * Optional for the same reason `readdirEntries` is: a rooted surface that is
     * not the authority's own — a bridge client rooted at someone else's
     * checkout — holds no index and offers neither read.
     */
    search?(query: string, options?: IndexSearchOptions): Promise<FileStatEntry[]>;
    /** Recursively stat one directory of this root from the same index. */
    statTree?(path: string, options?: { admits?: IndexAdmits; signal?: AbortSignal }): Promise<FileStatEntry[]>;
    /**
     * Know a tree's entries before a write lands them (D10), in this root's
     * index, opened first when it is cold: placeholders as pending entries,
     * every entry arriving until its bytes land. Optional: only the authority's
     * own view keeps an index.
     */
    expectEntries?(entries: readonly ExpectedEntry[]): Promise<void>;
    /**
     * Which of these files the root's index holds as pending entries: their
     * large object is not on the device yet. Answered from the index, and for
     * a file the size of a pointer it does not hold as pending, from that
     * file's bytes read raw: never through, so a consumer that only asks
     * never starts a download (D9).
     */
    pendingPaths?(paths: readonly string[]): Promise<readonly string[]>;
    /** Whether these paths of the expected tree have all landed; `undefined` while no tree is expected here. */
    entriesLanded?(paths: readonly string[]): boolean | undefined;
    /** End this root's expectation: the tree write is over. */
    endExpectation?(): void;
    /**
     * Lazy content facts (D4): from the index while they still describe the
     * bytes, otherwise measured from one read within `byteCap` and recorded.
     */
    facts?(paths: readonly string[], options?: IndexFactsOptions): Promise<ReadonlyMap<string, ContentFacts>>;
    /**
     * The full head-metadata compare of this root's index (D5): what a cut runs
     * first, so every fact it trusts has passed the compare and the racy guard.
     */
    compareIndex?(): Promise<IndexCompareResult>;
    /**
     * What this root's index changed after `since` (D3, S10): its generation
     * and epoch now, every entry it still holds that changed later, and every
     * path it removed since; or `rescan` when it cannot tell. Pass the `epoch`
     * the `since` came with: without one only `since` `0` is answered, and any
     * other is `rescan`. Unmasked here, like `statTree`.
     */
    changedSince?(
      since: number,
      options?: { admits?: IndexAdmits; signal?: AbortSignal; epoch?: string },
    ): Promise<IndexChanges>;
  };

/**
 * A rooted view, its captured mount and the pipeline it mutates through.
 *
 * @public
 */
export class RootedViews {
  private readonly _mountTable: MountTable;
  private readonly _pipeline: MutationPipeline;
  private readonly _watchRegistry: WatchRegistry;
  /** Every root's Project Index, opened by the authority that owns its I/O. */
  private readonly _projectIndexes: ProjectIndexes;
  /** Where a read of a pending entry gets its object (D9). */
  private readonly _pendingSource: () => PendingObjectSource | undefined;
  private readonly _pendingStallMilliseconds: number | undefined;

  /**
   * Create the rooted-view factory over the authority's own collaborators.
   *
   * @param options - The mount table, mutation pipeline, watch registry and per-root index accessor the authority owns.
   */
  public constructor(options: {
    mountTable: MountTable;
    pipeline: MutationPipeline;
    watchRegistry: WatchRegistry;
    projectIndexes: ProjectIndexes;
    pendingSource?: () => PendingObjectSource | undefined;
    pendingStallMilliseconds?: number;
  }) {
    this._mountTable = options.mountTable;
    this._pipeline = options.pipeline;
    this._watchRegistry = options.watchRegistry;
    this._projectIndexes = options.projectIndexes;
    this._pendingSource = options.pendingSource ?? (() => undefined);
    this._pendingStallMilliseconds = options.pendingStallMilliseconds;
  }

  /**
   * Capture one exact mount selected by trusted composition as a fully
   * writable filesystem whose entire visible namespace has root `''`.
   *
   * @param authorityRoot - Exact authority-global mount path to capture.
   * @param mutationContext - Optional origin metadata for echo suppression.
   * @param options - `placeholders: 'raw'` for the revision layer, which owns
   *   large-object pointers and reads them as they are; every other view reads
   *   a pending entry through to its object (D9).
   * @returns A writable filesystem whose root is the captured mount.
   */
  public create(
    authorityRoot: string,
    mutationContext?: WorkspaceMutationContext,
    options?: Readonly<{ placeholders?: 'raw' }>,
  ): RootedFileSystem {
    const raw = options?.placeholders === 'raw';
    const root = resolveAuthorityPath(authorityRoot);
    const captured = this._mountTable.getExactMount(root);
    if (captured === undefined) {
      throw new RootedFileSystemError('ROOT_UNAVAILABLE');
    }
    const projectIndexes = this._projectIndexes;

    const assertCurrent = (): void => {
      if (this._mountTable.getExactMount(root) !== captured) {
        throw new RootedFileSystemError('ESTALE');
      }
    };
    const assertMutableRoot = (localPath: string): void => {
      if (localPath === '') {
        throw new Error('Cannot remove or rename the rooted filesystem root.');
      }
    };
    const resolveLocal = (
      localPath: string,
    ): { authorityPath: string; resolution: MountResolution; localPath: string } => {
      const canonicalLocalPath = assertRootedPath(localPath);
      assertCurrent();
      const authorityPath =
        canonicalLocalPath === ''
          ? root
          : root === '/'
            ? resolveAuthorityPath(`/${canonicalLocalPath}`)
            : resolveAuthorityPath(`${root}/${canonicalLocalPath}`);
      const providerPath = assertRootedPath(joinRelativePath(captured.providerBasePath, canonicalLocalPath));
      return {
        authorityPath,
        localPath: canonicalLocalPath,
        resolution: { provider: captured.provider, path: providerPath, backend: captured.backend, entry: captured },
      };
    };
    const toLocalPath = (authorityPath: string): string | undefined => {
      if (root === '/') {
        return authorityPath === '/' ? '' : authorityPath.startsWith('/') ? authorityPath.slice(1) : undefined;
      }
      if (authorityPath === root) {
        return '';
      }
      if (!authorityPath.startsWith(`${root}/`)) {
        return undefined;
      }
      return authorityPath.slice(root.length + 1);
    };
    const prefixGlob = (pattern: string): string => {
      if (pattern.startsWith('/')) {
        throw new TypeError('A rooted watch glob must not begin with a slash.');
      }
      if (pattern === '') {
        return root;
      }
      return root === '/' ? `/${pattern}` : `${root}/${pattern}`;
    };

    /*
     * A pointer read is a pending entry (D9): the index records it, and every
     * view but the revision layer's raw one reads through to its object.
     */
    const stallMilliseconds = this._pendingStallMilliseconds;
    const pendingSource = this._pendingSource;
    const ask = async (
      request: PendingObjectRequest,
      pointer: Uint8Array<ArrayBuffer>,
      signal?: AbortSignal,
    ): Promise<Uint8Array<ArrayBuffer>> =>
      readThroughPending(pendingSource(), request, {
        pointer,
        ...(signal === undefined ? {} : { signal }),
        stallMilliseconds,
      });
    /* Read one file's bytes, marking a pointer pending unless a write landed after the read began (I7). */
    const readMarked = async (
      at: ReturnType<typeof resolveLocal>,
    ): Promise<Readonly<{ bytes: Uint8Array<ArrayBuffer>; object: PendingObject | undefined }>> => {
      const generation = projectIndexes.generationAt(at.authorityPath);
      const bytes = await at.resolution.provider.readFile(at.resolution.path);
      const object = pendingObjectOf(bytes);
      if (object !== undefined) {
        projectIndexes.markPending(at.authorityPath, object, { size: bytes.byteLength, generation });
      }
      return { bytes, object };
    };
    const throughPending = async (
      at: ReturnType<typeof resolveLocal>,
      read: Readonly<{ bytes: Uint8Array<ArrayBuffer>; object: PendingObject | undefined }>,
      signal?: AbortSignal,
    ): Promise<Uint8Array<ArrayBuffer>> =>
      raw || read.object === undefined
        ? read.bytes
        : ask({ authorityPath: at.authorityPath, root, path: at.localPath, object: read.object }, read.bytes, signal);
    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const at = resolveLocal(path);
      const observedAt = Date.now();
      const read = await readMarked(at);
      if (encoding === 'utf8') {
        return utf8.decode(await throughPending(at, read));
      }
      /* A whole read already holds every fact a listing asks for (D4): keep them. */
      projectIndexes.recordRead(root, at.localPath, { bytes: read.bytes, observedAt });
      return throughPending(at, read);
    }

    /* One provider call for the whole set: a remote provider digests beside its
     * bytes. Without one, the root's index answers each trusted digest and
     * reads, digests and records the rest (D5) — except on a root other
     * programs edit (a folder the user picked), which changes between polls:
     * until a cut compares its index first (W3.2), it offers no hashFiles and
     * the caller digests the bytes it reads. */
    const providerHashFiles = captured.provider.hashFiles?.bind(captured.provider);
    const indexHashFiles =
      captured.provider.capabilities.externallyEdited === true
        ? undefined
        : async (paths: readonly string[]): Promise<Record<string, string>> => {
            const local = paths.map((path) => resolveLocal(path).localPath);
            const answered = await this._projectIndexes.facts(root, local, { digests: ['sha256'] });
            assertCurrent();
            return Object.fromEntries(
              paths.map((path, index) => [path, answered.get(local[index]!)?.sha256 ?? 'missing']),
            );
          };
    const hashFiles =
      providerHashFiles === undefined
        ? indexHashFiles
        : async (paths: readonly string[]): Promise<Record<string, string>> => {
            const providerPaths = paths.map((path) => resolveLocal(path).resolution.path);
            const digests = await providerHashFiles(providerPaths);
            assertCurrent();
            return Object.fromEntries(paths.map((path, index) => [path, digests[providerPaths[index]!]!]));
          };

    const readFileStream = (path: string, options?: FileReadStreamOptions): ReadableStream<Uint8Array<ArrayBuffer>> => {
      validateFileReadStreamOptions(options);
      const at = resolveLocal(path);
      const { resolution } = at;
      /* A pending entry is a pointer of at most 1 KiB: a stream that may be one is read whole and through it (D9). */
      const small = async (): Promise<boolean> => {
        if (raw) {
          return false;
        }
        try {
          const { size } = await resolution.provider.stat(resolution.path);
          return size <= 1024;
        } catch {
          return false;
        }
      };
      let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
      const open = async (): Promise<ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>> => {
        if (await small()) {
          const read = await readMarked(at);
          return bufferToStream(await throughPending(at, read, options?.signal), options).getReader();
        }
        return (
          resolution.provider.readFileStream?.(resolution.path, options) ??
          bufferToStream(await resolution.provider.readFile(resolution.path), options)
        ).getReader();
      };
      const cancelAfterFailure = async (reason: unknown): Promise<void> => {
        try {
          await reader?.cancel(reason);
        } catch {
          // Preserve the read or staleness failure that required cleanup.
        }
      };
      return new ReadableStream(
        {
          async pull(controller) {
            try {
              assertCurrent();
              reader ??= await open();
              const result = await reader.read();
              assertCurrent();
              if (result.done) {
                controller.close();
              } else {
                controller.enqueue(result.value);
              }
            } catch (error) {
              await cancelAfterFailure(error);
              throw error;
            }
          },
          cancel: async (reason) => reader?.cancel(reason),
        },
        { highWaterMark: 0 },
      );
    };

    const readdir = async (path: string): Promise<string[]> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.readdir(resolution.path);
    };
    const readdirWithStats = captured.provider.readdirWithStats
      ? async (path: string): Promise<DirectoryStatRow[]> => {
          const { resolution } = resolveLocal(path);
          return resolution.provider.readdirWithStats!(resolution.path);
        }
      : undefined;
    const stat = async (path: string): Promise<FileStat> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.stat(resolution.path);
    };
    const readdirEntries = captured.provider.readdirEntries
      ? async (path: string): Promise<DirectoryEntry[]> => {
          const { resolution } = resolveLocal(path);
          return resolution.provider.readdirEntries!(resolution.path);
        }
      : undefined;
    const getFileMode = captured.provider.getFileMode
      ? async (path: string) => {
          const { resolution } = resolveLocal(path);
          return resolution.provider.getFileMode!(resolution.path);
        }
      : undefined;
    const setFileMode = captured.provider.setFileMode
      ? async (path: string, mode: '100644' | '100755') => {
          const { resolution } = resolveLocal(path);
          await resolution.provider.setFileMode!(resolution.path, mode);
        }
      : undefined;
    const writeFile = async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.writeFileResolved({ path: authorityPath, resolution, data, context: mutationContext });
    };
    const writeFileChecked = async (input: CheckedFileWrite): Promise<CheckedFileWriteResult> => {
      const target = resolveLocal(input.path);
      const preconditions = input.preconditions.map((precondition) => {
        const resolved = resolveLocal(precondition.path);
        return { ...precondition, path: resolved.authorityPath, resolution: resolved.resolution };
      });
      return this._pipeline.writeFileCheckedResolved({
        path: target.authorityPath,
        resolution: target.resolution,
        data: input.data,
        preconditions,
        signal: input.signal,
        context: mutationContext,
      });
    };
    const deleteFileChecked = async (input: {
      path: string;
      preconditions: readonly FileWritePrecondition[];
      signal?: AbortSignal;
    }): Promise<CheckedFileWriteResult> => {
      const target = resolveLocal(input.path);
      assertMutableRoot(target.localPath);
      const preconditions = input.preconditions.map((precondition) => {
        const resolved = resolveLocal(precondition.path);
        return { ...precondition, path: resolved.authorityPath, resolution: resolved.resolution };
      });
      return this._pipeline.deleteFileCheckedResolved({
        path: target.authorityPath,
        resolution: target.resolution,
        preconditions,
        signal: input.signal,
        context: mutationContext,
      });
    };
    const appendFile = async (path: string, data: Uint8Array<ArrayBuffer> | string): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.appendFileResolved({ path: authorityPath, resolution, data, context: mutationContext });
    };
    const appendFileFenced = async (
      path: string,
      data: Uint8Array<ArrayBuffer> | string,
      fence: AppendFence,
    ): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.appendFileResolved({
        path: authorityPath,
        resolution,
        data,
        fence,
        context: mutationContext,
      });
    };
    const mkdir = async (path: string, options?: MkdirOptions): Promise<void> => {
      const { authorityPath, resolution } = resolveLocal(path);
      await this._pipeline.mkdirResolved({ path: authorityPath, resolution, options, context: mutationContext });
    };
    const unlink = async (path: string): Promise<void> => {
      const { authorityPath, resolution, localPath } = resolveLocal(path);
      assertMutableRoot(localPath);
      await this._pipeline.unlinkResolved({ path: authorityPath, resolution, context: mutationContext });
    };
    const rmdir = async (path: string, options?: { recursive?: boolean }): Promise<void> => {
      const { authorityPath, resolution, localPath } = resolveLocal(path);
      assertMutableRoot(localPath);
      await this._pipeline.rmdirResolved({ path: authorityPath, resolution, options, context: mutationContext });
    };
    const move = async (from: string, to: string): Promise<FileStat> => {
      const source = resolveLocal(from);
      const target = resolveLocal(to);
      assertMutableRoot(source.localPath);
      assertMutableRoot(target.localPath);
      return this._pipeline.moveResolved({
        source: source.authorityPath,
        target: target.authorityPath,
        sourceResolution: source.resolution,
        targetResolution: target.resolution,
        context: mutationContext,
      });
    };
    const rename = async (from: string, to: string): Promise<void> => {
      await move(from, to);
    };
    const copyTree = async (
      source: string,
      target: string,
      options?: { admits?: WalkOptions['admits']; signal?: AbortSignal },
    ): Promise<void> => {
      const from = resolveLocal(source);
      const to = resolveLocal(target);
      await this._pipeline.copyTree({
        source: from.authorityPath,
        target: to.authorityPath,
        sourceResolution: from.resolution,
        targetResolution: to.resolution,
        admits: options?.admits,
        signal: options?.signal,
        context: mutationContext,
      });
    };
    const duplicate = async (source: string, target: string, options?: { signal?: AbortSignal }): Promise<void> => {
      options?.signal?.throwIfAborted();
      const to = resolveLocal(target);
      assertMutableRoot(to.localPath);
      /* A view is captured to one exact mount, so a target the mount table
       * routes elsewhere is not this view's to write — shadowing it in the
       * captured provider is the same boundary crossing `copyTree` refuses. */
      if (!this._pipeline.isCurrentResolution(to.authorityPath, to.resolution)) {
        throw new Error(`[WorkspaceFileService] copy would cross mount boundary at '${to.authorityPath}'.`);
      }
      /*
       * Copy-on-write: a pending entry is copied as its pointer and stays
       * pending where the target is a tracked name. Under a name the project
       * does not track, a pointer would be a person's text: the copy is the
       * object, from the device alone, or refused with PENDING.
       */
      const from = resolveLocal(source);
      const { bytes, object } = await readMarked(from);
      if (raw || object === undefined || pendingSource() === undefined) {
        /* Nothing is written yet: a copy stopped here leaves the target as it was. */
        options?.signal?.throwIfAborted();
        await writeFile(target, bytes);
        return;
      }
      const local = { object, pointer: bytes, localOnly: true } as const;
      /* The source answers a name it does not track with the pointer itself. */
      let untracked: boolean;
      try {
        untracked =
          (await ask({ authorityPath: to.authorityPath, root, path: to.localPath, ...local }, bytes)) === bytes;
      } catch (error) {
        if (!(error instanceof PendingContentError)) {
          throw error;
        }
        /* Tracked there, its object not here: the pointer is what the copy is. */
        untracked = false;
      }
      const copied = untracked
        ? await ask({ authorityPath: from.authorityPath, root, path: from.localPath, ...local }, bytes)
        : bytes;
      options?.signal?.throwIfAborted();
      await writeFile(target, copied);
    };
    const bulkMove = async (edits: readonly BulkMoveEdit[]): Promise<BulkMoveResult> => {
      const resolved = [];
      const failures = new Map<BulkMoveEdit, BulkMoveResult['failed'][number]>();
      for (const edit of edits) {
        try {
          const source = resolveLocal(edit.source);
          const target = resolveLocal(edit.target);
          assertMutableRoot(source.localPath);
          assertMutableRoot(target.localPath);
          resolved.push({
            edit,
            source: source.authorityPath,
            target: target.authorityPath,
            sourceResolution: source.resolution,
            targetResolution: target.resolution,
          });
        } catch (error) {
          failures.set(edit, { edit, error: causeToMutationError(error, edit.source, edit.target) });
        }
      }
      const result = await this._pipeline.bulkMove(resolved, mutationContext);
      for (const failure of result.failed) {
        failures.set(failure.edit, failure);
      }
      return { moved: result.moved, failed: edits.flatMap((edit) => failures.get(edit) ?? []) };
    };
    const apply = async (changeset: Changeset): Promise<ChangesetReceipt> =>
      this._pipeline.apply(
        {
          entries: changeset.entries.map((entry): ResolvedChangesetEntry => {
            if (entry.op === 'move') {
              const from = resolveLocal(entry.from);
              const to = resolveLocal(entry.to);
              assertMutableRoot(from.localPath);
              assertMutableRoot(to.localPath);
              return {
                entry: { ...entry, from: from.authorityPath, to: to.authorityPath },
                resolution: from.resolution,
                targetResolution: to.resolution,
              };
            }
            const at = resolveLocal(entry.path);
            assertMutableRoot(at.localPath);
            return { entry: { ...entry, path: at.authorityPath }, resolution: at.resolution };
          }),
          ...(changeset.lifecycle === undefined ? {} : { lifecycle: changeset.lifecycle }),
          ...(changeset.signal === undefined ? {} : { signal: changeset.signal }),
        },
        mutationContext,
      );
    const writeFiles = async (files: Record<string, { content: Uint8Array<ArrayBuffer> | string }>): Promise<void> => {
      await this._pipeline.writeFiles(
        Object.entries(files).map(([path, file]) => {
          const { authorityPath, resolution } = resolveLocal(path);
          return {
            path: authorityPath,
            resolution,
            content: typeof file.content === 'string' ? file.content : new Uint8Array(file.content),
          };
        }),
        mutationContext,
      );
    };
    /*
     * A preflight answers with a typed refusal instead of throwing, so an
     * uncanonical operand is `INVALID_NAME` rather than an exception — but a
     * stale view is still stale, and that is not a preflight outcome.
     */
    const resolveForPreflight = (
      path: string,
    ): { path: string; resolution: MountResolution } | WorkspaceMutationError => {
      try {
        const { localPath, resolution } = resolveLocal(path);
        return { path: localPath, resolution };
      } catch (error) {
        if (error instanceof RootedFileSystemError) {
          throw error;
        }
        return new WorkspaceMutationError('INVALID_NAME', path, { cause: error });
      }
    };
    const canMove = async (source: string, target: string): Promise<true | WorkspaceMutationError> => {
      const from = resolveForPreflight(source);
      if (from instanceof WorkspaceMutationError) {
        return from;
      }
      const to = resolveForPreflight(target);
      if (to instanceof WorkspaceMutationError) {
        return to;
      }
      return preflightMove(from, to);
    };
    const canRename = async (source: string, newName: string): Promise<true | WorkspaceMutationError> => {
      if (newName.length === 0 || newName.includes('/') || newName.includes('\\')) {
        return new WorkspaceMutationError('INVALID_NAME', newName);
      }
      if (newName === '.' || newName === '..') {
        return new WorkspaceMutationError('INVALID_NAME', newName);
      }
      return canMove(source, `${source.slice(0, source.lastIndexOf('/') + 1)}${newName}`);
    };
    const canCreate = async (path: string, kind: 'file' | 'directory'): Promise<true | WorkspaceMutationError> => {
      const target = resolveForPreflight(path);
      /* `kind` is the authority's contract too: providers route on the eventual
       * mutation, and the parameter is kept so the RPC can grow. */
      void kind;
      return target instanceof WorkspaceMutationError ? target : preflightCreate(target);
    };
    const canDelete = async (path: string): Promise<true | WorkspaceMutationError> => {
      const target = resolveForPreflight(path);
      return target instanceof WorkspaceMutationError ? target : preflightDelete(target);
    };
    const exists = async (path: string): Promise<boolean> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.exists(resolution.path);
    };
    /* Resolved and confined: the control plane only, never a project file. */
    const resolvePrivate = (path: string): Readonly<{ provider: FileSystemProvider; path: string }> => {
      const { localPath, resolution } = resolveLocal(path);
      if (localPath !== privateStoreDirectory && !localPath.startsWith(`${privateStoreDirectory}/`)) {
        throw new TypeError(`Only the Git control plane is stored outside the mutation pipeline: ${localPath}`);
      }
      return { provider: resolution.provider, path: resolution.path };
    };
    const readPrivateFile = (async (path: string, encoding?: 'utf8') => {
      const target = resolvePrivate(path);
      return encoding === 'utf8'
        ? target.provider.readFile(target.path, 'utf8')
        : target.provider.readFile(target.path);
    }) as PrivateStore['readFile'];
    const statPrivate: PrivateStore['stat'] = async (path: string) => {
      const target = resolvePrivate(path);
      return target.provider.stat(target.path);
    };
    const readPrivateRange = async (path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> => {
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
        throw new RangeError(
          `A private range read needs a whole offset and length, not ${String(offset)} and ${String(length)}.`,
        );
      }
      const target = resolvePrivate(path);
      const reader = target.provider.readFileStream!(target.path, { position: offset, length }).getReader();
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      let size = 0;
      // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
      for (let read = await reader.read(); !read.done; read = await reader.read()) {
        chunks.push(read.value);
        size += read.value.byteLength;
      }
      if (chunks.length === 1) {
        return chunks[0]!;
      }
      const joined = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        joined.set(chunk, at);
        at += chunk.byteLength;
      }
      return joined;
    };
    const privateStore: PrivateStore = {
      readFile: readPrivateFile,
      ...(captured.provider.readFileStream === undefined ? {} : { readRange: readPrivateRange }),
      /* A streamed write commits whole or not at all, by the provider's own staging (W6.3). */
      ...(captured.provider.writeFileStream === undefined
        ? {}
        : {
            writeFileStream: async (path: string, source: ReadableStream<Uint8Array<ArrayBuffer>>) => {
              const target = resolvePrivate(path);
              await target.provider.writeFileStream!(target.path, source);
            },
          }),
      writeFile: async (path, data) => {
        const target = resolvePrivate(path);
        await target.provider.writeFile(target.path, data);
      },
      readdir: async (path) => {
        const target = resolvePrivate(path);
        return target.provider.readdir(target.path);
      },
      stat: statPrivate,
      exists: async (path) => {
        const target = resolvePrivate(path);
        return target.provider.exists(target.path);
      },
      mkdir: async (path, options) => {
        const target = resolvePrivate(path);
        await target.provider.mkdir(target.path, options);
      },
      unlink: async (path) => {
        const target = resolvePrivate(path);
        await target.provider.unlink(target.path);
      },
      rmdir: async (path) => {
        const target = resolvePrivate(path);
        await target.provider.rmdir(target.path);
      },
      rename: async (from, to) => {
        const source = resolvePrivate(from);
        const destination = resolvePrivate(to);
        await source.provider.rename(source.path, destination.path);
      },
    };
    const lstat = async (path: string): Promise<FileStat> => {
      const { resolution } = resolveLocal(path);
      return resolution.provider.lstat(resolution.path);
    };
    const search = async (query: string, options?: IndexSearchOptions): Promise<FileStatEntry[]> => {
      assertCurrent();
      const index = await this._projectIndexes.ready(root);
      assertCurrent();
      options?.signal?.throwIfAborted();
      return index.search(query, options);
    };
    const statTree = async (
      path: string,
      options?: { admits?: IndexAdmits; signal?: AbortSignal },
    ): Promise<FileStatEntry[]> => {
      const { localPath } = resolveLocal(path);
      const index = await this._projectIndexes.ready(root);
      assertCurrent();
      options?.signal?.throwIfAborted();
      return index.statTree(localPath, options);
    };
    const facts = async (
      paths: readonly string[],
      options?: IndexFactsOptions,
    ): Promise<ReadonlyMap<string, ContentFacts>> => {
      const local = paths.map((path) => resolveLocal(path).localPath);
      const answered = await this._projectIndexes.facts(root, local, options);
      assertCurrent();
      return new Map(
        paths.flatMap((path, index) => {
          const value = answered.get(local[index]!);
          return value === undefined ? [] : [[path, value] as const];
        }),
      );
    };
    const changedSince = async (
      since: number,
      options?: { admits?: IndexAdmits; signal?: AbortSignal; epoch?: string },
    ): Promise<IndexChanges> => {
      assertCurrent();
      const index = await this._projectIndexes.ready(root);
      assertCurrent();
      options?.signal?.throwIfAborted();
      return index.changes(since, options);
    };
    const compareIndex = async (): Promise<IndexCompareResult> => {
      assertCurrent();
      const result = await this._projectIndexes.compare(root);
      assertCurrent();
      return result;
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
    /*
     * The change-set form (D6): one set per committed changeset that reaches
     * the request, spelled in this root's namespace. An entry with neither edge
     * inside the root is dropped; a move with one edge inside arrives as that
     * edge's creation or deletion; a reset above the root resets the root.
     */
    const toLocalEntry = (entry: ChangeSetEntry): ChangeSetEntry | undefined => {
      const path = toLocalPath(entry.path);
      if (entry.op !== 'moved' || entry.oldPath === undefined) {
        return path === undefined ? undefined : { ...entry, path };
      }
      const oldPath = toLocalPath(entry.oldPath);
      if (path !== undefined && oldPath !== undefined) {
        return { ...entry, path, oldPath };
      }
      if (path !== undefined) {
        return {
          op: 'created',
          path,
          kind: entry.kind,
          ...(entry.target === undefined ? {} : { target: entry.target }),
        };
      }
      return oldPath === undefined ? undefined : { op: 'deleted', path: oldPath, kind: entry.kind };
    };
    const toLocalSet = (set: ChangeSet): ChangeSet | undefined => {
      const base = {
        generation: set.generation,
        ...(set.origin === undefined ? {} : { origin: set.origin }),
        ...(set.backend === undefined ? {} : { backend: set.backend }),
      };
      if (set.reset !== undefined) {
        const resetPrefix = set.reset.prefix;
        const prefix =
          toLocalPath(resetPrefix) ?? (resetPrefix === '/' || root.startsWith(`${resetPrefix}/`) ? '' : undefined);
        return prefix === undefined
          ? undefined
          : { ...base, entries: [], touchedDirectories: [], reset: { prefix, reason: set.reset.reason } };
      }
      const entries = set.entries.flatMap((entry) => toLocalEntry(entry) ?? []);
      if (entries.length === 0) {
        return undefined;
      }
      const touchedDirectories = set.touchedDirectories.flatMap((directory) => toLocalPath(directory) ?? []);
      const segments = set.segments?.flatMap((segment) => {
        const path = toLocalPath(segment.path);
        return path === undefined ? [] : [{ path, writes: segment.writes }];
      });
      return {
        ...base,
        entries,
        touchedDirectories,
        ...(segments === undefined || segments.length === 0 ? {} : { segments }),
      };
    };
    const watchChangeSets = (request: ChangeSetWatchRequest, handler: (set: ChangeSet) => void): (() => void) => {
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
      unsubscribe = this._watchRegistry.watchChangeSets(
        {
          ...request,
          paths,
          includes: request.includes?.map(prefixGlob),
          excludes: request.excludes?.map(prefixGlob),
        },
        (set) => {
          if (!active) {
            return;
          }
          try {
            assertCurrent();
          } catch (error) {
            if (error instanceof RootedFileSystemError && error.code === 'ESTALE') {
              stop();
              handler({
                generation: set.generation,
                entries: [],
                touchedDirectories: [],
                reset: { prefix: '', reason: 'topology' },
              });
              return;
            }
            throw error;
          }
          const local = toLocalSet(set);
          if (local !== undefined) {
            handler(local);
          }
        },
        {
          authority: captured,
          ...(mutationContext?.originClientId === undefined ? {} : { skipOrigin: mutationContext.originClientId }),
        },
      );
      return stop;
    };
    return {
      id: 'workspace-root',
      capabilities: captured.provider.capabilities,
      dispose() {
        // The provider and rooted view lifetime remain owned by WorkspaceFileService.
      },
      ...(hashFiles === undefined ? {} : { hashFiles }),
      readFile,
      readFileStream,
      writeFile,
      writeFileChecked,
      deleteFileChecked,
      appendFile,
      appendFileFenced,
      readdir,
      readdirWithStats,
      readdirEntries,
      stat,
      getFileMode,
      setFileMode,
      mkdir,
      unlink,
      rmdir,
      rename,
      exists,
      lstat,
      watch,
      watchChangeSets,
      search,
      statTree,
      expectEntries: async (entries: readonly ExpectedEntry[]): Promise<void> => {
        assertCurrent();
        await this._projectIndexes.expect(
          root,
          entries.map((entry) => ({ ...entry, path: resolveLocal(entry.path).localPath })),
        );
      },
      pendingPaths: async (paths: readonly string[]): Promise<readonly string[]> => {
        assertCurrent();
        await this._projectIndexes.ready(root);
        const absent = (error: unknown): undefined => {
          if (!isNotFoundError(error)) {
            throw error;
          }
        };
        const pending = await mapConcurrent(paths, statConcurrency, async (path): Promise<boolean> => {
          const at = resolveLocal(path);
          if (projectIndexes.pendingAt(at.authorityPath) !== undefined) {
            return true;
          }
          /*
           * The index learns a placeholder from a read or a tree write, and a
           * lost or rescanned snapshot forgets it: its scans read no bytes
           * (I3). A file the size of a pointer is read raw, never through, so
           * no download starts; the read marks it pending. Only an absent path
           * is not pending: any other failure leaves it unknown, and rejects.
           */
          const size = await at.resolution.provider
            .stat(at.resolution.path)
            .then((stat) => (stat.type === 'file' ? stat.size : undefined), absent);
          if (size === undefined || size > 1024) {
            return false;
          }
          const read = await readMarked(at).catch(absent);
          return read?.object !== undefined;
        });
        return paths.filter((_, index) => pending[index]);
      },
      entriesLanded: (paths: readonly string[]): boolean | undefined =>
        this._projectIndexes.landed(
          root,
          paths.map((path) => resolveLocal(path).localPath),
        ),
      endExpectation: (): void => {
        this._projectIndexes.endExpectation(root);
      },
      facts,
      compareIndex,
      changedSince,
      copyTree,
      duplicate,
      move,
      apply,
      bulkMove,
      writeFiles,
      canMove,
      canRename,
      canCreate,
      canDelete,
      privateStore,
    };
  }
}
