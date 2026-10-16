/**
 * Purpose: Decide whether a PicoGK soak resource reached steady state, at a resolution derived from measured noise.
 * Why: The benchmark-native gate must fail on retained per-edit growth without failing on garbage-collector
 * oscillation, and both properties are pinned by `soak-convergence.test.mts` in ordinary CI.
 * Usage: imported by `benchmark-native.mts`; not a command.
 */

/**
 * The median of a non-empty sample.
 * @param values - The samples.
 * @returns Their median.
 */
const median = (values: readonly number[]): number => {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = (ordered.length - 1) / 2;
  return (ordered[Math.floor(middle)]! + ordered[Math.ceil(middle)]!) / 2;
};

/** The statistics and verdict of one resource over the final 100 soak edits. */
type ResourceConvergence = {
  readonly blockMedians: readonly number[];
  readonly growthPerEdit: number;
  readonly lastBlockGrowth: number;
  readonly spread: number;
  readonly resolution: number;
  readonly converged: boolean;
};

/** The resolution each soak resource is judged at, in its samples' unit. */
type SoakResolutions = {
  readonly managedHeapBytes: number;
  readonly residentKilobytes: number;
  readonly descriptors: number;
  readonly temporaryFiles: number;
};

/**
 * Whether the final 100 samples converged at `resolution` (the same unit as the samples).
 *
 * The window is split into five 20-sample blocks. A resource fails when the median pairwise block slope is positive
 * and the block-median spread exceeds the resolution, or when the last block rose above runs 40–80 by more than the
 * resolution. A steady per-edit growth `g` gives a spread of `80g` and a last-block rise of `30g`, so the gate detects
 * growth above `resolution / 80` per edit.
 * @param values - One sample per edit, oldest first.
 * @param resolution - The smallest change that counts as growth.
 * @returns The block medians, the statistics and the verdict.
 */
export const resourceConvergence = (values: readonly number[], resolution = 0): ResourceConvergence => {
  // A warm-up step is not a leak; one downward sample does not disprove a leak.
  // Examine the final 100 runs at the declared detection resolution. A failure
  // means nonconvergence in this observation window, not proof of a memory leak.
  const tail = values.slice(-100);
  const blockMedians = Array.from({ length: 5 }, (_, index) => median(tail.slice(index * 20, (index + 1) * 20)));
  const slopes = blockMedians.flatMap((value, index) =>
    blockMedians.slice(index + 1).map((next, offset) => (next - value) / ((offset + 1) * 20)),
  );
  const growthPerEdit = median(slopes);
  const lastBlockGrowth = blockMedians[4]! - median(tail.slice(40, 80));
  const spread = Math.max(...blockMedians) - Math.min(...blockMedians);
  return {
    blockMedians,
    growthPerEdit,
    lastBlockGrowth,
    spread,
    resolution,
    converged: !((growthPerEdit > 0 && spread > resolution) || lastBlockGrowth > resolution),
  };
};

/**
 * The block-median spread of a known-good steady-state soak on a `macos-26` darwin-arm64 runner. Two runs on the same
 * commit (W15, PR #758, jobs 116855103956 and 116919128288) measured the same .NET managed-heap oscillation,
 * 1,193,104 bytes, with the last block falling by about 658 KB, and a worker RSS spread of 752 and 736 KB with the last
 * block falling. Neither run grew; both failed a zero-resolution gate.
 */
export const measuredSoakNoise = { managedHeapBytes: 1_193_104, residentKilobytes: 752 } as const;

/**
 * Headroom over the measured noise: enough to absorb run-to-run variation of the oscillation, while keeping the
 * detection floor (`resolution / 80` per edit) at about 22 KB of managed heap and 14 KB of RSS per edit.
 */
const soakNoiseMargin = 1.5;

/**
 * The resolution each soak resource is judged at. RSS also never drops below one memory page.
 * @param pageKilobytes - The host's memory page size in KB.
 * @returns Resolutions in the samples' units; descriptors and temporary files stay exact.
 */
export const soakResolutions = (pageKilobytes: number): SoakResolutions => ({
  managedHeapBytes: Math.ceil(measuredSoakNoise.managedHeapBytes * soakNoiseMargin),
  residentKilobytes: Math.max(
    pageKilobytes,
    Math.ceil((measuredSoakNoise.residentKilobytes * soakNoiseMargin) / pageKilobytes) * pageKilobytes,
  ),
  descriptors: 0,
  temporaryFiles: 0,
});
