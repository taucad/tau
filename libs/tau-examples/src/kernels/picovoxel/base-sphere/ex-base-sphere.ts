// Port of LEAP71_ShapeKernel Examples/Ex_BaseSphereShowCase.cs (Apache-2.0, © LEAP 71).
// NOTE the C# modulation callbacks name their params (fTheta, fPhi) but
// BaseSphere passes (phi, theta) — the swap is upstream's, ported verbatim.

import type { Pico, Voxels } from 'picovoxel';
import { BaseSphere, localFrame, SurfaceModulation } from 'picovoxel/shapekernel';

const sphereRadius0 = (_theta: number, phi: number): number => 40 - 10 * Math.cos(6 * phi);
const sphereRadius1 = (theta: number, phi: number): number =>
  40 - 10 * Math.cos(6 * phi) + 30 * Math.cos(2 * theta);

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    const shape = new BaseSphere(localFrame.create([-100, 0, 0]), 40);
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 0
    const shape = new BaseSphere(localFrame.create([0, 0, 0]));
    shape.setRadius(new SurfaceModulation(sphereRadius0));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 1
    const shape = new BaseSphere(localFrame.create([150, 0, 0]));
    shape.setRadius(new SurfaceModulation(sphereRadius1));
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
