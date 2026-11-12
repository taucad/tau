import type { PicovoxelResult } from '@taucad/picovoxel';
import type { Pico, Vec3 } from 'picovoxel';
import {
  capsule,
  ellipsoid,
  mirrored,
  smoothUnion,
  sphere,
  subtract,
} from './lib/sdf.js';

/**
 * A stylised toy owl: ellipsoids and capsules blended with a smooth union into one field, so the print is one
 * watertight body with no internal faces. Change `blend` to soften or sharpen every seam at once.
 */
export const defaultParams = { voxelSize: 0.5, height: 60, blend: 4 };

export default function main(
  pico: Pico,
  params = defaultParams,
): PicovoxelResult {
  const s = params.height / 60;
  const at = ([x, y, z]: Vec3): Vec3 => [x * s, y * s, z * s];

  const body = ellipsoid(at([0, 0, 22]), at([17, 15, 21]));
  const head = ellipsoid(at([0, 0, 46]), at([15, 13, 12]));
  const ears = mirrored((side) =>
    capsule(at([8 * side, 0, 54]), at([12 * side, -1, 60]), 3 * s),
  );
  const wings = mirrored((side) =>
    ellipsoid(at([15 * side, 1, 24]), at([5, 10, 14])),
  );
  const feet = mirrored((side) =>
    ellipsoid(at([7 * side, -6, 2.5]), at([6, 7, 2.5])),
  );
  const beak = ellipsoid(at([0, -13, 42]), at([2.5, 3, 4]));
  const owl = smoothUnion(
    params.blend * s,
    body,
    head,
    ears,
    wings,
    feet,
    beak,
  );

  const eyes = mirrored((side) => sphere(at([6 * side, -12, 47]), 3.5 * s));
  const shape = pico.createVoxels({
    shape: 'implicit',
    boundsMin: at([-24, -20, -1]),
    boundsMax: at([24, 20, 66]),
    sdf: subtract(owl, eyes),
  });
  return { shape, name: 'Owl' };
}
