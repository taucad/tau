// Port of LEAP71_ShapeKernel Examples/Ex_BasicLattices.cs (Apache-2.0, © LEAP 71).
// Raw PicoGK lattice: one node sphere plus a rounded and an un-rounded beam.

import type { Pico, Voxels } from 'picovoxel';

export function task(pk: Pico): Voxels[] {
  const lattice = pk.createLattice();
  lattice.addSphere({ center: [1, 5, -10], radius: 5 });
  lattice.addBeam({ start: [5, 3, 0], end: [-3, 0, 7], startRadius: 1, endRadius: 3, roundCap: true });
  lattice.addBeam({ start: [5, 3, 0], end: [-3, 0, 7], startRadius: 1, endRadius: 3, roundCap: false });
  return [lattice.toVoxels()];
}
