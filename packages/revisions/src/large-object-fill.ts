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
 * theirs and left alone.
 */
import { ImmutableRevisionTree } from '#algorithms/index.js';
import type { RevisionId, RevisionTreeInput } from '#algorithms/index.js';
import { readLfsPointer } from '#lfs.js';
import { equalBytes } from '#object-hash.js';
import type { LargeObjectsFacet, LargeObjectsReport } from '#project-revisions.types.js';
import type { Checkout, RevisionPort } from '#revision-port.js';

/** One placeholder: the pointer bytes on disk and the object they name. */
type Placeholder = Readonly<{ oid: string; size: number; pointer: Uint8Array<ArrayBuffer> }>;

type Fill = {
  readonly place: Checkout;
  readonly head: RevisionId;
  readonly pending: Map<string, Placeholder>;
  /** Arrived bytes not yet written, by oid. */
  readonly landed: Map<string, Uint8Array<ArrayBuffer>>;
  readonly arrived: Set<string>;
  readonly totalObjects: number;
  readonly totalBytes: number;
  bytes: number;
  error: string | undefined;
  flushing: Promise<void>;
  flushTimer: ReturnType<typeof setTimeout> | undefined;
  reportTimer: ReturnType<typeof setTimeout> | undefined;
};

/** How often arrived objects are written into the checkout, and progress told. Milliseconds. */
const defaultFlushMilliseconds = 1000;
const defaultReportMilliseconds = 250;

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
 * @returns `fill`, which starts (or restarts) one checkout's fill, and
 *   `resume`, which starts one only when none is running.
 */
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
  resume: (place: Checkout, head: RevisionId) => Promise<void>;
}> => {
  const { port, capture, withCheckoutFence, materializeTree, report } = dependencies;
  const flushMilliseconds = dependencies.flushMilliseconds ?? defaultFlushMilliseconds;
  const reportMilliseconds = dependencies.reportMilliseconds ?? defaultReportMilliseconds;
  /* One fill per checkout; a newer one replaces it, and the older one's callbacks go quiet. */
  const fills = new Map<string, Fill>();
  const isCurrent = (fill: Fill): boolean => fills.get(fill.place.id) === fill;

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
    }
    report?.({
      checkoutId: fill.place.id,
      facet: done ? undefined : facetOf(fill),
      retry: () => {
        if (isCurrent(fill) && fill.error !== undefined) {
          void run(fill);
        }
      },
    });
  };
  const tellSoon = (fill: Fill): void => {
    fill.reportTimer ??= setTimeout(() => {
      tell(fill);
    }, reportMilliseconds);
  };

  /* Write every arrived object whose placeholder is still on disk, under the checkout's fence. */
  const flushNow = async (fill: Fill): Promise<void> => {
    if (![...fill.pending.values()].some(({ oid }) => fill.landed.has(oid))) {
      return;
    }
    await withCheckoutFence(fill.place.id, async () => {
      const before = await capture(fill.place);
      const filled: string[] = [];
      const gone: string[] = [];
      const entries: RevisionTreeInput[] = before.entries().map(({ path, content, mode }) => {
        const wanted = fill.pending.get(path);
        if (wanted === undefined) {
          return [path, content, mode];
        }
        if (!equalBytes(content, wanted.pointer)) {
          gone.push(path);
          return [path, content, mode];
        }
        const bytes = fill.landed.get(wanted.oid);
        if (bytes === undefined) {
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
      const wanted = new Set([...fill.pending.values()].map(({ oid }) => oid));
      for (const oid of fill.landed.keys()) {
        if (!wanted.has(oid)) {
          fill.landed.delete(oid);
        }
      }
    });
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

  const arrive = (fill: Fill, oid: string, content: Uint8Array<ArrayBuffer>): void => {
    if (fill.arrived.has(oid)) {
      return;
    }
    fill.arrived.add(oid);
    fill.bytes += content.byteLength;
    fill.landed.set(oid, content);
  };

  const run = async (fill: Fill): Promise<void> => {
    fill.error = undefined;
    tell(fill);
    try {
      const wanted = new Set([...fill.pending.values()].map(({ oid }) => oid));
      const full = await port.readTree(fill.head, {
        onLargeObject: (oid, content) => {
          if (!isCurrent(fill) || !wanted.has(oid)) {
            return;
          }
          arrive(fill, oid, content);
          tellSoon(fill);
          fill.flushTimer ??= setTimeout(() => {
            // async-iife: bootstrap -- a timer's flush; a failed one is retried by the next, and the last is awaited below.
            void (async (): Promise<void> => {
              try {
                await flush(fill);
                tellSoon(fill);
              } catch {
                /* The final flush writes whatever this one could not. */
              }
            })();
          }, flushMilliseconds);
        },
      });
      if (!isCurrent(fill)) {
        return;
      }
      for (const [path, { oid }] of fill.pending) {
        const content = full?.get(path);
        if (content !== undefined && readLfsPointer(content) === undefined) {
          arrive(fill, oid, content);
        }
      }
      await flush(fill);
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
      /* Whatever arrived before the failure is still written. */
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
      clearTimeout(previous.flushTimer);
      clearTimeout(previous.reportTimer);
    }
    if (pending.size === 0) {
      if (previous !== undefined) {
        fills.delete(place.id);
        report?.({ checkoutId: place.id, facet: undefined, retry: () => undefined });
      }
      return;
    }
    const sizes = new Map([...pending.values()].map(({ oid, size }) => [oid, size]));
    const next: Fill = {
      place,
      head,
      pending,
      landed: new Map(),
      arrived: new Set(),
      totalObjects: sizes.size,
      totalBytes: [...sizes.values()].reduce((sum, size) => sum + size, 0),
      bytes: 0,
      error: undefined,
      flushing: Promise.resolve(),
      flushTimer: undefined,
      reportTimer: undefined,
    };
    fills.set(place.id, next);
    await run(next);
  };

  /**
   * Pick up placeholders an earlier session left (a reload mid-download), unless a fill is already running.
   *
   * @param place - The checkout.
   * @param head - Its head.
   */
  const resume = async (place: Checkout, head: RevisionId): Promise<void> => {
    if (!fills.has(place.id)) {
      await fill(place, head);
    }
  };

  return { fill, resume };
};
