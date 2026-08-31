// Port of LEAP71_ShapeKernel Examples/Ex_MeshTrafoShowCase.cs (Apache-2.0, © LEAP 71).
// Voxels → mesh → per-vertex rotation → voxels (the C# fnRotate variant).

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { BaseBox, localFrame, meshUtility, vecOps } from 'picovoxel/shapekernel';

export const rotate = (pt: Vec3): Vec3 => vecOps.rotateAroundAxis(pt, (45 / 180) * Math.PI, [0, 0, 1]);

export function task(pk: Pico): Voxels[] {
  const box = new BaseBox(localFrame.create([0, 100, 0]), 50, 40, 30);
  const voxBox = box.voxConstruct(pk);
  const meshBox = voxBox.toMesh();
  const transformed = meshUtility.applyTransformation(pk, meshBox, rotate);
  return [voxBox, transformed.toVoxels()];
}
