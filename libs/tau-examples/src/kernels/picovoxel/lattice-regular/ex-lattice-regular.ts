// Port of LEAP71_LatticeLibrary Examples/Ex_LatticeLibraryRegularTask.cs (Apache-2.0, © LEAP 71).
// Headless: previews dropped; C# default component choices (RegularCellArray,
// BodyCentreLattice, CellBasedBeamThickness) with noise level 0.2.

import type { Pico, Voxels } from 'picovoxel';
import { BodyCentreLattice, CellBasedBeamThickness, RegularCellArray } from 'picovoxel/latticelibrary';
import { BaseSphere, localFrame } from 'picovoxel/shapekernel';

export function task(pk: Pico): Voxels[] {
  const voxBounding = new BaseSphere(localFrame.identity, 50).voxConstruct(pk);

  const cellArray = new RegularCellArray(voxBounding, 20, 20, 20, 0.2);
  const latticeType = new BodyCentreLattice();
  const beamThickness = new CellBasedBeamThickness(1, 4);
  beamThickness.setBoundingVoxels(voxBounding);

  // C# voxGetFinalLatticeGeometry with nSubSample = 5.
  const lattice = pk.createLattice();
  for (const cell of cellArray.unitCells()) {
    beamThickness.updateCell(cell);
    latticeType.addCell(lattice, cell, beamThickness, 5);
  }
  const voxLattice = lattice.toVoxels().fillet({ rounding: 1 }).intersect(voxBounding);
  return [voxLattice, voxBounding];
}
