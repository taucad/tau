/**
 * Calls the bridge answers on the host's side of the wire when the handler set
 * does not bring its own: `hashFiles`, `readMany`, `readRange`, `glob`, `grep`
 * and `indexStats` — and the wire form of `apply`'s receipt.
 *
 * Each is derived from the connection's own `readFile` (and `readFileStream`
 * for ranges, `statTree` for the index queries), so the view's mask applies,
 * and each answers where the bytes live: one round trip, bodies only where the
 * caller asked for bodies.
 */
import { headSniffByteLength, seemsBinary } from '@taucad/filesystem';
import type { Changeset, ChangesetReceipt, ContentFacts, IndexChanges } from '@taucad/filesystem';
import type { BridgeServerLongCall, StringKeyedObject } from '@taucad/rpc/bridge';
import type { FileStatEntry } from '@taucad/types';
import { sha256Bytes } from '@taucad/utils/hash';
import type {
  FactsOptions,
  FactsWireRows,
  FileSystemBridgeChangeset,
  GlobOptions,
  GrepMatch,
  GrepOptions,
  GrepResult,
  IndexChangedSince,
  IndexChangedSinceOptions,
  IndexStats,
  LongCall,
  ReadManyWireRows,
} from '#filesystem-bridge-protocol.js';
import {
  defaultGrepFileBytes,
  defaultGrepResults,
  fileSystemLongCalls,
  maxGrepLineCharacters,
  maxReadManyBytes,
} from '#filesystem-bridge-protocol.js';
import { ownedForTransfer } from '#filesystem-bridge-crossings.js';
import { boundedLineMatcher, literalLineMatcher } from '#filesystem-bridge-grep-matcher.js';
import type { FileLineMatcher, GrepMatcherWorkerFactory } from '#filesystem-bridge-grep-matcher.js';

/** Reads one `readMany` keeps in flight: enough to overlap I/O, few enough to bound open handles. */
const readManyConcurrency = 8;

/** Milliseconds between progress reports, so a call over thousands of small files sends tens of frames, not thousands. */
const progressInterval = 100;

type ReadBytes = (path: string) => Promise<Uint8Array<ArrayBuffer>>;
type StatTree = (path: string) => Promise<FileStatEntry[]>;
type Apply = (changeset: Changeset) => Promise<ChangesetReceipt>;
type Facts = (
  paths: readonly string[],
  options?: FactsOptions & LongCall,
) => Promise<ReadonlyMap<string, ContentFacts>>;
type ChangedSince = (since: number, options?: IndexChangedSinceOptions & LongCall) => Promise<IndexChanges>;
type ReadStream = (
  path: string,
  options: { readonly position: number; readonly length: number },
) => ReadableStream<Uint8Array<ArrayBuffer>>;

const isAbsence = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | undefined)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

const abortError = (): DOMException => new DOMException('The operation was aborted.', 'AbortError');

const throwIfAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted) {
    throw abortError();
  }
};

const codedError = (message: string, code: string): Error => Object.assign(new Error(message), { code });

/**
 * Run `work` once per item with bounded concurrency, stopping at the caller's
 * abort and reporting progress at most every {@link progressInterval}.
 */
const forEachReported = async <Item>(
  items: readonly Item[],
  options: LongCall | undefined,
  work: (item: Item, index: number) => Promise<number>,
): Promise<void> => {
  const signal = options?.signal;
  const onProgress = options?.onProgress;
  let next = 0;
  let done = 0;
  let bytes = 0;
  let reportedAt = Number.NEGATIVE_INFINITY;
  /* Set by the first lane that fails, so no other lane takes another item. */
  let stopped = false;
  const report = (final: boolean): void => {
    const now = performance.now();
    if (onProgress === undefined || (!final && now - reportedAt < progressInterval)) {
      return;
    }
    reportedAt = now;
    onProgress({ done, total: items.length, bytes });
  };
  const lane = async (): Promise<void> => {
    while (!stopped && next < items.length) {
      if (signal?.aborted) {
        stopped = true;
        throw abortError();
      }
      const index = next++;
      let read: number;
      try {
        /* Await first, then add: `bytes += await …` reads `bytes` before the
         * await, so lanes finishing side by side would overwrite each other. */
        // oxlint-disable-next-line no-await-in-loop -- one lane reads one file after another; lanes run side by side.
        read = await work(items[index]!, index);
      } catch (error) {
        stopped = true;
        throw error;
      }
      bytes += read;
      done += 1;
      report(false);
    }
  };
  await Promise.all(Array.from({ length: Math.min(readManyConcurrency, items.length) }, lane));
  report(true);
};

const concatenate = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>, size: number): Uint8Array<ArrayBuffer> => {
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

const hostHashFiles =
  (read: ReadBytes) =>
  async (paths: readonly string[], options?: LongCall): Promise<Record<string, string>> => {
    const digests: Array<[string, string]> = Array.from({ length: paths.length });
    await forEachReported(paths, options, async (path, index) => {
      try {
        const data = await read(path);
        digests[index] = [path, await sha256Bytes(data)];
        return data.byteLength;
      } catch (error) {
        if (isAbsence(error)) {
          digests[index] = [path, 'missing'];
          return 0;
        }
        throw error;
      }
    });
    return Object.fromEntries(digests);
  };

const hostReadMany =
  (read: ReadBytes) =>
  async (paths: readonly string[], options?: LongCall): Promise<ReadManyWireRows> => {
    const unique = [...new Set(paths)];
    const rows: ReadManyWireRows = Array.from({ length: unique.length });
    let total = 0;
    await forEachReported(unique, options, async (path, index) => {
      try {
        const bytes = await read(path);
        total += bytes.byteLength;
        if (total > maxReadManyBytes) {
          throw codedError(`readMany passed its ${String(maxReadManyBytes)}-byte total at '${path}'.`, 'EFBIG');
        }
        const data = ownedForTransfer(path, bytes);
        rows[index] = [path, data];
        return data.byteLength;
      } catch (error) {
        if (isAbsence(error)) {
          rows[index] = [path, 'missing'];
          return 0;
        }
        throw error;
      }
    });
    return rows;
  };

const hostReadRange =
  (read: ReadBytes, stream: ReadStream | undefined) =>
  async (path: string, offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> => {
    let data: Uint8Array<ArrayBuffer>;
    if (length === 0) {
      data = new Uint8Array(0);
    } else if (stream === undefined) {
      /* No seekable stream: read whole and keep only the range, in a buffer of its own. */
      const whole = await read(path);
      data = whole.slice(Math.min(offset, whole.byteLength), Math.min(offset + length, whole.byteLength));
    } else {
      const reader = stream(path, { position: offset, length }).getReader();
      const chunks: Array<Uint8Array<ArrayBuffer>> = [];
      let size = 0;
      // oxlint-disable-next-line no-await-in-loop -- a stream is read one chunk after another.
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        chunks.push(chunk.value);
        size += chunk.value.byteLength;
      }
      data = concatenate(chunks, size);
    }
    return ownedForTransfer(path, data);
  };

/**
 * The index's file rows under `path`, each with its root-relative path: the
 * index answers a subtree's rows relative to that subtree, and patterns match
 * against the root-relative path.
 */
const rowsUnder = async (statTree: StatTree, path: string): Promise<FileStatEntry[]> => {
  const rows = await statTree(path);
  return path === '' ? rows : rows.map((row) => ({ ...row, path: `${path}/${row.path}` }));
};

type Matcher = (path: string) => boolean;

/** A glob over root-relative paths: a pattern without `/` matches a basename at any depth. */
const globMatcher = async (pattern: string): Promise<Matcher> => {
  /* Loaded on first use, so a bridge that never globs never ships the matcher. */
  const { minimatch } = await import('minimatch');
  return (path) => minimatch(path, pattern, { matchBase: true, dot: true });
};

const hostGlob =
  (statTree: StatTree) =>
  async (pattern: string, options?: GlobOptions & LongCall): Promise<FileStatEntry[]> => {
    throwIfAborted(options?.signal);
    const [matches, rows] = await Promise.all([globMatcher(pattern), rowsUnder(statTree, options?.path ?? '')]);
    throwIfAborted(options?.signal);
    const limit = options?.maxResults ?? Number.POSITIVE_INFINITY;
    const found: FileStatEntry[] = [];
    for (const row of rows) {
      if (found.length >= limit) {
        break;
      }
      if (row.type === 'file' && matches(row.path)) {
        found.push(row);
      }
    }
    return found;
  };

const escapeRegExp = (text: string): string => text.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`);

/** The caller's pattern as an expression; one that does not compile refuses with `EINVAL`. */
const grepExpression = (pattern: string, options: GrepOptions | undefined): RegExp => {
  const source = options?.fixedStrings === true ? escapeRegExp(pattern) : pattern;
  try {
    return new RegExp(source, options?.caseSensitive === true ? 'u' : 'iu');
  } catch (error) {
    throw codedError(`Invalid grep pattern: ${error instanceof Error ? error.message : String(error)}`, 'EINVAL');
  }
};

/** The files a `grep` reads, and how many index rows it passes over unread. */
const grepCandidates = async (
  statTree: StatTree,
  options: GrepOptions | undefined,
): Promise<{ candidates: FileStatEntry[]; skipped: number }> => {
  const [rows, matches] = await Promise.all([
    rowsUnder(statTree, options?.path ?? ''),
    options?.glob === undefined ? undefined : globMatcher(options.glob),
  ]);
  const maxFileBytes = options?.maxFileBytes ?? defaultGrepFileBytes;
  const candidates: FileStatEntry[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (row.type !== 'file' || (matches !== undefined && !matches(row.path))) {
      continue;
    }
    if (row.contentKind === 'binary' || row.size > maxFileBytes) {
      skipped += 1;
    } else {
      candidates.push(row);
    }
  }
  return { candidates, skipped };
};

const hostGrep =
  (statTree: StatTree, read: ReadBytes, worker: GrepMatcherWorkerFactory | undefined) =>
  async (pattern: string, options?: GrepOptions & LongCall): Promise<GrepResult> => {
    const expression = grepExpression(pattern, options);
    throwIfAborted(options?.signal);
    const { candidates, skipped } = await grepCandidates(statTree, options);
    const limit = options?.maxResults ?? defaultGrepResults;
    /* One past the cap per file, so `truncated` still sees a file that holds more. */
    const shape = {
      expression,
      context: options?.context ?? 0,
      maxLine: maxGrepLineCharacters,
      maxMatches: limit + 1,
    };
    /* A caller's expression runs where it can be stopped; a literal cannot backtrack. */
    const matcher =
      options?.fixedStrings === true || candidates.length === 0
        ? literalLineMatcher(shape)
        : await boundedLineMatcher({ ...shape, ...(worker === undefined ? {} : { worker }) });
    try {
      return await grepFiles({ candidates, skipped, limit, matcher, read, options });
    } finally {
      matcher.close();
    }
  };

/** Read and match each candidate, in index order, until the cap. */
const grepFiles = async ({
  candidates,
  skipped,
  limit,
  matcher,
  read,
  options,
}: {
  readonly candidates: readonly FileStatEntry[];
  readonly skipped: number;
  readonly limit: number;
  readonly matcher: FileLineMatcher;
  readonly read: ReadBytes;
  readonly options: LongCall | undefined;
}): Promise<GrepResult> => {
  const decoder = new TextDecoder();
  const perFile: Array<GrepMatch[] | undefined> = Array.from({ length: candidates.length });
  let found = 0;
  let gone = 0;
  let unread = 0;
  let binary = 0;
  await forEachReported(candidates, options, async (row, index) => {
    /* Lanes take files in index order, so once the finished files hold the
     * cap, no file not yet started can reach the first `limit` matches. */
    if (found >= limit) {
      unread += 1;
      return 0;
    }
    let data: Uint8Array<ArrayBuffer>;
    try {
      data = await read(row.path);
    } catch (error) {
      if (isAbsence(error)) {
        gone += 1;
        return 0;
      }
      throw error;
    }
    /* A row carries its kind only when the index already knows it (I3); the
     * bytes are in hand now, so an unknown one is judged from its head. */
    if (row.type === 'file' && row.contentKind === undefined && seemsBinary(data.subarray(0, headSniffByteLength))) {
      binary += 1;
      return data.byteLength;
    }
    const matches = await matcher.match(row.path, decoder.decode(data));
    perFile[index] = matches;
    found += matches.length;
    return data.byteLength;
  });
  const all = perFile.flatMap((matches) => matches ?? []);
  return {
    matches: all.slice(0, limit),
    filesSearched: candidates.length - gone - unread - binary,
    filesSkipped: skipped + gone + binary,
    truncated: all.length > limit || (unread > 0 && all.length >= limit),
  };
};

const hostIndexStats =
  (statTree: StatTree) =>
  async (path: string, options?: LongCall): Promise<IndexStats> => {
    throwIfAborted(options?.signal);
    const rows = await statTree(path);
    const stats = { files: 0, bytes: 0, textFiles: 0, binaryFiles: 0, lines: 0 };
    for (const row of rows) {
      if (row.type !== 'file') {
        continue;
      }
      stats.files += 1;
      stats.bytes += row.size;
      /* Content facts ride a stat row only when already known (I3): a file
         no write or facts request has measured counts toward neither kind. */
      if (row.contentKind === 'text') {
        stats.textFiles += 1;
        stats.lines += row.lineCount ?? 0;
      } else if (row.contentKind === 'binary') {
        stats.binaryFiles += 1;
      }
    }
    return stats;
  };

/** An entry's error as data the wire carries: name, message and the provider's code. */
const entryErrorOnWire = (error: unknown): { name: string; message: string; code?: string } => {
  const code = (error as { code?: unknown } | undefined)?.code;
  return {
    name: error instanceof Error ? error.name : 'Error',
    message: error instanceof Error ? error.message : String(error),
    ...(typeof code === 'string' ? { code } : {}),
  };
};

const hostApply =
  (apply: Apply) =>
  async (changeset: FileSystemBridgeChangeset): Promise<ChangesetReceipt> => {
    const receipt = await apply(changeset);
    return {
      ...receipt,
      entries: receipt.entries.map((entry) =>
        entry.error === undefined ? entry : { ...entry, error: entryErrorOnWire(entry.error) },
      ),
    };
  };

const refuseApply = async (): Promise<never> => {
  throw codedError('This connection serves no changeset apply.', 'ENOTSUP');
};

/** The view's facts as wire rows, in request order. */
const hostFacts =
  (facts: Facts) =>
  async (paths: readonly string[], options?: FactsOptions & LongCall): Promise<FactsWireRows> => {
    throwIfAborted(options?.signal);
    return [...(await facts(paths, options))];
  };

/** What changed, with each entry's measurement record left on the authority; `rescan` and removals carried whole (S10). */
const hostChangedSince =
  (changedSince: ChangedSince) =>
  async (since: number, options?: IndexChangedSinceOptions & LongCall): Promise<IndexChangedSince> => {
    throwIfAborted(options?.signal);
    const { generation, epoch, entries, removed, rescan } = await changedSince(since, options);
    return {
      generation,
      epoch,
      entries: entries.map(({ factsAt: _factsAt, ...entry }) => entry),
      removed,
      ...(rescan === true ? { rescan } : {}),
    };
  };

const refuseIndexQuery = async (): Promise<never> => {
  throw codedError('This connection serves no index queries.', 'ENOTSUP');
};

/** The index queries a handler set answers itself or the bridge derives from its `statTree`. */
const derivedIndexCalls = (
  own: Partial<Record<string, unknown>>,
  handlers: StringKeyedObject,
  { read, worker }: { readonly read: ReadBytes; readonly worker: GrepMatcherWorkerFactory | undefined },
): Record<string, unknown> => {
  if (typeof own['statTree'] !== 'function') {
    return {};
  }
  const statTree = (own['statTree'] as StatTree).bind(handlers);
  return {
    ...(typeof own['glob'] === 'function' ? {} : { glob: hostGlob(statTree) }),
    ...(typeof own['grep'] === 'function' ? {} : { grep: hostGrep(statTree, read, worker) }),
    ...(typeof own['indexStats'] === 'function' ? {} : { indexStats: hostIndexStats(statTree) }),
  };
};

/**
 * What a host tells the derived calls about its platform.
 *
 * @public
 */
export type HostContentCallOptions = {
  /**
   * Starts the worker a `grep` pattern runs in, so the pattern can be stopped
   * (see `filesystem-bridge-grep-matcher.ts`). Needed only where the platform
   * has no web `Worker`, such as Node; without either, a non-literal pattern
   * is refused with `ENOTSUP`.
   */
  readonly grepMatcherWorker?: GrepMatcherWorkerFactory;
};

/**
 * Serve the derived calls beside a handler set that reads files, each only
 * where the handlers do not bring their own: `hashFiles`, `readMany` and
 * `readRange` from `readFile`; `glob`, `grep` and `indexStats` from
 * `statTree`; `apply` with its receipt's errors as wire data, or refused
 * with `ENOTSUP` where the view serves no changeset; and the index queries
 * `facts` and `changedSince` as wire data, or refused with `ENOTSUP` where the
 * view has no index. A set without `readFile`
 * is returned unchanged. Members stay bound to the original handler set, so a
 * class's private state survives.
 *
 * @param handlers - The handlers one connection is served.
 * @param options - The host's grep matcher worker, where its platform has no web `Worker`.
 * @returns The same handlers, answering the derived calls.
 */
export const withHostContentCalls = <Handlers extends StringKeyedObject>(
  handlers: Handlers,
  options?: HostContentCallOptions,
): Handlers => {
  const own = handlers as Partial<Record<string, unknown>>;
  if (typeof own['readFile'] !== 'function') {
    return handlers;
  }
  const read = (own['readFile'] as (path: string) => Promise<Uint8Array<ArrayBuffer>>).bind(handlers);
  const stream =
    typeof own['readFileStream'] === 'function' ? (own['readFileStream'] as ReadStream).bind(handlers) : undefined;
  const derived: Record<string, unknown> = {
    ...(typeof own['hashFiles'] === 'function' ? {} : { hashFiles: hostHashFiles(read) }),
    ...(typeof own['readMany'] === 'function' ? {} : { readMany: hostReadMany(read) }),
    ...(typeof own['readRange'] === 'function' ? {} : { readRange: hostReadRange(read, stream) }),
    ...derivedIndexCalls(own, handlers, { read, worker: options?.grepMatcherWorker }),
    apply: typeof own['apply'] === 'function' ? hostApply((own['apply'] as Apply).bind(handlers)) : refuseApply,
    facts: typeof own['facts'] === 'function' ? hostFacts((own['facts'] as Facts).bind(handlers)) : refuseIndexQuery,
    changedSince:
      typeof own['changedSince'] === 'function'
        ? hostChangedSince((own['changedSince'] as ChangedSince).bind(handlers))
        : refuseIndexQuery,
  };
  return new Proxy(handlers, {
    get(target, property) {
      if (typeof property === 'string' && Object.hasOwn(derived, property)) {
        return derived[property];
      }
      const value: unknown = Reflect.get(target, property, target);
      const descriptor = Reflect.getOwnPropertyDescriptor(target, property);
      /* A frozen member must be returned as itself (proxy invariant). */
      return typeof value === 'function' && !(descriptor?.configurable === false && descriptor.writable === false)
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
};

/**
 * Hand a long call's abort signal and progress sink to the handlers that take
 * them, merged into their options argument at the slot `fileSystemLongCalls`
 * names. Only calls the bridge itself derives, or whose rooted contract names
 * them, have a slot: a domain handler's trailing argument may already mean
 * something else, such as the mutation context a workspace port binds. `apply` takes the signal on the
 * changeset itself, where the pipeline reads it: abort stops later phases.
 *
 * @param method - The bridge method being served.
 * @param args - Its validated wire arguments.
 * @param longCall - The call's server-side controls.
 * @returns The arguments the handler is called with.
 */
export const bindFileSystemLongCall = (method: string, args: unknown[], longCall: BridgeServerLongCall): unknown[] => {
  if (method === 'apply') {
    return [{ ...(args[0] as FileSystemBridgeChangeset), signal: longCall.signal }, ...args.slice(1)];
  }
  const slot = fileSystemLongCalls[method];
  if (slot === undefined) {
    return args;
  }
  const bound = args.slice(0, slot);
  while (bound.length < slot) {
    bound.push(undefined);
  }
  const options = args[slot];
  bound.push({ ...(options !== null && typeof options === 'object' ? options : {}), ...longCall });
  return bound;
};
