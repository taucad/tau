// HelixHeatX headless entry (blueprint R11). The caller supplies the session
// — and with it the voxel size, exactly as upstream's Library.Go(voxelSize,
// HelixHeatX.Task) does. Returns the final part plus the authoring-time split
// the benchmark protocol reports (Finding 8 promotion trigger).

import type { Pico, Voxels } from 'picovoxel';
import { HelixHeatX, type HeatXKernelTiming } from './helixHeatX.ts';

export interface HeatXResult {
  voxels: Voxels;
  /** Pure-JS authoring milliseconds (lattice/point loops). */
  authorMs: number;
  /** Full constructor + voxel-assembly wall time. */
  constructMs: number;
  /** Ordered, exclusive kernel-stage timings. */
  kernelTimings: readonly HeatXKernelTiming[];
  /** JS/orchestration time outside the authoring loops and measured kernel stages. */
  unattributedMs: number;
}

export function task(pk: Pico): HeatXResult {
  const started = performance.now();
  const heatX = new HelixHeatX(pk);
  const voxels = heatX.voxConstruct();
  const constructMs = performance.now() - started;
  const kernelTimings = heatX.kernelTimings;
  const kernelMs = kernelTimings.reduce((total, timing) => total + timing.ms, 0);
  const unattributedMs = constructMs - heatX.authorMs - kernelMs;
  return { voxels, authorMs: heatX.authorMs, constructMs, kernelTimings, unattributedMs };
}
