/**
 * Cylinder head (one bank). Local frame: built flat as a slab in +Z, then the
 * assembly rotates/translates it onto a bank deck. Length runs along X.
 * Features: combustion deck slab, four spark-plug bosses, two cam-tower rails,
 * intake/exhaust port reliefs (simplified as a hollowed underside).
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  crankStations,
  type Params,
} from './params.js';

export function makeCylinderHead(p: Params = defaultParameters): Shape3D {
  const st = crankStations(p);
  const length = st.totalLen - p.snoutLen - p.flangeThk + 40;
  const width = 150;
  const thk = p.headThk;
  const x0 = st.mainStart[0];

  // Deck slab.
  let head: Shape3D = makeBox(
    [x0 - 10, -width / 2, 0],
    [x0 - 10 + length, width / 2, thk],
  );

  // Two cam-tower rails on top.
  const fuseParts: Shape3D[] = [];
  for (const sy of [-1, 1]) {
    const rail = makeBox(
      [x0 - 10, sy * 40 - 18, thk],
      [x0 - 10 + length, sy * 40 + 18, thk + 28],
    );
    fuseParts.push(rail);
  }

  // Four spark-plug bosses + combustion-chamber recesses, one per cylinder.
  const cutTools: Shape3D[] = [];
  for (let i = 0; i < 4; i++) {
    const x = st.pinCenter[i] - 7;
    const boss = makeCylinder(13, 26, [x, 0, thk], [0, 0, 1]);
    fuseParts.push(boss);
    const plugHole = makeCylinder(
      p.plugThreadDia / 2,
      thk + 30,
      [x, 0, -1],
      [0, 0, 1],
    );
    cutTools.push(plugHole);
    // Combustion chamber dish on the underside.
    const chamber = makeCylinder(p.bore / 2 - 4, 8, [x, 0, -1], [0, 0, 1]);
    cutTools.push(chamber);
    // Four valve pockets.
    for (const [vy, vz] of [
      [-22, 0],
      [22, 0],
    ]) {
      const valve = makeCylinder(15, 6, [x, vy, -1], [0, 0, 1]);
      cutTools.push(valve);
      void vz;
    }
  }

  head = head.fuseAll(fuseParts);

  // Hollow the casting underside (water jacket) — a shallow relief.
  const jacket = makeBox(
    [x0 - 4, -width / 2 + 8, -0.1],
    [x0 - 10 + length - 6, width / 2 - 8, 10],
  );
  cutTools.push(jacket);

  head = head.cutAll(cutTools);

  return head;
}

export default makeCylinderHead;
