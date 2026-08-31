import type { Pico } from 'picovoxel';
import { task } from './ex-implicit-gyroid-genus.js';

export const defaultParams = { voxelSize: 0.35 };
export default function main(pico: Pico) { return task(pico); }

