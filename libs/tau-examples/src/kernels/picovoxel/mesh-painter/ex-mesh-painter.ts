// Port of LEAP71_ShapeKernel Examples/Ex_MeshPainterShowCase.cs (Apache-2.0, © LEAP 71).
// The painting itself is viewer-bound (MeshPainter/ColorScales — N/A per R16);
// headless we build the three sphere meshes and evaluate the custom
// per-triangle property the third scale would have visualized.

import type { Pico, Vec3, Voxels } from 'picovoxel';
import { BaseSphere, localFrame } from 'picovoxel/shapekernel';

/** C# `fGetExampleProperty`: |centroid.x| mod 10. */
export function exampleProperty(a: Vec3, b: Vec3, c: Vec3): number {
  const centreX = (a[0] + b[0] + c[0]) / 3;
  return Math.abs(centreX) % 10;
}

export function task(pk: Pico): Voxels[] {
  const radius = 50;
  const spheres = [
    new BaseSphere(localFrame.create([-120, 0, 0]), radius),
    new BaseSphere(localFrame.create([0, 0, 0]), radius),
    new BaseSphere(localFrame.create([120, 0, 0]), radius),
  ];
  return spheres.map((sphere) => sphere.voxConstruct(pk));
}
