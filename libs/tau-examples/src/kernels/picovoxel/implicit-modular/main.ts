import type { Pico } from 'picovoxel';
import { task } from './ex-implicit-modular.js';

// Coarser than upstream (0.5 mm) to stay under the thumbnail renderer's 4M-index accessor limit.
export const defaultParams = { voxelSize: 0.6 };
export default function main(pico: Pico) {
  return task(pico);
}
