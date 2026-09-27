// Port of LEAP71_ShapeKernel Examples/Ex_BasePipeShowCase.cs (Apache-2.0, © LEAP 71).

import type { Pico, Vec3, Voxels } from 'picovoxel';
import {
  BasePipe,
  Frames,
  LineModulation,
  localFrame,
  splineOps,
  SurfaceModulation,
} from 'picovoxel/shapekernel';
import { ExampleSpline } from './example-spline.ts';

export const lineModulation1 = (lengthRatio: number): number => 10 - 3 * Math.cos(8 * lengthRatio);
export const surfaceModulation1 = (phi: number, _lr: number): number => 12 + 3 * Math.cos(5 * phi);
export const surfaceModulation2 = (phi: number, lr: number): number =>
  10 - 2 * Math.cos(3 * (phi + Math.PI * lr)) + 9 * lr;
export const surfaceModulation3 = (phi: number, _lr: number): number => 8 + 5 * Math.cos(5 * phi);
export const surfaceModulation4 = (phi: number, lr: number): number =>
  9 - 1 * Math.cos(3 * (phi + Math.PI * lr)) + 7 * lr;

const transformation = (pt: Vec3): Vec3 => [
  pt[1] + 0.2 * pt[2] - 50,
  0.5 * pt[2] + 50,
  0.5 * pt[0],
];

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    results.push(new BasePipe(localFrame.create([-50, 0, 0]), 60, 10, 20).voxConstruct(pk));
  }
  {
    // transformed
    const shape = new BasePipe(localFrame.create([0, 0, 0]), 60, 10, 20);
    shape.setTransformation(transformation);
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 0
    const shape = new BasePipe(localFrame.create([50, -50, 0]), 60, 2, 40);
    shape.setLengthSteps(500);
    shape.setRadius(
      new SurfaceModulation(6),
      SurfaceModulation.fromLineModulation(new LineModulation(lineModulation1)),
    );
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 1
    const shape = new BasePipe(localFrame.create([-50, -50, 0]), 60, 2, 40);
    shape.setLengthSteps(500);
    shape.setRadius(new SurfaceModulation(surfaceModulation3), new SurfaceModulation(surfaceModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 2
    const shape = new BasePipe(localFrame.create([0, -50, 0]), 60, 2, 40);
    shape.setLengthSteps(500);
    shape.setRadius(new SurfaceModulation(surfaceModulation4), new SurfaceModulation(surfaceModulation2));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated + spined
    const frames = Frames.withTargetX(new ExampleSpline().points(), [0, 1, 0]);
    const shape = new BasePipe(frames, 2, 40);
    shape.setRadius(new SurfaceModulation(surfaceModulation3), new SurfaceModulation(surfaceModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // spined
    const points = splineOps.translated(new ExampleSpline().points(), [50, 0, 0]);
    const frames = Frames.withTargetX(points, [0, 1, 0]);
    results.push(new BasePipe(frames, 10, 12).voxConstruct(pk));
  }
  return results;
}
