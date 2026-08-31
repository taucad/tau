import type { Pico } from 'picovoxel';
import { task } from './run.js';

export const defaultParams = { voxelSize: 2 };
export default function main(pico: Pico) { return task(pico).voxels; }

