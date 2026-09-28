// Port of LEAP71_ShapeKernel Examples/Ex_ImplicitSuperEllipsoid.cs (Apache-2.0, © LEAP 71).
// Three parameterisations, unit-scale (±1 mm) — run with a fine voxel size.
// The C# axis-order swap in the first two variants ((fAx, fAz, fAy)) and the
// centre-relative bounds are ported verbatim.

import type { Pico, Voxels } from 'picovoxel';
import { ImplicitSuperEllipsoid } from 'picovoxel/shapekernel';
import type { Vec3 } from 'picovoxel';

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  const render = (centre: Vec3, ax: number, ay: number, az: number, e1: number, e2: number): void => {
    const sdf = new ImplicitSuperEllipsoid(centre, ax, ay, az, e1, e2);
    results.push(
      pk.createVoxels({
        shape: 'implicit',
        boundsMin: [-ax - centre[0], -ay - centre[1], -az - centre[2]],
        boundsMax: [ax - centre[0], ay - centre[1], az - centre[2]],
        sdf: sdf.expression,
      }),
    );
  };
  render([0, 0, 0], 1, 1, 1, 3, 0.25); // C# passes (fAx, fAz, fAy) — all 1 here
  render([-4, 0, 0], 1, 1, 1, 1.5, 1.5);
  render([4, 0, 0], 1, 1, 1, 0.25, 0.25);
  return results;
}
