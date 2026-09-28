// Port of LEAP71_LatticeLibrary Examples/Ex_ImplicitLibraryRadialTask.cs (Apache-2.0, © LEAP 71).
// ImplicitRadialGyroid is callback-only (no atan2 in the tape op set), so the
// mask goes through maskedByImplicit's serial callback path.

import type { Pico, Voxels } from 'picovoxel';
import { ImplicitRadialGyroid } from 'picovoxel/latticelibrary';
import { BasePipe, localFrame } from 'picovoxel/shapekernel';

export function task(pk: Pico): Voxels[] {
  const voxBounding = new BasePipe(localFrame.identity, 50, 20, 50).voxConstruct(pk);
  const pattern = new ImplicitRadialGyroid(16, 10, 0.5);
  const voxImplicit = voxBounding.maskedByImplicit({ sdf: pattern.sdf });
  return [voxImplicit, voxBounding];
}
