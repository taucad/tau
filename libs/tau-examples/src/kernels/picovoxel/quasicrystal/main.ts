import type { Pico } from 'picovoxel';
import { wireframeFromCrystalTask } from './run.js';

export const defaultParams = { voxelSize: 2, generations: 0 };
export default function main(pico: Pico, params = defaultParams) {
  return wireframeFromCrystalTask(pico, params.generations).voxels;
}

