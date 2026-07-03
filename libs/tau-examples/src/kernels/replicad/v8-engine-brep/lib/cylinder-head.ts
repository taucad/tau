/**
 * Cylinder head. Plug bosses are annular pads, while plug holes, chambers,
 * valve reliefs, and water relief remain one reliable feature batch.
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import { defaultParams, crankStations, type Params } from './params.js';

export function makeCylinderHead(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const len = st.totalLen - p.snoutLen - p.flangeThk + 40;
  const width = 150;
  const thickness = p.headThk;
  const x0 = st.mainStart[0]! - 10;

  let deckPlate: Shape3D = makeBox(
    [x0, -width / 2, 0],
    [x0 + len, width / 2, 14],
  );
  const cutTools: Shape3D[] = [];

  for (let bore = 0; bore < p.bores; bore++) {
    const x = st.pinCenter[bore]! - 7;
    cutTools.push(
      makeCylinder(p.plugThreadDia / 2, thickness + 30, [x, 0, -1], [0, 0, 1]),
    );
    cutTools.push(makeCylinder(p.bore / 2 - 4, 8, [x, 0, -2], [0, 0, 1]));
    for (const valveY of [-p.valveCenterOffset, p.valveCenterOffset]) {
      cutTools.push(makeCylinder(18, 22, [x, valveY, -2], [0, 0, 1]));
    }
    for (const boltY of [-p.headBoltCircleOffset, p.headBoltCircleOffset]) {
      cutTools.push(
        makeCylinder(p.headBoltDia / 2 + 1.2, 22, [x, boltY, -2], [0, 0, 1]),
      );
    }
  }

  cutTools.push(
    makeBox([x0 + 6, -width / 2 + 8, -0.1], [x0 + len - 6, width / 2 - 8, 10]),
  );
  deckPlate = deckPlate.cutAll(cutTools);
  const head = deckPlate;
  const upperClearanceTools: Shape3D[] = [];
  for (let bore = 0; bore < p.bores; bore++) {
    const x = st.pinCenter[bore]! - 7;
    for (const valveY of [-p.valveCenterOffset, p.valveCenterOffset]) {
      upperClearanceTools.push(
        makeCylinder(26, thickness + 40, [x, valveY, 12], [0, 0, 1]),
      );
    }
    for (const boltY of [-p.headBoltCircleOffset, p.headBoltCircleOffset]) {
      upperClearanceTools.push(
        makeCylinder(
          p.headBoltDia / 2 + 3,
          thickness + 40,
          [x, boltY, 12],
          [0, 0, 1],
        ),
      );
    }
  }

  return head.cutAll(upperClearanceTools);
}

export default makeCylinderHead;
