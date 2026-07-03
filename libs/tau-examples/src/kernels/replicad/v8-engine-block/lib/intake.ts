/**
 * Intake manifold: a central plenum log running along X above the valley,
 * a throttle-body inlet at the front, and eight curved runners (four per
 * side) sweeping down toward each cylinder head intake port.
 */
import { draw, makeCylinder, type Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  crankStations,
  cosd,
  sind,
  type Params,
} from './params.js';

export function makeIntake(p: Params = defaultParameters): Shape3D {
  const st = crankStations(p);
  const plenumR = p.plenumDia / 2;
  const x0 = st.mainStart[0];
  const length = st.totalLen - p.snoutLen - p.flangeThk;
  const plenumZ = p.deckHeight * sind(45) + 40; // Above the valley

  // Plenum log along X.
  let intake: Shape3D = makeCylinder(
    plenumR,
    length,
    [x0, 0, plenumZ],
    [1, 0, 0],
  );

  // Throttle body inlet at the front (along +X out the nose).
  const throttleBody = makeCylinder(
    p.throttleDia / 2,
    40,
    [x0 - 40, 0, plenumZ],
    [1, 0, 0],
  );
  const fuseParts: Shape3D[] = [throttleBody];

  // Eight runners: sweep a circle from the plenum side down to each port.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 4; index++) {
      const x = st.pinCenter[index] - 7;
      // Port target near the head intake side.
      const portY = side * (p.deckHeight * cosd(45) * 0.35 + 25);
      const portZ = plenumZ - 60;
      // Build the runner as a swept profile path approximated by a tube:
      // start on plenum surface, curve out to the port. Use a smooth spline
      // path turned into a pipe via two-segment cylinders + sphere joints.
      const startY = side * plenumR;
      const start: [number, number, number] = [x, startY, plenumZ];
      const mid: [number, number, number] = [x, portY * 0.7, plenumZ - 20];
      const end: [number, number, number] = [x, portY, portZ];

      fuseParts.push(tube(start, mid, p.runnerDia / 2));
      fuseParts.push(tube(mid, end, p.runnerDia / 2));
      void draw;
    }
  }

  intake = intake.fuseAll(fuseParts);

  return intake;
}

/** A straight tube between two points (runner segment). */
function tube(
  a: [number, number, number],
  b: [number, number, number],
  r: number,
): Shape3D {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  return makeCylinder(r, length, a, [dx / length, dy / length, dz / length]);
}

export default makeIntake;
