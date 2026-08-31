import type { Pico } from 'picovoxel';
import { task } from './ex-lattice-pipe.js';

export const defaultParams = { voxelSize: 0.5 };
export default function main(pico: Pico) { return task(pico); }

