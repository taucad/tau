// Port of LEAP71_ShapeKernel Examples/Ex_BaseLensShowCase.cs (Apache-2.0, © LEAP 71).

import type { Pico, Voxels } from 'picovoxel';
import { BaseLens, localFrame, SurfaceModulation } from 'picovoxel/shapekernel';

const surfaceModulation = (phi: number, _lengthRatio: number): number => 12 + 3 * Math.cos(5 * phi);
const lensHeight1 = (phi: number, radiusRatio: number): number => 5 - surfaceModulation(phi, radiusRatio);
const lensHeight2 = (phi: number, radiusRatio: number): number => 5 + surfaceModulation(phi, radiusRatio);
const lensHeight3 = (phi: number, radiusRatio: number): number => {
  const shifted = phi + 0.3 * Math.PI * radiusRatio;
  return 5 + 1 * Math.cos(6 * shifted) + 3 * Math.cos(20 * radiusRatio);
};

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    const shape = new BaseLens(localFrame.create([-50, -50, 0]), 10, 10, 40);
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 0
    const shape = new BaseLens(localFrame.create([50, 50, 0]), 10, 10, 40);
    shape.setHeight(new SurfaceModulation(lensHeight1), new SurfaceModulation(lensHeight2));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 1
    const shape = new BaseLens(localFrame.create([-50, 50, 0]), 10, 10, 40);
    shape.setHeight(new SurfaceModulation(lensHeight1), new SurfaceModulation(lensHeight3));
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
