// Port of LEAP71_ShapeKernel Examples/Ex_LatticeManifoldShowCase.cs (Apache-2.0, © LEAP 71).
// Horizontal (local Z = +Y) manifold pipes with three overhang/extension settings.

import type { Pico, Voxels } from 'picovoxel';
import { LatticeManifold, localFrame } from 'picovoxel/shapekernel';

export function task(pk: Pico): Voxels[] {
  const results: Voxels[] = [];
  {
    const shape = new LatticeManifold(localFrame.createZ([-50, 0, 0], [0, 1, 0]), {
      length: 50,
      radius: 5,
      maxOverhangAngle: 45,
      extendBothSides: false,
    });
    results.push(shape.voxConstruct(pk));
  }
  {
    const shape = new LatticeManifold(localFrame.createZ([0, 0, 0], [0, 1, 0]), {
      length: 50,
      radius: 10,
      maxOverhangAngle: 30,
      extendBothSides: true,
    });
    results.push(shape.voxConstruct(pk));
  }
  {
    const shape = new LatticeManifold(localFrame.createZ([50, 0, 0], [0, 1, 0]), {
      length: 50,
      radius: 5,
      maxOverhangAngle: 60,
      extendBothSides: true,
    });
    results.push(shape.voxConstruct(pk));
  }
  return results;
}
