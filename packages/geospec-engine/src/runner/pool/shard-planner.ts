/**
 * Shard planning: turning a file list into an execution order.
 *
 * Everything here is a **pure function of the file list plus an optional
 * telemetry table**, and every telemetry-derived decision has a defined answer
 * when the telemetry is missing. That is the whole discipline of this module:
 * scheduling changes the order work happens in and the machine it happens on,
 * and it must never change a verdict (§16). A pool with no telemetry at all
 * runs declared order, one shard per file, unbounded by memory class — which is
 * exactly what a first run on a fresh machine does.
 *
 * @module
 */

import type { GeoSpecPoolShard } from 'geospec/runner/worker';
import type { ShardTiming, ShardTimings } from '#cache/timings.js';

/**
 * The telemetry key one shard is recorded under.
 *
 * A per-test shard is keyed on the exact test it runs, so splitting a heavy
 * file teaches the table about its parts rather than overwriting the whole.
 *
 * @param file - The GeoSpec file.
 * @param testNamePattern - The exact-test pattern, for split shards.
 * @returns The stable telemetry key.
 * @public
 */
export const shardTimingKey = (file: string, testNamePattern?: string): string =>
  testNamePattern === undefined ? file : `${file}::${testNamePattern}`;

/**
 * Files whose last recorded duration exceeds this are split per test.
 * Milliseconds.
 *
 * A file is the natural work unit; splitting costs an extra list-only pass and
 * loses the file's own warm loads, so it is only worth it when one file would
 * otherwise be the pool's critical path.
 */
export const defaultSplitThreshold = 60_000;

/**
 * Peak RSS above which a shard is scheduled as `heavy`.
 *
 * Peak RSS is monotonic and over-approximates, which makes it safe here: the
 * error is always "treat something as heavier than it is", which costs
 * throughput and never memory.
 */
export const defaultHeavyRssBytes = 3.5 * 1024 * 1024 * 1024;

/** Memory class of one shard. Absent telemetry means {@link 'normal'}. */
export type ShardMemoryClass = 'normal' | 'heavy';

/**
 * A planned shard: the wire shard plus the scheduling hints derived from
 * telemetry. Hints are advisory; dropping them all still yields a correct run.
 *
 * @public
 */
export type PlannedShard = GeoSpecPoolShard & {
  /** Telemetry key this shard's duration is recorded under. */
  timingKey: string;
  /** Last recorded duration, or 0 when unknown. Milliseconds. */
  estimated: number;
  /** Memory class derived from recorded peak RSS. */
  memoryClass: ShardMemoryClass;
  /** Deterministic model-load key this shard is expected to want (R9 affinity). */
  affinityKey?: string;
};

/**
 * Escape a test name into an exact-match JavaScript regular expression.
 *
 * A split shard must run exactly the test it names and no other, so the
 * pattern is anchored and every metacharacter is escaped.
 *
 * @param name - Full `suite > test` name as the collector reported it.
 * @returns An anchored, fully escaped pattern source.
 * @public
 */
export const exactTestPattern = (name: string): string =>
  `^${name.replaceAll(/[$()*+.?[\\\]^{|}]/gu, String.raw`\$&`)}$`;

const memoryClass = (timing: ShardTiming | undefined): ShardMemoryClass =>
  timing !== undefined && timing.peakRssBytes >= defaultHeavyRssBytes ? 'heavy' : 'normal';

/**
 * Which files are worth splitting into per-test shards.
 *
 * @param files - Selected GeoSpec files.
 * @param timings - Optional telemetry table.
 * @param threshold - Duration in milliseconds above which a file is split.
 * @returns The files to run a list-only collection pass over.
 * @public
 */
export const filesToSplit = (
  files: readonly string[],
  timings: ShardTimings | undefined,
  threshold: number = defaultSplitThreshold,
): string[] => {
  if (!timings) {
    return [];
  }
  return files.filter((file) => (timings.read(file)?.durationMs ?? 0) > threshold);
};

/**
 * Plan the execution order.
 *
 * Longest-first by recorded duration; ties, and every shard with no telemetry
 * at all, keep the declared file order. Unknown shards sort AFTER known ones:
 * a shard whose cost is unknown might be short, and putting a possibly-short
 * shard first is how a pool ends up waiting on one long tail.
 *
 * @param options - Files, the per-file split plan, and the telemetry table.
 * @returns The ordered shards, with stable ids assigned in execution order.
 * @public
 */
export const planShards = (options: {
  files: readonly string[];
  /** Test names collected from a list-only pass, per split file. */
  splitTests?: ReadonlyMap<string, readonly string[]>;
  timings?: ShardTimings;
  /** Deterministic model-load key last observed per file (R9 affinity). */
  affinity?: ReadonlyMap<string, string>;
}): PlannedShard[] => {
  const { files, splitTests, timings, affinity } = options;
  const planned: Array<Omit<PlannedShard, 'id'> & { order: number }> = [];

  for (const [order, file] of files.entries()) {
    const tests = splitTests?.get(file);
    const affinityKey = affinity?.get(file);
    if (tests && tests.length > 0) {
      for (const name of tests) {
        const testNamePattern = exactTestPattern(name);
        const timingKey = shardTimingKey(file, testNamePattern);
        const timing = timings?.read(timingKey);
        planned.push({
          file,
          testNamePattern,
          timingKey,
          estimated: timing?.durationMs ?? 0,
          memoryClass: memoryClass(timing),
          ...(affinityKey === undefined ? {} : { affinityKey }),
          order,
        });
      }
      continue;
    }
    const timing = timings?.read(file);
    planned.push({
      file,
      timingKey: file,
      estimated: timing?.durationMs ?? 0,
      memoryClass: memoryClass(timing),
      ...(affinityKey === undefined ? {} : { affinityKey }),
      order,
    });
  }

  planned.sort((left, right) => right.estimated - left.estimated || left.order - right.order);
  return planned.map(({ order: _order, ...shard }, index) => ({ ...shard, id: index }));
};

/**
 * Auto-size the worker count.
 *
 * Three caps, all of them lower bounds on sanity rather than tuning: never
 * more workers than shards, leave two cores for the host and the OS, and never
 * more than one worker per 3.5 GiB of memory — an OCCT module plus a loaded
 * assembly is the memory unit, and swapping is slower than running serially.
 *
 * @param options - Shard count and the machine's reported capacity.
 * @returns At least one worker.
 * @public
 */
export const autoWorkerCount = (options: { shards: number; cpus: number; totalMemoryBytes?: number }): number => {
  const byMemory =
    options.totalMemoryBytes === undefined
      ? Number.POSITIVE_INFINITY
      : Math.floor(options.totalMemoryBytes / defaultHeavyRssBytes);
  return Math.max(1, Math.min(options.shards, options.cpus - 2, byMemory));
};

/**
 * Pick the next shard for a worker that just went idle.
 *
 * Preference order, all of them hints:
 * 1. **affinity** — a shard whose expected load key this worker already has
 *    warm (its cached loader and resource scope still hold the subject);
 * 2. **memory class** — a `heavy` shard only starts when no other heavy shard
 *    is running, so two multi-gigabyte assemblies never coexist;
 * 3. **queue order** — which is longest-first.
 *
 * @param options - The pending queue and the pool's current state.
 * @returns The index in `pending` to dispatch, or `undefined` to wait.
 * @public
 */
export const selectShard = (options: {
  pending: readonly PlannedShard[];
  workerLoadKey: string | undefined;
  heavyRunning: number;
}): number | undefined => {
  const { pending, workerLoadKey, heavyRunning } = options;
  const runnable = (shard: PlannedShard): boolean => shard.memoryClass === 'normal' || heavyRunning === 0;

  if (workerLoadKey !== undefined) {
    const affine = pending.findIndex((shard) => shard.affinityKey === workerLoadKey && runnable(shard));
    if (affine !== -1) {
      return affine;
    }
  }
  const next = pending.findIndex((shard) => runnable(shard));
  return next === -1 ? undefined : next;
};
