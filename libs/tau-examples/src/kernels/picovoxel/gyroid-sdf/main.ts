import type { Pico, Voxels } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, period: 10, size: 12, wall: 0.4 };
export default function main(pico: Pico, params = defaultParams): Voxels {
  const scale = (2 * Math.PI) / params.period;
  return pico.createVoxels({
    shape: 'implicit',
    boundsMin: [-params.size, -params.size, -params.size],
    boundsMax: [params.size, params.size, params.size],
    sdf: ['-', ['abs', ['+',
      ['*', ['sin', ['*', 'x', scale]], ['cos', ['*', 'y', scale]]],
      ['*', ['sin', ['*', 'y', scale]], ['cos', ['*', 'z', scale]]],
      ['*', ['sin', ['*', 'z', scale]], ['cos', ['*', 'x', scale]]],
    ]], params.wall],
  });
}

