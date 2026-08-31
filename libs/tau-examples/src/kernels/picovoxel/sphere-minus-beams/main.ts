import type { Pico, Voxels } from 'picovoxel';

export const defaultParams = { voxelSize: 0.5, radius: 10, boreRadius: 3.5 };
export default function main(pico: Pico, params = defaultParams): Voxels {
  const sphere = pico.createVoxels({ shape: 'sphere', radius: params.radius });
  const beam = (axis: 0 | 1 | 2) => {
    const start: [number, number, number] = [0, 0, 0];
    const end: [number, number, number] = [0, 0, 0];
    start[axis] = -params.radius * 1.2;
    end[axis] = params.radius * 1.2;
    return pico.createVoxels({ shape: 'beam', start, end, radius: params.boreRadius });
  };
  return sphere.subtract(beam(0), beam(1), beam(2));
}

