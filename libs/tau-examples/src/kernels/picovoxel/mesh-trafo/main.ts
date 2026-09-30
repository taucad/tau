import type { PicovoxelResult } from '@taucad/picovoxel';
import type { Pico } from 'picovoxel';
import { task } from './ex-mesh-trafo.js';

export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico): PicovoxelResult {
  return task(pico).map((shape, index) => ({
    shape,
    name: index === 0 ? 'Original box' : 'Transformed box',
  }));
}
