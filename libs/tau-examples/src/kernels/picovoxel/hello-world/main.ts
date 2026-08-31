import type { Pico } from 'picovoxel';
import { helloWorld } from './hello-world.js';

export const defaultParams = { voxelSize: 0.5 };
export default function main(pico: Pico) { return helloWorld(pico); }

