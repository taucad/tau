// Port of LEAP71_ShapeKernel Examples/Ex_ImplicitGyroidGenus.cs (Apache-2.0, © LEAP 71).
// Small geometry (±3 mm) — run with a fine voxel size.

import type { Pico, Voxels } from 'picovoxel';
import { ImplicitGenus, ImplicitGyroid } from 'picovoxel/shapekernel';

export function task(pk: Pico): Voxels[] {
  const gap = 0.05;
  const extent = 2.5;
  const sdfGenus = new ImplicitGenus(gap);
  const voxGenus = pk.createVoxels({
    shape: 'implicit',
    boundsMin: [-1.2 * extent, -1.2 * extent, 1.2 * (-extent + 1.5)],
    boundsMax: [1.2 * extent, 1.2 * extent, 1.2 * (extent - 1.5)],
    sdf: sdfGenus.expression,
  });
  const sdfPattern = new ImplicitGyroid(1, 0.5);
  const voxGyroidGenus = voxGenus.maskedByImplicit({ sdf: sdfPattern.expression });
  return [voxGyroidGenus, voxGenus];
}
