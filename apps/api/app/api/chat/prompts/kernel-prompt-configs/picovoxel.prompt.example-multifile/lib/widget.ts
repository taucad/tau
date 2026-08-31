import type { Pico, Voxels } from 'picovoxel';

export const makeWidget = (pico: Pico, radius: number): Voxels =>
  pico.createVoxels({ shape: 'sphere', radius });
