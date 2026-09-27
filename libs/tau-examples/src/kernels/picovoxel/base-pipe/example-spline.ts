// Port of LEAP71_ShapeKernel Examples/ExampleSpline.cs (Apache-2.0, © LEAP 71).
// A reusable B-Spline spine shared by the spined example variants.

import { ControlPointSpline, type Spline } from 'picovoxel/shapekernel';
import type { Vec3 } from 'picovoxel';

export class ExampleSpline implements Spline {
  private readonly bspline = new ControlPointSpline([
    [0, 0, 0],
    [0, 40, 0],
    [0, 50, 20],
    [0, 60, 60],
  ]);

  points(samples = 500): Vec3[] {
    return this.bspline.points(samples);
  }
}
