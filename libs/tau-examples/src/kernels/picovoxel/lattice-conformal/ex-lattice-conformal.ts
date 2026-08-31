// Port of LEAP71_LatticeLibrary Examples/Ex_LatticeLibraryConformalTask.cs (Apache-2.0, © LEAP 71).
// Headless: previews dropped; C# default choices (the modulated showcase box,
// BodyCentreLattice, CellBasedBeamThickness(2, 0.1) — min/max inverted upstream).

import type { Pico, Voxels } from 'picovoxel';
import {
  BodyCentreLattice,
  CellBasedBeamThickness,
  ConformalCellArray,
  conformalShowcaseShapes,
} from 'picovoxel/latticelibrary';

export function task(pk: Pico): Voxels[] {
  const shape = conformalShowcaseShapes.box01();
  const voxBounding = shape.voxConstruct(pk);

  const cellArray = new ConformalCellArray(shape, 6, 8, 15);
  const latticeType = new BodyCentreLattice();
  const beamThickness = new CellBasedBeamThickness(2, 0.1);
  beamThickness.setBoundingVoxels(voxBounding);

  // C# voxGetFinalLatticeGeometry with nSubSample = 5.
  const lattice = pk.createLattice();
  for (const cell of cellArray.unitCells()) {
    beamThickness.updateCell(cell);
    latticeType.addCell(lattice, cell, beamThickness, 5);
  }
  const voxLattice = lattice.toVoxels().fillet({ rounding: 0.5 }).intersect(voxBounding);
  return [voxLattice, voxBounding];
}
