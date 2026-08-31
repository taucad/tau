import type { Pico } from 'picovoxel';
import { booleanShowcase } from './boolean-showcase.js';

export const defaultParams = { voxelSize: 0.5 };
export default function main(pico: Pico) { return booleanShowcase(pico).mesh; }

