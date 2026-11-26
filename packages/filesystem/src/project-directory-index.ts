/**
 * The discovery index: what each project directory of each discovery root held when the authority last read it, and
 * which directories have evidence since (project-library fast-path blueprint FW2, under the contract the
 * index-contract review approved with amendments A1 to A5; `specs/discovery-index/DiscoveryIndex.tla`).
 *
 * The index nominates and storage decides. It is a listing cache: no value read from it decides a deletion, a reclaim
 * of device state, an identity write or the absence of a project. Presence is read from a directory under its locks,
 * and absence is established by `ProjectDirectories.verifyAbsent`, which reads every directory.
 *
 * In memory, per tab, rebuilt after a reload; nothing is persisted. Evidence moves a counter: one per directory and
 * one for the root's child names, drawn from one clock that only rises, so a root that goes cold invalidates every read
 * in flight on it. A reader takes the counter before its first I/O and installs what it read as clean only if the
 * counter has not moved and no write of this authority is in flight on the directory. Only a reading the bytes
 * determined is installed: an I/O failure other than a recognised not-found leaves the directory dirty.
 *
 * @module
 */

import { countDiscoveryAuditMismatch, countDiscoveryRootCold, workerTimings } from '#worker-timings.js';
import type { DiscoveryRootColdReason, WorkerTimings } from '#worker-timings.js';

/**
 * What the index keeps of one directory: an opaque reading, of which it looks only at `kind` (a `not-a-project`
 * reading retains nothing). The readings themselves, and the manifest vocabulary they carry, belong to
 * `project-directories.ts` (D5).
 *
 * @public
 */
export type IndexedReading = Readonly<{ kind: string }>;

/**
 * How current a root's index is kept. `cold`: never read in full, or reset since. `exclusive`: only Tau writes it.
 * `observed`: other programs write it and a native observer is armed. `polled`: other programs write it and only the
 * snapshot poll reports them. `unindexed`: past the index's bounds, read on every pass.
 *
 * @public
 */
export type RootCurrency = 'cold' | 'exclusive' | 'observed' | 'polled' | 'unindexed';

/** A root with more children than this is not indexed (A5). @public */
export const maxIndexedChildren = 20_000;

/** Retained manifests across every root, estimated by their serialized size (A5). @public */
export const retainedManifestBudgetBytes = 32 * 1024 * 1024;

/** One directory's clean entry. */
type IndexedDirectory<Reading extends IndexedReading> = {
  readonly reading: Reading;
  /** Estimated bytes the reading retains. */
  readonly bytes: number;
  /** When its `tau.json` last changed: read only while another directory carries the same id. */
  modifiedAt?: number;
};

/** One root's index. */
type RootIndex<Reading extends IndexedReading> = {
  /** Every directory is unknown: the next pass reads the root in full. */
  cold: boolean;
  /** Past the bounds: nothing retained, read on every pass. */
  unindexed: boolean;
  /** The clock reading of the last reset: every counter of the root is at least this. */
  resetAt: number;
  /** The clock reading of the last evidence about the root's child names. */
  namesAt: number;
  /** When the last whole comparison with storage began: a cold read, an applied poll, an audit cycle. */
  validatedAt: number;
  /** False: the root's child names must be listed again. */
  namesListed: boolean;
  /** The child directory names the root held when last listed, with the names own writes added since. */
  readonly names: Set<string>;
  readonly entries: Map<string, IndexedDirectory<Reading>>;
  /** Directories with evidence since they were read. */
  readonly dirty: Set<string>;
  /** Each directory's clock reading of its last evidence. */
  readonly evidenceAt: Map<string, number>;
  /** This authority's writes in flight, per directory. */
  readonly writes: Map<string, number>;
  /** Writes in flight that create, remove or rename a child of the root. */
  nameWrites: number;
  /** Where the audit resumes. */
  auditCursor: number;
};

/** A directory's counter and its root's, as a reader takes them before its first I/O. @public */
export type IndexVersion = Readonly<{ directory: number; names: number }>;

/** What one pass learns from the index of one root. @public */
export type IndexedRootView = Readonly<{
  currency: 'cold' | 'warm' | 'unindexed';
  namesListed: boolean;
  names: readonly string[];
  dirty: readonly string[];
  validatedAt: number;
}>;

/** The provider paths a write names, relative to its root. */
const normalizedPath = (path: string): string => path.replaceAll(/^\/+|\/+$/gu, '');

/** Whether two readings are the same reading. */
const sameReading = (left: IndexedReading, right: IndexedReading): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

/** What a reading retains, estimated by its serialized size in UTF-16 code units. */
const readingBytes = (reading: IndexedReading): number =>
  reading.kind === 'not-a-project' ? 0 : 2 * JSON.stringify(reading).length;

/**
 * The discovery index of every discovery root this authority reads.
 *
 * @public
 */
export class ProjectDirectoryIndex<Reading extends IndexedReading = IndexedReading> {
  private readonly _roots = new Map<string, RootIndex<Reading>>();
  private _clock = 0;
  private _bytes = 0;
  /** The bytes the gauge last reported. */
  private _gauged = 0;
  private readonly _timings: Pick<WorkerTimings, 'count' | 'gauge'>;
  private readonly _maxChildren: number;
  private readonly _budgetBytes: number;
  private readonly _now: () => number;

  /**
   * Create an empty index.
   *
   * @param options - The clock, the recorder and the bounds; production defaults when omitted.
   */
  public constructor(
    options: Readonly<{
      now?: () => number;
      timings?: Pick<WorkerTimings, 'count' | 'gauge'>;
      maxChildren?: number;
      budgetBytes?: number;
    }> = {},
  ) {
    this._now = options.now ?? (() => Date.now());
    this._timings = options.timings ?? workerTimings;
    this._maxChildren = options.maxChildren ?? maxIndexedChildren;
    this._budgetBytes = options.budgetBytes ?? retainedManifestBudgetBytes;
  }

  /** Bytes the retained readings hold, estimated. */
  public get retainedBytes(): number {
    return this._bytes;
  }

  /**
   * Open a root's index, cold, if it has none. A reader opens it before its first I/O, so evidence that arrives while
   * the cold read runs moves the counters that read took.
   *
   * @param storageRootKey - The root.
   */
  public open(storageRootKey: string): void {
    if (!this._roots.has(storageRootKey)) {
      this._roots.set(storageRootKey, {
        cold: true,
        unindexed: false,
        resetAt: this._tick(),
        namesAt: 0,
        validatedAt: Number.NEGATIVE_INFINITY,
        namesListed: false,
        names: new Set(),
        entries: new Map(),
        dirty: new Set(),
        evidenceAt: new Map(),
        writes: new Map(),
        nameWrites: 0,
        auditCursor: 0,
      });
    }
  }

  /**
   * Forget a root: it is no longer configured, or its provider was replaced.
   *
   * @param storageRootKey - The root.
   */
  public drop(storageRootKey: string): void {
    const root = this._roots.get(storageRootKey);
    if (root !== undefined) {
      this._release(root);
      this._roots.delete(storageRootKey);
    }
  }

  /** The roots the index holds. */
  public storageRootKeys(): string[] {
    return [...this._roots.keys()];
  }

  /**
   * What one root's index holds for a pass.
   *
   * @param storageRootKey - The root.
   * @returns The view, or undefined when the root has no index.
   */
  public view(storageRootKey: string): IndexedRootView | undefined {
    const root = this._roots.get(storageRootKey);
    if (root === undefined) {
      return undefined;
    }
    return {
      currency: root.cold ? 'cold' : root.unindexed ? 'unindexed' : 'warm',
      namesListed: root.namesListed,
      names: [...root.names].sort(),
      dirty: [...root.dirty].sort(),
      validatedAt: root.validatedAt,
    };
  }

  /**
   * The clean entry of one directory.
   *
   * @param storageRootKey - The root.
   * @param name - The directory.
   * @returns The entry, or undefined when the directory is dirty or unknown.
   */
  public entry(storageRootKey: string, name: string): Readonly<IndexedDirectory<Reading>> | undefined {
    const root = this._roots.get(storageRootKey);
    return root === undefined || root.dirty.has(name) ? undefined : root.entries.get(name);
  }

  /**
   * The directories whose last reading `match` accepts, dirty ones included (fast-path FW3, `locationsOf`). A
   * nomination: what the index last read, which a caller proves by reading the directory before anything rests on it.
   *
   * @param match - Which readings to nominate.
   * @returns Each matching directory and its root.
   */
  public find(match: (reading: Reading) => boolean): Array<Readonly<{ storageRootKey: string; name: string }>> {
    const found: Array<Readonly<{ storageRootKey: string; name: string }>> = [];
    for (const [storageRootKey, root] of this._roots) {
      for (const [name, entry] of root.entries) {
        if (match(entry.reading)) {
          found.push({ storageRootKey, name });
        }
      }
    }
    return found;
  }

  /**
   * Take a directory's counters before the first I/O of a read.
   *
   * @param storageRootKey - The root.
   * @param name - The directory.
   * @returns The counters.
   */
  public version(storageRootKey: string, name: string): IndexVersion {
    const root = this._roots.get(storageRootKey);
    if (root === undefined) {
      return { directory: -1, names: -1 };
    }
    return {
      directory: Math.max(root.resetAt, root.evidenceAt.get(name) ?? 0),
      names: Math.max(root.resetAt, root.namesAt),
    };
  }

  /**
   * Take the root's names counter before a listing of its children.
   *
   * @param storageRootKey - The root.
   * @returns The counter.
   */
  public namesVersion(storageRootKey: string): number {
    const root = this._roots.get(storageRootKey);
    return root === undefined ? -1 : Math.max(root.resetAt, root.namesAt);
  }

  /**
   * Install a listing of the root's children, read since `version` was taken.
   *
   * @param storageRootKey - The root.
   * @param version - The names counter taken before the listing.
   * @param names - The child directory names, dot-prefixed ones excluded.
   * @returns Whether the listing was installed as the root's names.
   */
  public installNames(storageRootKey: string, version: number, names: readonly string[]): boolean {
    const root = this._roots.get(storageRootKey);
    if (root === undefined || version !== Math.max(root.resetAt, root.namesAt) || root.nameWrites > 0) {
      return false;
    }
    if (names.length > this._maxChildren) {
      this._release(root);
      root.unindexed = true;
      root.cold = false;
      root.names.clear();
      root.namesListed = false;
      root.dirty.clear();
      this._timings.count('discovery.unretained', names.length);
      return false;
    }
    root.unindexed = false;
    const listed = new Set(names);
    for (const name of [...root.names, ...root.entries.keys()]) {
      if (!listed.has(name)) {
        this._forget(root, name);
      }
    }
    for (const name of names) {
      if (!root.names.has(name)) {
        root.names.add(name);
        root.dirty.add(name);
      }
    }
    root.namesListed = true;
    return true;
  }

  /**
   * Install what one read of a directory found, if nothing about it moved while the read ran.
   *
   * @param storageRootKey - The root.
   * @param name - The directory.
   * @param read - The counters taken before the read's first I/O, what it found, and whether the bytes determined it
   *   (false for an I/O failure other than a not-found).
   * @returns `installed` (and whether it differs from the entry it replaced), or `dirty` when it was not installed.
   */
  public install(
    storageRootKey: string,
    name: string,
    read: Readonly<{ version: IndexVersion; reading: Reading; determined: boolean }>,
  ): Readonly<{ status: 'installed'; changed: boolean } | { status: 'dirty' }> {
    const { version, reading, determined } = read;
    const root = this._roots.get(storageRootKey);
    if (
      root === undefined ||
      root.cold ||
      root.unindexed ||
      !determined ||
      (root.writes.get(name) ?? 0) > 0 ||
      version.directory !== Math.max(root.resetAt, root.evidenceAt.get(name) ?? 0)
    ) {
      return { status: 'dirty' };
    }
    const previous = root.entries.get(name);
    const changed = previous === undefined || root.dirty.has(name) || !sameReading(previous.reading, reading);
    const bytes = readingBytes(reading);
    this._bytes -= previous?.bytes ?? 0;
    if (this._bytes + bytes > this._budgetBytes) {
      root.entries.delete(name);
      root.dirty.add(name);
      this._timings.count('discovery.unretained');
      this._gauge();
      return { status: 'dirty' };
    }
    this._bytes += bytes;
    root.entries.set(name, previous !== undefined && !changed ? previous : { reading, bytes });
    root.dirty.delete(name);
    /* The directory's counter never falls: lowered, it would let a slower reader that took an older value install the
     * older bytes it read (review M1). A reading that changed moves it, so an overlapping read that captured before
     * this one is refused even when no evidence arrived between them. */
    if (changed) {
      root.evidenceAt.set(name, this._tick());
    }
    root.names.add(name);
    this._gauge();
    return { status: 'installed', changed };
  }

  /**
   * Install that a directory is gone, as an operation that removed it verified, if nothing about it moved since.
   *
   * @param storageRootKey - The root.
   * @param name - The directory.
   * @param version - The counters taken after the operation's last write settled and before its check.
   * @returns Whether the absence was installed.
   */
  public installGone(storageRootKey: string, name: string, version: IndexVersion): boolean {
    const root = this._roots.get(storageRootKey);
    if (
      root === undefined ||
      root.cold ||
      root.unindexed ||
      (root.writes.get(name) ?? 0) > 0 ||
      version.directory !== Math.max(root.resetAt, root.evidenceAt.get(name) ?? 0)
    ) {
      return false;
    }
    this._forget(root, name);
    return true;
  }

  /**
   * Remember when a duplicated copy's `tau.json` last changed, if nothing about the directory moved since.
   *
   * @param storageRootKey - The root.
   * @param name - The directory.
   * @param stat - The counters taken before the stat, and the time, when the provider could tell it.
   */
  public installModifiedAt(
    storageRootKey: string,
    name: string,
    stat: Readonly<{ version: IndexVersion; modifiedAt: number | undefined }>,
  ): void {
    const { version, modifiedAt } = stat;
    const root = this._roots.get(storageRootKey);
    const entry = root?.entries.get(name);
    if (
      root === undefined ||
      entry === undefined ||
      root.dirty.has(name) ||
      version.directory !== Math.max(root.resetAt, root.evidenceAt.get(name) ?? 0)
    ) {
      return;
    }
    entry.modifiedAt = modifiedAt;
  }

  /**
   * A full read of the root completed; unless a reset overtook it, the root was compared with storage as a whole from
   * `startedAt`.
   *
   * @param storageRootKey - The root.
   * @param startedAt - When the read began.
   */
  public warmed(storageRootKey: string, startedAt: number): void {
    const root = this._roots.get(storageRootKey);
    /* A reset while the read ran left the root cold: the next pass reads it again. */
    if (root !== undefined && !root.cold) {
      root.validatedAt = Math.max(root.validatedAt, startedAt);
    }
  }

  /**
   * Take one cold read's start: the root is open and every directory of it is unknown.
   *
   * @param storageRootKey - The root.
   * @returns The names counter for the listing.
   */
  public beginColdRead(storageRootKey: string): number {
    this.open(storageRootKey);
    const root = this._roots.get(storageRootKey)!;
    this._reset(root);
    root.cold = false;
    return Math.max(root.resetAt, root.namesAt);
  }

  /**
   * A whole comparison with storage began at `at` and has been applied: a poll of the root, or an audit cycle.
   *
   * @param storageRootKey - The root.
   * @param at - When it began.
   */
  public validated(storageRootKey: string, at: number): void {
    const root = this._roots.get(storageRootKey);
    if (root !== undefined) {
      root.validatedAt = Math.max(root.validatedAt, at);
    }
  }

  /**
   * The root must be compared with storage as a whole before a pass publishes it again: an observer reported a change
   * it could not describe, or stopped.
   *
   * @param storageRootKey - The root.
   */
  public invalidateValidation(storageRootKey: string): void {
    const root = this._roots.get(storageRootKey);
    if (root !== undefined) {
      root.validatedAt = Number.NEGATIVE_INFINITY;
    }
  }

  /**
   * Every directory of a root, or of every root, is unknown (evidence rules: a reset fact, a diff too large to
   * localize, a re-admitted root, a notice gap, a notice that names no directory).
   *
   * @param storageRootKey - The root, or undefined for every root.
   * @param reason - Why, as counted.
   */
  public cold(storageRootKey: string | undefined, reason: DiscoveryRootColdReason): void {
    const roots =
      storageRootKey === undefined
        ? [...this._roots.values()]
        : [this._roots.get(storageRootKey)].filter((root) => root !== undefined);
    for (const root of roots) {
      this._reset(root);
      countDiscoveryRootCold(reason, this._timings);
    }
  }

  /**
   * Apply evidence about paths of one root (the blueprint's evidence rules). A path is provider-relative: `''` is the
   * root itself. A fact about the root that comes with a fact naming a directory unlists the root's names; one that
   * comes alone makes the root cold, since it could be about any directory.
   *
   * @param storageRootKey - The root.
   * @param paths - Provider-relative paths the evidence names.
   * @param source - `foreign` for another tab or program; `own` for this authority's writes, whose top-level names are
   *   exactly the ones it touched, so they are read without listing the root again.
   */
  public note(storageRootKey: string, paths: readonly string[], source: 'foreign' | 'own' = 'foreign'): void {
    const root = this._roots.get(storageRootKey);
    /* A cold root's next pass reads everything; a reset already moved every counter a read in flight took. */
    if (root === undefined || root.cold || root.unindexed) {
      return;
    }
    let rootLevel = false;
    let named = false;
    for (const path of paths) {
      const normalized = normalizedPath(path);
      if (normalized === '') {
        rootLevel = true;
        continue;
      }
      named = this._noteNamed(root, normalized, source) || named;
    }
    if (rootLevel && !named) {
      this._reset(root);
      countDiscoveryRootCold('notice', this._timings);
      return;
    }
    if (rootLevel) {
      this._unlistNames(root);
    }
    /* `dirty` never outgrows the entries the root holds; past them the root is cold (A5). */
    if (root.dirty.size > Math.max(root.names.size, root.entries.size, 1)) {
      this._reset(root);
      countDiscoveryRootCold('bound', this._timings);
    }
  }

  /**
   * The provider tap's half for one write (A2 a): marks what the write names when it is issued and again when it
   * settles, and refuses an install on those directories while it is in flight.
   *
   * @param storageRootKey - The write's root.
   * @param paths - Provider-relative paths the write names.
   * @returns Call when the write settles, whether it resolved or rejected.
   */
  public beginWrite(storageRootKey: string, paths: readonly string[]): () => void {
    /* A root the index has not opened is opened, cold: a cold read that starts while the write is in flight must see
     * it (the module's `WriteIssued` marks whatever the index holds). */
    this.open(storageRootKey);
    const root = this._roots.get(storageRootKey)!;
    const names = new Set<string>();
    let nameWrites = 0;
    for (const path of paths) {
      const [name, ...rest] = normalizedPath(path).split('/');
      if (name === undefined || name === '' || name.startsWith('.')) {
        continue;
      }
      names.add(name);
      if (rest.length === 0) {
        nameWrites += 1;
      }
    }
    this.note(storageRootKey, paths, 'own');
    for (const name of names) {
      root.writes.set(name, (root.writes.get(name) ?? 0) + 1);
    }
    root.nameWrites += nameWrites;
    let settled = false;
    return () => {
      if (settled) {
        return;
      }
      settled = true;
      for (const name of names) {
        const left = (root.writes.get(name) ?? 1) - 1;
        if (left === 0) {
          root.writes.delete(name);
        } else {
          root.writes.set(name, left);
        }
      }
      root.nameWrites -= nameWrites;
      if (this._roots.get(storageRootKey) === root) {
        this.note(storageRootKey, paths, 'own');
      }
    };
  }

  /**
   * When the clock reads now, for a validation's start.
   *
   * @returns Milliseconds.
   */
  public now(): number {
    return this._now();
  }

  /**
   * Choose the next directories the audit re-reads in one root (A4), and advance its cursor.
   *
   * @param storageRootKey - The root.
   * @param count - How many.
   * @returns The directories, and whether this call wrapped the cursor to the start of a cycle.
   */
  public auditBatch(storageRootKey: string, count: number): Readonly<{ names: string[]; wrapped: boolean }> {
    const root = this._roots.get(storageRootKey);
    if (root === undefined || root.cold || root.unindexed || root.names.size === 0) {
      return { names: [], wrapped: true };
    }
    const names = [...root.names].sort();
    /* A whole cycle asked for at once starts from the beginning. */
    const start = count >= names.length ? 0 : root.auditCursor % names.length;
    const picked = names.slice(start, start + count);
    root.auditCursor = start + picked.length;
    const wrapped = root.auditCursor >= names.length;
    if (wrapped) {
      root.auditCursor = 0;
    }
    return { names: picked, wrapped };
  }

  /**
   * Count an audit's mismatch under the root's kind.
   *
   * @param kind - The root's currency when the audit read it.
   */
  public countAuditMismatch(kind: 'exclusive' | 'observed' | 'polled'): void {
    countDiscoveryAuditMismatch(kind, this._timings);
  }

  /** Whether `name` is a top-level directory evidence or a listing named, and the rules a path under it follows. */
  private _noteNamed(root: RootIndex<Reading>, path: string, source: 'foreign' | 'own'): boolean {
    const [name = '', ...rest] = path.split('/');
    if (name.startsWith('.')) {
      return false;
    }
    if (rest.length === 0) {
      if (source === 'foreign') {
        this._unlistNames(root);
      } else {
        this._addOwnName(root, name);
      }
      this._dirty(root, name);
      return true;
    }
    const tail = rest.join('/');
    const entry = root.entries.get(name);
    if (
      tail === 'tau.json' ||
      tail === '.tau' ||
      tail === '.tau/project.json' ||
      (rest.length === 1 && (entry === undefined || entry.reading.kind === 'adoptable'))
    ) {
      if (!root.names.has(name)) {
        if (source === 'foreign') {
          this._unlistNames(root);
        } else {
          this._addOwnName(root, name);
        }
      }
      this._dirty(root, name);
    }
    return true;
  }

  /**
   * This authority wrote a top-level entry: the root's names hold it without a new listing, and the names counter
   * moves, so a listing taken before the write cannot install without it (review M2).
   */
  private _addOwnName(root: RootIndex<Reading>, name: string): void {
    root.names.add(name);
    root.namesAt = this._tick();
  }

  private _dirty(root: RootIndex<Reading>, name: string): void {
    root.dirty.add(name);
    root.evidenceAt.set(name, this._tick());
    /* Counters never fall, so their memory is bounded another way: past twice the root's entries, every counter rises
     * to one new floor, which refuses every read in flight on the root and keeps every clean entry. */
    if (root.evidenceAt.size > 2 * Math.max(root.names.size, root.entries.size, 64)) {
      root.resetAt = this._tick();
      root.evidenceAt.clear();
    }
  }

  private _unlistNames(root: RootIndex<Reading>): void {
    root.namesListed = false;
    root.namesAt = this._tick();
  }

  private _reset(root: RootIndex<Reading>): void {
    this._release(root);
    root.cold = true;
    root.unindexed = false;
    root.resetAt = this._tick();
    root.namesListed = false;
    root.names.clear();
    root.dirty.clear();
    root.evidenceAt.clear();
    root.validatedAt = Number.NEGATIVE_INFINITY;
    root.auditCursor = 0;
  }

  private _forget(root: RootIndex<Reading>, name: string): void {
    this._bytes -= root.entries.get(name)?.bytes ?? 0;
    root.entries.delete(name);
    root.names.delete(name);
    root.dirty.delete(name);
    this._gauge();
  }

  private _release(root: RootIndex<Reading>): void {
    for (const entry of root.entries.values()) {
      this._bytes -= entry.bytes;
    }
    root.entries.clear();
    this._gauge();
  }

  /** Move the `discovery.indexBytes` gauge to the bytes retained now. */
  private _gauge(): void {
    const delta = this._bytes - this._gauged;
    if (delta !== 0) {
      this._timings.gauge('discovery.indexBytes', delta);
      this._gauged = this._bytes;
    }
  }

  private _tick(): number {
    this._clock += 1;
    return this._clock;
  }
}
