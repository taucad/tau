import type { Pico } from 'picovoxel';
import { buildGearMesh, GEAR_DEFAULTS } from './gear.js';

export const defaultParams = { voxelSize: 0.5, ...GEAR_DEFAULTS };
export default function main(pico: Pico, params = defaultParams) {
  const vertices: number[] = [];
  const triangles: number[] = [];
  buildGearMesh({
    meshCreate: () => 0n,
    addVertex: (_library, _mesh, x, y, z) => {
      vertices.push(x, y, z);
      return vertices.length / 3 - 1;
    },
    addTriangle: (_library, _mesh, a, b, c) => {
      triangles.push(a, b, c);
      return triangles.length / 3 - 1;
    },
  }, 0n, params);
  return pico.createMesh({ vertices, triangles });
}
