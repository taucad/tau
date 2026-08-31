import type { Pico } from 'picovoxel';
import { task } from './ex-base-pipe.js';

export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico) { return task(pico); }

