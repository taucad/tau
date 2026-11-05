/**
 * One root's Project Index: a validated stat cache, not an unverified truth
 * (charter D5, H3).
 *
 * It holds the tree, each entry's head metadata, and — when something measured
 * them — the content facts of a file's current bytes, keyed by the
 * `(size, mtimeMs)` they were measured at, the way git's index keys a blob id.
 * Every path is relative to the root it indexes; {@link ProjectIndexes} owns
 * the set of them, their I/O and the absolute paths.
 *
 * Three things keep it honest:
 *
 * - **Observation merges, never discards.** A scan or a compare is an
 *   observation that started at a generation; a mutation the index learns of
 *   meanwhile wins over what the observation listed for that path, so a write
 *   during a scan neither loses the scan nor the write.
 * - **Facts carry their key.** Facts are answered only while the entry's
 *   `(size, mtimeMs)` still equals the one they were measured at. On a
 *   provider whose mtime cannot key them, every re-observation drops them.
 * - **Trust has a racy guard.** An oid offered to a cut must come from facts
 *   measured more than {@link timestampGranularityMilliseconds} after the bytes'
 *   own modification time; a younger stat cannot prove the bytes it describes
 *   are the bytes that were read (git's racy rule; closeout EQ7, C3).
 *
 * @module
 */

import type { StatContentMetadata } from '@taucad/types';
import type { ContentFacts, FileStatEntry } from '#types.js';

/** The coarsest modification time a filesystem we index reports: FAT's two seconds. @public */
export const timestampGranularityMilliseconds = 2000;

/** What kind of entry a path is. @public */
export type IndexEntryKind = 'file' | 'dir';

/** The metadata a file's facts were measured at, and when. @public */
export type FactsAt = Readonly<{
  size: number;
  /** `undefined` while a write-path measurement waits for the provider's own mtime. */
  mtimeMs: number | undefined;
  /** Clock reading taken no earlier than the bytes were read. */
  observedAt: number;
}>;

/** One entry as the index answers it. @public */
export type IndexEntry = Readonly<{
  path: string;
  kind: IndexEntryKind;
  size: number;
  mtimeMs: number;
  /** The index generation that last changed this entry. */
  generation: number;
  facts?: ContentFacts;
  factsAt?: FactsAt;
}>;

/** Options for a {@link ProjectIndex}. @public */
export type ProjectIndexOptions = Readonly<{
  /** The generation to continue from (a loaded snapshot's); `0` for a new root. */
  generation?: number;
  /**
   * Whether the provider's mtime changes with every content change, so
   * `(size, mtimeMs)` can key facts. Unset, facts last only until the path is
   * next observed or invalidated.
   */
  trustworthyMtime?: boolean;
}>;

/** One row an observation of the provider listed: head metadata only. @public */
export type ObservedRow = Readonly<{ path: string; kind: IndexEntryKind; size: number; mtimeMs: number }>;

/** Which entries an index query may answer with (a composed view's mask). @public */
export type IndexAdmits = (relativePath: string, kind: IndexEntryKind) => boolean;

/** Options every index search takes. @public */
export type IndexSearchOptions = {
  readonly maxResults?: number;
  readonly includeDirectories?: boolean;
  readonly admits?: IndexAdmits;
};

/** What one head-metadata compare found (D5). @public */
export type IndexCompareResult = Readonly<{
  /** Entries the provider listed. */
  checked: number;
  /** Paths created, removed, or whose size or mtime differed: their facts were dropped. */
  mismatched: readonly string[];
  /** Paths whose facts are kept but not trusted until re-read (racy guard). */
  racy: readonly string[];
}>;

/** One serialized entry: `[path, kind, size, mtimeMs, facts?, factsAt?]`. @internal */
export type SnapshotRow = readonly [
  path: string,
  kind: 'f' | 'd',
  size: number,
  mtimeMs: number,
  facts?: ContentFacts,
  factsAt?: FactsAt,
];

type Node = {
  kind: IndexEntryKind;
  size: number;
  mtimeMs: number;
  generation: number;
  /** A write recorded this node before the provider reported its mtime. */
  pendingMtime?: boolean;
  facts?: ContentFacts;
  factsAt?: FactsAt;
  children?: Map<string, Node>;
};

const defaultSearchMaxResults = 100;

const segmentsOf = (path: string): string[] => path.split('/').filter(Boolean);

const joinPath = (prefix: string, name: string): string => (prefix === '' ? name : `${prefix}/${name}`);

const isUnder = (path: string, prefix: string): boolean =>
  prefix === '' || path === prefix || path.startsWith(`${prefix}/`);

const directoryNode = (generation: number, mtimeMs = 0): Node => ({
  kind: 'dir',
  size: 0,
  mtimeMs,
  generation,
  children: new Map(),
});

/**
 * The content facts a stat may carry: only the classification and count, and
 * only when known (I3).
 *
 * @param facts - Facts the index holds, if any.
 * @returns Stat fields for those facts.
 */
const statFields = (facts: ContentFacts | undefined): StatContentMetadata => {
  if (facts?.contentKind === 'binary') {
    return { contentKind: 'binary' };
  }
  if (facts?.contentKind === 'text') {
    return facts.lineCount === undefined
      ? { contentKind: 'text' }
      : { contentKind: 'text', lineCount: facts.lineCount };
  }
  return {};
};

/**
 * The tree, metadata and facts of one root.
 *
 * @public
 */
export class ProjectIndex {
  /**
   * Rebuild an index from a persisted snapshot. It is not complete until a
   * compare has validated it against the provider. Only a root whose mtime can
   * key facts keeps a snapshot, so the index trusts its provider's mtime.
   *
   * @param rows - Serialized entries.
   * @param generation - The snapshot's generation.
   * @returns The index.
   */
  public static fromSnapshot(rows: readonly SnapshotRow[], generation: number): ProjectIndex {
    const index = new ProjectIndex({ generation, trustworthyMtime: true });
    for (const [path, kind, size, mtimeMs, facts, factsAt] of rows) {
      const node: Node =
        kind === 'd'
          ? directoryNode(generation, mtimeMs)
          : { kind: 'file', size, mtimeMs, generation, ...(facts === undefined ? {} : { facts, factsAt }) };
      index._place(path, node, false);
    }
    return index;
  }

  private readonly _root: Node = directoryNode(0);
  private readonly _trustworthyMtime: boolean;
  private _generation: number;
  private _complete = false;
  /** Paths a mutation touched, with its generation, kept while an observation is in flight. */
  private readonly _touched = new Map<string, number>();
  private _observing = 0;
  /** Paths an external fact left unknown; the next refresh re-observes them. */
  private readonly _stale = new Set<string>();

  /**
   * @param options - The generation to continue from, and whether the provider's mtime can key facts.
   */
  public constructor(options: ProjectIndexOptions = {}) {
    this._generation = options.generation ?? 0;
    this._trustworthyMtime = options.trustworthyMtime === true;
  }

  /** Monotonic per root; bumped by every change the index records. */
  public get generation(): number {
    return this._generation;
  }

  /** Whether an observation of the whole root has completed (a scan, or a load and its compare). */
  public get isComplete(): boolean {
    return this._complete;
  }

  /** Paths an external fact left unknown since the last refresh. */
  public get stalePaths(): readonly string[] {
    return [...this._stale];
  }

  /**
   * One entry.
   *
   * @param path - Root-relative path, `''` for the root.
   * @returns The entry, or `undefined` when the index does not hold it.
   */
  public entry(path: string): IndexEntry | undefined {
    const node = this._resolve(segmentsOf(path));
    return node === undefined ? undefined : this._entryOf(path, node);
  }

  /**
   * One directory level, sorted by name.
   *
   * @param path - Root-relative directory path.
   * @returns Its children, or none when it is not a directory the index holds.
   */
  public children(path: string): readonly IndexEntry[] {
    const node = this._resolve(segmentsOf(path));
    if (node?.children === undefined) {
      return [];
    }
    return [...node.children.entries()]
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([name, child]) => this._entryOf(joinPath(path, name), child));
  }

  /**
   * Every entry below a directory, depth-first, parents before children.
   *
   * @param prefix - Root-relative directory to walk, `''` for the root.
   * @param options - A mask asked before every descent, and the kinds to yield.
   * @yields Each admitted entry.
   */
  public *walk(
    prefix: string,
    options?: { readonly admits?: IndexAdmits; readonly kinds?: readonly IndexEntryKind[] },
  ): Generator<IndexEntry> {
    const start = this._resolve(segmentsOf(prefix));
    if (start?.children === undefined) {
      return;
    }
    const visit = function* (path: string, node: Node): Generator<IndexEntry> {
      for (const [name, child] of node.children!) {
        const childPath = joinPath(path, name);
        if (options?.admits?.(childPath, child.kind) === false) {
          continue;
        }
        if (options?.kinds === undefined || options.kinds.includes(child.kind)) {
          yield entryOf(childPath, child);
        }
        if (child.children !== undefined) {
          yield* visit(childPath, child);
        }
      }
    };
    const entryOf = (path: string, node: Node): IndexEntry => this._entryOf(path, node);
    yield* visit(prefix, start);
  }

  /**
   * Counts below a directory.
   *
   * @param prefix - Root-relative directory.
   * @returns Files, directories and file bytes below it.
   */
  public stats(prefix: string): { files: number; dirs: number; bytes: number } {
    const totals = { files: 0, dirs: 0, bytes: 0 };
    for (const entry of this.walk(prefix)) {
      if (entry.kind === 'file') {
        totals.files += 1;
        totals.bytes += entry.size;
      } else {
        totals.dirs += 1;
      }
    }
    return totals;
  }

  /**
   * Entries changed after a generation, for incremental capture and watch catch-up.
   *
   * @param since - A generation this index reported earlier.
   * @returns Every entry whose generation is newer.
   */
  public changedSince(since: number): readonly IndexEntry[] {
    return [...this.walk('')].filter((entry) => entry.generation > since);
  }

  /**
   * Every file below a directory as stat rows relative to it: what the rooted
   * `statTree` answers, with content facts only where known (I3).
   *
   * @param prefix - Root-relative directory.
   * @param options - Optional mask, asked before a descent.
   * @returns File rows relative to `prefix`.
   */
  public statTree(prefix: string, options?: { readonly admits?: IndexAdmits }): FileStatEntry[] {
    const strip = prefix === '' ? 0 : prefix.length + 1;
    const admits = options?.admits;
    const relativeAdmits =
      admits === undefined ? undefined : (path: string, kind: IndexEntryKind) => admits(path.slice(strip), kind);
    const rows: FileStatEntry[] = [];
    for (const entry of this.walk(prefix, { admits: relativeAdmits, kinds: ['file'] })) {
      const path = entry.path.slice(strip);
      rows.push({
        path,
        name: path.split('/').at(-1) ?? path,
        type: 'file',
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        ...statFields(this._validFacts(entry)),
      });
    }
    return rows;
  }

  /**
   * Case-insensitive substring search over paths.
   *
   * @param query - Substring to match.
   * @param options - Result cap, whether directories match, and the mask.
   * @returns Matches relative to the root.
   */
  public search(query: string, options?: IndexSearchOptions): FileStatEntry[] {
    const maxResults = options?.maxResults ?? defaultSearchMaxResults;
    const lowerQuery = query.toLowerCase();
    const results: FileStatEntry[] = [];
    for (const entry of this.walk('', { admits: options?.admits })) {
      if (results.length >= maxResults) {
        break;
      }
      if (!entry.path.toLowerCase().includes(lowerQuery)) {
        continue;
      }
      const name = entry.path.split('/').at(-1) ?? entry.path;
      if (entry.kind === 'file') {
        results.push({
          path: entry.path,
          name,
          type: 'file',
          size: entry.size,
          mtimeMs: entry.mtimeMs,
          ...statFields(this._validFacts(entry)),
        });
      } else if (options?.includeDirectories === true) {
        results.push({ path: entry.path, name, type: 'dir', size: 0, mtimeMs: entry.mtimeMs });
      }
    }
    return results;
  }

  /**
   * Record a completed file write. Facts come from the bytes the writer had in
   * hand; the provider's mtime is unknown until the next observation adopts it.
   *
   * @param path - Root-relative file path.
   * @param written - Byte size, the provider's mtime when known, and facts of the written bytes.
   */
  public recordFile(
    path: string,
    written: Readonly<{ size: number; mtimeMs?: number; facts?: ContentFacts; observedAt?: number }>,
  ): void {
    const generation = this._bump(path);
    const pendingMtime = written.mtimeMs === undefined;
    this._place(
      path,
      {
        kind: 'file',
        size: written.size,
        mtimeMs: written.mtimeMs ?? Date.now(),
        generation,
        ...(pendingMtime ? { pendingMtime } : {}),
        ...(written.facts === undefined
          ? {}
          : {
              facts: written.facts,
              factsAt: { size: written.size, mtimeMs: written.mtimeMs, observedAt: written.observedAt ?? Date.now() },
            }),
      },
      true,
    );
  }

  /**
   * Record a created directory and any missing ancestors.
   *
   * @param path - Root-relative directory path.
   */
  public recordDirectory(path: string): void {
    const generation = this._bump(path);
    if (this._resolve(segmentsOf(path))?.kind !== 'dir') {
      this._place(path, directoryNode(generation, Date.now()), true);
    }
  }

  /**
   * Record a removed file or directory, and everything below it.
   *
   * @param path - Root-relative path.
   */
  public remove(path: string): void {
    this._bump(path);
    const segments = segmentsOf(path);
    const parent = this._resolve(segments.slice(0, -1));
    parent?.children?.delete(segments.at(-1)!);
  }

  /**
   * Record a rename. A source the index does not hold leaves the target
   * unknown: it is marked stale and re-observed by the next refresh. So is a
   * target moved while an observation is in flight, or before the index is
   * complete: the source's metadata is then a listing taken before the move, or
   * a snapshot no compare has validated yet.
   *
   * @param from - Root-relative source path.
   * @param to - Root-relative target path.
   */
  public move(from: string, to: string): void {
    const fromSegments = segmentsOf(from);
    const node = this._resolve(fromSegments);
    this._bump(from);
    const generation = this._bump(to);
    if (node === undefined) {
      this._stale.add(to);
      return;
    }
    this._resolve(fromSegments.slice(0, -1))?.children?.delete(fromSegments.at(-1)!);
    const renumber = (current: Node): void => {
      current.generation = generation;
      for (const child of current.children?.values() ?? []) {
        renumber(child);
      }
    };
    renumber(node);
    this._place(to, node, true);
    if (this._observing > 0 || !this._complete) {
      this._stale.add(to);
    }
  }

  /**
   * Mark a path unknown after an external fact (another tab, an observer). The
   * next refresh re-observes it; no entry is trusted meanwhile.
   *
   * @param path - Root-relative path, `''` for the whole root.
   */
  public invalidate(path: string): void {
    this._stale.add(path);
    if (!this._trustworthyMtime) {
      this._dropFacts(this._resolve(segmentsOf(path)));
    }
  }

  /**
   * Begin an observation of the provider (a scan, a compare or a scoped refresh).
   *
   * @returns The generation it started at, to hand back to {@link ProjectIndex.completeObservation}.
   */
  public beginObservation(): number {
    this._observing += 1;
    return this._generation;
  }

  /**
   * Merge what an observation listed under `prefix` with what changed meanwhile.
   *
   * A path a mutation touched after `start` keeps what the mutation recorded;
   * every other listed row replaces the index's view of that path, keeping its
   * facts only while `(size, mtimeMs)` is unchanged; an indexed path the
   * observation did not list is removed. Ends the observation either way.
   *
   * @param start - What {@link ProjectIndex.beginObservation} returned.
   * @param prefix - The subtree the rows completely describe; `''` for the root.
   * @param rows - Every entry under `prefix` the provider listed, head metadata
   *   only; rows for `''` complete the index. `undefined` for a failed listing.
   * @returns What changed and what is racy.
   */
  public completeObservation(
    start: number,
    prefix: string,
    rows: readonly ObservedRow[] | undefined,
  ): IndexCompareResult {
    try {
      if (rows === undefined) {
        return { checked: 0, mismatched: [], racy: [] };
      }
      return this._merge(start, prefix, rows);
    } finally {
      this._observing -= 1;
      if (this._observing === 0) {
        this._touched.clear();
      }
    }
  }

  /**
   * Merge what an observation found at exactly one path: its head metadata, or
   * nothing when it is gone. A mutation recorded meanwhile wins. Ends the observation.
   *
   * @param start - What {@link ProjectIndex.beginObservation} returned.
   * @param path - Root-relative path observed.
   * @param row - Its metadata, or `undefined` when it is absent.
   */
  public completePathObservation(start: number, path: string, row: ObservedRow | undefined): void {
    try {
      if (this._touchedSince(path, start)) {
        return;
      }
      this._stale.delete(path);
      const node = this._resolve(segmentsOf(path));
      if (row === undefined) {
        if (node !== undefined) {
          this._detach(path);
          this._generation += 1;
        }
        return;
      }
      if (node?.kind === row.kind && (row.kind === 'dir' || (node.size === row.size && node.mtimeMs === row.mtimeMs))) {
        if (!this._trustworthyMtime) {
          this._dropFacts(node);
        }
        return;
      }
      this._generation += 1;
      this._place(
        path,
        row.kind === 'dir'
          ? directoryNode(this._generation, row.mtimeMs)
          : { kind: 'file', size: row.size, mtimeMs: row.mtimeMs, generation: this._generation },
        false,
      );
    } finally {
      this._observing -= 1;
      if (this._observing === 0) {
        this._touched.clear();
      }
    }
  }

  /**
   * Facts for one file, if they still describe its current bytes.
   *
   * @param path - Root-relative file path.
   * @returns The facts, or `undefined` when unknown or stale.
   */
  public factsFor(path: string): ContentFacts | undefined {
    const entry = this.entry(path);
    return entry === undefined ? undefined : this._validFacts(entry);
  }

  /**
   * True when a file's facts may be offered to a cut: they match its current
   * `(size, mtimeMs)`, no external fact left it unknown, and they were measured
   * more than {@link timestampGranularityMilliseconds} after the bytes changed.
   *
   * @param path - Root-relative file path.
   * @returns Whether the facts are trusted.
   */
  public trusted(path: string): boolean {
    const entry = this.entry(path);
    if (entry?.factsAt?.mtimeMs === undefined || this._validFacts(entry) === undefined || this._isStale(path)) {
      return false;
    }
    return entry.factsAt.observedAt - entry.factsAt.mtimeMs > timestampGranularityMilliseconds;
  }

  /**
   * True when facts a read measured may key on this entry's metadata: no
   * observation is in flight and no external fact left the path unknown, so
   * the entry is the freshest account of the file there is.
   *
   * @param path - Root-relative file path.
   * @returns Whether a read may record facts here.
   */
  public settled(path: string): boolean {
    return this._complete && this._observing === 0 && !this._isStale(path);
  }

  /**
   * Record facts measured from bytes just read, at the metadata a head stat
   * reported before the read. The entry takes that metadata too: it is the
   * freshest observation of the path.
   *
   * @param path - Root-relative file path.
   * @param facts - What the bytes are.
   * @param at - Size and mtime of the bytes, and when they were read.
   */
  public recordFacts(
    path: string,
    facts: ContentFacts,
    at: Readonly<{ size: number; mtimeMs: number; observedAt: number }>,
  ): void {
    const node = this._resolve(segmentsOf(path));
    if (node?.kind !== 'file') {
      return;
    }
    if (node.size !== at.size || node.mtimeMs !== at.mtimeMs || node.pendingMtime === true) {
      node.size = at.size;
      node.mtimeMs = at.mtimeMs;
      delete node.pendingMtime;
      node.generation = this._bump(path);
    }
    const merged = node.facts !== undefined && this._validFacts(this._entryOf(path, node)) !== undefined;
    node.facts = merged ? { ...node.facts, ...facts } : facts;
    node.factsAt = { size: at.size, mtimeMs: at.mtimeMs, observedAt: at.observedAt };
    this._stale.delete(path);
  }

  /**
   * Every entry as snapshot rows. Facts are written only with a known mtime.
   *
   * @returns Serialized entries, parents before children.
   */
  public toSnapshot(): SnapshotRow[] {
    const rows: SnapshotRow[] = [];
    for (const entry of this.walk('')) {
      if (entry.kind === 'dir') {
        rows.push([entry.path, 'd', 0, entry.mtimeMs]);
        continue;
      }
      const facts = this._validFacts(entry);
      rows.push(
        facts === undefined || entry.factsAt?.mtimeMs === undefined
          ? [entry.path, 'f', entry.size, entry.mtimeMs]
          : [entry.path, 'f', entry.size, entry.mtimeMs, facts, entry.factsAt],
      );
    }
    return rows;
  }

  private _merge(start: number, prefix: string, rows: readonly ObservedRow[]): IndexCompareResult {
    const touchedSince = (path: string): boolean => this._touchedSince(path, start);
    const mismatched: string[] = [];
    const racy: string[] = [];
    const listed = new Set(rows.map((row) => row.path));
    /* Indexed paths the provider no longer lists. */
    const gone: string[] = [];
    for (const entry of this.walk(prefix)) {
      if (!listed.has(entry.path) && !touchedSince(entry.path)) {
        gone.push(entry.path);
      }
    }
    /* Detached after the walk, which a live detach would cut short; a gone
     * directory takes its gone descendants with it. */
    for (const path of gone) {
      if (this._resolve(segmentsOf(path)) !== undefined) {
        this._detach(path);
        this._generation += 1;
        mismatched.push(path);
      }
    }
    for (const row of rows) {
      if (touchedSince(row.path)) {
        continue;
      }
      const node = this._resolve(segmentsOf(row.path));
      if (node?.kind === row.kind) {
        if (row.kind === 'dir') {
          continue;
        }
        if (node.size === row.size && (node.mtimeMs === row.mtimeMs || node.pendingMtime === true)) {
          if (node.pendingMtime === true) {
            node.mtimeMs = row.mtimeMs;
            delete node.pendingMtime;
            if (node.factsAt !== undefined) {
              node.factsAt = { ...node.factsAt, mtimeMs: row.mtimeMs };
              /* Bytes modified after the writer measured them are not the
               * bytes it measured: a same-size rewrite since. */
              if (row.mtimeMs > node.factsAt.observedAt) {
                this._dropFacts(node);
              }
            }
          }
          if (!this._trustworthyMtime) {
            this._dropFacts(node);
            continue;
          }
          if (
            node.factsAt?.mtimeMs !== undefined &&
            node.factsAt.observedAt - row.mtimeMs <= timestampGranularityMilliseconds
          ) {
            racy.push(row.path);
          }
          continue;
        }
        node.size = row.size;
        node.mtimeMs = row.mtimeMs;
        delete node.facts;
        delete node.factsAt;
        delete node.pendingMtime;
        this._generation += 1;
        node.generation = this._generation;
        mismatched.push(row.path);
        continue;
      }
      this._generation += 1;
      this._place(
        row.path,
        row.kind === 'dir'
          ? directoryNode(this._generation, row.mtimeMs)
          : { kind: 'file', size: row.size, mtimeMs: row.mtimeMs, generation: this._generation },
        false,
      );
      mismatched.push(row.path);
    }
    /* The listing answered every unknown path under the prefix, except one a
     * mutation made unknown after the listing began. */
    for (const stale of this._stale) {
      if (isUnder(stale, prefix) && !touchedSince(stale)) {
        this._stale.delete(stale);
      }
    }
    if (prefix === '') {
      this._complete = true;
    }
    return { checked: rows.length, mismatched, racy: racy.filter((path) => !mismatched.includes(path)) };
  }

  private _touchedSince(path: string, start: number): boolean {
    for (const [touched, generation] of this._touched) {
      if (generation > start && isUnder(path, touched)) {
        return true;
      }
    }
    return false;
  }

  private _isStale(path: string): boolean {
    for (const stale of this._stale) {
      if (isUnder(path, stale)) {
        return true;
      }
    }
    return false;
  }

  private _validFacts(entry: IndexEntry): ContentFacts | undefined {
    const { facts, factsAt } = entry;
    if (facts === undefined || factsAt === undefined || factsAt.size !== entry.size) {
      return undefined;
    }
    if (factsAt.mtimeMs !== undefined && factsAt.mtimeMs !== entry.mtimeMs) {
      return undefined;
    }
    return facts;
  }

  private _entryOf(path: string, node: Node): IndexEntry {
    return {
      path,
      kind: node.kind,
      size: node.size,
      mtimeMs: node.mtimeMs,
      generation: node.generation,
      ...(node.facts === undefined ? {} : { facts: node.facts }),
      ...(node.factsAt === undefined ? {} : { factsAt: node.factsAt }),
    };
  }

  private _bump(path: string): number {
    this._generation += 1;
    if (this._observing > 0) {
      this._touched.set(path, this._generation);
    }
    return this._generation;
  }

  private _resolve(segments: readonly string[]): Node | undefined {
    let current: Node | undefined = this._root;
    for (const segment of segments) {
      current = current.children?.get(segment);
      if (current === undefined) {
        return undefined;
      }
    }
    return current;
  }

  /** Forget the facts of a node and everything below it. */
  private _dropFacts(node: Node | undefined): void {
    if (node === undefined) {
      return;
    }
    delete node.facts;
    delete node.factsAt;
    for (const child of node.children?.values() ?? []) {
      this._dropFacts(child);
    }
  }

  private _detach(path: string): void {
    const segments = segmentsOf(path);
    this._resolve(segments.slice(0, -1))?.children?.delete(segments.at(-1)!);
  }

  /**
   * Put a node at a path, creating missing ancestors. A file standing where an
   * ancestor directory belongs is replaced: one kind per path.
   */
  private _place(path: string, node: Node, mutation: boolean): void {
    const segments = segmentsOf(path);
    if (segments.length === 0) {
      return;
    }
    let current = this._root;
    for (const segment of segments.slice(0, -1)) {
      let child = current.children!.get(segment);
      if (child?.children === undefined) {
        child = directoryNode(mutation ? this._generation : node.generation, child === undefined ? 0 : Date.now());
        current.children!.set(segment, child);
      }
      current = child;
    }
    const name = segments.at(-1)!;
    const existing = current.children!.get(name);
    if (node.kind === 'dir' && existing?.kind === 'dir' && node.children?.size === 0) {
      existing.generation = node.generation;
      return;
    }
    current.children!.set(name, node);
  }
}
