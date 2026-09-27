// Port of LEAP71_LatticeLibrary Examples/Ex_ImplicitLibraryRandomTask.cs (Apache-2.0, © LEAP 71).
// The C# ambient randomness becomes an explicit seeded stream (blueprint
// rule: no Math.random in library code; the seeded corpus is
// self-referential). Callback-only preset — the tape has no data gather.

import type { Pico, Voxels } from 'picovoxel';
import { ImplicitRandomizedSchwarzPrimitive, RandomDeformationField } from 'picovoxel/latticelibrary';
import { BaseBox, createRandom, localFrame } from 'picovoxel/shapekernel';

export function task(pk: Pico): Voxels[] {
  const voxBounding = new BaseBox(localFrame.identity, 50, 50, 50).voxConstruct(pk);

  const deformationAmplitude = 8;
  const underlyingGridSize = 20;
  const { bounds } = voxBounding.properties();
  const growth = deformationAmplitude + 0.2; // C# BBox3.Grow
  const grown = {
    min: [bounds.min[0] - growth, bounds.min[1] - growth, bounds.min[2] - growth],
    max: [bounds.max[0] + growth, bounds.max[1] + growth, bounds.max[2] + growth],
  } as const;
  const field = new RandomDeformationField(
    grown,
    underlyingGridSize,
    -deformationAmplitude,
    deformationAmplitude,
    createRandom(71),
  );

  const pattern = new ImplicitRandomizedSchwarzPrimitive(10, 0.5, field);
  const voxImplicit = voxBounding.maskedByImplicit({ sdf: pattern.sdf });
  return [voxImplicit]; // C# previews only the implicit result here
}
