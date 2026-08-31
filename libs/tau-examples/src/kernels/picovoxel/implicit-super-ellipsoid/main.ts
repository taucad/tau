import type { Pico } from 'picovoxel';
import { task } from './ex-implicit-super-ellipsoid.js';

export const defaultParams = { voxelSize: 0.02 };
export default function main(pico: Pico) { return task(pico); }

