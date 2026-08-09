/**
 * Shard planning: pool sizing (R15), duration-informed longest-first ordering
 * (R3), memory-class-aware placement (R15), and subject-affinity (R9).
 *
 * Telemetry (`timings.json`) is an optional hint: with no recorded history the
 * planner degrades to input order, conservative memory classes, and no
 * affinity — never to incorrect behavior. Verdicts do not depend on any
 * decision made here (R13 guarantees that).
 */

import type { GeoSpecFileTiming } from '#cache/timings.js';

/** Bytes a GLB-class shard is budgeted to occupy (measured peaks ≈3.3–3.5 GB). */
export const glbClassBytes = 3.5 * 1024 ** 3;

/** Peak-memory threshold above which a shard is treated as GLB-class. */
const glbClassThresholdBytes = 2.5 * 1024 ** 3;

export type GeoSpecShardPlanEntry = {
  file: string;
  /** Recorded wall from telemetry; undefined on first run. */
  durationMs?: number;
  /** Memory class: GLB-class shards are capped separately (R15). */
  memoryClass: 'brep' | 'glb';
  /** Recorded primary load key (R9 affinity), when telemetry has one. */
  affinityKey?: string;
  /** Exact-test pattern for split shards (R3/R6 per-test splitting). */
  testNamePattern?: string;
};

/**
 * Resolve the pool size (R15, container-correct):
 * `min(shards, availableParallelism − 2, floor(availableMemory / 3.5 GiB))`,
 * clamped to ≥1. An explicit request wins (still clamped to shard count).
 */
export const resolvePoolSize = (options: {
  shardCount: number;
  requestedWorkers?: number;
  availableParallelism: number;
  availableMemoryBytes: number;
}): number => {
  if (options.requestedWorkers !== undefined && options.requestedWorkers >= 1) {
    return Math.max(1, Math.min(Math.floor(options.requestedWorkers), options.shardCount));
  }
  const cpuCap = Math.max(1, options.availableParallelism - 2);
  const memoryCap = Math.max(1, Math.floor(options.availableMemoryBytes / glbClassBytes));
  return Math.max(1, Math.min(options.shardCount, cpuCap, memoryCap));
};

/**
 * How many GLB-class shards may run concurrently: the memory budget divided by
 * the GLB-class working set, never more than the pool itself.
 */
export const resolveGlbClassCap = (options: { poolSize: number; availableMemoryBytes: number }): number =>
  Math.max(1, Math.min(options.poolSize, Math.floor(options.availableMemoryBytes / glbClassBytes)));

/**
 * Plan shards from files + telemetry: longest-first (unknown durations first,
 * so first runs still spread), with memory class and affinity hints attached.
 * Unknown memory class is conservatively GLB (fewer concurrent heavyweights,
 * never an OOM surprise).
 */
export const planShards = (
  files: readonly string[],
  timings: Record<string, GeoSpecFileTiming>,
  fileLabel: (file: string) => string,
): GeoSpecShardPlanEntry[] => {
  const entries = files.map((file): GeoSpecShardPlanEntry => {
    const timing = timings[fileLabel(file)];
    const peakBytes = Math.max(timing?.workerMemoryBytes ?? 0, timing?.processPeakRssBytes ?? 0);
    return {
      file,
      ...(timing?.durationMs === undefined ? {} : { durationMs: timing.durationMs }),
      memoryClass: timing === undefined ? 'glb' : peakBytes >= glbClassThresholdBytes ? 'glb' : 'brep',
      ...(timing?.primaryLoadKey === undefined ? {} : { affinityKey: timing.primaryLoadKey }),
    };
  });
  // Longest-first; unknown durations schedule first (they may be the longest).
  entries.sort((left, right) => (right.durationMs ?? Infinity) - (left.durationMs ?? Infinity));
  return entries;
};

/**
 * Pick the next shard for a freed worker: prefer a pending shard whose
 * affinity key the worker has already loaded (subject/ledger/proof-context
 * reuse, R9), respecting the GLB-class concurrency cap (R15); otherwise the
 * longest pending shard the cap allows. Returns the index into `pending`, or
 * -1 when the cap blocks every pending shard.
 */
export const pickNextShardIndex = (options: {
  pending: readonly GeoSpecShardPlanEntry[];
  workerSeenKeys: ReadonlySet<string>;
  runningGlbShards: number;
  glbClassCap: number;
}): number => {
  const allowed = (entry: GeoSpecShardPlanEntry): boolean =>
    entry.memoryClass !== 'glb' || options.runningGlbShards < options.glbClassCap;
  const affinityIndex = options.pending.findIndex(
    (entry) => allowed(entry) && entry.affinityKey !== undefined && options.workerSeenKeys.has(entry.affinityKey),
  );
  if (affinityIndex !== -1) {
    return affinityIndex;
  }
  return options.pending.findIndex((entry) => allowed(entry));
};
