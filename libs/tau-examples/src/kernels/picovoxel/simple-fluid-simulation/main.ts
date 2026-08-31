import type { Pico } from 'picovoxel';
import { writeTask } from './run.js';

export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico) { return writeTask(pico).solidDomain; }

