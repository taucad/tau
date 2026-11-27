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
  DeclaredPlaceholder,
  ExpectedEntry,
  IndexAdmits,
  IndexCompareResult,
  IndexEntryKind,
  ObservedRow,
} from '#project-index/project-index.js';
import { projectIndexDirectory, readIndexSnapshot, writeIndexSnapshot } from '#project-index/index-snapshot.js';
import type { IndexSnapshot, IndexVector } from '#project-index/index-snapshot.js';
import {
  ArrivingContentError,
  mayBePointerSize,
  pendingObjectOf,
  pendingStallMilliseconds,
  untilDeclared,
} from '#pending-content.js';
import type { MarkAnswer, PendingObject, SettledFile } from '#pending-content.js';
import { importFactsMaximumBytes, importFactsPath, parseImportFacts, verifiedImportFacts } from '#importer/facts.js';

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
export type IndexFactsOptions = ContentFactsOptions &
  Readonly<{
    digests?: ReadonlyArray<'sha256' | 'blobOid'>;
    /**
     * `false` answers only what the index already holds and trusts (a
     * committed import's recorded facts among them), and never reads a file:
     * for a caller that already holds the bytes and would only hash them
     * again (D12: the first revision is built from recorded oids).
     */
    measure?: boolean;
    /**
     * With `measure: false`, `'import'` answers only the facts a committed
     * import's record seeded (D12), each confirmed as it is answered by a
     * provider stat at exactly the size and mtime the record holds, so a
     * change the index has not observed yet is never answered with the
     * record's ids. A file placed within the racy window of the record (EQ7)
     * is not trusted, so it is measured again by its caller. Each recorded
     * path is answered once, taken or refused; asked again, it is not.
     */
    recorded?: 'import';
  }>;

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
  /** Where the index was opened, so an eviction can tell whether the root still reads the same bytes. */
  opened?: Readonly<{ provider: FileSystemProvider; path: string }>;
};

/*
 * How often a read waiting on a tree write asks again what it is owed, landing or not: a landing it was not woken for
 * is seen within this, never only at the stall bound.
 */
const landingRecheckMilliseconds = 250;

/* What a tree write said of one path (D10), and whether its write had yet to land it when the index last knew. */
type ExpectedAnswer = Readonly<{ size: number; pending?: PendingObject; arriving: boolean }>;

/*
 * One root's tree write as the reads it owes see it (D10, I7; see `untilLanded`), its lookups made once as it is
 * announced so a probe never scans the tree.
 */
type Landing = {
  /** What the write said of each path it names. */
  readonly expected: ReadonlyMap<string, ExpectedAnswer>;
  /** Every folder above a path the write lands: only these can be owed for not existing yet. */
  readonly arrivingFolders: ReadonlySet<string>;
  /** The files the write removes, and the folders removing them empties (no entry of the tree is under them). */
  readonly removing: ReadonlySet<string>;
  /** Every folder above a removed path. */
  readonly removingFolders: ReadonlySet<string>;
  /** Per folder, the removed paths directly in it. */
  readonly removingIn: ReadonlyMap<string, readonly string[]>;
  /** Removed paths seen gone; one put back (a failed step's move-back) is owed again. */
  readonly gone: Set<string>;
  /** How many times a path the write names landed, went or came back: what a held read counts as progress. */
  progress: number;
  /**
   * Once the write failed, the paths it still owed then (`owed`) and the folders whose listing would show one
   * (`listings`): each refuses until the root's next expectation or end, through its rollback (I7).
   */
  failed?: Readonly<{ owed: ReadonlySet<string>; listings: ReadonlySet<string> }>;
};

/* The folders above a root-relative path, outermost first. */
const foldersAbove = (path: string): string[] =>
  path
    .split('/')
    .slice(0, -1)
    .map((_, index, segments) => segments.slice(0, index + 1).join('/'));

/* A tree write's staged sibling (`dir/.name.tau-staged.<uuid>.tmp`) stands for its path: staging it is progress. */
const stagedSibling = /^(?<folder>.*\/)?\.(?<name>.+)\.tau-staged\.[\da-f-]{36}\.tmp$/u;
const stagedOriginal = (relative: string | undefined): string | undefined => {
  const match = relative === undefined ? undefined : stagedSibling.exec(relative)?.groups;
  return match === undefined ? relative : `${match['folder'] ?? ''}${match['name'] ?? ''}`;
};

const parentOf = (path: string): string => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');

/*
 * Marks known for a root whose index has not compared yet (D9): its stored snapshot's, or a declared root's own,
 * kept across an eviction that left its mount as it was. Each answers a file only while the file is at the size and
 * mtime it was stored at.
 */
type StoredMarks = Readonly<{
  rows: ReadonlyMap<string, Readonly<{ size: number; mtimeMs: number }>>;
  pending: Readonly<Record<string, PendingObject>>;
  declared: boolean;
  /** Carried from an evicted index rather than read from a snapshot. */
  carried: boolean;
}>;

/*
 * A tree write as its reads see it: what it names, the folders its landings make, the files it removes and the
 * folders that removing them empties (as `pruneEmptiedDirectories` finds them: no entry of the tree is under them).
 */
const landingOf = (expected: ReadonlyMap<string, ExpectedAnswer>, removed: readonly string[]): Landing => {
  const arrivingFolders = new Set<string>();
  const kept = new Set<string>();
  for (const [path, answer] of expected) {
    for (const folder of foldersAbove(path)) {
      kept.add(folder);
      if (answer.arriving) {
        arrivingFolders.add(folder);
      }
    }
  }
  const removing = new Set(removed);
  for (const path of removed) {
    for (const folder of foldersAbove(path)) {
      if (!kept.has(folder)) {
        removing.add(folder);
      }
    }
  }
  const removingFolders = new Set<string>();
  const removingIn = new Map<string, string[]>();
  for (const path of removing) {
    for (const folder of foldersAbove(path)) {
      removingFolders.add(folder);
    }
    const parent = parentOf(path);
    removingIn.set(parent, [...(removingIn.get(parent) ?? []), path]);
  }
  return { expected, arrivingFolders, removing, removingFolders, removingIn, gone: new Set(), progress: 0 };
};

/**
 * The set of Project Indexes, one per root.
 *
 * @public
 */
export class ProjectIndexes {
  private readonly _states = new Map<string, RootState>();
  /** Roots the revision layer will declare, held until it first does or the bound passes (see `awaitDeclaration`). */
  private readonly _holds = new Map<
    string,
    Readonly<{ declared: Promise<void>; release: () => void; timer: ReturnType<typeof setTimeout> }>
  >();
  /** Roots whose hold ended this session: declared, released or timed out. None is held again until evicted. */
  private readonly _settled = new Set<string>();
  /**
   * Every revision root and what its marks are (D9): `declared` once a whole declaration ran since it was mounted
   * and no observation since found a pointer-sized file changed, `unknown` otherwise. A path under no such root is
   * answered by its marks alone.
   */
  private readonly _declaration = new Map<string, 'declared' | 'unknown'>();
  /** Per root a tree write is landing, every path it named and the object each placeholder stands for (D10). */
  private readonly _expected = new Map<string, Map<string, ExpectedAnswer>>();
  /** Per root, how many tree writes have announced their entries ({@link declarationBasis}). */
  private readonly _expectations = new Map<string, number>();
  /**
   * Per root a tree write is landing now (announced and not yet ended), or failed and not yet followed by another
   * expectation or end: only these owe a read anything (D10), whatever a declaration has since made of `_expected`.
   */
  private readonly _landing = new Map<string, Landing>();
  /** Told as each root's tree write ends ({@link ProjectIndexes.onExpectationEnd}). */
  private readonly _endListeners = new Set<(root: string, failed: boolean) => void>();
  /** Reads waiting on a tree write ({@link ProjectIndexes.untilLanded}), woken by every landing. */
  private readonly _landingWaiters = new Set<() => void>();
  /** Per cold root, the marks known before its index compares (see `StoredMarks`). */
  private readonly _stored = new Map<string, StoredMarks>();
  /** Indexes whose first observation is a scan, which finds every row new rather than changed. */
  private readonly _scanning = new WeakSet<ProjectIndex>();
  /** Per root, the one read of its stored snapshot a cold answer and its open share. */
  private readonly _peeking = new Map<string, Promise<IndexSnapshot | undefined>>();
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

  /** The records already taken, by root and operation: a record seeds once, never again on a later rescan. */
  private readonly _importFactsTaken = new Set<string>();

  /**
   * What each root's import record seeded, at the size and mtime it holds:
   * what `recorded: 'import'` may answer, once per path. A path leaves once
   * asked (the first capture after the import), so no later walk trusts it.
   */
  private readonly _importSeeded = new Map<string, Map<string, Readonly<{ size: number; mtimeMs: number }>>>();
  /**
   * The snapshot writes still running. {@link ProjectIndexes.clear} stops each
   * at its next await before the disk, and {@link ProjectIndexes.close} waits for them.
   */
  private readonly _persisting = new Set<Promise<unknown>>();
  /* Aborted by every clear: a write begun before it stores nothing after it. */
  private _cleared = new AbortController();
  /* Set once by `dispose` or `close`: no snapshot write starts after it. */
  private _closed = false;

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
    /* An import record's facts, answered only while the file the provider holds now is the one it recorded. */
    const importRecorded = async (path: string, known: ContentFacts | undefined): Promise<ContentFacts | undefined> => {
      const seeded = this._importSeeded.get(key);
      const at = seeded?.get(path);
      /* A record answers each path once, taken or refused: a later walk measures, and stats no seeded path again. */
      seeded?.delete(path);
      if (seeded?.size === 0) {
        this._importSeeded.delete(key);
      }
      if (at === undefined || !answers(path, known)) {
        return undefined;
      }
      const stat = await resolution.provider.stat(joinRelativePath(resolution.path, path)).catch(() => undefined);
      return stat?.type === 'file' && stat.size === at.size && stat.mtimeMs === at.mtimeMs ? known : undefined;
    };
    const answered = await mapConcurrent(paths, factsConcurrency, async (path) => {
      options?.signal?.throwIfAborted();
      const known = index.factsFor(path);
      if (options?.recorded === 'import') {
        return { facts: await importRecorded(path, known), recorded: false };
      }
      if (answers(path, known)) {
        return { facts: known, recorded: false };
      }
      if (options?.measure === false) {
        return { facts: undefined, recorded: false };
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
   *   `'skipped'` when the root keeps none, is not open, or a clear or close
   *   overtook the write before it reached the disk, or `'busy'` when
   *   another holder has the lock: a later write is scheduled, never waited for.
   */
  public async persist(root: string): Promise<'written' | 'stale' | 'skipped' | 'busy'> {
    if (this._closed) {
      return 'skipped';
    }
    const writing = this._persist(normalizePath(root), this._cleared.signal);
    this._persisting.add(writing);
    try {
      return await writing;
    } finally {
      this._persisting.delete(writing);
    }
  }

  /**
   * Stop writing snapshots, drop every index, and wait until no snapshot write
   * this set began can still touch the disk.
   *
   * A write past its last await before the disk (the snapshot file's own write)
   * finishes; every other stops there. Then a caller may remove or move a root.
   *
   * @returns Once every snapshot write this set began has ended.
   */
  public async close(): Promise<void> {
    this.dispose();
    while (this._persisting.size > 0) {
      // oxlint-disable-next-line no-await-in-loop -- a write that ends may not start another, but wait for the set to empty.
      await Promise.allSettled(this._persisting);
    }
  }

  /** Stop writing snapshots and drop every index, without waiting for a write in flight (see {@link ProjectIndexes.close}). */
  public dispose(): void {
    this._closed = true;
    this.clear();
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
    this._reappeared(normalizePath(absolutePath));
    this._apply(absolutePath, (index, relative) => {
      index.recordFile(relative, { ...written, observedAt });
    });
  }

  /**
   * Make one file a pending entry in every index that holds it at the pointer's size (see
   * {@link ProjectIndex.markPending}): a copy of a marked placeholder is one too.
   *
   * @param absolutePath - Absolute file path.
   * @param object - The large object its pointer names.
   * @param observed - The size the pointer was written at.
   */
  public markPending(absolutePath: string, object: PendingObject, observed?: Readonly<{ size: number }>): void {
    this._apply(absolutePath, (index, relative) => {
      index.markPending(relative, object, observed);
    });
  }

  /**
   * Whether a path's root is declared and no tree write's entries are live over it: its marks alone are its word.
   *
   * @param absolutePath - Absolute file path.
   * @returns `true` when a read may end a mark it finds stale.
   */
  public declaredAt(absolutePath: string): boolean {
    const normalized = normalizePath(absolutePath);
    if (this._unknownAt(normalized)) {
      return false;
    }
    for (const root of this._expected.keys()) {
      if (relativeTo(root, normalized) !== undefined) {
        return false;
      }
    }
    return true;
  }

  /**
   * End one file's pending entry in every index that holds it: a read found it no placeholder.
   *
   * @param absolutePath - Absolute file path.
   */
  public endPending(absolutePath: string): void {
    this._apply(absolutePath, (index, relative) => {
      index.declarePending(new Map(), { paths: [relative] });
    });
  }

  /**
   * The large object a warm index records for one pending entry.
   *
   * @param absolutePath - Absolute file path.
   * @param size - The file's size as a stat found it: a file of another size is not the pointer the index marked (it
   *   was written since, and the index has not observed it yet).
   * @returns The object, or `undefined` when no index has it pending.
   */
  public pendingAt(absolutePath: string, size?: number): PendingObject | undefined {
    const covering = this._covering(absolutePath);
    const entry = covering?.index.entry(covering.relative);
    return entry === undefined || (size !== undefined && entry.size !== size) ? undefined : entry.pending;
  }

  /**
   * Know one root as the revision layer's (D9): until its whole declaration, its marks are `unknown`, so a file the
   * size of a pointer that no mark names may be a placeholder (I7). Called as the root is configured or mounted; a
   * root already known keeps what it is. While unknown, a stat of such a file waits for the declaration, once per
   * root and at most the bound, then answers from the marks; a read of one whose bytes are a pointer refuses with
   * `PENDING` until the declaration. A root whose index loaded a declared snapshot that its compare left whole is
   * declared at once.
   *
   * @param root - Absolute root the revision layer will declare.
   * @param boundMilliseconds - How long a stat waits at most; {@link pendingStallMilliseconds} when omitted.
   */
  public awaitDeclaration(root: string, boundMilliseconds?: number): void {
    const key = normalizePath(root);
    if (!this._declaration.has(key)) {
      this._declaration.set(key, this._states.get(key)?.index.declared === true ? 'declared' : 'unknown');
    }
    if (this._declaration.get(key) === 'declared' || this._holds.has(key) || this._settled.has(key)) {
      return;
    }
    let release: () => void = () => undefined;
    const declared = new Promise<void>((resolve) => {
      release = resolve;
    });
    const timer = setTimeout(() => {
      this._release(key);
    }, boundMilliseconds ?? pendingStallMilliseconds);
    /* A hold never keeps a host process alive on its own. */
    (timer as { unref?: () => void }).unref?.();
    this._holds.set(key, { declared, release, timer });
  }

  /**
   * What a file's marks say now, waiting for nothing (D9): an expected tree's answer for a path it named; a complete
   * index's mark; a stored mark while the file is at the size and mtime it was stored at; and otherwise, under a
   * revision root not yet declared, `'unknown'`.
   *
   * @param absolutePath - Absolute file path.
   * @param row - The file's size, and its mtime when a stat gave one.
   * @returns The object it stands for, `undefined` when it is no placeholder, or `'unknown'`.
   */
  public markAt(absolutePath: string, row: Readonly<{ size: number; mtimeMs?: number | undefined }>): MarkAnswer {
    const normalized = normalizePath(absolutePath);
    const expected = this._expectedAt(normalized);
    if (expected !== undefined && !expected.arriving) {
      return expected.pending !== undefined && expected.size === row.size ? expected.pending : undefined;
    }
    const answer = this._markedAt(normalized, row);
    /* A path the write has yet to land is what is on disk: its mark there, or not known (I7). */
    return answer === undefined && expected !== undefined ? 'unknown' : answer;
  }

  /**
   * End the wait on one root and every root under it: the revision layer let go of it (its first capture ended
   * without a declaration). What waited answers from the marks it finds; the root stays as known as it was, so a
   * pointer it never declared still refuses a read.
   *
   * @param root - Absolute root.
   */
  public releaseDeclaration(root: string): void {
    const key = normalizePath(root);
    this._settled.add(key);
    for (const held of this._holds.keys()) {
      if (relativeTo(key, held) !== undefined) {
        this._release(held);
      }
    }
  }

  /**
   * The first declaration of a root held for one that holds this path (see {@link ProjectIndexes.awaitDeclaration}).
   *
   * @param absolutePath - Absolute path.
   * @returns The declaration, or `undefined` when no root holding the path is held.
   */
  public declarationAt(absolutePath: string): Promise<void> | undefined {
    if (this._holds.size === 0) {
      return undefined;
    }
    const normalized = normalizePath(absolutePath);
    for (const [root, { declared }] of this._holds) {
      if (relativeTo(root, normalized) !== undefined) {
        return declared;
      }
    }
    return undefined;
  }

  /**
   * What a file the size of a pointer answers (D9, I7), waiting only for itself: a durable root's stored snapshot is
   * read first (one read, never the whole compare), so a reload's marks answer a file still as stored; and a file
   * nothing answers under a held root waits for the revision layer's word, once per root and at most the bound.
   *
   * @param file - The absolute root the view or mount answers for, the absolute file path, and the file's size and
   *   mtime as the provider stats it.
   * @param signal - The caller's cancellation.
   * @returns What its marks say (see {@link ProjectIndexes.markAt}).
   * @throws The signal's reason when the caller stops waiting.
   */
  public async settleMarks(file: SettledFile, signal?: AbortSignal): Promise<MarkAnswer> {
    const { root, authorityPath, size, mtimeMs, bytes } = file;
    if (!mayBePointerSize(size)) {
      return this.pendingAt(authorityPath, size);
    }
    await this.storedMarks(root);
    let answer = this.markAt(authorityPath, { size, mtimeMs });
    const held = answer === 'unknown' ? this.declarationAt(authorityPath) : undefined;
    if (held !== undefined && bytes !== undefined) {
      /* I3's bounded trade: a few bytes of a file the size of a pointer decide; only a pointer can be a placeholder. */
      const head = await bytes();
      if (head !== undefined && pendingObjectOf(head) === undefined) {
        return undefined;
      }
    }
    if (held !== undefined) {
      await untilDeclared(held, signal);
      answer = this.markAt(authorityPath, { size, mtimeMs });
    }
    return answer;
  }

  /**
   * Read a cold durable root's stored marks once, so its files answer before its index compares (see
   * {@link ProjectIndexes.markAt}). Nothing for a root whose index is open or that keeps no snapshot.
   *
   * @param root - Absolute root.
   */
  public async storedMarks(root: string): Promise<void> {
    const key = normalizePath(root);
    if (this._states.get(key)?.index.isComplete === true || this._stored.has(key) || !this._keepsSnapshot(key)) {
      return;
    }
    const snapshot = await this._peek(key).catch(() => undefined);
    if (snapshot !== undefined && !snapshot.rescan && this._states.get(key)?.index.isComplete !== true) {
      this._stored.set(key, {
        rows: new Map(
          snapshot.entries.flatMap(([path, kind, size, mtimeMs]) =>
            kind === 'f' ? [[path, { size, mtimeMs }] as const] : [],
          ),
        ),
        pending: snapshot.pending ?? {},
        declared: snapshot.declared === true,
        carried: false,
      });
    }
  }

  /**
   * Keep what the revision layer declares the placeholders under one root are (see
   * {@link ProjectIndex.declarePending}), in every warm index that holds them, each by its own entries; the root's own
   * index is opened first when it is cold, so the declaration is never lost to a cold open.
   *
   * @param root - Absolute root the declaration is about.
   * @param declared - The placeholders, by root-relative path.
   * @param scope - `paths`: the root-relative paths it speaks for; omitted, every path under the root. `basis`: the
   *   {@link declarationBasis} the declaration was found on; a whole declaration a tree write's expectation has
   *   overtaken since speaks for an older tree, and changes nothing.
   */
  public async declarePending(
    root: string,
    declared: ReadonlyMap<string, DeclaredPlaceholder>,
    scope?: Readonly<{ paths?: readonly string[] | undefined; basis?: number | undefined }>,
  ): Promise<void> {
    const key = normalizePath(root);
    const paths = scope?.paths;
    const basis = scope?.basis;
    const overtaken = (): boolean => basis !== undefined && this.declarationBasis(key) !== basis;
    try {
      if (!(await this._declare(key, declared, { paths, overtaken }))) {
        return;
      }
      if (paths === undefined) {
        for (const known of this._declaration.keys()) {
          if (relativeTo(key, known) !== undefined) {
            this._declaration.set(known, 'declared');
          }
        }
        /* The marks now say what the expected tree did. */
        for (const expected of this._expected.keys()) {
          if (relativeTo(key, expected) !== undefined) {
            this._expected.delete(expected);
          }
        }
      }
    } finally {
      /* A whole declaration ends the hold, even one that failed: what waited answers from the marks there are. */
      if (paths === undefined) {
        this.releaseDeclaration(key);
      }
    }
  }

  /**
   * How many tree writes have announced their entries under a root: a declaration found on one basis speaks only
   * while no write has announced a newer tree since (D10).
   *
   * @param root - Absolute root.
   * @returns The root's count of announced tree writes.
   */
  public declarationBasis(root: string): number {
    return this._expectations.get(normalizePath(root)) ?? 0;
  }

  /**
   * Know a tree's entries before its write lands them, in the index of that
   * exact root (see {@link ProjectIndex.expect}), opening it when it is cold.
   *
   * @param root - Absolute root the tree is written to.
   * @param entries - Every entry of the tree, root-relative.
   * @param removing - The root-relative files the write removes: a read of one waits until it is gone.
   */
  public async expect(root: string, entries: readonly ExpectedEntry[], removing?: readonly string[]): Promise<void> {
    const key = normalizePath(root);
    /* A declaration found before this write announced its tree speaks for the older one (D10). */
    this._expectations.set(key, this.declarationBasis(root) + 1);
    /* Known now, before the index opens or a byte lands: every path the tree names answers as the tree says (D9). */
    this._expected.set(
      normalizePath(root),
      new Map(
        entries.map(
          ({ path, size, pending, arriving }) =>
            [path, pending === undefined ? { size, arriving } : { size, pending, arriving }] as const,
        ),
      ),
    );
    this._landing.set(key, landingOf(this._expected.get(key)!, removing ?? []));
    this._noteLanding();
    /* A cold root is opened first, so a cold open's write is known as it lands. */
    const index = await this.ready(root);
    index.expect(entries);
    this._noteLanding();
  }

  /**
   * Wait until the tree write landing under a path's root has put there what its tree says (D10, I7): a file it writes
   * until it lands (a placeholder until its pointer does, after which a read goes through to the object, D9), a file
   * it removes until it is gone, and a folder only its entries make until one of them lands. A listing waits while a
   * child it would list has yet to land or go. Every other path, and every path while no write is landing, answers at
   * once, so a read never answers old bytes or a missing file in place of what the write is landing, and only a path
   * the write owes waits.
   *
   * @param absolutePath - Absolute path.
   * @param options - `listing` for a directory listing; the caller's `signal`; and the stall bound, how long nothing
   *   may land under any root before the wait refuses ({@link pendingStallMilliseconds} when omitted).
   * @throws {ArrivingContentError} When the write failed before landing it, or nothing landed for the bound.
   */
  public async untilLanded(
    absolutePath: string,
    options?: Readonly<{ listing?: boolean; signal?: AbortSignal | undefined; stallMilliseconds?: number | undefined }>,
  ): Promise<void> {
    if (this._landing.size === 0) {
      return;
    }
    const normalized = normalizePath(absolutePath);
    const listing = options?.listing === true;
    const bound = options?.stallMilliseconds ?? pendingStallMilliseconds;
    let owed = this._owedBy(normalized, listing);
    let progress = owed?.progress;
    let progressAt = Date.now();
    while (owed !== undefined) {
      /* The write that owed it failed: what is there now is neither tree, until the root's next write or end (I7). */
      if (owed.failed !== undefined) {
        throw new ArrivingContentError(normalized, 'failed');
      }
      const remaining = bound - (Date.now() - progressAt);
      if (remaining <= 0) {
        throw new ArrivingContentError(normalized, 'stalled');
      }
      // oxlint-disable-next-line no-await-in-loop -- each landing is waited for in turn until the path's own.
      await this._nextLanding(Math.min(remaining, landingRecheckMilliseconds), options?.signal);
      const next = this._owedBy(normalized, listing);
      /* Only the owing write's own landings are progress: another root's, or a write it never named, are not. */
      if (next?.progress !== progress || next !== owed) {
        progressAt = Date.now();
      }
      owed = next;
      progress = next?.progress;
    }
  }

  /**
   * Whether every one of these paths of the expected tree has landed (D10).
   *
   * @param root - Absolute root the tree is written to.
   * @param paths - Root-relative file paths.
   * @returns `true` when none is arriving; `undefined` when that root's index expects no tree.
   */
  public landed(root: string, paths: readonly string[]): boolean | undefined {
    /* A write that failed landed none of its tree for good, through its rollback (I7). */
    if (this._landing.get(normalizePath(root))?.failed !== undefined) {
      return false;
    }
    const index = this._states.get(normalizePath(root))?.index;
    return index?.expecting === true ? paths.every((path) => !index.arriving(path)) : undefined;
  }

  /**
   * The entries a tree write landing under a directory has yet to put there (D10, I7), so a listing shows what will
   * arrive rather than an empty or missing one: each file at the size the tree gives it (a placeholder's object's
   * size), and each folder only such files make. Only paths the write still has to land count; whatever is on disk
   * answers as itself (see {@link ProjectIndexes.markAt}).
   *
   * @param absoluteDirectory - Absolute directory path.
   * @param options - `recursive` for every arriving entry beneath it, not only its children; `absent` for only those
   *   the root's index holds nothing at yet (a placeholder whose pointer landed is on disk, though it still arrives).
   * @returns Directory-relative rows, parents before children; empty while no write expects any.
   */
  public arrivingIn(
    absoluteDirectory: string,
    options?: Readonly<{ recursive?: boolean; absent?: boolean }>,
  ): ReadonlyArray<Readonly<{ path: string; type: 'file' | 'dir'; size: number }>> {
    if (this._expected.size === 0) {
      return [];
    }
    const directory = normalizePath(absoluteDirectory);
    const rows = new Map<string, Readonly<{ path: string; type: 'file' | 'dir'; size: number }>>();
    for (const [root, expected] of this._expected) {
      const under = relativeTo(root, directory);
      if (under === undefined) {
        continue;
      }
      /* Once the root's index knows the tree, it says what has landed; before, the write said what it would land. */
      const index = this._states.get(root)?.index;
      const prefix = under === '' ? '' : `${under}/`;
      for (const [path, answer] of expected) {
        if (!path.startsWith(prefix) || !(index?.expecting === true ? index.arriving(path) : answer.arriving)) {
          continue;
        }
        const segments = path.slice(prefix.length).split('/');
        const last = options?.recursive === true ? segments.length : 1;
        for (let depth = 1; depth <= Math.min(last, segments.length); depth += 1) {
          const relative = segments.slice(0, depth).join('/');
          if (options?.absent === true && index?.entry(`${prefix}${relative}`) !== undefined) {
            continue;
          }
          if (!rows.has(relative)) {
            rows.set(
              relative,
              depth === segments.length
                ? { path: relative, type: 'file', size: answer.pending?.size ?? answer.size }
                : { path: relative, type: 'dir', size: 0 },
            );
          }
        }
      }
    }
    return [...rows.values()].toSorted((left, right) => left.path.localeCompare(right.path));
  }

  /**
   * End a root's expectation: its tree write is over.
   *
   * @param root - Absolute root.
   * @param options - `failed` when the write did not land every path, so its entries no longer answer.
   */
  public endExpectation(root: string, options?: Readonly<{ failed?: boolean }>): void {
    const key = normalizePath(root);
    const expected = this._expected.get(key);
    const landing = this._landing.get(key);
    if (options?.failed === true && landing !== undefined && landing.failed === undefined) {
      /*
       * A read it still owed was owed the tree, which never came, and the move-backs and rollback that follow write
       * neither tree: each such path refuses until the root's next expectation or end, never answering what is left.
       */
      landing.failed = this._stillOwed(key, landing);
    } else if (options?.failed !== true || landing?.failed === undefined) {
      /* A later write that failed before announcing its entries leaves an earlier failure's checkout torn still. */
      this._landing.delete(key);
    }
    if (options?.failed === true) {
      /* A failed write landed what it landed: every path is what is on disk, as the index observes it. */
      this._expected.delete(key);
    } else if (expected !== undefined) {
      /* The write is over and landed every path: the tree's word stands until the declaration that follows. */
      for (const [path, answer] of expected) {
        expected.set(path, { ...answer, arriving: false });
      }
    }
    this._states.get(key)?.index.endExpectation();
    this._noteLanding();
    for (const listener of this._endListeners) {
      listener(key, options?.failed === true);
    }
  }

  /**
   * Be told as each root's tree write ends, landed or failed, so a host that read the write's landings reads again
   * (D10, I7): a failed write's landings are no tree, and {@link ProjectIndexes.landed} answers `false` from then.
   *
   * @param listener - Called with the root and whether its write failed.
   * @returns Stops the listening.
   */
  public onExpectationEnd(listener: (root: string, failed: boolean) => void): () => void {
    this._endListeners.add(listener);
    return () => {
      this._endListeners.delete(listener);
    };
  }

  /**
   * Record a created directory.
   *
   * @param absolutePath - Absolute directory path.
   */
  public addDirectory(absolutePath: string): void {
    this._reappeared(normalizePath(absolutePath));
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
    this._removed(absolutePath);
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
    this._removed(source);
    this._reappeared(target);
    this._progress(source);
    this._progress(target);
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
    this._noteLanding();
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
    const carried = new Set<string>();
    for (const [root, state] of this._states) {
      if (relativeTo(changed, root) !== undefined || relativeTo(root, changed) !== undefined) {
        clearTimeout(state.persistTimer);
        this._states.delete(root);
        if (this._carry(root, state)) {
          carried.add(root);
        }
      }
    }
    for (const [root, stored] of this._stored) {
      if (relativeTo(changed, root) !== undefined && !carried.has(root) && !stored.carried) {
        this._stored.delete(root);
        this._peeking.delete(root);
      }
    }
    for (const root of this._expected.keys()) {
      if (relativeTo(changed, root) !== undefined) {
        this._expected.delete(root);
      }
    }
    /* The root no longer reads the same bytes: its write is not landed there, and nothing waits on it. */
    for (const root of this._landing.keys()) {
      if (relativeTo(changed, root) !== undefined) {
        this._landing.delete(root);
      }
    }
    this._noteLanding();
    /*
     * A root that moved is no longer what the revision layer declared: what waited answers now, a root still mounted
     * is unknown again and held again when it is configured, and an unmounted one is no revision root.
     */
    this.releaseDeclaration(changed);
    for (const root of this._settled) {
      if (relativeTo(changed, root) !== undefined) {
        this._settled.delete(root);
      }
    }
    const mounted = new Set(this._options.mountPrefixes?.() ?? []);
    for (const root of this._declaration.keys()) {
      if (relativeTo(changed, root) !== undefined && !carried.has(root)) {
        if (mounted.has(root)) {
          this._declaration.set(root, 'unknown');
        } else {
          this._declaration.delete(root);
        }
      }
    }
  }

  /** Drop every index: disposal, or a reset fact that may have moved the whole tree. */
  public clear(): void {
    this._cleared.abort();
    this._cleared = new AbortController();
    this._readFacts.clear();
    this._importFactsPending.clear();
    this._importSeeded.clear();
    for (const state of this._states.values()) {
      clearTimeout(state.persistTimer);
    }
    this._states.clear();
    /* Nothing will declare a root now: what waited answers from the marks it finds. */
    this.releaseDeclaration('/');
    this._settled.clear();
    this._declaration.clear();
    this._expected.clear();
    this._landing.clear();
    this._noteLanding();
    this._stored.clear();
    this._peeking.clear();
  }

  /* What the marks say of a file, the stored snapshot's first, then its covering index's. */
  private _markedAt(normalized: string, row: Readonly<{ size: number; mtimeMs?: number | undefined }>): MarkAnswer {
    for (const [stored, marks] of this._stored) {
      const relative = relativeTo(stored, normalized);
      const kept = relative === undefined ? undefined : marks.rows.get(relative);
      if (kept !== undefined && kept.size === row.size && kept.mtimeMs === row.mtimeMs) {
        const object = Object.hasOwn(marks.pending, relative!) ? marks.pending[relative!] : undefined;
        return object ?? (marks.declared || !this._unknownAt(normalized) ? undefined : 'unknown');
      }
      if (relative !== undefined && marks.declared && mayBePointerSize(row.size)) {
        /* A stamp vouches only for the rows it stored: a pointer-sized file written since is not known (I7). */
        return 'unknown';
      }
    }
    const covering = this._covering(normalized);
    if (covering !== undefined) {
      const entry = covering.index.entry(covering.relative);
      if (entry?.pending !== undefined && entry.size === row.size) {
        return entry.pending;
      }
      return this._unknownAt(normalized) ? 'unknown' : undefined;
    }
    return this._unknownAt(normalized) ? 'unknown' : undefined;
  }

  private async _declare(
    key: string,
    declared: ReadonlyMap<string, DeclaredPlaceholder>,
    scope: Readonly<{ paths: readonly string[] | undefined; overtaken: () => boolean }>,
  ): Promise<boolean> {
    const { paths, overtaken } = scope;
    if (overtaken()) {
      return false;
    }
    await this.ready(key);
    if (overtaken()) {
      return false;
    }
    const absolute = (path: string): string => (key === '/' ? `/${path}` : `${key}/${path}`);
    for (const [indexRoot, state] of this._states) {
      /* Where the root lies in this index: its prefix when the index holds it, `''` when the index lies inside it. */
      const prefix = this._inside(indexRoot, key) ?? (this._inside(key, indexRoot) === undefined ? undefined : '');
      if (prefix === undefined || !state.index.isComplete) {
        continue;
      }
      const inIndex = (path: string): string | undefined => {
        const relative = this._inside(indexRoot, absolute(path));
        return relative === undefined || relative === '' ? undefined : relative;
      };
      const translated = new Map(
        [...declared].flatMap(([path, placeholder]) => {
          const relative = inIndex(path);
          return relative === undefined ? [] : [[relative, placeholder] as const];
        }),
      );
      const changed = state.index.declarePending(
        translated,
        paths === undefined ? { under: prefix } : { paths: paths.flatMap((path) => inIndex(path) ?? []) },
      );
      if (changed) {
        this._schedulePersist(indexRoot);
      }
    }
    return true;
  }

  /*
   * A carried root's index reopened: each carried mark holds where its file is still at the size and mtime it was
   * carried at, and any pointer-sized file the marks no longer account for makes the root unknown again.
   */
  private _landCarried(root: string, index: ProjectIndex, stored: StoredMarks): void {
    const changed: string[] = [];
    for (const entry of index.walk('', { kinds: ['file'] })) {
      const kept = stored.rows.get(entry.path);
      const same = kept !== undefined && kept.size === entry.size && kept.mtimeMs === entry.mtimeMs;
      const object = Object.hasOwn(stored.pending, entry.path) ? stored.pending[entry.path] : undefined;
      if (same && object !== undefined) {
        index.markPending(entry.path, object, { size: entry.size });
      } else if (!same) {
        changed.push(entry.path);
      }
    }
    this._noteObserved(root, index, changed);
  }

  /*
   * Keep a declared root's marks across an eviction that left it reading the same bytes (a topology change elsewhere,
   * such as the authority root's): it stays declared, its marks answering each file still at its size and mtime, and
   * its index reopens to check them. Answers whether it carried them.
   */
  private _carry(root: string, state: RootState): boolean {
    if (this._declaration.get(root) !== 'declared' || state.opened === undefined || !state.index.isComplete) {
      return false;
    }
    let now: Readonly<{ provider: FileSystemProvider; path: string }>;
    try {
      now = this._resolve(root);
    } catch {
      return false;
    }
    if (now.provider !== state.opened.provider || now.path !== state.opened.path) {
      return false;
    }
    const rows = new Map<string, Readonly<{ size: number; mtimeMs: number }>>();
    const carriedAt = Date.now();
    for (const entry of state.index.walk('', { kinds: ['file'] })) {
      /* A file inside the racy window may change again at the same size and mtime: its mark is not carried (I5). */
      if (carriedAt - entry.mtimeMs > timestampGranularityMilliseconds) {
        rows.set(entry.path, { size: entry.size, mtimeMs: entry.mtimeMs });
      }
    }
    this._stored.set(root, { rows, pending: state.index.pendingSnapshot(), declared: true, carried: true });
    return true;
  }

  /* Whether a path lies under a revision root not yet declared. */
  private _unknownAt(normalized: string): boolean {
    for (const [root, state] of this._declaration) {
      if (state === 'unknown' && relativeTo(root, normalized) !== undefined) {
        return true;
      }
    }
    return false;
  }

  /* What the tree write landing under a path's root said of it, if it named it. */
  private _expectedAt(normalized: string): ExpectedAnswer | undefined {
    for (const [root, expected] of this._expected) {
      const relative = relativeTo(root, normalized);
      const answer = relative === undefined ? undefined : expected.get(relative);
      if (answer !== undefined) {
        /* Once the root's index knows the tree, it says what has landed; before, the write said what it would land. */
        const index = this._states.get(root)?.index;
        return index?.expecting === true ? { ...answer, arriving: index.arriving(relative!) } : answer;
      }
    }
    return undefined;
  }

  /* One read of a root's stored snapshot, shared by a cold answer and the open that follows. */
  private async _peek(root: string): Promise<IndexSnapshot | undefined> {
    let peeking = this._peeking.get(root);
    if (peeking === undefined) {
      const resolution = this._resolve(root);
      peeking =
        resolution.persist === undefined
          ? Promise.resolve(undefined)
          : readIndexSnapshot(resolution.provider, resolution.path);
      this._peeking.set(root, peeking);
    }
    return peeking;
  }

  /*
   * An observation found these paths of one index created or changed: a file now the size of a pointer that no mark
   * names may be a placeholder written from outside (a reload's compare, another program, a crash before a snapshot
   * kept the marks), so every revision root holding it is unknown again until its next whole declaration.
   */
  private _noteObserved(root: string, index: ProjectIndex, paths: Iterable<string>): void {
    for (const path of paths) {
      const entry = index.entry(path);
      if (entry?.kind !== 'file' || entry.pending !== undefined || !mayBePointerSize(entry.size)) {
        continue;
      }
      const absolute = normalizePath(root === '/' ? `/${path}` : `${root}/${path}`);
      for (const [expectedRoot, expected] of this._expected) {
        const relative = relativeTo(expectedRoot, absolute);
        if (relative !== undefined) {
          expected.delete(relative);
        }
      }
      for (const [known, state] of this._declaration) {
        if (state === 'declared' && relativeTo(known, absolute) !== undefined) {
          this._declaration.set(known, 'unknown');
          if (this._states.get(known)?.index.forgetDeclared() === true) {
            this._schedulePersist(known);
          }
        }
      }
      if (index.forgetDeclared()) {
        this._schedulePersist(root);
        /* A stamped snapshot is the revision layer's word that this is its root, opened again or not yet. */
        if (!this._declaration.has(root)) {
          this._declaration.set(root, 'unknown');
        }
      }
    }
  }

  /* End one root's hold, for this session: its marks alone answer from here. */
  private _release(root: string): void {
    const hold = this._holds.get(root);
    this._settled.add(root);
    if (hold !== undefined) {
      this._holds.delete(root);
      clearTimeout(hold.timer);
      hold.release();
    }
  }

  /* Whether one root keeps a snapshot, so a reload may know marks before anything declares them. */
  private _keepsSnapshot(root: string): boolean {
    try {
      return this._resolve(normalizePath(root)).persist !== undefined;
    } catch {
      return false;
    }
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
    const snapshot = resolution.persist === undefined ? undefined : await this._peek(root);
    this._peeking.delete(root);
    const usable = snapshot !== undefined && !snapshot.rescan;
    const index = usable
      ? ProjectIndex.fromSnapshot(snapshot.entries, snapshot.vector.generation, {
          ...(snapshot.pending === undefined ? {} : { pending: snapshot.pending }),
          ...(snapshot.declared === undefined ? {} : { declared: true }),
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
    const state: RootState = {
      index,
      seen: { ...snapshot?.vector.seqByTab },
      needsCompare: false,
      opened: { provider: resolution.provider, path: resolution.path },
    };
    this._states.set(root, state);
    workerTimings.count(usable ? 'index.load' : 'index.scan', 1);
    /* A scan finds every row new: only a compare against stored rows says what changed. */
    if (!usable) {
      this._scanning.add(index);
    }
    try {
      await this._observe(root, index, '');
    } finally {
      this._scanning.delete(index);
    }
    if (index.stalePaths.length > 0) {
      /* A rename whose source the scan had not reached yet. */
      await this._refreshStale(root, index);
    }
    if (this._states.get(root) !== state) {
      /* Evicted while opening: answer this caller, keep nothing. */
      return index;
    }
    this._inheritMarks(root, index);
    const stored = this._stored.get(root);
    this._stored.delete(root);
    if (stored?.carried === true) {
      this._landCarried(root, index, stored);
    }
    if (index.declared) {
      /* No pointer-sized row changed against the provider: the stored marks are the root's word, so nothing waits. */
      this._declaration.set(root, 'declared');
      this._release(root);
    }
    if (!usable) {
      /* A first scan may be of a project an import just committed: its first digest request seeds from the record. */
      this._importFactsPending.add(root);
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
   * holds to the file: anything else is measured like any file. A record
   * seeds once: a later rescan of the root measures its files. The record
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
      /* A record for the largest import admitted is a few megabytes; anything far past that is not one. */
      if (stat.type !== 'file' || stat.size > importFactsMaximumBytes) {
        return;
      }
      recordMtime = stat.mtimeMs;
      record = parseImportFacts(await provider.readFile(recordPath));
    } catch {
      return;
    }
    const taken = `${root}\0${record?.operationId ?? ''}`;
    if (record === undefined || this._importFactsTaken.has(taken)) {
      return;
    }
    this._importFactsTaken.add(taken);
    const seeded = verifiedImportFacts(record, { recordMtime, now: Date.now() }, (entryPath) => {
      const entry = index.settled(entryPath) ? index.entry(entryPath) : undefined;
      return entry === undefined || entry.kind === 'dir'
        ? undefined
        : { kind: 'file', size: entry.size, mtimeMs: entry.mtimeMs };
    });
    const held = this._importSeeded.get(root) ?? new Map<string, Readonly<{ size: number; mtimeMs: number }>>();
    for (const [entryPath, { facts, size, mtimeMs }] of seeded) {
      index.recordFacts(entryPath, facts, { size, mtimeMs, observedAt: recordMtime });
      held.set(entryPath, { size, mtimeMs });
    }
    this._importSeeded.set(root, held);
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
      if ((index.entry(path)?.generation ?? 0) > generation) {
        this._noteObserved(root, index, [path]);
      }
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
    if (!this._scanning.has(index)) {
      this._noteObserved(root, index, result.mismatched);
    }
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

  private async _persist(key: string, cleared: AbortSignal): Promise<'written' | 'stale' | 'skipped' | 'busy'> {
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
    /* A clear can come at any await: read the signal afresh each time. */
    const overtaken = (): boolean => cleared.aborted;
    if (overtaken()) {
      return 'skipped';
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
      signal: cleared,
      snapshot: () => {
        const pending = state.index.pendingSnapshot();
        return {
          vector: this.vector(key),
          rescan: false,
          writtenAt: Date.now(),
          entries: state.index.toSnapshot(),
          ...(Object.keys(pending).length === 0 ? {} : { pending }),
          ...(state.index.declared ? { declared: true } : {}),
          removals: state.index.removalSnapshot(),
        };
      },
    });
    if (written === 'busy' && !overtaken()) {
      this._schedulePersist(key);
    }
    return written;
  }

  private _schedulePersist(root: string): void {
    const state = this._states.get(root);
    if (state === undefined || this._options.resolve === undefined || this._closed) {
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

  /*
   * The shallowest complete index whose root contains `absolutePath` with no mount boundary between: one choice
   * whatever order the roots opened in. Every index holding a path holds its mark alike (see `_inheritMarks`).
   */
  private _covering(absolutePath: string): { index: ProjectIndex; relative: string } | undefined {
    const normalized = normalizePath(absolutePath);
    let covering: { index: ProjectIndex; relative: string; depth: number } | undefined;
    for (const [root, state] of this._states) {
      const relative = this._inside(root, normalized);
      const depth = root === '/' ? 0 : root.split('/').length;
      if (relative !== undefined && state.index.isComplete && (covering === undefined || depth < covering.depth)) {
        covering = { index: state.index, relative, depth };
      }
    }
    return covering;
  }

  /*
   * Give an index that just completed the marks the other complete indexes hold for its paths, each at the size this
   * one holds: a declaration made before it opened reaches it too, so every index answers a path alike.
   */
  private _inheritMarks(root: string, index: ProjectIndex): void {
    for (const [other, state] of this._states) {
      if (other === root || !state.index.isComplete) {
        continue;
      }
      if (this._inside(other, root) === undefined && this._inside(root, other) === undefined) {
        continue;
      }
      for (const [path, object] of Object.entries(state.index.pendingSnapshot())) {
        const relative = this._inside(root, other === '/' ? `/${path}` : `${other}/${path}`);
        const held = relative === undefined || relative === '' ? undefined : state.index.entry(path);
        if (held !== undefined && index.pendingFor(relative!) === undefined) {
          index.markPending(relative!, object, { size: held.size });
        }
      }
    }
  }

  private _apply(absolutePath: string, update: (index: ProjectIndex, relative: string) => void): void {
    const normalized = normalizePath(absolutePath);
    this._progress(normalized);
    for (const [root, state] of this._states) {
      const relative = this._inside(root, normalized);
      if (relative === undefined || relative === '' || this._excluded(relative)) {
        continue;
      }
      update(state.index, relative);
      this._schedulePersist(root);
    }
    this._noteLanding();
  }

  /* A file or folder a tree write removes is gone: a read of it, or of anything under it, no longer waits. */
  private _removed(normalized: string): void {
    for (const [root, landing] of this._landing) {
      const relative = relativeTo(root, normalized);
      if (relative === undefined || landing.failed !== undefined) {
        continue;
      }
      if (landing.removing.has(relative)) {
        landing.gone.add(relative);
      }
      if (relative === '' || landing.removingFolders.has(relative)) {
        for (const path of landing.removing) {
          if (relative === '' || path.startsWith(`${relative}/`)) {
            landing.gone.add(path);
          }
        }
      }
    }
  }

  /* A path the write removes is back (a failed step moving its backup back, I7): it is owed again until it goes. */
  private _reappeared(normalized: string): void {
    for (const [root, landing] of this._landing) {
      const relative = relativeTo(root, normalized);
      if (relative === undefined || relative === '' || landing.gone.size === 0) {
        continue;
      }
      for (const path of [...foldersAbove(relative), relative]) {
        landing.gone.delete(path);
      }
    }
  }

  /* A path a live write names landed, went or came back, or its staged bytes did: progress for the reads it holds. */
  private _progress(normalized: string): void {
    for (const [root, landing] of this._landing) {
      const relative = stagedOriginal(relativeTo(root, normalized));
      if (
        relative !== undefined &&
        (landing.expected.has(relative) ||
          landing.removing.has(relative) ||
          landing.arrivingFolders.has(relative) ||
          landing.removingFolders.has(relative))
      ) {
        landing.progress += 1;
      }
    }
  }

  /* What a failed write still owed as it failed: each path a read would have waited on, and each listing (I7). */
  private _stillOwed(root: string, landing: Landing): NonNullable<Landing['failed']> {
    const owed = new Set<string>();
    for (const path of [...landing.expected.keys(), ...landing.removing, ...landing.arrivingFolders]) {
      if (this._owesEntry(root, landing, path)) {
        owed.add(path);
      }
    }
    return { owed, listings: new Set([...owed].map((path) => parentOf(path))) };
  }

  /*
   * The tree write a read of this path waits on, if it owes the read anything (see `untilLanded`): only a write
   * landing now owes, or one that failed owing it. A listing is owed while a child it lists has yet to land (not on
   * disk at all) or to go.
   */
  private _owedBy(normalized: string, listing: boolean): Landing | undefined {
    for (const [root, landing] of this._landing) {
      const relative = relativeTo(root, normalized);
      if (relative === undefined) {
        continue;
      }
      if (listing ? this._owesListing(landing, normalized, relative) : this._owesEntry(root, landing, relative)) {
        return landing;
      }
    }
    return undefined;
  }

  private _owesListing(landing: Landing, normalized: string, relative: string): boolean {
    if (landing.failed !== undefined) {
      return landing.failed.listings.has(relative);
    }
    for (const path of landing.removingIn.get(relative) ?? []) {
      if (!landing.gone.has(path)) {
        return true;
      }
    }
    return (
      (relative === '' || landing.arrivingFolders.has(relative)) &&
      this.arrivingIn(normalized, { absent: true }).length > 0
    );
  }

  private _owesEntry(root: string, landing: Landing, relative: string): boolean {
    if (relative === '') {
      return false;
    }
    if (landing.failed !== undefined) {
      return landing.failed.owed.has(relative);
    }
    if (landing.removing.has(relative) && !landing.gone.has(relative)) {
      return true;
    }
    const index = this._states.get(root)?.index;
    const answer = landing.expected.get(relative);
    if (answer === undefined) {
      /* A folder only the write's entries make is owed until it exists. */
      return (
        landing.arrivingFolders.has(relative) &&
        index?.entry(relative) === undefined &&
        this.arrivingIn(root === '/' ? `/${relative}` : `${root}/${relative}`, { absent: true }).length > 0
      );
    }
    /*
     * Only what the write itself lands is owed: an entry already in the checkout when it was announced is the tree's
     * now (a placeholder there reads through by the tree's word, see `markAt`). Once the root's index knows the tree,
     * it says what has landed; before, the write said what it would land.
     */
    if (!answer.arriving || (index?.expecting === true && !index.arriving(relative))) {
      return false;
    }
    /* A placeholder whose own pointer has landed is read through to its object (D9): only its pointer was owed. */
    const mark = index?.pendingFor(relative);
    return answer.pending === undefined || mark?.oid !== answer.pending.oid;
  }

  /* Wake every read waiting on a tree write: something landed, went or ended. Each asks again what it is owed. */
  private _noteLanding(): void {
    if (this._landingWaiters.size === 0) {
      return;
    }
    const waiters = [...this._landingWaiters];
    this._landingWaiters.clear();
    for (const wake of waiters) {
      wake();
    }
  }

  /* The next landing: `true` when one came, `false` when the time passed first; rejects when the caller stops. */
  private async _nextLanding(milliseconds: number, signal: AbortSignal | undefined): Promise<boolean> {
    signal?.throwIfAborted();
    return new Promise<boolean>((resolve, reject) => {
      const settle = (landed: boolean): void => {
        clearTimeout(timer);
        this._landingWaiters.delete(wake);
        signal?.removeEventListener('abort', stop);
        resolve(landed);
      };
      const wake = (): void => {
        settle(true);
      };
      const stop = (): void => {
        clearTimeout(timer);
        this._landingWaiters.delete(wake);
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- an abort rejects with the caller's own reason.
        reject(signal!.reason);
      };
      const timer = setTimeout(() => {
        settle(false);
      }, milliseconds);
      (timer as { unref?: () => void }).unref?.();
      this._landingWaiters.add(wake);
      signal?.addEventListener('abort', stop, { once: true });
    });
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
