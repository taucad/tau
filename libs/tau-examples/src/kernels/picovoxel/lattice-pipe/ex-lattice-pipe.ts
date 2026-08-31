// Port of LEAP71_ShapeKernel Examples/Ex_LatticePipeShowCase.cs (Apache-2.0, © LEAP 71).

import type { Pico, Voxels } from 'picovoxel';
import { Frames, LatticePipe, LineModulation, localFrame, splineOps } from 'picovoxel/shapekernel';
import { ExampleSpline } from './example-spline.ts';

const lineModulation1 = (lengthRatio: number): number => 10 - 3 * Math.cos(8 * lengthRatio);

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    results.push(new LatticePipe(localFrame.create([-50, 0, 0]), 60, 10).voxConstruct(pk));
  }
  {
    // modulated 0
    const shape = new LatticePipe(localFrame.create([50, -50, 0]), 60);
    shape.setRadius(new LineModulation(lineModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated + spined
    const frames = Frames.withTargetX(new ExampleSpline().points(), [0, 1, 0]);
    const shape = new LatticePipe(frames);
    shape.setRadius(new LineModulation(lineModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // spined
    const points = splineOps.translated(new ExampleSpline().points(), [50, 0, 0]);
    const frames = Frames.withTargetX(points, [0, 1, 0]);
    results.push(new LatticePipe(frames, 5).voxConstruct(pk));
  }
  return results;
}
