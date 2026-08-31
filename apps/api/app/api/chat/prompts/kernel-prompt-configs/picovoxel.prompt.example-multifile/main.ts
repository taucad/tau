import type { Pico } from 'picovoxel';
import { makeWidget } from './lib/widget.js';

export const defaultParams = { voxelSize: 1, radius: 8 };

export default function main(pico: Pico, params = defaultParams) {
  return makeWidget(pico, params.radius);
}
