/**
 * Capturing a rooted filesystem as an immutable revision tree.
 *
 * The one walk every host records a revision from: the browser worker's
 * revision root, the Node daemon and the Electron utility all reach it through
 * `@taucad/revisions/revision-effects`, whose only capture filter is
 * `classify(path).versioned`. It used to live beside the materialized-workspace
 * authority that W3d deleted; nothing about it was ever about materialization.
 */

import { assertRootedPath, joinRelativePath } from '@taucad/utils/path';
import { bufferToStream } from '@taucad/filesystem/backend/stream-utils';
import { walk } from '@taucad/filesystem/content-ops';
import type { WalkFileSystem } from '@taucad/filesystem/content-ops';
import type { DirectoryEntry, FileMode, FileStatEntry, FileSystemProvider } from '@taucad/filesystem';
import { ImmutableRevisionTree } from '#algorithms/revision-tree.js';
import type { RevisionTreeInput } from '#algorithms/revision-tree.js';

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
  /** Every file this capture did read, with the bytes it read. */
  onRead?: (path: string, content: Uint8Array<ArrayBuffer>) => void;
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
  const listing: WalkFileSystem = {
    readdir: async (path) => filesystem.readdir(path),
    stat: async (path) => filesystem.stat(path),
    readdirEntries: async (path) => {
      throwIfAborted();
      const children = await skipIfVanished(async () => listChildren(path));
      const admitted: DirectoryEntry[] = [];
      for (const child of children ?? []) {
        throwIfAborted();
        const childPath = joinRelativePath(path, child.name);
        if (excluded?.(childPath) === true) {
          continue;
        }
        // oxlint-disable-next-line eslint/no-await-in-loop -- Sequential traversal avoids a second nested concurrency pool.
        const kind = child.kind ?? (await statKind(childPath));
        if (kind !== undefined) {
          admitted.push({ name: child.name, kind });
        }
      }
      return admitted;
    },
  };
  const filePaths: Array<Readonly<{ path: string; mode: FileMode }>> = [];
  try {
    for await (const entry of walk(listing, '')) {
      throwIfAborted();
      if (entry.kind === 'dir') {
        continue;
      }
      const mode =
        (filesystem.getFileMode === undefined
          ? undefined
          : // oxlint-disable-next-line no-await-in-loop -- mode belongs to the entry reached by sequential traversal.
            await skipIfVanished(async () => filesystem.getFileMode!(entry.relativePath))) ??
        options?.inheritedMode?.(entry.relativePath) ??
        '100644';
      filePaths.push({ path: entry.relativePath, mode });
    }
    const entries = Array.from<RevisionTreeInput | undefined>({
      length: filePaths.length,
    });
    let nextIndex = 0;
    let capturedBytes = 0;
    let firstFailure: unknown;
    const captureFile = async (path: string, mode: FileMode, index: number): Promise<void> => {
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
          entries[index] = [path, held, mode];
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
        entries[index] = [path, content, mode];
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
          await captureFile(file.path, file.mode, index);
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
    const completeEntries = entries.filter((entry): entry is RevisionTreeInput => entry !== undefined);
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

/**
 * The coarsest modification time a filesystem we capture through reports: FAT's
 * two seconds. Nothing advertises its own resolution, so the memo assumes the
 * worst and never trusts a stat this young (EQ7, C3).
 */
const timestampGranularityMilliseconds = 2000;

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
 * ponytail: one tree's bytes, held until the tree shrinks below them — the map
 * is pruned to the paths each capture's stats name, so it is bounded by the
 * capture's own `maximumTotalBytes` rather than by a budget of its own. Give it
 * a byte ceiling if a project ever opens more checkouts than a tab can hold.
 *
 * @returns A memo to hand the captures of one checkout, dropped with it.
 * @public
 */
export const createCaptureMemo = (): CaptureMemo => {
  const held = new Map<string, Readonly<{ size: number; mtimeMs: number; content: Uint8Array<ArrayBuffer> }>>();
  return {
    unchanged: (stats, observedAt) => {
      if (stats === undefined) {
        held.clear();
        return {};
      }
      const byPath = new Map(stats.map((entry) => [entry.path, entry]));
      for (const path of held.keys()) {
        if (!byPath.has(path)) {
          held.delete(path);
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
          if (
            stat === undefined ||
            stat.size !== content.byteLength ||
            observedAt - stat.mtimeMs <= timestampGranularityMilliseconds
          ) {
            held.delete(path);
            return;
          }
          held.set(path, { size: stat.size, mtimeMs: stat.mtimeMs, content });
        },
      };
    },
  };
};
