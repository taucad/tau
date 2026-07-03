/**
 * Intake parts are returned as named bodies. The model keeps the plenum,
 * throttle body, and runners separate instead of forcing a decorative casting
 * union that is not needed for this assembly reference.
 */
import { makeCylinder, type ShapeConfig } from 'replicad';
import { tubeBetween } from './helpers.js';
import {
  defaultParams,
  crankStations,
  cosd,
  sind,
  type Params,
} from './params.js';

export function makeIntakeParts(p: Params = defaultParams): ShapeConfig[] {
  const st = crankStations(p);
  const plenumR = p.plenumDia / 2;
  const x0 = st.mainStart[0]!;
  const len = st.totalLen - p.snoutLen - p.flangeThk;
  const halfBank = p.bankAngle / 2;
  const plenumZ = p.deckHeight * sind(halfBank) + 145;
  const parts: ShapeConfig[] = [
    {
      shape: makeCylinder(plenumR, len, [x0, 0, plenumZ], [1, 0, 0]),
      color: '#7a2d2d',
      name: 'Intake Plenum',
      alpha: 0.9,
    },
    {
      shape: makeCylinder(
        p.throttleDia / 2,
        40,
        [x0 - 40, 0, plenumZ],
        [1, 0, 0],
      ),
      color: '#7a2d2d',
      name: 'Throttle Body',
      alpha: 0.9,
    },
  ];

  for (const side of [-1, 1]) {
    const sideName = side < 0 ? 'L' : 'R';
    const railY = side * (p.deckHeight * cosd(halfBank) + 230);
    const railZ = plenumZ - 34;
    parts.push({
      shape: makeCylinder(
        p.fuelRailDia / 2,
        len,
        [x0, railY, railZ],
        [1, 0, 0],
      ),
      color: '#a94d3f',
      name: `Fuel Rail ${sideName}`,
      alpha: 0.95,
    });
    for (let bore = 0; bore < p.bores; bore++) {
      const x = st.pinCenter[bore]! - 7;
      const portY = side * (p.deckHeight * cosd(halfBank) + 36);
      const portZ = plenumZ - 78;
      const runnerR = p.runnerDia * 0.32;
      const start: [number, number, number] = [
        x,
        side * (plenumR + runnerR + 0.2),
        plenumZ,
      ];
      const mid: [number, number, number] = [x, portY * 0.82, plenumZ - 28];
      const midLower: [number, number, number] = [
        x,
        mid[1] + side * (runnerR * 2 + 2),
        mid[2],
      ];
      const end: [number, number, number] = [x, portY, portZ];
      const runnerName = `Intake Runner ${side < 0 ? 'L' : 'R'}${bore + 1}`;

      parts.push({
        shape: tubeBetween(start, mid, runnerR),
        color: '#7a2d2d',
        name: `${runnerName} Upper`,
        alpha: 0.9,
      });
      parts.push({
        shape: tubeBetween(midLower, end, runnerR),
        color: '#7a2d2d',
        name: `${runnerName} Lower`,
        alpha: 0.9,
      });
      parts.push({
        shape: makeCylinder(
          p.injectorDia / 2,
          28,
          [x, railY - side * 18, railZ - 32],
          [0, 0, 1],
        ),
        color: '#bcb28e',
        name: `Fuel Injector ${sideName}${bore + 1}`,
      });
    }
  }

  return parts;
}

export default makeIntakeParts;
