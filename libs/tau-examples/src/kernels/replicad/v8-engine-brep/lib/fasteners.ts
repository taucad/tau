import {
  makeBox,
  makeCylinder,
  type Shape3D,
  type ShapeConfig,
} from 'replicad';
import { hexPrismZ, rectangularTubeZ } from './helpers.js';
import {
  defaultParams,
  bankLayouts,
  cosd,
  crankStations,
  sind,
  type Params,
} from './params.js';

const makeBoltZ = (
  diameter: number,
  length: number,
  headAcross = diameter * 1.8,
): Shape3D => {
  const shank = makeCylinder(diameter / 2, length, [0, 0, 0], [0, 0, 1]);
  const head = hexPrismZ(headAcross, length, diameter * 0.55);
  return shank.fuseAll([head]);
};

const placeBankPart = (
  shape: Shape3D,
  deckAngle: number,
  translation: [number, number, number],
): Shape3D =>
  shape
    .rotate(deckAngle - 90, [0, 0, 0], [1, 0, 0])
    .translate(translation) as Shape3D;

export function makeHeadGasket(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const x0 = st.mainStart[0]! - 12;
  const len = st.totalLen - p.snoutLen - p.flangeThk + 44;
  let gasket: Shape3D = makeBox([x0, -68, -p.gasketThk], [x0 + len, 68, 0]);
  const cutTools: Shape3D[] = [];

  for (let bore = 0; bore < p.bores; bore++) {
    const x = st.pinCenter[bore]! - 7;
    cutTools.push(
      makeCylinder(
        p.bore / 2 - 2,
        p.gasketThk + 2,
        [x, 0, -p.gasketThk - 1],
        [0, 0, 1],
      ),
    );
    cutTools.push(
      makeCylinder(
        p.plugThreadDia / 2 + 2,
        p.gasketThk + 2,
        [x, 0, -p.gasketThk - 1],
        [0, 0, 1],
      ),
    );
    for (const valveY of [-p.valveCenterOffset, p.valveCenterOffset]) {
      cutTools.push(
        makeCylinder(
          18,
          p.gasketThk + 2,
          [x, valveY, -p.gasketThk - 1],
          [0, 0, 1],
        ),
      );
    }
    for (const boltY of [-p.headBoltCircleOffset, p.headBoltCircleOffset]) {
      cutTools.push(
        makeCylinder(
          p.headBoltDia / 2 + 1.2,
          p.gasketThk + 2,
          [x, boltY, -p.gasketThk - 1],
          [0, 0, 1],
        ),
      );
    }
  }

  gasket = gasket.cutAll(cutTools);
  return gasket;
}

export function makeFastenerAndGasketParts(
  p: Params = defaultParams,
): ShapeConfig[] {
  const st = crankStations(p);
  const parts: ShapeConfig[] = [];
  const coverBolt = makeBoltZ(p.coverBoltDia, 5);
  const panBolt = makeBoltZ(p.panBoltDia, 5);
  const headGasket = makeHeadGasket(p);
  const valveCoverGasket = rectangularTubeZ({
    x0: st.mainStart[0]! - 10,
    x1: st.totalLen - p.flangeThk + 25,
    y0: -60,
    y1: 60,
    z0: 0,
    z1: p.gasketThk,
    wall: 5,
  });

  for (const bank of bankLayouts(p)) {
    const headOrigin: [number, number, number] = [
      0,
      cosd(bank.deckAngle) * p.deckHeight,
      sind(bank.deckAngle) * p.deckHeight + 10,
    ];
    parts.push({
      shape: placeBankPart(headGasket.clone(), bank.deckAngle, headOrigin),
      color: '#4d4d45',
      name: `Head Gasket ${bank.side}`,
    });
    parts.push({
      shape: placeBankPart(valveCoverGasket.clone(), bank.deckAngle, [
        0,
        cosd(bank.deckAngle) * (p.deckHeight + p.headThk + 28),
        sind(bank.deckAngle) * (p.deckHeight + p.headThk + 28) + 10,
      ]),
      color: '#232323',
      name: `Valve Cover Gasket ${bank.side}`,
    });

    for (let bolt = 0; bolt < p.bores + 1; bolt++) {
      const x =
        st.mainStart[0]! +
        (bolt * (st.totalLen - p.snoutLen - p.flangeThk)) / p.bores;
      for (const y of [-47, 47]) {
        parts.push({
          shape: placeBankPart(coverBolt.clone(), bank.deckAngle, [
            x,
            cosd(bank.deckAngle) *
              (p.deckHeight + p.headThk + 28 + p.gasketThk + 0.2) +
              y,
            sind(bank.deckAngle) *
              (p.deckHeight + p.headThk + 28 + p.gasketThk + 0.2) +
              p.valveCoverHeight +
              10,
          ]),
          color: '#2c2c30',
          name: `Valve Cover Bolt ${bank.side}${bolt + 1}${y < 0 ? 'A' : 'B'}`,
        });
      }
    }
  }

  const x0 = -6;
  const x1 = st.flangeStart - 8;
  const panZ = -125;
  parts.push({
    shape: rectangularTubeZ({
      x0,
      x1,
      y0: -92,
      y1: 92,
      z0: panZ,
      z1: panZ + p.gasketThk,
      wall: 5,
    }),
    color: '#202020',
    name: 'Oil Pan Gasket',
  });
  for (let index = 0; index < 9; index++) {
    const x = x0 + (index * (x1 - x0)) / 8;
    for (const y of [-83, 83]) {
      parts.push({
        shape: panBolt.clone().translate([x, y, panZ + p.gasketThk]) as Shape3D,
        color: '#2c2c30',
        name: `Oil Pan Bolt ${index + 1}${y < 0 ? 'L' : 'R'}`,
      });
    }
  }

  return parts;
}

export default makeFastenerAndGasketParts;
