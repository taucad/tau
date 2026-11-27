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
  AuthorityCheckedFileWrite,
  CheckedFileWrite,
  CheckedFileWriteResult,
  FileWritePrecondition,
  FileStat,
  FileStatEntry,
} from '@taucad/types';
import { assertRootedPath, joinRelativePath, normalizePath, resolveAuthorityPath } from '@taucad/utils/path';
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
  DeclaredPlaceholder,
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
import { RootedFileSystemError, WorkspaceMutationError } from '#workspace-errors.js';
import { mapConcurrent, statConcurrency } from '#concurrency.js';
import { bufferToStream, validateFileReadStreamOptions } from '#backend/stream-utils.js';
import { getEventOrigin } from '#event-origin-registry.js';
import {
  PendingContentError,
  asMarkedRow,
  mayBePointerSize,
  pendingObjectOf,
  readAsMarked,
  readThroughPending,
} from '#pending-content.js';
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
  /**
   * The checked write whose preconditions may name a digest (charter D17): the
   * authority reads and hashes each named file under the write's locks, and
   * answers the digest of what it wrote. `writeFileChecked` is the same call
   * for byte preconditions only, as a provider's own checked write is typed.
   */
  writeFileCheckedDigest(input: AuthorityCheckedFileWrite): Promise<CheckedFileWriteResult>;
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
    expectEntries?(
      entries: readonly ExpectedEntry[],
      options?: Readonly<{ removing?: readonly string[] }>,
    ): Promise<void>;
    /**
     * Declare which files under this root are placeholders (D9), as the revision layer, their only writer, knows them:
     * each declared file still at its pointer's size is pending on its object, and every other pending entry the
     * declaration speaks for stops being one. `paths` names the files it speaks for; omitted, it speaks for the whole
     * root. `basis` is the {@link declarationBasis} it was found on: a whole declaration a tree write's expectation
     * has overtaken since speaks for an older tree, and changes nothing. Optional: only the authority's own view
     * keeps an index.
     */
    declarePending?(
      declared: ReadonlyMap<string, DeclaredPlaceholder>,
      paths?: readonly string[],
      options?: Readonly<{ basis?: number }>,
    ): Promise<void>;
    /**
     * Where this root's announced tree writes stand (D10): taken before a look at the checkout and passed with what it
     * declares, so a declaration a newer tree write has overtaken does not speak for it.
     */
    declarationBasis?(): number;
    /**
     * Let go of this root before its first whole declaration (D9): the revision layer's first capture of it ended
     * without one. Every other view, held since the revision layer's view of the root was made so a placeholder is
     * never shown as a small present file (I7), answers from the marks there are. Heard only from a raw view.
     */
    releaseDeclaration?(): void;
    /**
     * Which of these files the root's index holds as pending entries: the
     * placeholders the revision layer declared, as a non-raw view's stat
     * answers them (D9). Reads no bytes.
     */
    pendingPaths?(paths: readonly string[]): Promise<readonly string[]>;
    /** Whether these paths of the expected tree have all landed; `undefined` while no tree is expected here. */
    entriesLanded?(paths: readonly string[]): boolean | undefined;
    /** End this root's expectation: the tree write is over, and `failed` when it did not land every path. */
    endExpectation?(options?: Readonly<{ failed?: boolean }>): void;
    /**
     * Be told as this root's tree write ends, `failed` when it did not land every path: from a failure until the
     * root's next expectation or end, `entriesLanded` answers `false` (I7).
     */
    onExpectationEnd?(listener: (outcome: Readonly<{ failed: boolean }>) => void): () => void;
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
    if (raw) {
      /*
       * A configured route is known already, and keeps what it is. A root a host mounted itself (a checkout the
       * worker mounts on demand) becomes the revision layer's here, unknown until its first declaration.
       */
      projectIndexes.awaitDeclaration(root, this._pendingStallMilliseconds);
    }

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
     * A pending entry is a file the revision layer declared a placeholder (D9),
     * one mark in the index: a marked file stats as its object and reads
     * through to it, and anything else is the bytes it holds. The raw view, the
     * revision layer's own, sees the pointers it wrote.
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
    /* The object a file of this size stands for: marked, and still the size of the pointer the index holds. */
    const markedAt = (authorityPath: string, size: number): PendingObject | undefined =>
      raw ? undefined : projectIndexes.pendingAt(authorityPath, size);
    /*
     * A path a tree write landing under this root has yet to land or remove is read once the write has (D10, I7): a
     * read, stat or listing of it waits, never answering the bytes it held before or a missing file. The raw view,
     * the writer's own, reads the disk; so does every view while no write is landing.
     */
    const landed = async (
      at: ReturnType<typeof resolveLocal>,
      options?: Readonly<{ listing?: boolean; signal?: AbortSignal | undefined }>,
    ): Promise<void> => {
      if (raw) {
        return;
      }
      await projectIndexes.untilLanded(at.authorityPath, { ...options, stallMilliseconds });
      assertCurrent();
    };
    /*
     * What each row of a listing answers, waiting for nothing (D9, I7): a durable root's stored marks are read first
     * (one read), and a row nothing answers yet is reported `pending` at its own size, so one such row never holds the
     * others. Only a stat of a file waits, and only for itself.
     */
    const listed = async <Row extends Readonly<{ type: string; size: number; mtimeMs?: number }>>(
      rows: readonly Row[],
      at: (row: Row) => string,
    ): Promise<Row[]> => {
      if (raw) {
        return [...rows];
      }
      if (rows.some((row) => row.type === 'file' && mayBePointerSize(row.size))) {
        await projectIndexes.storedMarks(root);
      }
      /* Only a pointer-sized row the index has not answered as its object can be anything but what it is. */
      return rows.map((row) =>
        row.type === 'file' && mayBePointerSize(row.size) && !('pending' in row)
          ? asMarkedRow(row, projectIndexes.markAt(at(row), row))
          : row,
      );
    };
    const settledStat = async <Row extends FileStat>(at: ReturnType<typeof resolveLocal>, row: Row): Promise<Row> =>
      raw || row.type !== 'file'
        ? row
        : asMarkedRow(
            row,
            await projectIndexes.settleMarks({
              root,
              authorityPath: at.authorityPath,
              size: row.size,
              mtimeMs: row.mtimeMs,
              bytes: async () => at.resolution.provider.readFile(at.resolution.path).catch(() => undefined),
            }),
          );
    /* One file's bytes on disk, and what the path answers: through to its object when it is a placeholder. */
    const readAnswered = async (
      at: ReturnType<typeof resolveLocal>,
      signal?: AbortSignal,
    ): Promise<Readonly<{ bytes: Uint8Array<ArrayBuffer>; answer: Uint8Array<ArrayBuffer> }>> => {
      const bytes = await at.resolution.provider.readFile(at.resolution.path);
      if (raw) {
        return { bytes, answer: bytes };
      }
      const answer = await readAsMarked(projectIndexes, pendingSource(), {
        authorityPath: at.authorityPath,
        root,
        path: at.localPath,
        bytes,
        mtimeMs: async () => {
          try {
            const head = await at.resolution.provider.stat(at.resolution.path);
            return head.mtimeMs;
          } catch {
            return undefined;
          }
        },
        signal,
        stallMilliseconds,
      });
      return { bytes, answer };
    };
    function readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
    function readFile(path: string, encoding: 'utf8'): Promise<string>;
    async function readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
      const at = resolveLocal(path);
      await landed(at);
      const observedAt = Date.now();
      const { bytes, answer } = await readAnswered(at);
      if (encoding === 'utf8') {
        return utf8.decode(answer);
      }
      /* A whole read already holds every fact a listing asks for (D4): keep them. */
      projectIndexes.recordRead(root, at.localPath, { bytes, observedAt });
      return answer;
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
    const storedHashFiles =
      providerHashFiles === undefined
        ? indexHashFiles
        : async (paths: readonly string[]): Promise<Record<string, string>> => {
            const providerPaths = paths.map((path) => resolveLocal(path).resolution.path);
            const digests = await providerHashFiles(providerPaths);
            assertCurrent();
            return Object.fromEntries(paths.map((path, index) => [path, digests[providerPaths[index]!]!]));
          };
    /* A pending entry digests as its object: a git-lfs oid is the object's SHA-256, so nothing is fetched (D9). */
    const hashFiles =
      storedHashFiles === undefined || raw
        ? storedHashFiles
        : async (paths: readonly string[]): Promise<Record<string, string>> => {
            await projectIndexes.ready(root);
            /* A mark answers only while the file is still its pointer's size: a stat says so, from metadata alone. */
            const marks = await mapConcurrent(paths, statConcurrency, async (path) => {
              const at = resolveLocal(path);
              if (projectIndexes.pendingAt(at.authorityPath) === undefined) {
                return undefined;
              }
              try {
                const head = await at.resolution.provider.stat(at.resolution.path);
                return head.type === 'file' ? projectIndexes.pendingAt(at.authorityPath, head.size) : undefined;
              } catch {
                return undefined;
              }
            });
            const rest = paths.filter((_, index) => marks[index] === undefined);
            const digests = rest.length === 0 ? {} : await storedHashFiles(rest);
            return Object.fromEntries(paths.map((path, index) => [path, marks[index]?.oid ?? digests[path]!]));
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
        await landed(at, { signal: options?.signal });
        if (await small()) {
          const { answer } = await readAnswered(at, options?.signal);
          return bufferToStream(answer, options).getReader();
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
      const at = resolveLocal(path);
      await landed(at, { listing: true });
      return at.resolution.provider.readdir(at.resolution.path);
    };
    /*
     * What a tree write has yet to land under a directory (D10, I7): a listing shows each such entry as a pending row
     * at the size the tree gives it, never missing, and a folder only such entries make lists before it exists. Read
     * before the provider's listing, so an entry that lands in between is the row on disk; the raw view sees the disk.
     */
    const arrivingIn = (authorityPath: string, recursive?: boolean): ReturnType<ProjectIndexes['arrivingIn']> =>
      raw ? [] : projectIndexes.arrivingIn(authorityPath, { recursive });
    /*
     * Arriving rows not on disk vanish without a disk event of their own: as a write ends, each directory holding the
     * outermost of them raises `directoryChanged`, so every watch at or under it lists again (I7).
     */
    const relistArriving = (arriving: ReturnType<ProjectIndexes['arrivingIn']>): void => {
      const rows = new Set(arriving.map((entry) => entry.path));
      const parents = new Set<string>();
      for (const { path } of arriving) {
        const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
        if (!rows.has(parent)) {
          parents.add(parent);
        }
      }
      this._pipeline.emitChangeEvents(
        [...parents].map((parent) => {
          const at = resolveLocal(parent);
          return {
            event: { type: 'directoryChanged', path: at.authorityPath, backend: at.resolution.backend },
            operations: [{ path: at.authorityPath, resolution: at.resolution }],
          };
        }),
        mutationContext,
      );
    };
    const isMissing = (error: unknown): boolean => (error as { code?: unknown } | undefined)?.code === 'ENOENT';
    const readdirWithStats = captured.provider.readdirWithStats
      ? async (path: string): Promise<DirectoryStatRow[]> => {
          const { authorityPath, resolution } = resolveLocal(path);
          const arriving = arrivingIn(authorityPath);
          let rows: DirectoryStatRow[];
          try {
            rows = await resolution.provider.readdirWithStats!(resolution.path);
          } catch (error) {
            if (arriving.length === 0 || !isMissing(error)) {
              throw error;
            }
            rows = [];
          }
          const parent = authorityPath === '/' ? '' : authorityPath;
          const answered = await listed(rows, (row) => `${parent}/${row.name}`);
          const names = new Set(answered.map((row) => row.name));
          for (const entry of arriving) {
            if (!names.has(entry.path)) {
              answered.push(
                entry.type === 'dir'
                  ? { name: entry.path, type: 'dir', size: 0, mtimeMs: 0, pending: true, arriving: true }
                  : { name: entry.path, type: 'file', size: entry.size, mtimeMs: 0, pending: true, arriving: true },
              );
            }
          }
          return answered;
        }
      : undefined;
    const stat = async (path: string): Promise<FileStat> => {
      const at = resolveLocal(path);
      await landed(at);
      return settledStat(at, await at.resolution.provider.stat(at.resolution.path));
    };
    const readdirEntries = captured.provider.readdirEntries
      ? async (path: string): Promise<DirectoryEntry[]> => {
          const at = resolveLocal(path);
          await landed(at, { listing: true });
          return at.resolution.provider.readdirEntries!(at.resolution.path);
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
    const writeFileChecked = async (input: AuthorityCheckedFileWrite): Promise<CheckedFileWriteResult> => {
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
      const bytes = await from.resolution.provider.readFile(from.resolution.path);
      /* Only a marked placeholder is one: an unmarked pointer is a person's text, copied as it is. */
      const object = markedAt(from.authorityPath, bytes.byteLength) === undefined ? undefined : pendingObjectOf(bytes);
      /* A copy of a marked placeholder is one too, so its stat agrees with its read. */
      const markCopy = (): void => {
        if (object !== undefined) {
          projectIndexes.markPending(to.authorityPath, object, { size: bytes.byteLength });
        }
      };
      if (raw || object === undefined || pendingSource() === undefined) {
        /* Nothing is written yet: a copy stopped here leaves the target as it was. */
        options?.signal?.throwIfAborted();
        await writeFile(target, bytes);
        markCopy();
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
      if (!untracked) {
        markCopy();
      }
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
      const at = resolveLocal(path);
      await landed(at);
      return at.resolution.provider.exists(at.resolution.path);
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
      /* A streamed write commits whole or not at all, by the provider's own staging (W6.3); offered
       * only where the provider holds a chunk at a time, so streaming never costs the object twice (W6.4). */
      ...(captured.provider.writeFileStream === undefined || captured.provider.capabilities.streamsWrites !== true
        ? {}
        : {
            writeFileStream: async (path: string, source: ReadableStream<Uint8Array<ArrayBuffer>>) => {
              let target: ReturnType<typeof resolvePrivate>;
              try {
                target = resolvePrivate(path);
              } catch (error) {
                /* Refused before the provider saw it: nothing else will release the source. */
                await source.cancel(error).catch(() => undefined);
                throw error;
              }
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
      const at = resolveLocal(path);
      await landed(at);
      return settledStat(at, await at.resolution.provider.lstat(at.resolution.path));
    };
    const search = async (query: string, options?: IndexSearchOptions): Promise<FileStatEntry[]> => {
      assertCurrent();
      const index = await this._projectIndexes.ready(root);
      assertCurrent();
      options?.signal?.throwIfAborted();
      return listed(
        index.search(query, { ...options, asObjects: !raw }),
        (row) => resolveLocal(row.path).authorityPath,
      );
    };
    const statTree = async (
      path: string,
      options?: { admits?: IndexAdmits; signal?: AbortSignal },
    ): Promise<FileStatEntry[]> => {
      const { localPath, authorityPath } = resolveLocal(path);
      const index = await this._projectIndexes.ready(root);
      assertCurrent();
      options?.signal?.throwIfAborted();
      const arriving = arrivingIn(authorityPath, true);
      const answered = await listed(
        index.statTree(localPath, { ...options, asObjects: !raw }),
        (row) => resolveLocal(joinRelativePath(localPath, row.path)).authorityPath,
      );
      if (arriving.length === 0) {
        return answered;
      }
      const admits = options?.admits;
      const paths = new Set(answered.map((row) => row.path));
      const admitted = new Set(arriving.flatMap((entry) => (entry.type === 'dir' ? [] : [entry.path])));
      for (const entry of arriving) {
        /* A folder the mask refuses refuses everything beneath it, as the index's own walk prunes it. */
        if (admits !== undefined && !admits(entry.path, entry.type)) {
          for (const file of admitted) {
            if (file === entry.path || file.startsWith(`${entry.path}/`)) {
              admitted.delete(file);
            }
          }
        }
      }
      for (const entry of arriving) {
        if (entry.type === 'file' && admitted.has(entry.path) && !paths.has(entry.path)) {
          const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
          answered.push({
            path: entry.path,
            name,
            type: 'file',
            size: entry.size,
            mtimeMs: 0,
            pending: true,
            arriving: true,
          });
        }
      }
      return answered;
    };
    const facts = async (
      paths: readonly string[],
      options?: IndexFactsOptions,
    ): Promise<ReadonlyMap<string, ContentFacts>> => {
      if (!raw) {
        await projectIndexes.ready(root);
      }
      /* A pending entry's facts are unknown until its object lands (I7): the pointer's describe the pointer. */
      const asked = paths.flatMap((path) => {
        const at = resolveLocal(path);
        return !raw && projectIndexes.pendingAt(at.authorityPath) !== undefined ? [] : [[path, at.localPath] as const];
      });
      const answered = await this._projectIndexes.facts(
        root,
        asked.map(([, local]) => local),
        options,
      );
      assertCurrent();
      return new Map(
        asked.flatMap(([path, local]) => {
          const value = answered.get(local);
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
      if (raw) {
        return index.changes(since, options);
      }
      const changes = index.changes(since, options);
      /* A pending entry as its object, as a stat answers it, the pointer's own facts dropped; and so are the facts of an
       * entry nothing answers yet, which may be a placeholder (I7). */
      return {
        ...changes,
        entries: changes.entries.map((entry) => {
          const unknown =
            entry.pending === undefined &&
            entry.kind === 'file' &&
            mayBePointerSize(entry.size) &&
            projectIndexes.markAt(resolveLocal(entry.path).authorityPath, entry) === 'unknown';
          if (entry.pending === undefined && !unknown) {
            return entry;
          }
          const { facts: _facts, factsAt: _factsAt, ...rest } = entry;
          return entry.pending === undefined ? rest : { ...rest, size: entry.pending.size };
        }),
      };
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
      writeFileCheckedDigest: writeFileChecked,
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
      declarePending: async (
        declared: ReadonlyMap<string, DeclaredPlaceholder>,
        paths?: readonly string[],
        declareOptions?: Readonly<{ basis?: number }>,
      ): Promise<void> => {
        assertCurrent();
        const local = (path: string): string => resolveLocal(path).localPath;
        await this._projectIndexes.declarePending(
          root,
          new Map([...declared].map(([path, placeholder]) => [local(path), placeholder])),
          { paths: paths?.map((path) => local(path)), basis: declareOptions?.basis },
        );
      },
      declarationBasis: (): number => this._projectIndexes.declarationBasis(root),
      releaseDeclaration: (): void => {
        assertCurrent();
        /* Only the revision layer's own view may let go of its root. */
        if (raw) {
          this._projectIndexes.releaseDeclaration(root);
        }
      },
      expectEntries: async (
        entries: readonly ExpectedEntry[],
        expectOptions?: Readonly<{ removing?: readonly string[] }>,
      ): Promise<void> => {
        assertCurrent();
        await this._projectIndexes.expect(
          root,
          entries.map((entry) => ({ ...entry, path: resolveLocal(entry.path).localPath })),
          expectOptions?.removing?.map((path) => resolveLocal(path).localPath),
        );
      },
      pendingPaths: async (paths: readonly string[]): Promise<readonly string[]> => {
        assertCurrent();
        await this._projectIndexes.ready(root);
        return paths.filter((path) => projectIndexes.pendingAt(resolveLocal(path).authorityPath) !== undefined);
      },
      entriesLanded: (paths: readonly string[]): boolean | undefined =>
        this._projectIndexes.landed(
          root,
          paths.map((path) => resolveLocal(path).localPath),
        ),
      endExpectation: (options?: Readonly<{ failed?: boolean }>): void => {
        /*
         * The rows a listing showed arriving have nothing to replace them once the write ends: a folder only they
         * made raises no event of its own. Each directory holding the outermost of them is told to re-list, so
         * every watch at or under it does, failed or not (I7).
         */
        /* Only rows not on disk: a placeholder whose pointer landed is a row of its own, replaced as its object lands. */
        const arriving = projectIndexes.arrivingIn(root, { recursive: true, absent: true });
        this._projectIndexes.endExpectation(root, options);
        relistArriving(arriving);
      },
      onExpectationEnd: (listener: (outcome: Readonly<{ failed: boolean }>) => void): (() => void) =>
        this._projectIndexes.onExpectationEnd((ended, failed) => {
          if (ended === normalizePath(root)) {
            listener({ failed });
          }
        }),
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
