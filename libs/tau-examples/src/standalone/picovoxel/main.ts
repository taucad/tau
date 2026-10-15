import type { Pico, Voxels } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, radius: 10, holeRadius: 4 };

export default function main(pico: Pico, params = defaultParams): Voxels[] {
  const sphere = pico.createVoxels({ shape: 'sphere', radius: params.radius });
  const hole = pico.createVoxels({ shape: 'sphere', radius: params.holeRadius });
  return [sphere.subtract(hole)];
}
