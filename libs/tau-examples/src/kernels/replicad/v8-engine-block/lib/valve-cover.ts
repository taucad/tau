/**
 * Valve cover (one bank). A hollow ribbed shell sitting on the cam towers.
 * Built flat in +Z; the assembly orients it onto a bank.
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  crankStations,
  type Params,
} from './params.js';

export function makeValveCover(p: Params = defaultParameters): Shape3D {
  const st = crankStations(p);
  const length = st.totalLen - p.snoutLen - p.flangeThk + 30;
  const width = 110;
  const h = p.valveCoverHeight;
  const x0 = st.mainStart[0] - 5;
  const wall = 4;

  // Outer shell.
  let cover: Shape3D = makeBox(
    [x0, -width / 2, 0],
    [x0 + length, width / 2, h],
  );
  // Hollow it.
  const cavity = makeBox(
    [x0 + wall, -width / 2 + wall, -1],
    [x0 + length - wall, width / 2 - wall, h - wall],
  );
  cover = cover.cut(cavity);

  // Mounting flange lip at the base.
  const lip = makeBox(
    [x0 - 6, -width / 2 - 6, 0],
    [x0 + length + 6, width / 2 + 6, 6],
  );
  const fuseParts: Shape3D[] = [lip];
  const lipCavity = makeBox(
    [x0 + wall, -width / 2 + wall, -1],
    [x0 + length - wall, width / 2 - wall, 6.1],
  );
  const cutTools: Shape3D[] = [lipCavity];

  // Four reinforcing ribs across the top.
  for (let i = 0; i < 4; i++) {
    const x = x0 + (length * (i + 0.5)) / 4;
    const rib = makeBox(
      [x - 3, -width / 2 + wall, h - wall],
      [x + 3, width / 2 - wall, h + 4],
    );
    fuseParts.push(rib);
  }

  // Oil filler cap boss.
  const filler = makeCylinder(16, 18, [x0 + 30, 0, h], [0, 0, 1]);
  fuseParts.push(filler);
  cutTools.push(makeCylinder(11, 22, [x0 + 30, 0, h - 2], [0, 0, 1]));

  cover = cover.fuseAll(fuseParts).cutAll(cutTools);

  return cover;
}

export default makeValveCover;
