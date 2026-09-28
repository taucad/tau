// Port of LEAP71_ShapeKernel Examples/Ex_BasePipeSegmentShowCase.cs (Apache-2.0, © LEAP 71).

import type { Pico, Voxels } from 'picovoxel';
import {
  BasePipeSegment,
  Frames,
  LineModulation,
  localFrame,
  splineOps,
  SurfaceModulation,
} from 'picovoxel/shapekernel';
import { ExampleSpline } from './example-spline.ts';
import {
  lineModulation1,
  surfaceModulation1,
  surfaceModulation2,
  surfaceModulation3,
  surfaceModulation4,
} from './ex-base-pipe.ts';

const segmentPhiMid1 = (lr: number): number => -Math.PI * lr;
const segmentPhiMid2 = (lr: number): number => 4 * Math.PI * lr;
const segmentPhiRange1 = (lr: number): number => 0.5 * Math.PI + 0.25 * Math.PI * Math.cos(8 * lr);
const segmentPhiRange2 = (lr: number): number => 0.5 * Math.PI + 0.25 * Math.PI * Math.cos(40 * lr);

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    // basic
    const shape = new BasePipeSegment(localFrame.create([-50, 0, 0]), {
      length: 60,
      innerRadius: 20,
      outerRadius: 40,
      startOrMid: new LineModulation(Math.PI),
      endOrRange: new LineModulation(0.5 * Math.PI),
      method: 'midRange',
    });
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 0
    const shape = new BasePipeSegment(localFrame.create([-50, 50, 0]), {
      length: 60,
      innerRadius: 2,
      outerRadius: 40,
      startOrMid: new LineModulation(Math.PI),
      endOrRange: new LineModulation(segmentPhiRange2),
      method: 'midRange',
    });
    shape.setLengthSteps(500);
    shape.setRadius(
      new SurfaceModulation(6),
      SurfaceModulation.fromLineModulation(new LineModulation(lineModulation1)),
    );
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 1
    const shape = new BasePipeSegment(localFrame.create([0, -50, 0]), {
      length: 60,
      innerRadius: 2,
      outerRadius: 40,
      startOrMid: new LineModulation(Math.PI),
      endOrRange: new LineModulation(segmentPhiRange1),
      method: 'midRange',
    });
    shape.setLengthSteps(500);
    shape.setRadius(new SurfaceModulation(surfaceModulation3), new SurfaceModulation(surfaceModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated 2
    const shape = new BasePipeSegment(localFrame.create([50, -50, 0]), {
      length: 60,
      innerRadius: 2,
      outerRadius: 40,
      startOrMid: new LineModulation(segmentPhiMid1),
      endOrRange: new LineModulation(1.75 * Math.PI),
      method: 'midRange',
    });
    shape.setLengthSteps(500);
    shape.setRadius(new SurfaceModulation(surfaceModulation4), new SurfaceModulation(surfaceModulation2));
    results.push(shape.voxConstruct(pk));
  }
  {
    // modulated + spined
    const frames = Frames.withTargetX(new ExampleSpline().points(), [0, 1, 0]);
    const shape = new BasePipeSegment(frames, {
      innerRadius: 2,
      outerRadius: 40,
      startOrMid: new LineModulation(segmentPhiMid2),
      endOrRange: new LineModulation(1.5 * Math.PI),
      method: 'midRange',
    });
    shape.setRadius(new SurfaceModulation(surfaceModulation3), new SurfaceModulation(surfaceModulation1));
    results.push(shape.voxConstruct(pk));
  }
  {
    // spined
    const points = splineOps.translated(new ExampleSpline().points(), [50, 0, 0]);
    const frames = Frames.withTargetX(points, [0, 1, 0]);
    const shape = new BasePipeSegment(frames, {
      innerRadius: 10,
      outerRadius: 12,
      startOrMid: new LineModulation(segmentPhiMid1),
      endOrRange: new LineModulation(Math.PI),
      method: 'midRange',
    });
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
