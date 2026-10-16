import { describe, expect, it } from 'vitest';

// oxlint-disable-next-line no-restricted-imports -- The gate's own sibling module; scripts have no `#` alias.
import { measuredSoakNoise, resourceConvergence, soakResolutions } from './soak-convergence.mjs';

/** The 16 KB darwin-arm64 page. */
const pageKilobytes = 16;
const resolution = soakResolutions(pageKilobytes);

/**
 * A 200-edit series whose final five 20-edit blocks hold the given medians, plus `retainedPerEdit` kept by every edit.
 * @param blockMedians - Five block medians, as the soak reports them.
 * @param retainedPerEdit - Growth each edit keeps, in the samples' unit.
 * @returns One sample per edit.
 */
const series = (blockMedians: readonly number[], retainedPerEdit = 0): number[] =>
  Array.from({ length: 200 }, (_, index) => {
    const block = Math.max(0, Math.floor((index - 100) / 20));
    return blockMedians[block]! + retainedPerEdit * index;
  });

/** Managed-heap block medians of the two known-good macos-26 soaks (jobs 116855103956 and 116919128288). */
const managedHeapRuns = [
  [10_776_784, 10_271_928, 11_465_032, 11_434_912, 10_777_440],
  [10_778_680, 10_273_824, 11_466_928, 11_266_448, 10_608_064],
] as const;

/** RSS block medians (KB) of the same two soaks. */
const residentRuns = [
  [254_952, 254_952, 255_584, 255_704, 255_248],
  [257_000, 257_000, 257_616, 257_736, 257_264],
] as const;

describe('PicoGK soak convergence', () => {
  it('should derive the floors from the measured noise with a 1.5x margin, RSS in whole pages', () => {
    expect(resolution.managedHeapBytes).toBe(Math.ceil(measuredSoakNoise.managedHeapBytes * 1.5));
    expect(resolution.residentKilobytes % pageKilobytes).toBe(0);
    expect(resolution.residentKilobytes).toBeGreaterThanOrEqual(measuredSoakNoise.residentKilobytes * 1.5);
    expect(resolution).toMatchObject({ descriptors: 0, temporaryFiles: 0 });
  });

  it.each(managedHeapRuns)(
    'should pass the measured managed-heap oscillation %#, which a zero resolution failed',
    (...medians) => {
      expect(resourceConvergence(series(medians), resolution.managedHeapBytes).converged).toBe(true);
      expect(resourceConvergence(series(medians)).converged).toBe(false);
    },
  );

  it.each(residentRuns)(
    'should pass the measured RSS oscillation %#, which a one-page resolution failed',
    (...medians) => {
      expect(resourceConvergence(series(medians), resolution.residentKilobytes).converged).toBe(true);
      expect(resourceConvergence(series(medians), pageKilobytes).converged).toBe(false);
    },
  );

  it('should fail the same oscillation when every edit also retains managed heap above the floor', () => {
    // The floor detects growth above resolution / 80 per edit (about 22 KB); 32 KB per edit is a real leak.
    const leak = resourceConvergence(series(managedHeapRuns[1], 32 * 1024), resolution.managedHeapBytes);

    expect(leak.converged).toBe(false);
    expect(leak.growthPerEdit).toBeGreaterThan(0);
  });

  it('should fail the same oscillation when every edit also retains RSS above the floor', () => {
    // The RSS floor detects growth above resolution / 80 per edit (about 14 KB).
    expect(resourceConvergence(series(residentRuns[1], 16), resolution.residentKilobytes).converged).toBe(false);
  });

  it('should fail a steady leak with no oscillation at the floor, and pass growth below the detection floor', () => {
    const flat = [10_000_000, 10_000_000, 10_000_000, 10_000_000, 10_000_000];
    const floorPerEdit = resolution.managedHeapBytes / 80;

    expect(resourceConvergence(series(flat, floorPerEdit * 1.1), resolution.managedHeapBytes).converged).toBe(false);
    // Below the floor is the documented blind spot of one 100-edit window, not an allowance.
    expect(resourceConvergence(series(flat, floorPerEdit * 0.9), resolution.managedHeapBytes).converged).toBe(true);
  });

  it('should keep descriptors and temporary files exact', () => {
    const descriptors = Array.from({ length: 200 }, (_, index) => (index >= 180 ? 92 : 91));

    expect(resourceConvergence(descriptors, resolution.descriptors).converged).toBe(false);
  });
});
