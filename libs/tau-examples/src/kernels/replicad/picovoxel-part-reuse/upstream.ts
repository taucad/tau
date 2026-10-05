import type { Pico } from 'picovoxel';
import { upstreamSize } from './upstream.settings.js';

export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico) {
  return pico.createVoxels({ shape: 'sphere', radius: upstreamSize });
}
