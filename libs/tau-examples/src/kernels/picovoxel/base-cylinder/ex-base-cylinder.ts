// Port of LEAP71_ShapeKernel Examples/Ex_BaseCylinderShowcase.cs (Apache-2.0, © LEAP 71).

import type { Pico, Voxels } from 'picovoxel';
import { BaseCylinder, Frames, LineModulation, localFrame, SurfaceModulation } from 'picovoxel/shapekernel';
import { ExampleSpline } from './example-spline.ts';

const lineModulation = (lengthRatio: number): number => 10 - 3 * Math.cos(8 * lengthRatio);
const surfaceModulation = (phi: number, _lengthRatio: number): number => 12 + 3 * Math.cos(5 * phi);

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    const shape = new BaseCylinder(localFrame.create([-50, 0, 0]), 60, 40);
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated
    const shape = new BaseCylinder(localFrame.create([50, 0, 0]), 60, 12);
    shape.setLengthSteps(500);
    shape.setRadius(SurfaceModulation.fromLineModulation(new LineModulation(lineModulation)));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated + spined
    const frames = Frames.withTargetX(new ExampleSpline().points(), [0, 1, 0]);
    const shape = new BaseCylinder(frames, 12);
    shape.setRadius(new SurfaceModulation(surfaceModulation));
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
