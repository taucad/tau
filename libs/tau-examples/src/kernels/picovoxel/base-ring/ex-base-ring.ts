// Port of LEAP71_ShapeKernel Examples/Ex_BaseRingShowCase.cs (Apache-2.0, © LEAP 71).

import type { Pico, Voxels } from 'picovoxel';
import { BaseRing, localFrame, SurfaceModulation } from 'picovoxel/shapekernel';

const ringRadius0 = (phi: number, _alpha: number): number => 10 - 2 * Math.cos(5 * phi);
const ringRadius1 = (_phi: number, alpha: number): number => 10 + 3 * Math.cos(5 * alpha);
const ringRadius2 = (phi: number, alpha: number): number =>
  10 - 2 * Math.cos(5 * (phi + alpha)) + 3 * Math.cos(5 * alpha);

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    results.push(new BaseRing(localFrame.create([-50, -50, 0]), 30, 8).voxConstruct(pk));
  }
  {
    // modulated 0
    const shape = new BaseRing(localFrame.create([-50, 50, 0]), 30);
    shape.setRadius(new SurfaceModulation(ringRadius0));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 1
    const shape = new BaseRing(localFrame.create([50, 50, 0]), 30);
    shape.setRadius(new SurfaceModulation(ringRadius1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 2
    const shape = new BaseRing(localFrame.create([50, -50, 0]), 30);
    shape.setRadius(new SurfaceModulation(ringRadius2));
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
