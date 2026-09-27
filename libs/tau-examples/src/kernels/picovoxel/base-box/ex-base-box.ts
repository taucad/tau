// Port of LEAP71_ShapeKernel Examples/Ex_BaseBoxShowCase.cs (Apache-2.0, © LEAP 71).
// Headless: previews dropped, the constructed voxel fields are returned.

import type { Pico, Voxels } from 'picovoxel';
import { BaseBox, Frames, LineModulation, localFrame } from 'picovoxel/shapekernel';
import { ExampleSpline } from './example-spline.ts';

const lineModulation1 = (lengthRatio: number): number => 10 - 3 * Math.cos(8 * lengthRatio);
const lineModulation2 = (lengthRatio: number): number => 8 - 1 * Math.cos(40 * lengthRatio);

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    const shape = new BaseBox(localFrame.create([-50, 0, 0]), 20, 10, 15);
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated
    const shape = new BaseBox(localFrame.create([50, 0, 0]), 20);
    shape.setWidth(new LineModulation(lineModulation2));
    shape.setDepth(new LineModulation(lineModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated + spined
    const frames = Frames.withTargetX(new ExampleSpline().points(), [0, 1, 0]);
    const shape = new BaseBox(frames);
    shape.setWidth(new LineModulation(lineModulation2));
    shape.setDepth(new LineModulation(lineModulation1));
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
