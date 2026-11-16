/**
 * Filling a checkout's large-object placeholders after it opens.
 *
 * An open writes the checkout from this store alone: a file whose large object
 * has not arrived is written as its pointer, so the code, the file tree and the
 * chats open while the objects download. The pointer is what the store records
 * for that path either way (`cleanLargeObjects` passes a pointer through), so a
 * placeholder is never work to save, and a cut over it records the head's tree.
 *
 * This fills each placeholder with its object's bytes as the object lands. A
 * path is filled only while it still holds a pointer to a wanted object: the
 * bytes are content-addressed, so a filled file is the file the pointer names,
 * whichever head named it, and a path someone wrote meanwhile is theirs and
 * left alone. A flush reads and writes only the paths it fills (#2010), never
 * the checkout around them, so its cost follows its batch and not the tree. A
 * placeholder is known by the object it names, not by its path, so one renamed,
 * moved, duplicated or restored meanwhile is filled where it now is: the fill
 * looks for the checkout's placeholders once more each time its own run out.
 */
import { workerTimings } from '@taucad/filesystem';
import type { DeclaredPlaceholder, FileMode } from '@taucad/filesystem';
import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import { lfsPointerFor, readLfsPointer } from '#lfs.js';
import { equalBytes } from '#object-hash.js';
import type { LargeObjectsFacet, LargeObjectsReport } from '#project-revisions.types.js';
import { RevisionPortError } from '#revision-port.js';
import { attributesOf, generatedGitattributesPath, placeholderPathMatcher } from '#workspace-config.js';
import type { AttributesReading } from '#workspace-config.js';
import type { Checkout, RevisionPort } from '#revision-port.js';

/** One placeholder: the pointer bytes on disk and the object they name. */
type Placeholder = Readonly<{ oid: string; size: number; pointer: Uint8Array<ArrayBuffer> }>;

/**
 * A path a reader waits on: its name alone, or with the object its placeholder names, so a placeholder renamed,
 * copied or restored since the fill looked is tracked where it is now. @internal
 */
export type FillPath = string | Readonly<{ path: string; oid: string; size: number }>;

const pathOf = (entry: FillPath): string => (typeof entry === 'string' ? entry : entry.path);

/** A path a flush dropped: what it held, and the attributes files on its way, as that flush read them. */
type Dropped = Readonly<{ content: Uint8Array<ArrayBuffer> | undefined; attributes: string }>;

/** What one checkout path holds, read raw. @internal */
export type FillPathContent = Readonly<{ content: Uint8Array<ArrayBuffer>; mode: FileMode }>;

/* The attributes files on one path's way as a read found them, as one comparable text: absent ones are empty. */
const attributesSignature = (read: ReadonlyMap<string, FillPathContent>, path: string): string =>
  attributesPathsOn(path)
    .map((each) => `${each}\u0000${new TextDecoder().decode(read.get(each)?.content ?? new Uint8Array())}`)
    .join('\u0000');

/* The attributes files git reads for one path: the root's and each folder's on its way. */
const attributesPathsOn = (path: string): string[] => {
  const folders = path.split('/').slice(0, -1);
  return [
    generatedGitattributesPath,
    ...folders.map((_, depth) => `${folders.slice(0, depth + 1).join('/')}/${generatedGitattributesPath}`),
  ];
};

type Fill = {
  readonly place: Checkout;
  readonly head: RevisionId;
  /** The placeholders still on disk, by path. */
  readonly pending: Map<string, Placeholder>;
  /** The objects this fill fetches, by oid, with their sizes. */
  readonly wanted: ReadonlyMap<string, number>;
  /** Arrived bytes, by oid: kept until the fill ends, so a placeholder copied or moved later is still filled. */
  readonly landed: Map<string, Uint8Array<ArrayBuffer>>;
  readonly arrived: Set<string>;
  /**
   * Whether this checkout lands an object from the host's store (W11.3): the
   * head is read with `largeObjects: 'stored'`, an arrival is its oid alone,
   * and a flush writes `{ largeObject, size }` for the checkout to clone.
   */
  fromStore: boolean;
  /** Objects the host's store turned out not to hold when a write named them: fetched as bytes instead. */
  readonly unstored: Set<string>;
  /** Objects an opened path names: fetched before the rest and written as soon as they land (D10). */
  readonly promoted: Set<string>;
  /**
   * Paths a flush dropped since the fill last looked at the whole checkout, with what each held then (`undefined`:
   * nothing) and the attributes files on its way as the flush read them. The look tracks such a path again only
   * when either changed since, so a flush and the look that disagree over one path end, one look per run-out,
   * instead of finding it again and again, while a path whose attributes changed back is filled.
   */
  readonly dropped: Map<string, Dropped>;
  /**
   * A whole-checkout look is owed: the fill's own placeholders ran out (or the fill failed) and no look has answered
   * since. The fill is never done while one is owed; a look that fails leaves it owed, and the next flush, the run's
   * end or its retry looks again (D10, I7).
   */
  lookOwed: boolean;
  /** Runs under way: a timed flush whose look failed leaves it to a running one, and starts one when none runs. */
  runs: number;
  /** Woken on every arrival, flush, report and end, so a read or `materialize` waiting on this fill re-checks (D9). */
  readonly waiters: Set<() => void>;
  readonly totalObjects: number;
  readonly totalBytes: number;
  /** Stops the fill's transfers when the checkout closes or a newer fill replaces this one. */
  readonly controller: AbortController;
  bytes: number;
  error: string | undefined;
  running: Promise<void>;
  flushing: Promise<void>;
  flushTimer: ReturnType<typeof setTimeout> | undefined;
  reportTimer: ReturnType<typeof setTimeout> | undefined;
  /** The fill's next automatic attempt after a failure; cleared by a manual retry, a success or retirement. */
  retryTimer: ReturnType<typeof setTimeout> | undefined;
  /** Failed attempts in a row, which space the automatic retries out. */
  failures: number;
  /** A timed flush is writing; another timer waits for it rather than queueing behind it. */
  flushRunning: boolean;
  /** Objects arrived while a timed flush ran: the next one is scheduled when it ends. */
  flushAgain: boolean;
  /** Bytes arrived since the last flush that wrote, which start the next one early once they reach the batch. */
  unflushedBytes: number;
};

/**
 * A write that named large objects by id found them missing from the host's
 * store (W11.3): the paths are left as they were, and the fill brings those
 * objects' bytes instead (a fetch by oid), so one object a prune or another
 * writer took from the store never fails the fill.
 *
 * @internal
 */
export class UnstoredLargeObjectsError extends RevisionPortError {
  public readonly oids: readonly string[];

  /**
   * @param oids - The objects the store did not hold.
   */
  public constructor(oids: readonly string[]) {
    super('MISSING_LARGE_OBJECT', 'The large-object store no longer holds an object this write named.');
    this.name = 'UnstoredLargeObjectsError';
    this.oids = oids;
  }
}

/** How often arrived objects are written into the checkout, and progress told. Milliseconds. */
const defaultFlushMilliseconds = 1000;
const defaultReportMilliseconds = 250;
/**
 * The most large-object bytes one flush writes into the checkout. A flush holds
 * the checkout's fence and its writes hold the project's mutation claims, so an
 * unbounded batch (everything that arrived in a second, or a backlog) kept every
 * other writer waiting; the rest is written by the next flush, which starts at once.
 */
const defaultFlushBytes = 32 * 1024 * 1024;
/** How many times one flush re-sweeps a checkout a writer changed under it before leaving it to the next flush. */
const conflictSweeps = 3;
/**
 * The waits before a failed fill tries again on its own, by failures in a row; the last repeats. A failed fill
 * is never left for the person to notice: it keeps what arrived and tries again until it lands or is replaced.
 */
const defaultRetryMilliseconds: readonly number[] = [2000, 5000, 15_000, 30_000, 60_000];

/** How one wait on a fill ends early: `signal` aborts it, `stall` gives up after that many milliseconds without progress. @internal */
export type FillWait = Readonly<{ signal?: AbortSignal; stall?: number }>;

/**
 * The placeholders a tree holds: every pointer the tree's attributes files
 * track ({@link placeholderPathMatcher}). A pointer anywhere else is a
 * person's text: never fetched, never written over.
 *
 * @param tree - A tree read with `largeObjects: 'local'`, or a capture.
 * @param reading - How the repository reads its attributes (`core.ignoreCase`).
 * @returns The placeholders by path.
 */
export const largeObjectPlaceholders = (
  tree: ImmutableRevisionTree,
  reading?: AttributesReading,
): Map<string, Placeholder> => {
  const entries = tree.entries();
  const tracked = placeholderPathMatcher(attributesOf(entries), reading);
  return new Map(
    entries.flatMap(({ path, content }) => {
      const pointer = readLfsPointer(content);
      return pointer === undefined || !tracked(path)
        ? []
        : [[path, { oid: pointer.oid, size: pointer.size, pointer: content }] as const];
    }),
  );
};

/**
 * The placeholders the revision layer declares to a checkout's index (D9): the tree's
 * {@link largeObjectPlaceholders}, the rule its fill and read-through use.
 *
 * @param tree - The checkout's tree: a capture, or the tree a write lands.
 * @param options - Paths whose pointer lands as its object (a write's sourced paths), and how the repository reads
 *   its attributes.
 * @returns The declared placeholders by path, with the size of the pointer each one is.
 */
export const declaredPlaceholders = (
  tree: ImmutableRevisionTree,
  options?: Readonly<{ except?: ReadonlyMap<string, unknown> | undefined; reading?: AttributesReading | undefined }>,
): Map<string, DeclaredPlaceholder> =>
  new Map(
    [...largeObjectPlaceholders(tree, options?.reading)].flatMap(([path, { oid, size, pointer }]) =>
      options?.except?.has(path) === true
        ? []
        : [[path, { object: { oid, size }, pointerSize: pointer.byteLength }] as const],
    ),
  );

/**
 * Build the fill over one project's checkout seams.
 *
 * @param dependencies - The port the objects come from, how the checkout's
 *   placeholders are found and its paths read, the caller's fence and
 *   materialization, and who is told about progress.
 * @returns `fill`, which starts (or restarts) one checkout's fill, `resume`,
 *   which starts one only when none is running (or restarts a running one),
 *   `forget`, which ends one checkout's fill without a word, and `stop`, which
 *   ends every fill and resolves once none is writing.
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one closure over the fills' shared map and seams.
export const createLargeObjectFill = (
  dependencies: Readonly<{
    port: Pick<RevisionPort, 'readTree' | 'fetchLargeObjects'>;
    /**
     * Every placeholder the checkout holds, found and declared as a declaration finds them (D9): the fill's look
     * when its caller names none, and its closing look each time its own placeholders run out.
     */
    placeholders: (place: Checkout) => Promise<ReadonlyMap<string, Placeholder>>;
    /** What these checkout paths hold now, read raw; a path that is gone is absent. One flush reads only its batch. */
    readPaths: (place: Checkout, paths: readonly string[]) => Promise<ReadonlyMap<string, FillPathContent>>;
    /** Say these paths, which a flush just filled, are no placeholders any more (D9), under the flush's fence. */
    declareFilled?: (place: Checkout, paths: readonly string[]) => Promise<void>;
    withCheckoutFence: <Result>(checkoutId: string, operation: () => Promise<Result>) => Promise<Result>;
    materializeTree: (
      place: Checkout,
      target: ImmutableRevisionTree,
      materialization: Readonly<{
        before: ImmutableRevisionTree;
        purpose: 'fill';
        largeObjects?: ReadonlyMap<string, Readonly<{ oid: string; size: number }>>;
      }>,
    ) => Promise<unknown>;
    /** Whether a checkout lands large objects from the host's store (`largeObjectSources`, W11.3). */
    landsFromStore?: (place: Checkout) => Promise<boolean>;
    report?: ((report: LargeObjectsReport) => void) | undefined;
    flushMilliseconds?: number;
    reportMilliseconds?: number;
    /** The most bytes one flush writes; see {@link defaultFlushBytes}. */
    flushBytes?: number;
    /** How the repository reads its attributes (`core.ignoreCase`), so the fill names what the declaration does. */
    attributesReading?: () => Promise<AttributesReading>;
    /** The waits before a failed fill tries again; see {@link defaultRetryMilliseconds}. */
    retryMilliseconds?: readonly number[];
  }>,
): Readonly<{
  fill: (
    place: Checkout,
    head: RevisionId | undefined,
    placeholders?: ReadonlyMap<string, Placeholder>,
  ) => Promise<void>;
  resume: (place: Checkout, head: RevisionId, replace?: boolean) => Promise<void>;
  forget: (checkoutId: string) => void;
  stop: () => Promise<void>;
  look: (checkoutId: string, oid: string) => LargeObjectLook | undefined;
  arrival: (checkoutId: string, oid: string, signal?: AbortSignal) => Promise<Uint8Array<ArrayBuffer> | undefined>;
  written: (
    checkoutId: string,
    paths: readonly FillPath[],
    wait?: FillWait,
  ) => Promise<'written' | 'failed' | 'stalled' | 'idle'>;
  /** Move these paths to the front of the checkout's running fill (D10); nothing when none runs. */
  prioritize: (checkoutId: string, paths: readonly FillPath[]) => void;
}> => {
  const { port, readPaths, declareFilled, withCheckoutFence, materializeTree, report, landsFromStore } = dependencies;
  const findPlaceholders = dependencies.placeholders;
  const flushMilliseconds = dependencies.flushMilliseconds ?? defaultFlushMilliseconds;
  const reportMilliseconds = dependencies.reportMilliseconds ?? defaultReportMilliseconds;
  const flushBytes = dependencies.flushBytes ?? defaultFlushBytes;
  const retryMilliseconds = dependencies.retryMilliseconds ?? defaultRetryMilliseconds;
  const attributesReading = dependencies.attributesReading ?? (async (): Promise<AttributesReading> => ({}));
  /* One fill per checkout; a newer one replaces it, and the older one's callbacks go quiet. */
  const fills = new Map<string, Fill>();
  /* Checkouts this fill has given its word on, so a host never reads silence as "nothing to fill" (D10 `filled`). */
  const told = new Set<string>();
  const isCurrent = (fill: Fill): boolean => fills.get(fill.place.id) === fill;
  /*
   * An object's landed bytes, only while they are still whole: bytes a reader was once handed and then
   * transferred elsewhere are detached (empty), and bytes of the wrong size are not the object. Such bytes are
   * forgotten and the object is owed again, fetched by its oid, so a flush never fails on them and a retry
   * can always finish.
   */
  const intactLanded = (fill: Fill, oid: string): Uint8Array<ArrayBuffer> | undefined => {
    const bytes = fill.landed.get(oid);
    if (bytes === undefined || bytes.byteLength === fill.wanted.get(oid)) {
      return bytes;
    }
    fill.landed.delete(oid);
    if (fill.arrived.delete(oid)) {
      fill.bytes -= fill.wanted.get(oid) ?? 0;
    }
    fill.unstored.add(oid);
    return undefined;
  };

  /* Whether a flush can write an object now: its bytes are in hand, or the host's store holds it whole (W11.3). */
  const isHere = (fill: Fill, oid: string): boolean =>
    fill.landed.has(oid) || (fill.fromStore && fill.arrived.has(oid));

  const wake = (fill: Fill): void => {
    /* A waiter that settles removes itself; a Set visits each remaining one once. */
    for (const waiter of fill.waiters) {
      waiter();
    }
  };

  /* A fill that is no longer current: its timers end and its transfers stop. */
  const retire = (fill: Fill): void => {
    clearTimeout(fill.flushTimer);
    clearTimeout(fill.reportTimer);
    clearTimeout(fill.retryTimer);
    fill.flushTimer = undefined;
    fill.reportTimer = undefined;
    fill.retryTimer = undefined;
    fill.controller.abort();
    wake(fill);
  };

  /*
   * Wait until `check` holds, answering `true`; `false` once the fill fails or
   * ends without it, or (given `stall`) once that many milliseconds pass with
   * nothing arriving, flushed or told. An abort rejects with its reason.
   */
  const until = async (fill: Fill, check: () => boolean, wait: FillWait = {}): Promise<boolean> => {
    const { signal, stall } = wait;
    signal?.throwIfAborted();
    const settled = Promise.withResolvers<boolean>();
    const onAbort = (): void => {
      settled.reject(signal?.reason);
    };
    let stalled: ReturnType<typeof setTimeout> | undefined;
    const waiter = (): void => {
      clearTimeout(stalled);
      if (check()) {
        settled.resolve(true);
      } else if (!isCurrent(fill) || fill.error !== undefined) {
        settled.resolve(false);
      } else if (stall !== undefined) {
        stalled = setTimeout(() => {
          settled.resolve(false);
        }, stall);
      }
    };
    fill.waiters.add(waiter);
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      waiter();
      return await settled.promise;
    } finally {
      clearTimeout(stalled);
      fill.waiters.delete(waiter);
      signal?.removeEventListener('abort', onAbort);
    }
  };

  const facetOf = (fill: Fill): LargeObjectsFacet => ({
    phase: fill.error === undefined ? 'fetching' : 'failed',
    paths: [...fill.pending.keys()].sort(),
    objects: fill.arrived.size,
    totalObjects: fill.totalObjects,
    bytes: fill.bytes,
    totalBytes: fill.totalBytes,
    ...(fill.error === undefined ? {} : { error: fill.error }),
  });

  const tell = (fill: Fill): void => {
    clearTimeout(fill.reportTimer);
    fill.reportTimer = undefined;
    if (!isCurrent(fill)) {
      return;
    }
    const done = fill.pending.size === 0 && !fill.lookOwed;
    if (done) {
      fills.delete(fill.place.id);
      retire(fill);
      fill.landed.clear();
    }
    told.add(fill.place.id);
    report?.({
      checkoutId: fill.place.id,
      facet: done ? undefined : facetOf(fill),
      retry: () => {
        if (isCurrent(fill) && fill.error !== undefined) {
          clearTimeout(fill.retryTimer);
          fill.retryTimer = undefined;
          fill.running = run(fill);
        }
      },
      prioritize: (paths) => {
        prioritize(fill, paths);
      },
    });
    wake(fill);
  };
  /* An opened path jumps the queue: its object is asked for next, and written the moment it is here. */
  const prioritize = (fill: Fill, paths: readonly FillPath[]): void => {
    if (!isCurrent(fill)) {
      return;
    }
    let landed = false;
    for (const entry of paths) {
      const path = pathOf(entry);
      /* A placeholder the fill has not tracked here, naming an object it fetches: tracked now, and the flush
       * that writes it reads the path first, so a path that holds something else by then is left alone. */
      if (typeof entry !== 'string' && fill.wanted.has(entry.oid) && !fill.pending.has(path)) {
        fill.pending.set(path, { oid: entry.oid, size: entry.size, pointer: new Uint8Array() });
        fill.dropped.delete(path);
      }
      const oid = fill.pending.get(path)?.oid;
      if (oid !== undefined) {
        fill.promoted.add(oid);
        landed ||= isHere(fill, oid);
      }
    }
    if (landed) {
      flushSoon(fill);
    }
  };
  const tellSoon = (fill: Fill): void => {
    fill.reportTimer ??= setTimeout(() => {
      tell(fill);
    }, reportMilliseconds);
  };

  /* What a path holds, as a placeholder this fill can fill: the one it was written with, or any pointer to a wanted object. */
  /* What a path holds, as a placeholder this fill can fill: a pointer to a wanted object, read from the bytes
   * themselves every time, so nothing but a pointer (an emptied file, a person's text) is ever written over. */
  const placeholderAt = (fill: Fill, content: Uint8Array<ArrayBuffer>): Placeholder | undefined => {
    const pointer = readLfsPointer(content);
    return pointer === undefined || !fill.wanted.has(pointer.oid)
      ? undefined
      : { oid: pointer.oid, size: pointer.size, pointer: content };
  };

  /* The landed bytes a later flush still has to write: one count per object a tracked placeholder still names. */
  const unflushedOf = (fill: Fill): number => {
    let total = 0;
    for (const oid of new Set([...fill.pending.values()].map((placeholder) => placeholder.oid))) {
      total +=
        fill.landed.get(oid)?.byteLength ?? (fill.fromStore && fill.arrived.has(oid) ? fill.wanted.get(oid)! : 0);
    }
    return total;
  };

  /*
   * One flush's writes (#2010): the tracked placeholders whose objects are here, at most {@link flushBytes} of
   * them (always at least one file, and every object an open file waits for), read back at their paths and the
   * paths alone, then written as a tree of just those paths. A path that no longer holds a pointer to a wanted
   * object, or one its attributes no longer track, is someone else's now and dropped; one that now names another
   * wanted object is tracked as that one. Nothing else in the checkout is read or written, so a flush costs what
   * it fills, never the checkout. A write over a path someone changed since this read refuses as a conflict
   * (the apply moves each replaced file aside and checks it is the pointer read here), and the flush sweeps again.
   *
   * Answers whether arrived objects were left for the next flush.
   */
  const sweep = async (fill: Fill): Promise<boolean> => {
    type Candidate = Readonly<{ path: string; known: Placeholder; bytes: Uint8Array<ArrayBuffer> | undefined }>;
    const batch: Candidate[] = [];
    let written = 0;
    let more = false;
    for (const [path, known] of fill.pending) {
      const bytes = intactLanded(fill, known.oid);
      if (bytes === undefined && !(fill.fromStore && fill.arrived.has(known.oid))) {
        continue;
      }
      const size = bytes?.byteLength ?? known.size;
      /* A promoted object is never left for a later batch: someone has its file open. */
      if (batch.length > 0 && written + size > flushBytes && !fill.promoted.has(known.oid)) {
        more = true;
        continue;
      }
      batch.push({ path, known, bytes });
      written += size;
    }
    if (batch.length === 0) {
      return more;
    }
    const attributesPaths = [...new Set(batch.flatMap(({ path }) => attributesPathsOn(path)))];
    const current = await readPaths(fill.place, [...batch.map(({ path }) => path), ...attributesPaths]);
    /* Only a pointer the attributes track is a placeholder: a person's pointer text is never filled (D9). */
    const tracked = placeholderPathMatcher(
      attributesOf(attributesPaths.flatMap((path) => (current.has(path) ? [{ path, ...current.get(path)! }] : []))),
      await attributesReading(),
    );
    const filled: string[] = [];
    const gone: string[] = [];
    const before: RevisionTreeInput[] = [];
    const target: RevisionTreeInput[] = [];
    /* Paths a store-landing flush writes from the store, by the object they name. */
    const sourced = new Map<string, Readonly<{ oid: string; size: number }>>();
    for (const { path, known, bytes } of batch) {
      const held = current.get(path);
      const placeholder = held === undefined || !tracked(path) ? undefined : placeholderAt(fill, held.content);
      if (held === undefined || placeholder === undefined) {
        gone.push(path);
        fill.dropped.set(path, { content: held?.content, attributes: attributesSignature(current, path) });
        continue;
      }
      if (placeholder.oid !== known.oid) {
        /* Written meanwhile with a pointer to another wanted object: tracked as that one, for the next flush. */
        fill.pending.set(path, placeholder);
        more ||= isHere(fill, placeholder.oid);
        continue;
      }
      filled.push(path);
      before.push([path, held.content, held.mode]);
      if (bytes === undefined) {
        /* The pointer stays the entry; the checkout clones the stored object in its place. */
        sourced.set(path, { oid: placeholder.oid, size: placeholder.size });
        target.push([path, held.content, held.mode]);
      } else {
        target.push([path, bytes, held.mode]);
      }
    }
    if (filled.length > 0) {
      try {
        await materializeTree(fill.place, new ImmutableRevisionTree(target), {
          before: new ImmutableRevisionTree(before),
          purpose: 'fill',
          ...(sourced.size === 0 ? {} : { largeObjects: sourced }),
        });
      } catch (error) {
        if (!(error instanceof UnstoredLargeObjectsError)) {
          throw error;
        }
        /* Nothing this flush meant is written: every placeholder stays tracked, and the objects the store
         * lacks are owed as bytes, which the run fetches by their oids. */
        let marked = 0;
        for (const oid of error.oids) {
          if (!fill.unstored.has(oid)) {
            fill.unstored.add(oid);
            marked += 1;
          }
          if (fill.arrived.delete(oid)) {
            fill.bytes -= fill.wanted.get(oid) ?? 0;
          }
        }
        if (marked === 0) {
          throw error;
        }
        for (const path of gone) {
          fill.pending.delete(path);
        }
        fill.unflushedBytes = unflushedOf(fill);
        wake(fill);
        return true;
      }
      /* The filled paths are no placeholders now (D9): said for those paths alone, as the flush wrote them. */
      await declareFilled?.(fill.place, filled);
    }
    for (const path of [...filled, ...gone]) {
      fill.pending.delete(path);
    }
    /* The fill's own placeholders ran out: the whole checkout is looked at before it can be done. */
    if (fill.pending.size === 0 && filled.length + gone.length > 0) {
      fill.lookOwed = true;
    }
    /* Counted again from what is still owed, not decremented by what was written: an object whose
     * placeholder is gone or already real would otherwise stay counted, and every later arrival
     * would flush at once. */
    fill.unflushedBytes = unflushedOf(fill);
    wake(fill);
    return more;
  };

  /*
   * The closing look (#2010): once the fill's own placeholders have all been filled or dropped, or the fill
   * failed, the checkout is asked once for the placeholders it holds, so one renamed, moved, copied or restored
   * meanwhile, which no flush read, is tracked where it now is before the fill says it is done, and one somebody
   * replaced is no longer counted as owed. Answers whether arrived objects were found for the next flush.
   */
  const reconcile = async (fill: Fill): Promise<boolean> => {
    /* What it speaks for: a path a reader named while it looked is the reader's word, kept for the next flush. */
    const looked = [...fill.pending.keys()];
    /* Owed until it answers: a look that throws leaves it owed, and the fill is not done meanwhile. */
    fill.lookOwed = true;
    const found = await findPlaceholders(fill.place);
    /* A path a flush dropped that holds the same bytes again is suppressed only while the attributes on its way
     * are those that flush read: changed since, the flush decides it again. */
    const same = [...found].flatMap(([path, placeholder]) => {
      const dropped = fill.dropped.get(path);
      return dropped?.content !== undefined && equalBytes(dropped.content, placeholder.pointer) ? [path] : [];
    });
    const attributes =
      same.length === 0
        ? new Map<string, FillPathContent>()
        : await readPaths(fill.place, [...new Set(same.flatMap((path) => attributesPathsOn(path)))]);
    if (!isCurrent(fill)) {
      return false;
    }
    for (const path of looked) {
      fill.pending.delete(path);
    }
    const unchanged = new Set(
      same.filter((path) => fill.dropped.get(path)?.attributes === attributesSignature(attributes, path)),
    );
    for (const [path, placeholder] of found) {
      if (fill.wanted.has(placeholder.oid) && !unchanged.has(path)) {
        fill.pending.set(path, placeholder);
      }
    }
    fill.dropped.clear();
    fill.lookOwed = false;
    fill.unflushedBytes = unflushedOf(fill);
    wake(fill);
    return fill.unflushedBytes > 0;
  };

  /*
   * One flush's writes under the checkout's fence, held for those writes alone so other work interleaves
   * between flushes. A writer that moved a path under it is swept again, never a failure. Once the fill's own
   * placeholders run out, it looks for any left elsewhere before it can read done. Answers whether arrived
   * objects were left for the next flush.
   */
  const flushNow = async (fill: Fill): Promise<boolean> => {
    if (!isCurrent(fill)) {
      return false;
    }
    let more = false;
    const swept = await workerTimings.span('fill.flush', async () =>
      withCheckoutFence(fill.place.id, async () => {
        /* A tree write that held the fence meanwhile replaced this fill: what it would write is not the checkout's now. */
        if (!isCurrent(fill)) {
          return true;
        }
        for (let attempt = 1; ; attempt += 1) {
          try {
            // oxlint-disable-next-line no-await-in-loop -- each sweep re-reads what the last one lost to a writer.
            more = await sweep(fill);
            return true;
          } catch (error) {
            if (!(error instanceof RevisionPortError && error.code === 'CHECKOUT_CONFLICT')) {
              throw error;
            }
            if (attempt >= conflictSweeps) {
              return false;
            }
          }
        }
      }),
    );
    if (!swept) {
      scheduleFlush(fill);
      return false;
    }
    /* Only the flush that filled or dropped the last of them looks: one look each time they run out. */
    if (fill.lookOwed && fill.pending.size === 0 && isCurrent(fill)) {
      more = await reconcile(fill);
    }
    return more;
  };
  /* One step at a time per fill, in the order asked: a flush, or a look that rewrites what the fill tracks. */
  const inTurn = async <Result>(fill: Fill, step: () => Promise<Result>): Promise<Result> => {
    // oxlint-disable-next-line promise/prefer-await-to-then -- one writer at a time per fill, in arrival order.
    const next = fill.flushing.then(step);
    /* The chain survives a failed write; the caller still sees it. */
    fill.flushing = (async (): Promise<void> => {
      try {
        await next;
      } catch {
        /* Reported to the step's own caller. */
      }
    })();
    return next;
  };
  const flush = async (fill: Fill): Promise<boolean> => {
    clearTimeout(fill.flushTimer);
    fill.flushTimer = undefined;
    return inTurn(fill, async () => flushNow(fill));
  };
  /* Flush until no arrived object is left waiting: the end of a run writes everything, a batch at a time. */
  const flushAll = async (fill: Fill): Promise<void> => {
    // oxlint-disable-next-line no-await-in-loop -- each batch writes what the last one left.
    while ((await flush(fill)) && isCurrent(fill)) {
      /* The next batch. */
    }
  };
  /*
   * One timed flush at a time: a timer that fires while one is writing marks
   * the fill to flush again when it ends instead of queueing behind it, and a
   * flush that left objects for later starts the next one at once.
   */
  const scheduleFlush = (fill: Fill, delay = flushMilliseconds): void => {
    if (!isCurrent(fill)) {
      return;
    }
    if (fill.flushRunning) {
      fill.flushAgain = true;
      return;
    }
    fill.flushTimer ??= setTimeout(() => {
      fill.flushTimer = undefined;
      fill.flushRunning = true;
      fill.flushAgain = false;
      // async-iife: bootstrap -- a timer's flush; a failed one is retried by the next, and the last is awaited by the run.
      void (async (): Promise<void> => {
        let more = false;
        try {
          more = await flush(fill);
        } catch {
          /* The run's final flush writes whatever this one could not. A look it owed and could not make is made
           * by the run: a running one at its end, else one started now, which fails and backs off if it throws. */
          if (fill.lookOwed && isCurrent(fill) && fill.runs === 0 && fill.error === undefined) {
            fill.running = run(fill);
          }
        } finally {
          fill.flushRunning = false;
        }
        tellSoon(fill);
        if (more || fill.flushAgain) {
          fill.flushAgain = false;
          scheduleFlush(fill, more || fill.unflushedBytes >= flushBytes || owesPromoted(fill) ? 0 : flushMilliseconds);
        }
      })();
    }, delay);
  };

  /* Whether an object an open file waits for has landed and is not written yet. */
  const owesPromoted = (fill: Fill): boolean =>
    [...fill.pending.values()].some(({ oid }) => fill.promoted.has(oid) && isHere(fill, oid));

  /* A flush at once, unless one is writing: that one's end starts the next at once instead. */
  const flushSoon = (fill: Fill): void => {
    if (fill.flushRunning) {
      fill.flushAgain = true;
      return;
    }
    clearTimeout(fill.flushTimer);
    fill.flushTimer = undefined;
    scheduleFlush(fill, 0);
  };

  const arrive = (fill: Fill, oid: string, content: Uint8Array<ArrayBuffer>): void => {
    if (fill.arrived.has(oid)) {
      return;
    }
    fill.arrived.add(oid);
    fill.bytes += content.byteLength;
    fill.unflushedBytes += content.byteLength;
    fill.landed.set(oid, content);
    wake(fill);
  };

  /* An object the host's store now holds whole: arrived by its oid, its bytes never in hand (W11.3). */
  const arriveStored = (fill: Fill, oid: string): void => {
    const size = fill.wanted.get(oid);
    if (size === undefined || fill.arrived.has(oid) || fill.unstored.has(oid)) {
      return;
    }
    fill.arrived.add(oid);
    fill.bytes += size;
    fill.unflushedBytes += size;
    wake(fill);
  };

  /* The head's objects this fill still wants, found by what they hash to: a path's content is never trusted to be its old pointer's object. */
  const arriveFromTree = (fill: Fill, tree: ImmutableRevisionTree | undefined): void => {
    if (fill.fromStore) {
      /* Read with `stored`: a pointer in the answer names an object the store holds whole, at its size. */
      for (const { content } of tree?.entries() ?? []) {
        const pointer = readLfsPointer(content);
        const wantedSize = pointer === undefined ? undefined : fill.wanted.get(pointer.oid);
        if (pointer !== undefined && wantedSize === pointer.size) {
          arriveStored(fill, pointer.oid);
        }
      }
    }
    const sizes = new Set([...fill.wanted].flatMap(([oid, size]) => (fill.arrived.has(oid) ? [] : [size])));
    for (const { content } of tree?.entries() ?? []) {
      if (sizes.has(content.byteLength) && readLfsPointer(content) === undefined) {
        const { oid } = lfsPointerFor(content).pointer;
        if (fill.wanted.has(oid)) {
          arrive(fill, oid, content);
        }
      }
    }
  };

  const run = async (fill: Fill): Promise<void> => {
    fill.runs += 1;
    try {
      await attempt(fill);
    } finally {
      fill.runs -= 1;
    }
  };
  const attempt = async (fill: Fill): Promise<void> => {
    fill.error = undefined;
    tell(fill);
    const transfer = {
      signal: fill.controller.signal,
      firstLargeObjects: () => fill.promoted,
      onLargeObject: (oid: string, content: Uint8Array<ArrayBuffer>) => {
        if (!isCurrent(fill) || !fill.wanted.has(oid)) {
          return;
        }
        arrive(fill, oid, content);
        tellSoon(fill);
        /* A full batch, or an object an open file waits for, flushes now rather than waiting out the timer. */
        if (fill.unflushedBytes >= flushBytes || fill.promoted.has(oid)) {
          flushSoon(fill);
        } else {
          scheduleFlush(fill);
        }
      },
    };
    try {
      fill.fromStore = (await landsFromStore?.(fill.place)) === true;
      /*
       * The placeholders name their objects, so a store that fetches by oid is asked for them at once (Tau
       * #2013): reading the head's tree first read every blob it holds before the first object was asked for.
       * A store-landing checkout reads the head with `stored`, which says which objects the store holds whole.
       */
      /* Only what has not arrived: a retry keeps what an earlier attempt brought, and asks for nothing when all is here. */
      const owedObjects = [...fill.wanted].flatMap(([oid, size]) => (fill.arrived.has(oid) ? [] : [{ oid, size }]));
      let byOid = owedObjects.length > 0 && !fill.fromStore && port.fetchLargeObjects !== undefined;
      if (byOid && port.fetchLargeObjects !== undefined) {
        try {
          const fetched = await port.fetchLargeObjects(owedObjects, transfer);
          if (!isCurrent(fill)) {
            return;
          }
          for (const [oid, content] of fetched) {
            if (fill.wanted.has(oid)) {
              arrive(fill, oid, content);
            }
          }
        } catch (error) {
          if (!isCurrent(fill)) {
            return;
          }
          /* An object the fetch by oid found missing is looked for in the head's tree, as a fill read it before. */
          if (!(error instanceof RevisionPortError && error.code === 'MISSING_LARGE_OBJECT')) {
            throw error;
          }
          byOid = false;
        }
      }
      if (!byOid && owedObjects.length > 0) {
        const full = await port.readTree(
          fill.head,
          fill.fromStore ? { ...transfer, largeObjects: 'stored' } : transfer,
        );
        if (!isCurrent(fill)) {
          return;
        }
        arriveFromTree(fill, full);
      }
      /* A placeholder the head does not name (an undo's, a merge's) is fetched by its own oid. */
      const unnamed = [...fill.wanted].flatMap(([oid, size]) => (fill.arrived.has(oid) ? [] : [{ oid, size }]));
      if (unnamed.length > 0 && port.fetchLargeObjects !== undefined) {
        const fetched = await port.fetchLargeObjects(unnamed, transfer);
        if (!isCurrent(fill)) {
          return;
        }
        for (const [oid, content] of fetched) {
          if (fill.wanted.has(oid)) {
            arrive(fill, oid, content);
          }
        }
      }
      await flushAll(fill);
      if (!isCurrent(fill)) {
        return;
      }
      /* Objects a write found missing from the store after all: their bytes, fetched by oid, are written instead.
       * A flush of those bytes can find another object gone, so this runs again for what is new — each object
       * fetched once, so it ends. */
      const refetched = new Set<string>();
      for (;;) {
        const unstored = [...fill.unstored].flatMap((oid) =>
          fill.arrived.has(oid) || refetched.has(oid) ? [] : [{ oid, size: fill.wanted.get(oid)! }],
        );
        if (unstored.length === 0 || port.fetchLargeObjects === undefined) {
          break;
        }
        for (const { oid } of unstored) {
          refetched.add(oid);
        }
        // oxlint-disable-next-line no-await-in-loop -- each pass fetches what the last one's flush found missing.
        const fetched = await port.fetchLargeObjects(unstored, transfer);
        if (!isCurrent(fill)) {
          return;
        }
        for (const [oid, content] of fetched) {
          if (fill.wanted.has(oid)) {
            arrive(fill, oid, content);
          }
        }
        // oxlint-disable-next-line no-await-in-loop -- see above.
        await flushAll(fill);
        if (!isCurrent(fill)) {
          return;
        }
      }
      /* A look a flush owed and could not make (it threw) is made here, in turn; one that throws again fails the
       * run, which tries again later, so the fill is never done without it. */
      if (fill.lookOwed && fill.pending.size === 0) {
        if (await inTurn(fill, async () => reconcile(fill))) {
          await flushAll(fill);
        }
        if (!isCurrent(fill)) {
          return;
        }
      }
      /* A placeholder neither the head nor the store delivered is still owed: the fill fails, never reads done (D10). */
      if ([...fill.pending.values()].some(({ oid }) => !fill.arrived.has(oid))) {
        throw new RevisionPortError('MISSING_LARGE_OBJECT', 'A large object this checkout holds could not be fetched.');
      }
      fill.failures = 0;
      tell(fill);
    } catch (error) {
      if (!isCurrent(fill)) {
        return;
      }
      /* Whatever arrived before the failure is still written, and what changed meanwhile found again. */
      await flushAll(fill).catch(() => undefined);
      if (
        isCurrent(fill) &&
        (fill.pending.size > 0 || fill.lookOwed) &&
        (await inTurn(fill, async () => reconcile(fill)).catch(() => false))
      ) {
        await flushAll(fill).catch(() => undefined);
      }
      fill.error = error instanceof Error ? error.message : String(error);
      fill.failures += 1;
      tell(fill);
      retryLater(fill);
    }
  };
  /* A failed fill tries again on its own, spaced out by its failures in a row, while it is still the checkout's. */
  const retryLater = (fill: Fill): void => {
    if (!isCurrent(fill) || fill.error === undefined) {
      return;
    }
    clearTimeout(fill.retryTimer);
    const retryDelay = retryMilliseconds[Math.min(fill.failures, retryMilliseconds.length) - 1] ?? 60_000;
    fill.retryTimer = setTimeout(() => {
      fill.retryTimer = undefined;
      if (isCurrent(fill) && fill.error !== undefined) {
        fill.running = run(fill);
      }
    }, retryDelay);
  };

  /**
   * Fill one checkout's placeholders from `head`'s objects.
   *
   * A caller that names what it just wrote is always answered, even when that
   * is nothing to fill: a host that forgot the checkout's fill at a tree write
   * waits for this word on the new tree (D10).
   *
   * @param place - The checkout.
   * @param head - The revision whose tree names the objects; none before a
   *   checkout's first revision, when there is nothing it can owe.
   * @param placeholders - What the caller just wrote; captured from the checkout when absent.
   */
  const fill = async (
    place: Checkout,
    head: RevisionId | undefined,
    placeholders?: ReadonlyMap<string, Placeholder>,
  ): Promise<void> => {
    const pending = new Map(placeholders ?? (await findPlaceholders(place)));
    const previous = fills.get(place.id);
    if (previous !== undefined) {
      fills.delete(place.id);
      retire(previous);
    }
    if (pending.size === 0) {
      if (previous !== undefined || placeholders !== undefined || !told.has(place.id)) {
        told.add(place.id);
        report?.({ checkoutId: place.id, facet: undefined, retry: () => undefined, prioritize: () => undefined });
      }
      return;
    }
    if (head === undefined) {
      /* A placeholder only a revision's tree can explain: with none, the check fails and is asked again. */
      throw new RevisionPortError(
        'MISSING_LARGE_OBJECT',
        'This checkout holds a large-object placeholder but has no revision to fetch it from.',
      );
    }
    const wanted = new Map([...pending.values()].map(({ oid, size }) => [oid, size]));
    const next: Fill = {
      place,
      head,
      pending,
      wanted,
      landed: new Map(),
      arrived: new Set(),
      fromStore: false,
      unstored: new Set(),
      /* A refill keeps what open files asked for. */
      promoted: new Set([...(previous?.promoted ?? [])].filter((oid) => wanted.has(oid))),
      dropped: new Map(),
      lookOwed: false,
      runs: 0,
      waiters: new Set(),
      totalObjects: wanted.size,
      totalBytes: [...wanted.values()].reduce((sum, size) => sum + size, 0),
      controller: new AbortController(),
      bytes: 0,
      error: undefined,
      running: Promise.resolve(),
      flushing: Promise.resolve(),
      flushTimer: undefined,
      reportTimer: undefined,
      retryTimer: undefined,
      failures: 0,
      flushRunning: false,
      flushAgain: false,
      unflushedBytes: 0,
    };
    fills.set(place.id, next);
    next.running = run(next);
    await next.running;
  };

  /**
   * Pick up placeholders an earlier session left (a reload mid-download), unless a fill is already running.
   *
   * @param place - The checkout.
   * @param head - Its head.
   * @param replace - Begin the running fill again from the checkout instead, and only if one runs.
   */
  const resume = async (place: Checkout, head: RevisionId, replace = false): Promise<void> => {
    if (replace === fills.has(place.id)) {
      await fill(place, head);
    }
  };

  /**
   * End every fill: transfers stop, timers clear, and nothing more is told.
   *
   * @returns Once no fill is reading or writing.
   */
  const stop = async (): Promise<void> => {
    const stopped = [...fills.values()];
    fills.clear();
    for (const each of stopped) {
      retire(each);
    }
    await Promise.allSettled(stopped.flatMap(({ running, flushing }) => [running, flushing]));
  };

  /**
   * What this fill knows of one object on one checkout: whether it is still
   * coming or failed, and its bytes when they have landed but are not written.
   *
   * @param checkoutId - The checkout.
   * @param oid - The large object.
   * @returns `undefined` when no fill on that checkout wants it.
   */
  const look = (checkoutId: string, oid: string): LargeObjectLook | undefined => {
    const current = fills.get(checkoutId);
    if (current === undefined || !current.wanted.has(oid)) {
      return undefined;
    }
    const state = current.error === undefined ? 'filling' : 'failed';
    const bytes = intactLanded(current, oid);
    if (bytes === undefined) {
      return { state };
    }
    return {
      state,
      /* A copy, made only when asked for: a reader may transfer what it is given (a worker reply), which would empty the fill's own bytes. */
      get bytes(): Uint8Array<ArrayBuffer> {
        return new Uint8Array(bytes);
      },
    };
  };

  /**
   * The bytes of one object once this fill has them.
   *
   * @param checkoutId - The checkout.
   * @param oid - The large object.
   * @param signal - Stops waiting; the wait then rejects.
   * @returns The bytes, or `undefined` when no fill wants it or the fill failed or ended first.
   */
  const arrival = async (
    checkoutId: string,
    oid: string,
    signal?: AbortSignal,
  ): Promise<Uint8Array<ArrayBuffer> | undefined> => {
    const current = fills.get(checkoutId);
    if (current === undefined || !current.wanted.has(oid)) {
      return undefined;
    }
    let bytes: Uint8Array<ArrayBuffer> | undefined;
    const found = await until(
      current,
      () => {
        bytes = intactLanded(current, oid);
        return bytes !== undefined;
      },
      { signal },
    );
    /* A copy, as `look` gives: the fill's own bytes are written by its next flush and must stay whole. */
    return found && bytes !== undefined ? new Uint8Array(bytes) : undefined;
  };

  /**
   * Wait until these paths no longer hold a placeholder this fill tracks,
   * promoting them first (D9 `materialize`). A fill replaced meanwhile is
   * followed to its successor.
   *
   * @param checkoutId - The checkout.
   * @param paths - Checkout-relative paths.
   * @param wait - `signal` stops waiting (the wait then rejects); `stall` is the milliseconds with no progress after which it gives up.
   * @returns `written`; `failed` when the transfer failed first; `stalled` when it made no progress for `stall`;
   *   `idle` when no fill runs on the checkout.
   */
  const written = async (
    checkoutId: string,
    paths: readonly FillPath[],
    wait?: FillWait,
  ): Promise<'written' | 'failed' | 'stalled' | 'idle'> => {
    for (let current = fills.get(checkoutId); current !== undefined; current = fills.get(checkoutId)) {
      prioritize(current, paths);
      const tracked = current;
      // oxlint-disable-next-line no-await-in-loop -- a replaced fill is followed to its successor, one at a time.
      if (await until(tracked, () => paths.every((entry) => !tracked.pending.has(pathOf(entry))), wait)) {
        return 'written';
      }
      if (isCurrent(tracked)) {
        return tracked.error === undefined ? 'stalled' : 'failed';
      }
    }
    return 'idle';
  };

  /**
   * End one checkout's fill without telling anyone: its tree is being replaced,
   * and the fill of the new tree speaks for the checkout next (D10, I7).
   *
   * @param checkoutId - The checkout.
   */
  const forget = (checkoutId: string): void => {
    const current = fills.get(checkoutId);
    if (current !== undefined) {
      fills.delete(checkoutId);
      retire(current);
    }
  };

  return {
    fill,
    resume,
    forget,
    stop,
    look,
    arrival,
    written,
    prioritize: (checkoutId: string, paths: readonly FillPath[]): void => {
      const current = fills.get(checkoutId);
      if (current !== undefined) {
        prioritize(current, paths);
      }
    },
  };
};

/** One large object as a running fill sees it. @public */
export type LargeObjectLook = Readonly<{
  state: 'filling' | 'failed';
  /** Present once the object has landed and before it is written into the checkout. */
  bytes?: Uint8Array<ArrayBuffer>;
}>;
