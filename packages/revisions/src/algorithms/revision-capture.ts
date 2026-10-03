/**
 * Capturing a rooted filesystem as an immutable revision tree.
 *
 * The one walk every host records a revision from: the browser worker's
 * revision root, the Node daemon and the Electron utility all reach it through
 * `@taucad/revisions/revision-effects`, whose only capture filter is
 * `classify(path).versioned`. Capture itself excludes Tau's reserved staging
 * and backup siblings, so live comparisons and recording share that rule. It used to live beside the materialized-workspace
 * authority that W3d deleted; nothing about it was ever about materialization.
 */

import { parseTemporarySibling } from '#revision-temporary-sibling.js';
import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { bufferToStream } from '@taucad/filesystem/backend/stream-utils';
import { walk } from '@taucad/filesystem/content-ops';
import type { WalkFileSystem } from '@taucad/filesystem/content-ops';
import type { DirectoryEntry, FileMode, FileStatEntry, FileSystemProvider } from '@taucad/filesystem';
import { adoptRevisionTree, revisionTreeFiles } from '#algorithms/revision-tree.js';
import type { ImmutableRevisionTree, RevisionTreeFile } from '#algorithms/revision-tree.js';

/** Read capabilities required to capture one immutable revision tree. @public */
export type RevisionCaptureFileSystem = Pick<
  FileSystemProvider,
  'readFile' | 'readFileStream' | 'readdir' | 'readdirEntries' | 'stat' | 'getFileMode'
>;

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  ((error as NodeJS.ErrnoException).code === 'ENOENT' || (error as { name?: unknown }).name === 'NotFoundError');

/** Options for {@link captureRevisionTree}. @public */
export type CaptureRevisionTreeOptions = Readonly<{
  /** Rooted paths the walk must not descend into or record. */
  exclude?: (path: string) => boolean;
  /** File paths that must be present in the completed capture. */
  requiredPaths?: readonly string[];
  /** Mode inherited from the checkout's recorded base when this backend has no executable-bit support. */
  inheritedMode?: (path: string) => FileMode | undefined;
  /** Maximum number of file streams read at once. Defaults to 16. */
  concurrency?: number;
  /** Maximum aggregate file payload. Defaults to 1 GiB. */
  maximumTotalBytes?: number;
  /** Cancels traversal and all active file streams. */
  signal?: AbortSignal;
  /**
   * Bytes the caller already holds for a file it knows has not changed, read
   * instead of the file itself — see {@link createCaptureMemo}.
   */
  reuse?: (path: string) => Uint8Array<ArrayBuffer> | undefined;
  /**
   * Every file this capture did read, with the bytes it read. They are the
   * captured tree's own bytes, shared rather than copied: never write them.
   */
  onRead?: (path: string, content: Uint8Array<ArrayBuffer>) => void;
  /**
   * The last tree this checkout captured and every versioned path written
   * since (E1). Only those paths are listed and read; every other file is the
   * previous tree's own record, so its ids are memoised already. A path names a
   * file or a whole directory, present or gone. Omit it whenever the paths are
   * not known to be complete — a gap in the change bus, a write no watcher saw,
   * a first capture — and the capture walks everything.
   */
  changedSince?: Readonly<{ tree: ImmutableRevisionTree; paths: readonly string[] }>;
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
  filesystem: RevisionCaptureFileSystem,
  options?: CaptureRevisionTreeOptions,
): Promise<ImmutableRevisionTree> => {
  if (options?.changedSince === undefined) {
    return captureOnce(filesystem, options);
  }
  try {
    return await captureOnce(filesystem, options);
  } catch (error) {
    /* E1 trusts a change set only as far as the disk agrees with it. A path
     * spelled another way than the disk spells it, a parent that is now a file,
     * a collision in the derived tree, a failed read — each proves the set
     * cannot be trusted, and the capture walks everything, which answers or
     * fails on its own terms. A caller's abort is not a failure of the set. */
    if (options.signal?.aborted === true) {
      throw error;
    }
    return captureOnce(filesystem, { ...options, changedSince: undefined });
  }
};

const captureOnce = async (
  filesystem: RevisionCaptureFileSystem,
  options: CaptureRevisionTreeOptions | undefined,
): Promise<ImmutableRevisionTree> => {
  const concurrency = assertCaptureLimit(options?.concurrency ?? defaultCaptureConcurrency, 'concurrency', 256);
  const maximumTotalBytes = assertCaptureLimit(
    options?.maximumTotalBytes ?? defaultCaptureMaximumTotalBytes,
    'maximumTotalBytes',
    Number.MAX_SAFE_INTEGER,
  );
  const excluded = (path: string): boolean =>
    parseTemporarySibling(path) !== undefined || options?.exclude?.(path) === true;
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
  /*
   * A kind-carrying listing spares a `stat` per child — on OPFS `stat` reads a
   * text file whole to count its lines. A child that vanishes after the
   * listing is skipped by its read, exactly as one that vanishes after `stat`.
   */
  const listChildren = async (path: string): Promise<ReadonlyArray<{ name: string; kind?: 'file' | 'dir' }>> => {
    if (filesystem.readdirEntries !== undefined) {
      return filesystem.readdirEntries(path);
    }
    const names = await filesystem.readdir(path);
    return names.map((name) => ({ name }));
  };
  const statKind = async (path: string): Promise<'file' | 'dir' | undefined> => {
    const stat = await skipIfVanished(async () => filesystem.stat(path));
    return stat?.type;
  };
  /*
   * The listing surface `walk` traverses, which is where capture keeps what a
   * walker's contract does not carry: a directory that vanished between its
   * parent's listing and its own is empty rather than fatal, and a reserved
   * path is dropped before its kind is asked for, so an excluded entry costs no
   * `stat` and no descent.
   */
  const admittedChildren = async (path: string): Promise<DirectoryEntry[]> => {
    throwIfAborted();
    const children = await skipIfVanished(async () => listChildren(path));
    const admitted: DirectoryEntry[] = [];
    for (const child of children ?? []) {
      throwIfAborted();
      const childPath = joinRelativePath(path, child.name);
      if (excluded(childPath)) {
        continue;
      }
      // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential traversal avoids a second nested concurrency pool.
      const kind = child.kind ?? (await statKind(childPath));
      if (kind !== undefined) {
        admitted.push({ name: child.name, kind });
      }
    }
    return admitted;
  };
  const listing: WalkFileSystem = {
    readdir: async (path) => filesystem.readdir(path),
    stat: async (path) => filesystem.stat(path),
    readdirEntries: admittedChildren,
  };
  const filePaths: Array<Readonly<{ path: string; mode: FileMode }>> = [];
  const modeOf = async (path: string): Promise<FileMode> =>
    (filesystem.getFileMode === undefined
      ? undefined
      : await skipIfVanished(async () => filesystem.getFileMode!(path))) ??
    options?.inheritedMode?.(path) ??
    '100644';
  const listFiles = async (root: string): Promise<void> => {
    for await (const entry of walk(listing, root)) {
      throwIfAborted();
      if (entry.kind === 'dir') {
        continue;
      }
      const path = joinRelativePath(root, entry.relativePath);
      // oxlint-disable-next-line no-await-in-loop -- mode belongs to the entry reached by sequential traversal.
      filePaths.push({ path, mode: await modeOf(path) });
    }
  };
  const files = new Map<string, RevisionTreeFile>();
  const listings = new Map<string, Promise<DirectoryEntry[]>>();
  /*
   * What a changed path is on disk, resolved one segment at a time through
   * each parent's listing by exact name — so the tree records the disk's
   * spelling, as the full walk would. A parent that is missing or not a
   * directory, or a name the disk holds under another letter case or Unicode
   * form, throws: the change set and the disk disagree (review finding 1).
   */
  const kindOnDisk = async (root: string): Promise<'file' | 'dir' | undefined> => {
    const segments = root.split('/');
    let parent = '';
    for (const [index, segment] of segments.entries()) {
      const listing = listings.get(parent) ?? admittedChildren(parent);
      listings.set(parent, listing);
      // oxlint-disable-next-line no-await-in-loop -- each segment's listing is its parent's child.
      const children = await listing;
      const exact = children.find((child) => child.name === segment);
      const last = index === segments.length - 1;
      if (exact === undefined) {
        if (!last || children.some((child) => foldedName(child.name) === foldedName(segment))) {
          throw new Error(`The change set does not match the disk at ${root}.`);
        }
        return undefined;
      }
      if (last) {
        return exact.kind;
      }
      if (exact.kind !== 'dir') {
        throw new Error(`The change set does not match the disk at ${root}.`);
      }
      parent = joinRelativePath(parent, segment);
    }
    return undefined;
  };
  /*
   * E1: every file outside the changed paths is the previous tree's own
   * record; each changed path is asked of its parent's listing, which applies
   * `exclude` and answers file, directory or gone. Answers the bytes the kept
   * records already count against the budget.
   */
  const listChanged = async (previous: ImmutableRevisionTree, roots: ReadonlySet<string>): Promise<number> => {
    let keptBytes = 0;
    for (const [path, file] of revisionTreeFiles(previous)) {
      if (!isUnder(path, roots) && !isExcludedPath(path, excluded)) {
        files.set(path, file);
        keptBytes += file.content.byteLength;
      }
    }
    for (const root of roots) {
      /* A root inside another is read with it; one the walk could never
       * reach is not read at all. */
      if (hasAncestorIn(root, roots) || isExcludedPath(root, excluded)) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- sequential traversal, as the full walk.
      const kind = await kindOnDisk(root);
      if (kind === 'file') {
        // oxlint-disable-next-line no-await-in-loop -- sequential traversal, as the full walk.
        filePaths.push({ path: root, mode: await modeOf(root) });
      } else if (kind === 'dir') {
        // oxlint-disable-next-line no-await-in-loop -- sequential traversal, as the full walk.
        await listFiles(root);
      }
    }
    return keptBytes;
  };
  const changedSince = options?.changedSince;
  const changed = changedSince === undefined ? undefined : changedRoots(changedSince.paths);
  try {
    let capturedBytes =
      changedSince === undefined || changed === undefined ? 0 : await listChanged(changedSince.tree, changed);
    if (changed === undefined) {
      await listFiles('');
    }
    if (capturedBytes > maximumTotalBytes) {
      throw new RangeError(`Revision tree capture exceeds maximumTotalBytes (${maximumTotalBytes}).`);
    }
    let nextIndex = 0;
    let firstFailure: unknown;
    const captureFile = async (path: string, mode: FileMode): Promise<void> => {
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
        /* An unchanged file is bytes the caller already holds, so the cheapest
         * read of it is no read at all (EQ7). It still costs its own budget. */
        const held = options?.reuse?.(path);
        if (held !== undefined) {
          if (capturedBytes + held.byteLength > maximumTotalBytes) {
            throw new RangeError(`Revision tree capture exceeds maximumTotalBytes (${maximumTotalBytes}).`);
          }
          capturedBytes += held.byteLength;
          reservedBytes += held.byteLength;
          /* Bytes a capture read are shared, so their ids stay memoised across
           * cuts; anything else a caller hands in is copied, as the tree's
           * constructor would. */
          files.set(path, Object.freeze({ content: capturedBytesOf.has(held) ? held : new Uint8Array(held), mode }));
          return;
        }
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
        capturedBytesOf.add(content);
        files.set(path, Object.freeze({ content, mode }));
        options?.onRead?.(path, content);
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
          const file = filePaths[index]!;
          // oxlint-disable-next-line no-await-in-loop -- Each worker owns one sequential lane in the shared pool.
          await captureFile(file.path, file.mode);
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
    const missingRequired = [...requiredPaths].filter((path) => !files.has(path));
    if (missingRequired.length > 0) {
      throw new Error(`Required capture paths were not captured: ${missingRequired.join(', ')}`);
    }
    /* A file and a directory at one path cannot both be on disk, so a derived
     * tree that holds both throws here, and the caller walks everything. */
    return adoptRevisionTree(files);
  } finally {
    options?.signal?.removeEventListener('abort', abortFromCaller);
  }
};

/**
 * The changed paths as a set of canonical roots.
 *
 * @param paths - Root-relative paths from the change bus.
 * @returns The roots, or `undefined` when one names the whole tree and the
 *   capture must walk it.
 */
const changedRoots = (paths: readonly string[]): ReadonlySet<string> | undefined => {
  const roots = new Set(paths.map((path) => assertRootedPath(path)));
  return roots.has('') ? undefined : roots;
};

/* A name as a case-insensitive, normalizing disk compares it. */
const foldedName = (name: string): string => name.normalize('NFC').toLowerCase();

/* Whether any ancestor directory of a path is one of the roots. */
const hasAncestorIn = (path: string, roots: ReadonlySet<string>): boolean => {
  for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
    if (roots.has(path.slice(0, index))) {
      return true;
    }
  }
  return false;
};

/* Whether a path is one of the roots or inside one. */
const isUnder = (path: string, roots: ReadonlySet<string>): boolean => roots.has(path) || hasAncestorIn(path, roots);

/* The full walk never descends into an excluded directory, so neither may a changed path.
 * The path itself is asked of its parent's listing, which applies `exclude` already. */
const isExcludedPath = (path: string, excluded: ((path: string) => boolean) | undefined): boolean => {
  if (excluded === undefined) {
    return false;
  }
  if (excluded(path)) {
    return true;
  }
  for (let index = path.indexOf('/'); index !== -1; index = path.indexOf('/', index + 1)) {
    if (excluded(path.slice(0, index))) {
      return true;
    }
  }
  return false;
};

/*
 * Bytes a capture read itself. Only these are shared with a tree when a caller
 * hands them back through `reuse`: a buffer from anywhere else may still be
 * written by whoever made it, so it is copied.
 */
const capturedBytesOf = new WeakSet<Uint8Array<ArrayBuffer>>();

/**
 * The coarsest modification time a filesystem we capture through reports: FAT's
 * two seconds. Nothing advertises its own resolution, so the memo assumes the
 * worst and never trusts a stat this young (EQ7, C3).
 */
const timestampGranularityMilliseconds = 2000;

/**
 * How many bytes of one checkout a memo may keep resident, by default.
 *
 * Deliberately far below the capture's own 1 GiB payload bound: capture bytes
 * used to be transient, and every byte held here is held for as long as the
 * checkout is open, in a worker that also holds the kernel's own memory. Sixty
 * four mebibytes covers the many-small-files tree the memo exists for — a
 * project's sources, parameters and chats — and declines the single large mesh
 * whose re-read costs one stream and whose residency costs the tab.
 */
const defaultMemoRetainedBytes = 64 * 1024 * 1024;

/** Bytes one checkout's captures may reuse instead of reading. @public */
export type CaptureMemo = Readonly<{
  /**
   * The reuse options for one capture of the tree these stats describe.
   *
   * @param stats - Every file stat of the tree, or `undefined` from a surface
   *   that keeps none — which opts the capture out and pays the read.
   * @param observedAt - Clock reading taken no later than those stats were.
   * @returns Capture options that read only what changed.
   */
  unchanged: (
    stats: readonly FileStatEntry[] | undefined,
    observedAt: number,
  ) => Pick<CaptureRevisionTreeOptions, 'reuse' | 'onRead'>;
}>;

/**
 * Memoise one checkout's captured bytes on `(path, size, mtimeMs)` (EQ7).
 *
 * A cut over a tree nobody has touched reads no file bytes: the stats the
 * rooted surface already maintains answer what changed, and the bytes of what
 * did not come from the last capture. Two bounds make that trustworthy. A stat
 * younger than {@link timestampGranularityMilliseconds} cannot prove the bytes
 * it describes are the bytes that were read, so it is never memoised at all and
 * a same-size same-timestamp rewrite is read and seen (C3). And a capture whose
 * bytes did not match the size its stat claimed memoises nothing for that path.
 *
 * **What it retains is the captured trees' own bytes.** A capture shares the
 * bytes it read with the tree it builds and hands those same bytes to this
 * memo, and a reused file goes back into the next tree uncopied — so a memoised
 * file is resident once however many trees hold it, and its blob and pointer
 * ids stay memoised across cuts (E2, E3). The ceiling is still
 * {@link defaultMemoRetainedBytes} and not the capture's payload bound, because
 * what the memo holds outlives every tree built from it.
 *
 * ponytail: a byte budget with per-file admission, in capture order, and no
 * eviction — a file that does not fit is simply not held and pays its read next
 * time, so a tree larger than the budget keeps the first files that fit rather
 * than the most useful ones. Upgrade path: an LRU here.
 *
 * @param options - Byte ceiling for what this memo keeps resident.
 * @returns A memo to hand the captures of one checkout, dropped with it.
 * @public
 */
export const createCaptureMemo = (options?: Readonly<{ maximumRetainedBytes?: number }>): CaptureMemo => {
  const budget = assertCaptureLimit(
    options?.maximumRetainedBytes ?? defaultMemoRetainedBytes,
    'maximumRetainedBytes',
    Number.MAX_SAFE_INTEGER,
  );
  const held = new Map<string, Readonly<{ size: number; mtimeMs: number; content: Uint8Array<ArrayBuffer> }>>();
  let retainedBytes = 0;
  const drop = (path: string): void => {
    const entry = held.get(path);
    if (entry !== undefined) {
      retainedBytes -= entry.content.byteLength;
      held.delete(path);
    }
  };
  return {
    unchanged: (stats, observedAt) => {
      if (stats === undefined) {
        held.clear();
        retainedBytes = 0;
        return {};
      }
      const byPath = new Map(stats.map((entry) => [entry.path, entry]));
      for (const path of held.keys()) {
        if (!byPath.has(path)) {
          drop(path);
        }
      }
      return {
        reuse: (path) => {
          const stat = byPath.get(path);
          const entry = held.get(path);
          return entry !== undefined && entry.size === stat?.size && entry.mtimeMs === stat.mtimeMs
            ? entry.content
            : undefined;
        },
        onRead: (path, content) => {
          const stat = byPath.get(path);
          drop(path);
          if (
            stat === undefined ||
            stat.size !== content.byteLength ||
            observedAt - stat.mtimeMs <= timestampGranularityMilliseconds ||
            retainedBytes + content.byteLength > budget
          ) {
            return;
          }
          retainedBytes += content.byteLength;
          held.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, content });
        },
      };
    },
  };
};
