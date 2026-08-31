import type { Pico } from 'picovoxel';

export const defaultParams = {
  voxelSize: 0.5,
  radius: 12,
  boreRadius: 4,
};

export default function main(pico: Pico, params = defaultParams) {
  const body = pico.createVoxels({ shape: 'sphere', radius: params.radius });
  const bore = pico.createVoxels({
    shape: 'beam',
    start: [0, 0, -params.radius * 1.5],
    end: [0, 0, params.radius * 1.5],
    radius: params.boreRadius,
  });
  return body.subtract(bore);
}
