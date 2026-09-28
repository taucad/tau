// Port of LEAP71_LatticeLibrary Examples/Ex_ImplicitLibraryLogicSplitTask.cs (Apache-2.0, © LEAP 71).
// C# default choice: the two ImplicitSplitVoidGyroid sides, complementary
// voids of the same box. Both masks run the accelerated tape path.

import type { Pico, Voxels } from 'picovoxel';
import { ImplicitSplitVoidGyroid } from 'picovoxel/latticelibrary';
import { BaseBox, localFrame } from 'picovoxel/shapekernel';

export function task(pk: Pico): Voxels[] {
  const voxBounding = new BaseBox(localFrame.identity, 50, 50, 50).voxConstruct(pk);
  const pattern1 = new ImplicitSplitVoidGyroid(10, 1, true);
  const pattern2 = new ImplicitSplitVoidGyroid(10, 1, false);
  const voxImplicit1 = voxBounding.maskedByImplicit({ sdf: pattern1.expression });
  const voxImplicit2 = voxBounding.maskedByImplicit({ sdf: pattern2.expression });
  return [voxImplicit1, voxImplicit2, voxBounding];
}
