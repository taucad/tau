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
 * path is filled only while it still holds exactly the pointer it was written
 * with: the bytes are content-addressed, so a filled file is the file the
 * pointer names, whichever head named it, and a path someone wrote meanwhile is
 * theirs and left alone. A placeholder is known by the object it names, not by
 * its path, so one renamed, moved, duplicated or restored meanwhile is filled
 * where it now is.
 */
import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import { lfsPointerFor, readLfsPointer } from '#lfs.js';
import { equalBytes } from '#object-hash.js';
import type { LargeObjectsFacet, LargeObjectsReport } from '#project-revisions.types.js';
import { RevisionPortError } from '#revision-port.js';
import type { Checkout, RevisionPort } from '#revision-port.js';

/** One placeholder: the pointer bytes on disk and the object they name. */
type Placeholder = Readonly<{ oid: string; size: number; pointer: Uint8Array<ArrayBuffer> }>;

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
};

/** How often arrived objects are written into the checkout, and progress told. Milliseconds. */
const defaultFlushMilliseconds = 1000;
const defaultReportMilliseconds = 250;
/** How many times one flush re-sweeps a checkout a writer changed under it before leaving it to the next flush. */
const conflictSweeps = 3;

/**
 * The placeholders a tree holds: every entry that is a pointer.
 *
 * A pointer never reaches a checkout as content — an authored pointer is
 * hydrated on every read — so a pointer in a checkout is a placeholder.
 *
 * @param tree - A tree read with `largeObjects: 'local'`, or a capture.
 * @returns The placeholders by path.
 */
export const largeObjectPlaceholders = (tree: ImmutableRevisionTree): Map<string, Placeholder> =>
  new Map(
    tree.entries().flatMap(({ path, content }) => {
      const pointer = readLfsPointer(content);
      return pointer === undefined ? [] : [[path, { oid: pointer.oid, size: pointer.size, pointer: content }] as const];
    }),
  );

/**
 * Build the fill over one project's checkout seams.
 *
 * @param dependencies - The port the objects come from, the caller's capture,
 *   fence and materialization, and who is told about progress.
 * @returns `fill`, which starts (or restarts) one checkout's fill, `resume`,
 *   which starts one only when none is running (or restarts a running one),
 *   and `stop`, which ends every fill and resolves once none is writing.
 */
// oxlint-disable-next-line eslint/max-lines-per-function -- one closure over the fills' shared map and seams.
export const createLargeObjectFill = (
  dependencies: Readonly<{
    port: Pick<RevisionPort, 'readTree'>;
    capture: (place: Checkout) => Promise<ImmutableRevisionTree>;
    withCheckoutFence: <Result>(checkoutId: string, operation: () => Promise<Result>) => Promise<Result>;
    materializeTree: (
      place: Checkout,
      target: ImmutableRevisionTree,
      materialization: Readonly<{ before: ImmutableRevisionTree }>,
    ) => Promise<unknown>;
    report?: ((report: LargeObjectsReport) => void) | undefined;
    flushMilliseconds?: number;
    reportMilliseconds?: number;
  }>,
): Readonly<{
  fill: (place: Checkout, head: RevisionId, placeholders?: ReadonlyMap<string, Placeholder>) => Promise<void>;
  resume: (place: Checkout, head: RevisionId, replace?: boolean) => Promise<void>;
  stop: () => Promise<void>;
}> => {
  const { port, capture, withCheckoutFence, materializeTree, report } = dependencies;
  const flushMilliseconds = dependencies.flushMilliseconds ?? defaultFlushMilliseconds;
  const reportMilliseconds = dependencies.reportMilliseconds ?? defaultReportMilliseconds;
  /* One fill per checkout; a newer one replaces it, and the older one's callbacks go quiet. */
  const fills = new Map<string, Fill>();
  const isCurrent = (fill: Fill): boolean => fills.get(fill.place.id) === fill;

  /* A fill that is no longer current: its timers end and its transfers stop. */
  const retire = (fill: Fill): void => {
    clearTimeout(fill.flushTimer);
    clearTimeout(fill.reportTimer);
    fill.flushTimer = undefined;
    fill.reportTimer = undefined;
    fill.controller.abort();
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
    const done = fill.pending.size === 0;
    if (done) {
      fills.delete(fill.place.id);
      retire(fill);
      fill.landed.clear();
    }
    report?.({
      checkoutId: fill.place.id,
      facet: done ? undefined : facetOf(fill),
      retry: () => {
        if (isCurrent(fill) && fill.error !== undefined) {
          fill.running = run(fill);
        }
      },
    });
  };
  const tellSoon = (fill: Fill): void => {
    fill.reportTimer ??= setTimeout(() => {
      tell(fill);
    }, reportMilliseconds);
  };

  /* What a path holds, as a placeholder this fill can fill: the one it was written with, or any pointer to a wanted object. */
  const placeholderAt = (
    fill: Fill,
    known: Placeholder | undefined,
    content: Uint8Array<ArrayBuffer>,
  ): Placeholder | undefined => {
    if (known !== undefined && equalBytes(content, known.pointer)) {
      return known;
    }
    const pointer = readLfsPointer(content);
    return pointer === undefined || !fill.wanted.has(pointer.oid)
      ? undefined
      : { oid: pointer.oid, size: pointer.size, pointer: content };
  };

  /*
   * One pass over the checkout: every placeholder naming an arrived object is
   * filled, wherever it now is; one naming an object still on its way is
   * tracked at its path; a tracked path that no longer holds its pointer is
   * someone else's now and dropped.
   */
  const sweep = async (fill: Fill): Promise<void> => {
    const before = await capture(fill.place);
    const filled: string[] = [];
    const gone: string[] = [];
    const entries: RevisionTreeInput[] = before.entries().map(({ path, content, mode }) => {
      const known = fill.pending.get(path);
      const placeholder = placeholderAt(fill, known, content);
      if (placeholder === undefined) {
        if (known !== undefined) {
          gone.push(path);
        }
        return [path, content, mode];
      }
      const bytes = fill.landed.get(placeholder.oid);
      if (bytes === undefined) {
        fill.pending.set(path, placeholder);
        return [path, content, mode];
      }
      filled.push(path);
      return [path, bytes, mode];
    });
    for (const path of fill.pending.keys()) {
      if (!before.has(path)) {
        gone.push(path);
      }
    }
    if (filled.length > 0) {
      await materializeTree(fill.place, new ImmutableRevisionTree(entries), { before });
    }
    for (const path of [...filled, ...gone]) {
      fill.pending.delete(path);
    }
  };

  /* A sweep under the checkout's fence. A writer that moved the checkout under it is swept again, never a failure. */
  const flushNow = async (fill: Fill): Promise<void> => {
    if (!isCurrent(fill)) {
      return;
    }
    const swept = await withCheckoutFence(fill.place.id, async () => {
      for (let attempt = 1; ; attempt += 1) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- each sweep re-reads what the last one lost to a writer.
          await sweep(fill);
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
    });
    if (!swept) {
      scheduleFlush(fill);
    }
  };
  const flush = async (fill: Fill): Promise<void> => {
    clearTimeout(fill.flushTimer);
    fill.flushTimer = undefined;
    // oxlint-disable-next-line promise/prefer-await-to-then -- one writer at a time per fill, in arrival order.
    const next = fill.flushing.then(async () => flushNow(fill));
    // oxlint-disable-next-line promise/prefer-await-to-then -- the chain survives a failed write; the caller still sees it.
    fill.flushing = next.catch(() => undefined);
    return next;
  };
  const scheduleFlush = (fill: Fill): void => {
    if (!isCurrent(fill)) {
      return;
    }
    fill.flushTimer ??= setTimeout(() => {
      // async-iife: bootstrap -- a timer's flush; a failed one is retried by the next, and the last is awaited by the run.
      void (async (): Promise<void> => {
        try {
          await flush(fill);
        } catch {
          /* The run's final flush writes whatever this one could not. */
        }
        tellSoon(fill);
      })();
    }, flushMilliseconds);
  };

  const arrive = (fill: Fill, oid: string, content: Uint8Array<ArrayBuffer>): void => {
    if (fill.arrived.has(oid)) {
      return;
    }
    fill.arrived.add(oid);
    fill.bytes += content.byteLength;
    fill.landed.set(oid, content);
  };

  /* The head's objects this fill still wants, found by what they hash to: a path's content is never trusted to be its old pointer's object. */
  const arriveFromTree = (fill: Fill, tree: ImmutableRevisionTree | undefined): void => {
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
    fill.error = undefined;
    tell(fill);
    try {
      const full = await port.readTree(fill.head, {
        signal: fill.controller.signal,
        onLargeObject: (oid, content) => {
          if (!isCurrent(fill) || !fill.wanted.has(oid)) {
            return;
          }
          arrive(fill, oid, content);
          tellSoon(fill);
          scheduleFlush(fill);
        },
      });
      if (!isCurrent(fill)) {
        return;
      }
      arriveFromTree(fill, full);
      await flush(fill);
      if (!isCurrent(fill)) {
        return;
      }
      /* A placeholder the head no longer names cannot be filled from it; the next pull's checkout rewrites it. */
      for (const [path, { oid }] of fill.pending) {
        if (!fill.arrived.has(oid)) {
          fill.pending.delete(path);
        }
      }
      tell(fill);
    } catch (error) {
      if (!isCurrent(fill)) {
        return;
      }
      /* Whatever arrived before the failure is still written, and what changed meanwhile swept. */
      await flush(fill).catch(() => undefined);
      fill.error = error instanceof Error ? error.message : String(error);
      tell(fill);
    }
  };

  /**
   * Fill one checkout's placeholders from `head`'s objects.
   *
   * @param place - The checkout.
   * @param head - The revision whose tree names the objects.
   * @param placeholders - What the caller just wrote; captured from the checkout when absent.
   */
  const fill = async (
    place: Checkout,
    head: RevisionId,
    placeholders?: ReadonlyMap<string, Placeholder>,
  ): Promise<void> => {
    const pending = new Map(placeholders ?? largeObjectPlaceholders(await capture(place)));
    const previous = fills.get(place.id);
    if (previous !== undefined) {
      fills.delete(place.id);
      retire(previous);
    }
    if (pending.size === 0) {
      if (previous !== undefined) {
        report?.({ checkoutId: place.id, facet: undefined, retry: () => undefined });
      }
      return;
    }
    const wanted = new Map([...pending.values()].map(({ oid, size }) => [oid, size]));
    const next: Fill = {
      place,
      head,
      pending,
      wanted,
      landed: new Map(),
      arrived: new Set(),
      totalObjects: wanted.size,
      totalBytes: [...wanted.values()].reduce((sum, size) => sum + size, 0),
      controller: new AbortController(),
      bytes: 0,
      error: undefined,
      running: Promise.resolve(),
      flushing: Promise.resolve(),
      flushTimer: undefined,
      reportTimer: undefined,
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

  return { fill, resume, stop };
};
