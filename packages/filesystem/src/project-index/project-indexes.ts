/**
 * Every root's {@link ProjectIndex}, and the I/O that opens, validates, feeds
 * and persists them (charter D5).
 *
 * The only place that speaks absolute authority paths to the indexes: each
 * mutation, external fact and topology change lands in every index whose root
 * contains the path with no mount boundary between them, and in none other.
 *
 * Opening a root loads its snapshot from `<root>/.tau-index/` and runs one
 * head-metadata compare of the whole root — a listing per directory, no file
 * content (I3) — or, with no trustworthy snapshot, the same listing as a scan.
 * Either way the observation merges with every mutation recorded meanwhile.
 *
 * @module
 */

import { joinRelativePath, normalizePath } from '@taucad/utils/path';
import { sha256Bytes } from '@taucad/utils/hash';
import { getFileContentMetadata } from '#content-metadata.js';
import { directoryConcurrency, mapConcurrent, statConcurrency } from '#concurrency.js';
import { workerTimings } from '#worker-timings.js';
import type { ContentFacts, ContentFactsOptions, FileStatEntry, FileSystemProvider, PathPolicy } from '#types.js';
import { ProjectIndex } from '#project-index/project-index.js';
import type { IndexAdmits, IndexCompareResult, IndexEntryKind, ObservedRow } from '#project-index/project-index.js';
import { projectIndexDirectory, readIndexSnapshot, writeIndexSnapshot } from '#project-index/index-snapshot.js';
import type { IndexVector } from '#project-index/index-snapshot.js';

/** Reserved dot paths no index ever holds (I9): its own snapshot, and import staging. @public */
export const reservedIndexPaths: readonly string[] = Object.freeze([projectIndexDirectory, '.tau-staging']);

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
export type IndexFactsOptions = ContentFactsOptions & Readonly<{ digests?: readonly ('sha256' | 'blobOid')[] }>;

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
   * Compare every warm root (a webaccess tab regaining visibility).
   *
   * @returns Once each warm root is compared.
   */
  public async compareAll(): Promise<void> {
    await Promise.all(
      [...this._states.keys()].filter((root) => this.get(root) !== undefined).map(async (root) => this.compare(root)),
    );
  }

  /**
   * Lazy content facts (D4): answered from the index while they still describe
   * the bytes, otherwise measured from one read, recorded and answered.
   *
   * A requested digest is answered from the index only when the entry is
   * trusted (racy guard, I5); a provider without a trustworthy mtime always
   * pays the read. Paths that would take the bytes read past `byteCap` are left
   * out, as are directories and missing paths.
   *
   * @param root - Absolute root.
   * @param paths - Root-relative file paths.
   * @param options - Byte cap, digests wanted, cancellation.
   * @returns Facts by path.
   */
  public async facts(
    root: string,
    paths: readonly string[],
    options?: IndexFactsOptions,
  ): Promise<ReadonlyMap<string, ContentFacts>> {
    const key = normalizePath(root);
    const index = await this.ready(key);
    const resolution = this._resolve(key);
    const digests = options?.digests ?? [];
    const trustworthy = resolution.persist !== undefined;
    let budget = options?.byteCap ?? Number.POSITIVE_INFINITY;
    const answered = new Map<string, ContentFacts>();
    let recorded = false;
    for (const path of paths) {
      options?.signal?.throwIfAborted();
      const known = index.factsFor(path);
      if (known !== undefined && digests.every((digest) => known[digest] !== undefined)) {
        if (digests.length === 0 || (trustworthy && index.trusted(path))) {
          answered.set(path, known);
          continue;
        }
      }
      const entry = index.entry(path);
      if (entry?.kind === 'dir' || (entry !== undefined && entry.size > budget)) {
        continue;
      }
      const providerPath = joinRelativePath(resolution.path, path);
      const observedAt = Date.now();
      // oxlint-disable-next-line no-await-in-loop -- the byte cap is spent in request order.
      const stat = await resolution.provider.stat(providerPath).catch(() => undefined);
      if (stat?.type !== 'file' || stat.size > budget) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- the byte cap is spent in request order.
      const bytes = await resolution.provider.readFile(providerPath);
      budget -= bytes.byteLength;
      workerTimings.count('index.facts.bytes', bytes.byteLength);
      const facts: ContentFacts = {
        ...getFileContentMetadata(bytes),
        // oxlint-disable-next-line no-await-in-loop -- digests of the bytes just read.
        ...(digests.includes('sha256') ? { sha256: await sha256Bytes(bytes) } : {}),
        // oxlint-disable-next-line no-await-in-loop -- digests of the bytes just read.
        ...(digests.includes('blobOid') ? { blobOid: await blobOidOf(bytes) } : {}),
      };
      answered.set(path, facts);
      if (entry !== undefined && bytes.byteLength === stat.size) {
        index.recordFacts(path, facts, { size: stat.size, mtimeMs: stat.mtimeMs, observedAt });
        recorded = true;
      }
    }
    if (recorded) {
      this._schedulePersist(key);
    }
    return answered;
  }

  /**
   * Write one root's snapshot now, under its index lock and CAS (D5).
   *
   * @param root - Absolute root.
   * @returns `'written'`, `'stale'` when a newer snapshot is stored, or
   *   `'skipped'` when the root keeps none or is not open.
   */
  public async persist(root: string): Promise<'written' | 'stale' | 'skipped'> {
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
    return writeIndexSnapshot({
      provider: resolution.provider,
      providerRoot: resolution.path,
      lockName: resolution.persist.lockName,
      snapshot: () => ({
        vector: this.vector(key),
        rescan: false,
        writtenAt: Date.now(),
        entries: state.index.toSnapshot(),
      }),
    });
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
    if (tab !== undefined) {
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
      if (relativeFrom !== undefined && relativeTo !== undefined) {
        state.index.move(relativeFrom, relativeTo);
      } else if (relativeFrom !== undefined) {
        state.index.remove(relativeFrom);
      } else if (relativeTo !== undefined) {
        state.index.invalidate(relativeTo);
      } else {
        continue;
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
        state.index.invalidate(relative);
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
    for (const state of this._states.values()) {
      clearTimeout(state.persistTimer);
    }
    this._states.clear();
  }

  private async _open(root: string): Promise<ProjectIndex> {
    const resolution = this._resolve(root);
    const snapshot =
      resolution.persist === undefined ? undefined : await readIndexSnapshot(resolution.provider, resolution.path);
    const usable = snapshot !== undefined && !snapshot.rescan;
    const index = usable ? ProjectIndex.fromSnapshot(snapshot.entries, snapshot.vector.generation) : new ProjectIndex();
    const state: RootState = { index, seen: usable ? { ...snapshot.vector.seqByTab } : {}, needsCompare: false };
    this._states.set(root, state);
    workerTimings.count(usable ? 'index.load' : 'index.scan', 1);
    await this._observe(root, index, '');
    if (index.stalePaths.length > 0) {
      /* A rename whose source the scan had not reached yet. */
      await this._refreshStale(root, index);
    }
    if (this._states.get(root) !== state) {
      /* Evicted while opening: answer this caller, keep nothing. */
      return index;
    }
    this._schedulePersist(root);
    return index;
  }

  /** Re-observe the paths external facts left unknown, each as a scoped observation. */
  private async _refreshStale(root: string, index: ProjectIndex): Promise<void> {
    const resolution = this._resolve(root);
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
    this._schedulePersist(root);
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
    const result = index.completeObservation(start, prefix, rows, { complete: prefix === '' });
    const state = this._states.get(root);
    if (state !== undefined && prefix === '') {
      state.lastCompare = result;
    }
    if (result.mismatched.length > 0) {
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
    const first = relative.split('/', 1)[0]!;
    if (reservedIndexPaths.includes(first)) {
      return true;
    }
    return this._options.policy?.classify(relative).watch === 'none';
  }

  private _resolve(root: string): IndexRootResolution {
    const resolve = this._options.resolve;
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
    state.persistTimer = setTimeout(() => {
      state.persistTimer = undefined;
      void this.persist(root).catch(() => undefined);
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
