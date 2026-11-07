/**
 * Every root's {@link ProjectIndex}, and the I/O that opens, validates, feeds
 * and persists them (charter D5).
 *
 * The only place that speaks absolute authority paths to the indexes: each
 * mutation, external fact and topology change lands in every index whose root
 * contains the path with no mount boundary between them, and in none other.
 *
 * Opening a root loads its snapshot from `<root>/.tau/index/` and runs one
 * head-metadata compare of the whole root — a listing per directory, no file
 * content (I3) — or, with no trustworthy snapshot, the same listing as a scan.
 * Either way the observation merges with every mutation recorded meanwhile.
 *
 * @module
 */

import { joinRelativePath, normalizePath } from '@taucad/utils/path';
import { sha256Bytes } from '@taucad/utils/hash';
import { factsConcurrency, getFileContentMetadata, measureContentFacts } from '#content-metadata.js';
import { directoryConcurrency, mapConcurrent, statConcurrency } from '#concurrency.js';
import { workerTimings } from '#worker-timings.js';
import type { ContentFacts, ContentFactsOptions, FileStatEntry, FileSystemProvider, PathPolicy } from '#types.js';
import { ProjectIndex, timestampGranularityMilliseconds } from '#project-index/project-index.js';
import type {
  ExpectedEntry,
  IndexAdmits,
  IndexCompareResult,
  IndexEntryKind,
  ObservedRow,
} from '#project-index/project-index.js';
import { projectIndexDirectory, readIndexSnapshot, writeIndexSnapshot } from '#project-index/index-snapshot.js';
import type { IndexVector } from '#project-index/index-snapshot.js';
import type { PendingObject } from '#pending-content.js';
import { importFactsPath, parseImportFacts, verifiedImportFacts } from '#importer/facts.js';

/** Reserved root paths no index ever holds (I9): its own snapshot, and import staging. @public */
export const reservedIndexPaths: readonly string[] = Object.freeze([projectIndexDirectory, '.tau-staging']);

/**
 * Whether a root-relative path is one of the {@link reservedIndexPaths} or lies under one.
 *
 * @param relative - Root-relative path.
 * @returns Whether no index holds it.
 * @public
 */
export const isReservedIndexPath = (relative: string): boolean =>
  reservedIndexPaths.some((reserved) => relative === reserved || relative.startsWith(`${reserved}/`));

/** How the indexes reach one root's bytes. @public */
export type IndexRootResolution = Readonly<{
  provider: FileSystemProvider;
  /** The root's provider-relative path. */
  path: string;
  /**
   * Present when the root keeps a snapshot: a durable provider with a
   * trustworthy mtime, mounted at this root. `lockName` names its index lock.
   */
  persist?: Readonly<{ lockName: string }>;
}>;

/** Options for {@link ProjectIndexes}. @public */
export type ProjectIndexesOptions = Readonly<{
  /** Live mount prefixes: an index never answers past a nested mount. */
  mountPrefixes?: () => Iterable<string>;
  /** Resolve a root to its provider; required for any I/O. */
  resolve?: (root: string) => IndexRootResolution;
  /** The path policy applied at scan time (I9). */
  policy?: PathPolicy;
  /** This tab's identity and its latest published change notice. */
  tab?: () => Readonly<{ tabId: string; seq: number }>;
  /** Quiet period before a changed index is persisted. Defaults to 2 s. */
  persistDelayMilliseconds?: number;
}>;

/** A lazy facts request: what to measure beyond the classification. @public */
export type IndexFactsOptions = ContentFactsOptions & Readonly<{ digests?: ReadonlyArray<'sha256' | 'blobOid'> }>;

const textEncoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

/** Git's blob id: SHA-1 over `blob <size>\0` and the bytes. */
const blobOidOf = async (bytes: Uint8Array<ArrayBuffer>): Promise<string> => {
  const header = textEncoder.encode(`blob ${bytes.byteLength}\0`);
  const framed = new Uint8Array(header.byteLength + bytes.byteLength);
  framed.set(header);
  framed.set(bytes, header.byteLength);
  return toHex(await crypto.subtle.digest('SHA-1', framed));
};

/** Most read facts one cold root keeps before it starts over. */
const readFactsCapacity = 50_000;

/** Facts a cold root's read measured, the size it read, and when the read began. */
type ReadFacts = Readonly<{ facts: ContentFacts; size: number; observedAt: number }>;

/**
 * True when a read still describes the file whose head metadata is `current`:
 * the same size, and the mtime old enough (the racy rule, I5) that no write the
 * read could have missed shares it — a write during or after the read leaves a
 * newer mtime, whether or not any hook saw it.
 */
const readStillHolds = (
  read: Readonly<{ size: number; observedAt: number }>,
  current: Readonly<{ size: number; mtimeMs: number }>,
): boolean => read.size === current.size && read.observedAt - current.mtimeMs > timestampGranularityMilliseconds;

/** Unknown, or text whose line count was not measured. */
const lacksCount = (facts: ContentFacts | undefined): boolean =>
  facts === undefined || (facts.contentKind === 'text' && facts.lineCount === undefined);

/** `relative` of `absolute` under `root`, or `undefined` when outside it. */
const relativeTo = (root: string, absolute: string): string | undefined => {
  if (absolute === root) {
    return '';
  }
  if (root === '/') {
    return absolute.slice(1);
  }
  return absolute.startsWith(`${root}/`) ? absolute.slice(root.length + 1) : undefined;
};

type RootState = {
  index: ProjectIndex;
  /** Per tab, the last change notice this root's index accounted for. */
  seen: Record<string, number>;
  /** A sequence gap or a lost observer: the next `ready` compares the whole root. */
  needsCompare: boolean;
  /** What the latest whole-root observation found. */
  lastCompare?: IndexCompareResult;
  persistTimer?: ReturnType<typeof setTimeout>;
};

/**
 * The set of Project Indexes, one per root.
 *
 * @public
 */
export class ProjectIndexes {
  private readonly _states = new Map<string, RootState>();
  private readonly _opening = new Map<string, Promise<ProjectIndex>>();
  private readonly _options: ProjectIndexesOptions;
  /** Notices from sibling tabs, joined into every root's vector. */
  private readonly _remoteSeen: Record<string, number> = {};
  /**
   * Per cold root, the facts of bytes a whole read already held (D4): what a
   * later listing asks of a root nobody opened an index for, answered without
   * reading again while the file's size and mtime show it unchanged since the
   * read began. No write hook needs to forget them: a write changes the mtime.
   */
  private readonly _readFacts = new Map<string, Map<string, ReadFacts>>();

  /** Roots opened by a scan whose import facts, if any, no digest request has taken yet (D12). */
  private readonly _importFactsPending = new Set<string>();

  /**
   * @param options - Mount boundaries, provider resolution, path policy and tab identity.
   */
  public constructor(options: ProjectIndexesOptions = {}) {
    this._options = options;
  }

  /**
   * The index of one root, opened and validated when cold, with any paths an
   * external fact left unknown re-observed first.
   *
   * @param root - Absolute root.
   * @returns The complete index.
   */
  public async ready(root: string): Promise<ProjectIndex> {
    const key = normalizePath(root);
    const state = this._states.get(key);
    if (state?.index.isComplete === true) {
      if (state.needsCompare) {
        state.needsCompare = false;
        await this._observe(key, state.index, '');
      } else if (state.index.stalePaths.length > 0) {
        await this._refreshStale(key, state.index);
      }
      return state.index;
    }
    const pending = this._opening.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const opening = this._open(key);
    this._opening.set(key, opening);
    try {
      return await opening;
    } finally {
      this._opening.delete(key);
    }
  }

  /**
   * The warm index of one exact root, if any.
   *
   * @param root - Absolute root.
   * @returns The index, or `undefined` when that root is cold.
   */
  public get(root: string): ProjectIndex | undefined {
    const index = this._states.get(normalizePath(root))?.index;
    return index?.isComplete === true ? index : undefined;
  }

  /**
   * The full head-metadata compare of one root (D5): at a cut, on visibility
   * regain, after a sequence gap. Reads no file content.
   *
   * @param root - Absolute root.
   * @returns What changed and what is racy.
   */
  public async compare(root: string): Promise<IndexCompareResult> {
    const key = normalizePath(root);
    const state = this._states.get(key);
    if (state?.index.isComplete !== true) {
      /* Opening a root is its compare. */
      await this.ready(key);
      return this._states.get(key)?.lastCompare ?? { checked: 0, mismatched: [], racy: [] };
    }
    return this._observe(key, state.index, '');
  }

  /**
   * Compare the warm roots other programs edit (`externallyEdited`): one, or
   * every one when `root` is omitted — a poll, a tab regaining visibility. A
   * root only Tau writes (OPFS, IndexedDB) learns every change from its own
   * hooks and cross-tab notices, so a poll never compares it.
   *
   * @param root - Optional absolute root.
   * @returns Once each such warm root is compared; at once for a cold one.
   */
  public async compareExternallyEdited(root?: string): Promise<void> {
    const roots = root === undefined ? [...this._states.keys()] : [normalizePath(root)];
    await Promise.all(
      roots
        .filter(
          (key) => this.get(key) !== undefined && this._resolve(key).provider.capabilities.externallyEdited === true,
        )
        .map(async (key) => this.compare(key)),
    );
  }

  /**
   * Lazy content facts (D4): answered from the index while they still describe
   * the bytes, otherwise measured, recorded and answered — at most
   * {@link factsConcurrency} files at a time.
   *
   * The kind comes from a file's first 512 bytes, so a binary is never read in
   * full for it; a text file is read in full only for a requested line count
   * and only within `byteCap`, and is otherwise answered as text with no count.
   * A requested digest needs the whole file within `byteCap`, and is answered
   * from the index only when the entry is trusted (racy guard, I5); a provider
   * without a trustworthy mtime always pays the read. Directories, missing
   * paths and files whose kind cannot be learned within the cap are left out.
   *
   * @param root - Absolute root.
   * @param paths - Root-relative file paths.
   * @param options - Line counts, digests, the per-file byte cap, cancellation.
   * @returns Facts by path, in request order.
   */
  public async facts(
    root: string,
    paths: readonly string[],
    options?: IndexFactsOptions,
  ): Promise<ReadonlyMap<string, ContentFacts>> {
    const key = normalizePath(root);
    const digests = options?.digests ?? [];
    const lineCount = options?.lineCount === true;
    const byteCap = options?.byteCap ?? Number.POSITIVE_INFINITY;
    if (digests.length === 0 && this.get(key) === undefined) {
      return this._coldFacts(key, paths, { lineCount, byteCap, signal: options?.signal, listed: options?.listed });
    }
    const index = await this.ready(key);
    if (digests.length > 0 && this._importFactsPending.delete(key)) {
      await this._seedImportFacts(key, index);
    }
    const resolution = this._resolve(key);
    const trustworthy = resolution.persist !== undefined;
    const answers = (path: string, known: ContentFacts | undefined): known is ContentFacts => {
      if (known === undefined || !digests.every((digest) => known[digest] !== undefined)) {
        return false;
      }
      if (digests.length > 0) {
        return trustworthy && index.trusted(path);
      }
      return (
        !lineCount ||
        known.contentKind === 'binary' ||
        known.lineCount !== undefined ||
        (index.entry(path)?.size ?? 0) > byteCap
      );
    };
    const answered = await mapConcurrent(paths, factsConcurrency, async (path) => {
      options?.signal?.throwIfAborted();
      const known = index.factsFor(path);
      if (answers(path, known)) {
        return { facts: known, recorded: false };
      }
      const entry = index.entry(path);
      if (entry?.kind === 'dir') {
        return { facts: undefined, recorded: false };
      }
      const providerPath = joinRelativePath(resolution.path, path);
      const observedAt = Date.now();
      const stat = await resolution.provider.stat(providerPath).catch(() => undefined);
      if (stat?.type !== 'file') {
        return { facts: undefined, recorded: false };
      }
      const file = { path: providerPath, size: stat.size };
      const [facts, keyed] =
        digests.length === 0
          ? [await this._measure(resolution.provider, file, { lineCount, byteCap }), true]
          : await this._digest(resolution.provider, file, { digests, byteCap });
      const recorded = facts !== undefined && keyed && entry !== undefined;
      if (recorded) {
        index.recordFacts(path, facts, { size: stat.size, mtimeMs: stat.mtimeMs, observedAt });
      }
      return { facts, recorded };
    });
    if (answered.some((answer) => answer.recorded)) {
      this._schedulePersist(key);
    }
    return new Map(
      paths.flatMap((path, at) => {
        const { facts } = answered[at] ?? {};
        return facts === undefined ? [] : [[path, facts] as const];
      }),
    );
  }

  /**
   * Record the facts of a whole file a rooted read just returned (D4): its
   * kind from the first 512 bytes and its line count, both from those same
   * bytes, so no listing reads the file again. A warm index takes them at the
   * entry's metadata when the sizes agree, nothing left the path unknown, no
   * observation is in flight and the entry's mtime is past the racy window; a
   * cold root keeps them beside the size read, checked against the file's
   * current size and mtime before they are used. Both trust the mtime, so a
   * provider that does not declare `trustworthyMtime` records nothing (M4).
   *
   * @param root - Absolute root.
   * @param path - Root-relative file path.
   * @param read - The whole file as just read, and a clock reading taken before the read began.
   */
  public recordRead(
    root: string,
    path: string,
    read: Readonly<{ bytes: Uint8Array<ArrayBuffer>; observedAt: number }>,
  ): void {
    const { bytes, observedAt } = read;
    const key = normalizePath(root);
    if (path === '' || this._excluded(path) || !this._trustsMtime(key)) {
      return;
    }
    const state = this._states.get(key);
    if (state !== undefined) {
      const entry = state.index.settled(path) ? state.index.entry(path) : undefined;
      /* A write still waiting for the provider's own mtime keeps the facts it wrote. */
      const pendingWrite = entry?.factsAt !== undefined && entry.factsAt.mtimeMs === undefined;
      if (
        entry?.kind === 'file' &&
        !pendingWrite &&
        readStillHolds({ size: bytes.byteLength, observedAt }, entry) &&
        lacksCount(state.index.factsFor(path))
      ) {
        state.index.recordFacts(path, getFileContentMetadata(bytes), {
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          observedAt,
        });
        this._schedulePersist(key);
      }
      return;
    }
    this._remember(key, path, { facts: getFileContentMetadata(bytes), size: bytes.byteLength, observedAt });
  }

  /**
   * Write one root's snapshot now, under its index lock and CAS (D5).
   *
   * @param root - Absolute root.
   * @returns `'written'`, `'stale'` when a newer snapshot is stored,
   *   `'skipped'` when the root keeps none or is not open, or `'busy'` when
   *   another holder has the lock: a later write is scheduled, never waited for.
   */
  public async persist(root: string): Promise<'written' | 'stale' | 'skipped' | 'busy'> {
    const key = normalizePath(root);
    const state = this._states.get(key);
    if (state === undefined || !state.index.isComplete) {
      return 'skipped';
    }
    clearTimeout(state.persistTimer);
    state.persistTimer = undefined;
    const resolution = this._resolve(key);
    if (resolution.persist === undefined) {
      return 'skipped';
    }
    /* A snapshot claims every notice its vector names: re-observe what those
     * notices left unknown first, so it never stores a view older than its vector.
     * A pending entry still waiting for its mtime is observed too, so the stored
     * mtime is the provider's and the reload keeps it pending (D9). */
    for (const path of state.index.unmeasuredPendingPaths) {
      state.index.invalidate(path);
    }
    if (state.index.stalePaths.length > 0) {
      await this._refreshStale(key, state.index);
      clearTimeout(state.persistTimer);
      state.persistTimer = undefined;
    }
    /* Storing creates `.tau` when the root has none: hold it first, or the next
     * compare finds it new and stores the snapshot again for it. */
    const container = projectIndexDirectory.split('/', 1)[0]!;
    if (state.index.entry(container) === undefined) {
      state.index.recordDirectory(container);
    }
    const written = await writeIndexSnapshot({
      provider: resolution.provider,
      providerRoot: resolution.path,
      lockName: resolution.persist.lockName,
      snapshot: () => {
        const pending = state.index.pendingSnapshot();
        return {
          vector: this.vector(key),
          rescan: false,
          writtenAt: Date.now(),
          entries: state.index.toSnapshot(),
          ...(Object.keys(pending).length === 0 ? {} : { pending }),
          removals: state.index.removalSnapshot(),
        };
      },
    });
    if (written === 'busy') {
      this._schedulePersist(key);
    }
    return written;
  }

  /**
   * The vector one root's index has reached: its generation and, per tab, the
   * last notice it accounted for — this tab's own included.
   *
   * @param root - Absolute root.
   * @returns The vector.
   */
  public vector(root: string): IndexVector {
    const state = this._states.get(normalizePath(root));
    const tab = this._options.tab?.();
    const seqByTab: Record<string, number> = { ...state?.seen };
    for (const [tabId, seq] of Object.entries(this._remoteSeen)) {
      seqByTab[tabId] = Math.max(seqByTab[tabId] ?? 0, seq);
    }
    if (tab !== undefined && tab.seq > 0) {
      seqByTab[tab.tabId] = Math.max(seqByTab[tab.tabId] ?? 0, tab.seq);
    }
    return { generation: state?.index.generation ?? 0, seqByTab };
  }

  /**
   * Account for one sibling tab's change notice. A notice after a gap means
   * notices were lost, so every open root compares in full before its next answer.
   *
   * @param tabId - The publishing tab.
   * @param seq - Its notice sequence number.
   * @param gap - Whether notices from it were lost before this one.
   */
  public noteNotice(tabId: string, seq: number, gap: boolean): void {
    this._remoteSeen[tabId] = Math.max(this._remoteSeen[tabId] ?? 0, seq);
    if (gap) {
      for (const state of this._states.values()) {
        state.needsCompare = true;
      }
    }
  }

  /**
   * Recursively stat a directory from whichever warm index covers it.
   *
   * @param absolutePath - Absolute directory path.
   * @param options - Optional mask.
   * @returns Rows relative to it, or `undefined` when no warm index covers it.
   */
  public statTree(absolutePath: string, options?: { admits?: IndexAdmits }): FileStatEntry[] | undefined {
    const covering = this._covering(absolutePath);
    return covering?.index.statTree(covering.relative, options);
  }

  /**
   * The kind a warm index knows for one absolute path.
   *
   * @param absolutePath - Absolute path.
   * @returns `'file'`, `'dir'`, or `undefined` when no index knows it.
   */
  public statType(absolutePath: string): IndexEntryKind | undefined {
    const covering = this._covering(absolutePath);
    return covering?.index.entry(covering.relative)?.kind;
  }

  /**
   * Record a completed file write with the facts of the bytes written (D4).
   *
   * @param absolutePath - Absolute file path.
   * @param written - Size and the facts of the written bytes.
   */
  public addFile(absolutePath: string, written: Readonly<{ size: number; facts?: ContentFacts }>): void {
    const observedAt = Date.now();
    this._apply(absolutePath, (index, relative) => {
      index.recordFile(relative, { ...written, observedAt });
    });
  }

  /**
   * Make one file a pending entry in every index that holds it (see
   * {@link ProjectIndex.markPending}).
   *
   * @param absolutePath - Absolute file path.
   * @param object - The large object its pointer names.
   * @param observed - The size the pointer was read at, and {@link ProjectIndexes.generationAt} before the read.
   */
  public markPending(
    absolutePath: string,
    object: PendingObject,
    observed?: Readonly<{ size: number; generation?: number | undefined }>,
  ): void {
    this._apply(absolutePath, (index, relative) => {
      index.markPending(relative, object, observed);
    });
  }

  /**
   * The generation of one entry in the warm index that covers it, taken before a read so a mark made from that read
   * can tell whether a write landed since.
   *
   * @param absolutePath - Absolute file path.
   * @returns The generation, or `undefined` when no warm index holds the entry.
   */
  public generationAt(absolutePath: string): number | undefined {
    const covering = this._covering(absolutePath);
    return covering?.index.entry(covering.relative)?.generation;
  }

  /**
   * The large object a warm index records for one pending entry.
   *
   * @param absolutePath - Absolute file path.
   * @returns The object, or `undefined` when no index has it pending.
   */
  public pendingAt(absolutePath: string): PendingObject | undefined {
    const covering = this._covering(absolutePath);
    return covering?.index.pendingFor(covering.relative);
  }

  /**
   * Know a tree's entries before its write lands them, in the index of that
   * exact root (see {@link ProjectIndex.expect}), opening it when it is cold.
   *
   * @param root - Absolute root the tree is written to.
   * @param entries - Every entry of the tree, root-relative.
   */
  public async expect(root: string, entries: readonly ExpectedEntry[]): Promise<void> {
    /* A cold root is opened first, so a cold open's write is known as it lands. */
    const index = await this.ready(root);
    index.expect(entries);
  }

  /**
   * Whether every one of these paths of the expected tree has landed (D10).
   *
   * @param root - Absolute root the tree is written to.
   * @param paths - Root-relative file paths.
   * @returns `true` when none is arriving; `undefined` when that root's index expects no tree.
   */
  public landed(root: string, paths: readonly string[]): boolean | undefined {
    const index = this._states.get(normalizePath(root))?.index;
    return index?.expecting === true ? paths.every((path) => !index.arriving(path)) : undefined;
  }

  /**
   * End a root's expectation: its tree write is over.
   *
   * @param root - Absolute root.
   */
  public endExpectation(root: string): void {
    this._states.get(normalizePath(root))?.index.endExpectation();
  }

  /**
   * Record a created directory.
   *
   * @param absolutePath - Absolute directory path.
   */
  public addDirectory(absolutePath: string): void {
    this._apply(absolutePath, (index, relative) => {
      index.recordDirectory(relative);
    });
  }

  /**
   * Record a removed file.
   *
   * @param absolutePath - Absolute file path.
   */
  public removeFile(absolutePath: string): void {
    this._apply(absolutePath, (index, relative) => {
      index.remove(relative);
    });
  }

  /**
   * Record a removed directory and everything under it.
   *
   * @param absolutePath - Absolute directory path.
   */
  public removeDirectory(absolutePath: string): void {
    this.removeFile(absolutePath);
  }

  /**
   * Record a rename. An index that holds only one side marks it unknown.
   *
   * @param from - Absolute source path.
   * @param to - Absolute target path.
   */
  public rename(from: string, to: string): void {
    const source = normalizePath(from);
    const target = normalizePath(to);
    for (const [root, state] of this._states) {
      const relativeFrom = this._inside(root, source);
      const relativeTo = this._inside(root, target);
      /* A side outside this root, or one no index holds, is not a move here. */
      if (relativeFrom === undefined || this._excluded(relativeFrom)) {
        if (relativeTo === undefined || this._excluded(relativeTo)) {
          continue;
        }
        state.index.invalidate(relativeTo);
      } else if (relativeTo === undefined || this._excluded(relativeTo)) {
        state.index.remove(relativeFrom);
      } else {
        state.index.move(relativeFrom, relativeTo);
      }
      this._schedulePersist(root);
    }
  }

  /**
   * Mark a path unknown after an external fact (another tab's write, an
   * observer, a half-finished mutation): scoped, never the whole root (D5).
   *
   * @param absolutePath - Absolute path whose state is unknown.
   */
  public invalidate(absolutePath: string): void {
    const normalized = normalizePath(absolutePath);
    for (const [root, state] of this._states) {
      const relative = this._inside(root, normalized);
      if (relative !== undefined) {
        /* The index's own snapshot, staging, and what policy leaves unwatched
         * are never held, so a fact about them changes nothing: dropping it is
         * what stops the index's own write from echoing back as a rewrite. */
        if (relative === '' || !this._excluded(relative)) {
          state.index.invalidate(relative);
        }
      } else if (relativeTo(normalized, root) !== undefined) {
        /* The fact names an ancestor of this root: all of it is unknown. */
        state.index.invalidate('');
      }
    }
  }

  /**
   * Drop the indexes a topology change at `absolutePath` invalidates: those
   * rooted at or under it, and the one that covers it — a removed prefix falls
   * through to whichever broader mount now takes it. Every other root stays warm.
   *
   * @param absolutePath - The mount prefix that changed.
   */
  public evict(absolutePath: string): void {
    this._forget(absolutePath);
    const changed = normalizePath(absolutePath);
    for (const [root, state] of this._states) {
      if (relativeTo(changed, root) !== undefined || relativeTo(root, changed) !== undefined) {
        clearTimeout(state.persistTimer);
        this._states.delete(root);
      }
    }
  }

  /** Drop every index: disposal, or a reset fact that may have moved the whole tree. */
  public clear(): void {
    this._readFacts.clear();
    this._importFactsPending.clear();
    for (const state of this._states.values()) {
      clearTimeout(state.persistTimer);
    }
    this._states.clear();
  }

  /**
   * Facts on a root with no warm index (D4): what its reads already measured,
   * where the file's current size and mtime — the caller's listing, or one
   * head stat — show it unchanged since, and the rest measured now. Opening
   * the index would hold the listing for a full scan, so this neither waits
   * for one nor starts one.
   */
  private async _coldFacts(
    root: string,
    paths: readonly string[],
    options: Readonly<{
      lineCount: boolean;
      byteCap: number;
      signal: AbortSignal | undefined;
      listed: ContentFactsOptions['listed'];
    }>,
  ): Promise<ReadonlyMap<string, ContentFacts>> {
    const resolution = this._resolve(root);
    const memo = this._readFacts.get(root);
    const requests = paths.map((path, at) => ({ path, listed: options.listed?.[at] }));
    const answered = await mapConcurrent(requests, factsConcurrency, async ({ path, listed }) => {
      options.signal?.throwIfAborted();
      const providerPath = joinRelativePath(resolution.path, path);
      const observedAt = Date.now();
      const current =
        listed ??
        (await resolution.provider.stat(providerPath).then(
          (stat) => (stat.type === 'file' ? stat : undefined),
          () => undefined,
        ));
      if (current === undefined) {
        return undefined;
      }
      const read = memo?.get(path);
      if (
        read !== undefined &&
        readStillHolds(read, current) &&
        (!options.lineCount || !lacksCount(read.facts) || read.size > options.byteCap)
      ) {
        return read.facts;
      }
      const facts = await this._measure(resolution.provider, { path: providerPath, size: current.size }, options);
      if (facts !== undefined) {
        this._remember(root, path, { facts, size: current.size, observedAt });
      }
      return facts;
    });
    return new Map(
      paths.flatMap((path, at) => {
        const facts = answered[at];
        return facts === undefined ? [] : [[path, facts] as const];
      }),
    );
  }

  /**
   * Keep what a cold root's read or measurement found, keyed by the size it
   * read and when. A provider whose mtime does not follow its bytes keeps
   * nothing: a same-size rewrite would leave the key unchanged (M4).
   */
  private _remember(root: string, path: string, read: ReadFacts): void {
    if (!this._trustsMtime(root)) {
      return;
    }
    let memo = this._readFacts.get(root);
    if (memo === undefined) {
      memo = new Map();
      this._readFacts.set(root, memo);
    }
    if (memo.size >= readFactsCapacity) {
      memo.clear();
    }
    memo.set(path, read);
  }

  /** Drop the read facts of every cold root a topology change at `absolutePath` covers or contains. */
  private _forget(absolutePath: string): void {
    const changed = normalizePath(absolutePath);
    for (const root of this._readFacts.keys()) {
      if (relativeTo(root, changed) !== undefined || relativeTo(changed, root) !== undefined) {
        this._readFacts.delete(root);
      }
    }
  }

  private async _open(root: string): Promise<ProjectIndex> {
    this._readFacts.delete(root);
    const resolution = this._resolve(root);
    const snapshot =
      resolution.persist === undefined ? undefined : await readIndexSnapshot(resolution.provider, resolution.path);
    const usable = snapshot !== undefined && !snapshot.rescan;
    const index = usable
      ? ProjectIndex.fromSnapshot(snapshot.entries, snapshot.vector.generation, {
          ...(snapshot.pending === undefined ? {} : { pending: snapshot.pending }),
          ...(snapshot.removals === undefined ? {} : { removals: snapshot.removals }),
        })
      : new ProjectIndex({
          trustworthyMtime:
            resolution.persist !== undefined || resolution.provider.capabilities.trustworthyMtime === true,
        });
    /* A rescan still accounts for every notice the stored vector names: the
     * scan below observes the provider after all of them. Adopting the vector
     * lets this tab's next snapshot replace the rescan mark instead of meeting
     * it as incomparable forever. */
    const state: RootState = { index, seen: { ...snapshot?.vector.seqByTab }, needsCompare: false };
    this._states.set(root, state);
    workerTimings.count(usable ? 'index.load' : 'index.scan', 1);
    await this._observe(root, index, '');
    if (index.stalePaths.length > 0) {
      /* A rename whose source the scan had not reached yet. */
      await this._refreshStale(root, index);
    }
    if (!usable) {
      /* A first scan may be of a project an import just committed: its first digest request seeds from the record. */
      this._importFactsPending.add(root);
    }
    if (this._states.get(root) !== state) {
      /* Evicted while opening: answer this caller, keep nothing. */
      return index;
    }
    this._schedulePersist(root);
    return index;
  }

  /**
   * Take a committed import's recorded facts (charter D12) for every file
   * they still describe, so a digest request finds blob ids and SHA-256
   * without hashing the import again. Asked once, by the first digest request
   * after a scan, so opening a root costs nothing more. Only on a provider
   * whose mtimes are trustworthy, and only what {@link verifiedImportFacts}
   * holds to the file: anything else is measured like any file. The record
   * is trusted as of its own mtime, so a file written within the racy window
   * of it stays untrusted (EQ7).
   */
  private async _seedImportFacts(root: string, index: ProjectIndex): Promise<void> {
    if (!this._trustsMtime(root)) {
      return;
    }
    const { provider, path } = this._resolve(root);
    const recordPath = joinRelativePath(path, importFactsPath);
    let record: ReturnType<typeof parseImportFacts>;
    let recordMtime: number;
    try {
      const stat = await provider.stat(recordPath);
      if (stat.type !== 'file') {
        return;
      }
      recordMtime = stat.mtimeMs;
      record = parseImportFacts(await provider.readFile(recordPath));
    } catch {
      return;
    }
    if (record === undefined) {
      return;
    }
    const seeded = verifiedImportFacts(record, recordMtime, (entryPath) => {
      const entry = index.settled(entryPath) ? index.entry(entryPath) : undefined;
      return entry === undefined || entry.kind === 'dir'
        ? undefined
        : { kind: 'file', size: entry.size, mtimeMs: entry.mtimeMs };
    });
    for (const [entryPath, { facts, size, mtimeMs }] of seeded) {
      index.recordFacts(entryPath, facts, { size, mtimeMs, observedAt: recordMtime });
    }
    workerTimings.count('index.importFacts', seeded.size);
  }

  /**
   * Re-observe the paths external facts left unknown, each as a scoped
   * observation; persist only when one changed the index.
   */
  private async _refreshStale(root: string, index: ProjectIndex): Promise<void> {
    const resolution = this._resolve(root);
    const { generation } = index;
    const stale = index.stalePaths.filter(
      (path, _, all) => !all.some((other) => other !== path && (other === '' || path.startsWith(`${other}/`))),
    );
    for (const path of stale) {
      if (path === '') {
        // oxlint-disable-next-line no-await-in-loop -- one root at a time.
        await this._observe(root, index, '');
        continue;
      }
      const start = index.beginObservation();
      // oxlint-disable-next-line no-await-in-loop -- scoped refreshes are few and ordered.
      const stat = await resolution.provider.stat(joinRelativePath(resolution.path, path)).catch(() => undefined);
      index.completePathObservation(
        start,
        path,
        stat === undefined || this._excluded(path)
          ? undefined
          : { path, kind: stat.type, size: stat.size, mtimeMs: stat.mtimeMs },
      );
      if (stat?.type === 'dir') {
        // oxlint-disable-next-line no-await-in-loop -- scoped refreshes are few and ordered.
        await this._observe(root, index, path);
      }
    }
    if (index.generation !== generation) {
      this._schedulePersist(root);
    }
  }

  /**
   * One observation of a subtree: a head listing per directory, policy
   * applied before descent, merged with mutations recorded meanwhile.
   */
  private async _observe(root: string, index: ProjectIndex, prefix: string): Promise<IndexCompareResult> {
    const resolution = this._resolve(root);
    const start = index.beginObservation();
    let rows: ObservedRow[] | undefined;
    try {
      rows = await this._list(resolution, prefix);
    } catch (error) {
      index.completeObservation(start, prefix, undefined);
      throw error;
    }
    workerTimings.count('index.compare', 1);
    const result = index.completeObservation(start, prefix, rows);
    const state = this._states.get(root);
    if (state !== undefined && prefix === '') {
      state.lastCompare = result;
    }
    /* An adopted mtime changes what the snapshot must hold, not the generation. */
    const adopted = index.takeAdoptedMtimes();
    if (result.mismatched.length > 0 || adopted > 0) {
      this._schedulePersist(root);
    }
    return result;
  }

  /** Every entry under `prefix` with head metadata, one listing per directory level. */
  private async _list(resolution: IndexRootResolution, prefix: string): Promise<ObservedRow[]> {
    const { provider, path: base } = resolution;
    const rows: ObservedRow[] = [];
    let level = [prefix];
    while (level.length > 0) {
      // oxlint-disable-next-line no-await-in-loop -- one level at a time bounds the listings in flight.
      const listed = await mapConcurrent(level, directoryConcurrency, async (directory) => {
        const providerPath = joinRelativePath(base, directory);
        const children = await this._listDirectory(provider, providerPath);
        return children.map((child) => ({ ...child, path: joinRelativePath(directory, child.name) }));
      });
      const next: string[] = [];
      for (const child of listed.flat()) {
        if (this._excluded(child.path)) {
          continue;
        }
        rows.push({ path: child.path, kind: child.kind, size: child.size, mtimeMs: child.mtimeMs });
        if (child.kind === 'dir') {
          next.push(child.path);
        }
      }
      level = next;
    }
    return rows;
  }

  private async _listDirectory(
    provider: FileSystemProvider,
    path: string,
  ): Promise<Array<{ name: string; kind: IndexEntryKind; size: number; mtimeMs: number }>> {
    try {
      if (provider.readdirWithStats !== undefined) {
        const rows = await provider.readdirWithStats(path);
        return rows.map((row) => ({ name: row.name, kind: row.type, size: row.size, mtimeMs: row.mtimeMs }));
      }
      const names = await provider.readdir(path);
      const stats = await mapConcurrent(names, statConcurrency, async (name) => {
        const stat = await provider.stat(joinRelativePath(path, name)).catch(() => undefined);
        return stat === undefined ? undefined : { name, kind: stat.type, size: stat.size, mtimeMs: stat.mtimeMs };
      });
      return stats.filter((stat) => stat !== undefined);
    } catch (error) {
      /* A directory removed between its parent's listing and its own lists empty. */
      if ((error as { code?: unknown }).code === 'ENOENT' || (error as { name?: unknown }).name === 'NotFoundError') {
        return [];
      }
      throw error;
    }
  }

  /** The path policy at scan time (I9): reserved index paths, then everything nothing watches. */
  private _excluded(relative: string): boolean {
    return isReservedIndexPath(relative) || this._options.policy?.classify(relative).watch === 'none';
  }

  /** Kind, and a line count when asked for, within the per-file cap. */
  private async _measure(
    provider: FileSystemProvider,
    file: Readonly<{ path: string; size: number }>,
    options: Readonly<{ lineCount: boolean; byteCap: number }>,
  ): Promise<ContentFacts | undefined> {
    const measured = await measureContentFacts(provider, file, options);
    workerTimings.count('index.facts.bytes', measured.bytesRead);
    return measured.facts;
  }

  /**
   * Every fact of the whole file, digests included, when it fits the per-file
   * cap; and whether the bytes read are the ones the stat described, so the
   * facts may be recorded under its key.
   */
  private async _digest(
    provider: FileSystemProvider,
    file: Readonly<{ path: string; size: number }>,
    options: Readonly<{ digests: ReadonlyArray<'sha256' | 'blobOid'>; byteCap: number }>,
  ): Promise<readonly [ContentFacts | undefined, boolean]> {
    const { path, size } = file;
    if (size > options.byteCap) {
      return [undefined, false];
    }
    const bytes = await provider.readFile(path);
    workerTimings.count('index.facts.bytes', bytes.byteLength);
    const facts: ContentFacts = {
      ...getFileContentMetadata(bytes),
      ...(options.digests.includes('sha256') ? { sha256: await sha256Bytes(bytes) } : {}),
      ...(options.digests.includes('blobOid') ? { blobOid: await blobOidOf(bytes) } : {}),
    };
    return [facts, bytes.byteLength === size];
  }

  /** Whether the root's provider changes `mtimeMs` whenever its bytes change, so read facts may be keyed on it. */
  private _trustsMtime(root: string): boolean {
    return this._options.resolve !== undefined && this._resolve(root).provider.capabilities.trustworthyMtime === true;
  }

  private _resolve(root: string): IndexRootResolution {
    const { resolve } = this._options;
    if (resolve === undefined) {
      throw new Error('This index set was built without a provider resolver.');
    }
    return resolve(root);
  }

  private _schedulePersist(root: string): void {
    const state = this._states.get(root);
    if (state === undefined || this._options.resolve === undefined) {
      return;
    }
    clearTimeout(state.persistTimer);
    state.persistTimer = setTimeout(async () => {
      state.persistTimer = undefined;
      try {
        await this.persist(root);
      } catch {
        /* Best effort: the next change schedules another, and a load always compares. */
      }
    }, this._options.persistDelayMilliseconds ?? 2000);
  }

  /** The first warm index whose root contains `absolutePath` with no mount boundary between. */
  private _covering(absolutePath: string): { index: ProjectIndex; relative: string } | undefined {
    const normalized = normalizePath(absolutePath);
    for (const [root, state] of this._states) {
      const relative = this._inside(root, normalized);
      if (relative !== undefined && state.index.isComplete) {
        return { index: state.index, relative };
      }
    }
    return undefined;
  }

  private _apply(absolutePath: string, update: (index: ProjectIndex, relative: string) => void): void {
    const normalized = normalizePath(absolutePath);
    for (const [root, state] of this._states) {
      const relative = this._inside(root, normalized);
      if (relative === undefined || relative === '' || this._excluded(relative)) {
        continue;
      }
      update(state.index, relative);
      this._schedulePersist(root);
    }
  }

  /** `absolutePath` relative to `root` when inside it with no nested mount between them. */
  private _inside(root: string, absolutePath: string): string | undefined {
    const relative = relativeTo(root, absolutePath);
    if (relative === undefined) {
      return undefined;
    }
    for (const prefix of this._options.mountPrefixes?.() ?? []) {
      const nested = relativeTo(root, normalizePath(prefix));
      if (nested !== undefined && nested !== '' && relativeTo(normalizePath(prefix), absolutePath) !== undefined) {
        return undefined;
      }
    }
    return relative;
  }
}
