/**
 * Worker-side timing for the hosted project open: where a cold open's minutes go.
 *
 * Git, LFS and the checkout apply run in the file-manager worker, so the page's
 * resource timing sees none of it. This recorder keeps, per second of the
 * worker's clock, how often each span ran and how long it took, how often each
 * counter moved and how high each gauge stood. A window — an apply, a fill, an
 * open — is summarised afterwards from those buckets, so overlapping windows
 * need no bookkeeping of their own, and memory stays bounded by the buckets
 * kept, never by the operations recorded.
 *
 * Every span is also a `performance.measure` (`tau:<span>`), cleared in bulk
 * once enough have accumulated, so a profile of the worker shows the same
 * spans the summary counts.
 *
 * No path, URL, oid or id is ever recorded: names are a closed vocabulary.
 *
 * @module
 */

/**
 * The timed spans.
 *
 * - `lfs.store`: one large object written into the store after its transfer.
 * - `fence.wait` / `fence.held`: a checkout fence, waited for and then held.
 * - `queue.wait` / `queue.held`: a mutation's resource-queue claims, waited for and then held.
 * - `fill.flush`: one large-object fill flush (capture, materialize, verify).
 * - `capture.tree`: one checkout comparison capture.
 * - `apply.hold`: one tree apply, from its first write to its release.
 * - `records.project`: the opening pull's chat and evidence fetch and projection.
 *
 * @public
 */
export const workerTimingSpans = [
  'lfs.store',
  'fence.wait',
  'fence.held',
  'queue.wait',
  'queue.held',
  'fill.flush',
  'capture.tree',
  'apply.hold',
  'records.project',
] as const;

/** One timed span's name. @public */
export type WorkerTimingSpan = (typeof workerTimingSpans)[number];

/**
 * The counters, summarised as a total and the busiest second.
 *
 * - `events.change`: change events the worker's bus delivered.
 * - `revisions.changed`: `changed` events sent to a checkout machine.
 * - `listing.bytes`: file bytes a directory listing read to describe its entries.
 * - `locks.set`: ordered Web Lock sets a mutation acquired (one per `withCrossTabLocks` call).
 * - `locks.token`: the tokens those sets named, so `locks.token / locks.set` is the mean set size.
 * - `changesets`: changesets the authority applied under their lock set (one per `apply`, D2).
 * - `uncommitted.verified` / `uncommitted.removed`: recorded creates an initialise checked after their
 *   realm died, and those it removed for not holding their recorded size or oid (I1).
 *
 * @public
 */
export const workerTimingCounters = [
  'events.change',
  'revisions.changed',
  'listing.bytes',
  'locks.set',
  'locks.token',
  'changesets',
  'uncommitted.verified',
  'uncommitted.removed',
] as const;

/** One counter's name. @public */
export type WorkerTimingCounter = (typeof workerTimingCounters)[number];

/**
 * The gauges, summarised as their highest value.
 *
 * - `capture.inflight`: comparison captures running at once.
 * - `bridge.pending`: page requests the worker's filesystem bridge has not answered yet.
 *
 * @public
 */
export const workerTimingGauges = ['capture.inflight', 'bridge.pending'] as const;

/** One gauge's name. @public */
export type WorkerTimingGauge = (typeof workerTimingGauges)[number];

/** One span's figures over a window. @public */
export type WorkerTimingSpanSummary = Readonly<{ count: number; totalMilliseconds: number; maxMilliseconds: number }>;

/** One counter's figures over a window. @public */
export type WorkerTimingCounterSummary = Readonly<{ total: number; peakPerSecond: number }>;

/** What a window cost, by span, counter and gauge; a name that never moved is absent. @public */
export type WorkerTimingSummary = Readonly<{
  durationMilliseconds: number;
  spans: Readonly<Partial<Record<WorkerTimingSpan, WorkerTimingSpanSummary>>>;
  counters: Readonly<Partial<Record<WorkerTimingCounter, WorkerTimingCounterSummary>>>;
  gauges: Readonly<Partial<Record<WorkerTimingGauge, number>>>;
}>;

/** The recorder. @public */
export type WorkerTimings = Readonly<{
  /** The recorder's clock, in milliseconds; a window starts at one of its readings. */
  now: () => number;
  /** Time `operation` as `span`, whether it resolves or rejects. */
  span: <Result>(span: WorkerTimingSpan, operation: () => Promise<Result>) => Promise<Result>;
  /** Record one span that started at `startedAt` (a {@link WorkerTimings.now} reading) and ends now. */
  record: (span: WorkerTimingSpan, startedAt: number) => void;
  /** Move a counter. */
  count: (counter: WorkerTimingCounter, amount?: number) => void;
  /** Move a gauge up or down. */
  gauge: (gauge: WorkerTimingGauge, delta: number) => void;
  /** Everything recorded from `startedAt` until now, to the second. */
  summarize: (startedAt: number) => WorkerTimingSummary;
}>;

type SpanBucket = { count: number; total: number; max: number };
type Bucket = {
  spans: Map<WorkerTimingSpan, SpanBucket>;
  counters: Map<WorkerTimingCounter, number>;
  gauges: Map<WorkerTimingGauge, number>;
};

/** Seconds of buckets kept: a cold open measured at twenty minutes, with room to spare. */
const keptSeconds = 2 * 60 * 60;
/** Measures the timeline may hold before this recorder clears its own. */
const measuresBeforeClear = 4096;

/**
 * Create a recorder.
 *
 * @param options - The clock and whether spans are also `performance.measure`d; both default to the global `performance`.
 * @returns The recorder.
 * @public
 */
export const createWorkerTimings = (
  options: Readonly<{ now?: () => number; measure?: boolean }> = {},
): WorkerTimings => {
  const clock = options.now ?? (() => performance.now());
  const measuring = options.measure ?? typeof performance.measure === 'function';
  const buckets = new Map<number, Bucket>();
  const gaugeLevels = new Map<WorkerTimingGauge, number>();
  let measures = 0;

  const bucketAt = (milliseconds: number): Bucket => {
    const second = Math.floor(milliseconds / 1000);
    let bucket = buckets.get(second);
    if (bucket === undefined) {
      bucket = { spans: new Map(), counters: new Map(), gauges: new Map(gaugeLevels) };
      buckets.set(second, bucket);
      /* Map order is insertion order, which is time order: the oldest go first. */
      for (const kept of buckets.keys()) {
        if (kept > second - keptSeconds) {
          break;
        }
        buckets.delete(kept);
      }
    }
    return bucket;
  };

  const measure = (span: WorkerTimingSpan, startedAt: number, endedAt: number): void => {
    if (!measuring) {
      return;
    }
    try {
      performance.measure(`tau:${span}`, { start: startedAt, end: endedAt });
      measures += 1;
      if (measures >= measuresBeforeClear) {
        measures = 0;
        for (const name of workerTimingSpans) {
          performance.clearMeasures(`tau:${name}`);
        }
      }
    } catch {
      /* A timeline that refuses a measure (an origin clock reset) still has the summary. */
    }
  };

  const record = (span: WorkerTimingSpan, startedAt: number): void => {
    const endedAt = clock();
    const milliseconds = Math.max(0, endedAt - startedAt);
    const row = bucketAt(endedAt).spans;
    const current = row.get(span);
    if (current === undefined) {
      row.set(span, { count: 1, total: milliseconds, max: milliseconds });
    } else {
      current.count += 1;
      current.total += milliseconds;
      current.max = Math.max(current.max, milliseconds);
    }
    measure(span, startedAt, endedAt);
  };

  const span = async <Result>(name: WorkerTimingSpan, operation: () => Promise<Result>): Promise<Result> => {
    const startedAt = clock();
    try {
      return await operation();
    } finally {
      record(name, startedAt);
    }
  };

  const count = (counter: WorkerTimingCounter, amount = 1): void => {
    const row = bucketAt(clock()).counters;
    row.set(counter, (row.get(counter) ?? 0) + amount);
  };

  const gauge = (name: WorkerTimingGauge, delta: number): void => {
    const level = Math.max(0, (gaugeLevels.get(name) ?? 0) + delta);
    gaugeLevels.set(name, level);
    const row = bucketAt(clock()).gauges;
    row.set(name, Math.max(row.get(name) ?? 0, level));
  };

  const summarize = (startedAt: number): WorkerTimingSummary => {
    const endedAt = clock();
    const first = Math.floor(startedAt / 1000);
    const last = Math.floor(endedAt / 1000);
    const spans = new Map<WorkerTimingSpan, SpanBucket>();
    const counters = new Map<WorkerTimingCounter, { total: number; peak: number }>();
    const gauges = new Map<WorkerTimingGauge, number>([...gaugeLevels].filter(([, level]) => level > 0));
    for (const [second, bucket] of buckets) {
      if (second < first || second > last) {
        continue;
      }
      for (const [name, row] of bucket.spans) {
        const sum = spans.get(name);
        spans.set(
          name,
          sum === undefined
            ? { ...row }
            : { count: sum.count + row.count, total: sum.total + row.total, max: Math.max(sum.max, row.max) },
        );
      }
      for (const [name, amount] of bucket.counters) {
        const sum = counters.get(name);
        counters.set(name, { total: (sum?.total ?? 0) + amount, peak: Math.max(sum?.peak ?? 0, amount) });
      }
      for (const [name, level] of bucket.gauges) {
        if (level > 0) {
          gauges.set(name, Math.max(gauges.get(name) ?? 0, level));
        }
      }
    }
    return {
      durationMilliseconds: Math.max(0, endedAt - startedAt),
      spans: Object.fromEntries(
        [...spans].map(([name, { count: times, total, max }]) => [
          name,
          { count: times, totalMilliseconds: Math.round(total), maxMilliseconds: Math.round(max) },
        ]),
      ),
      counters: Object.fromEntries(
        [...counters].map(([name, { total, peak }]) => [name, { total, peakPerSecond: peak }]),
      ),
      gauges: Object.fromEntries(gauges),
    };
  };

  return Object.freeze({ now: clock, span, record, count, gauge, summarize });
};

const seconds = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)}s`;

/**
 * One line a person can read in a console: the window's length, then each span
 * (`count×`, total, max), each counter (total, busiest second) and each gauge's peak.
 *
 * @param label - What the window was, in a few words ("fill", "apply of 439 paths").
 * @param summary - The window.
 * @returns The line; it never carries a path, URL or id.
 * @public
 */
export const formatWorkerTimingSummary = (label: string, summary: WorkerTimingSummary): string => {
  const spans = workerTimingSpans.flatMap((name) => {
    const row = summary.spans[name];
    return row === undefined
      ? []
      : [`${name} ${String(row.count)}× ${seconds(row.totalMilliseconds)} max ${seconds(row.maxMilliseconds)}`];
  });
  const counters = workerTimingCounters.flatMap((name) => {
    const row = summary.counters[name];
    return row === undefined ? [] : [`${name} ${String(row.total)} peak ${String(row.peakPerSecond)}/s`];
  });
  const gauges = workerTimingGauges.flatMap((name) => {
    const peak = summary.gauges[name];
    return peak === undefined ? [] : [`${name} peak ${String(peak)}`];
  });
  return `[worker-timings] ${label} took ${seconds(summary.durationMilliseconds)}: ${
    [...spans, ...counters, ...gauges].join('; ') || 'nothing recorded'
  }`;
};

/**
 * This realm's recorder: the file-manager worker's, which every package in it shares.
 *
 * @public
 */
export const workerTimings: WorkerTimings = createWorkerTimings();
