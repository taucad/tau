import type { Pico, Voxels } from 'picovoxel';
import { meshFromBufferGeometry } from 'picovoxel/three';
import { TorusKnotGeometry } from 'three';

export const defaultParams = { voxelSize: 0.5, radius: 8, tube: 2.5 };
export default function main(pico: Pico, params = defaultParams): Voxels {
  return meshFromBufferGeometry(pico, new TorusKnotGeometry(params.radius, params.tube, 128, 24)).toVoxels();
}

