/**
 * Shard timings vocabulary: the pool's longest-first scheduling hint, kept
 * free of Node imports so the browser-safe pool can type it. The persisted
 * table lives in `#runner/node/pool-timings.js`.
 *
 * @module
 */

/**
 * One shard's recorded cost.
 *
 * @public
 */
export type ShardTiming = {
  /** Wall duration of the last recorded run, in milliseconds. */
  durationMs: number;
  /** Highest RSS observed for this shard, in bytes. Monotonic. */
  peakRssBytes: number;
};

/**
 * A mutable timings table.
 *
 * @public
 */
export type ShardTimings = {
  /** Merge one observation. Peak RSS only ever grows. */
  record(shard: string, timing: ShardTiming): void;
  /** The hint for one shard, or `undefined` when unknown. */
  read(shard: string): ShardTiming | undefined;
  /** Every recorded shard, sorted by descending duration (longest-first). */
  longestFirst(): string[];
  /** Persist the table. Failure is silent: telemetry never fails a run. */
  save(): void;
};
