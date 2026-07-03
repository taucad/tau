/**
 * Valve cover as an additive thin-wall part. The walls are a compound-sketch
 * rectangular tube and the filler neck is an annular revolved boss.
 */
import { makeBox, type Shape3D } from 'replicad';
import { rectangularTubeZ, tubeZ } from './helpers.js';
import { defaultParams, crankStations, type Params } from './params.js';

export function makeValveCover(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const len = st.totalLen - p.snoutLen - p.flangeThk + 30;
  const width = 110;
  const height = p.valveCoverHeight;
  const x0 = st.mainStart[0]! - 5;
  const wall = 4;

  let cover: Shape3D = makeBox(
    [x0 - 6, -width / 2 - 6, 0],
    [x0 + len + 6, width / 2 + 6, 6],
  );
  const parts: Shape3D[] = [
    rectangularTubeZ({
      x0,
      x1: x0 + len,
      y0: -width / 2,
      y1: width / 2,
      z0: 6,
      z1: height,
      wall,
    }),
    makeBox([x0, -width / 2, height - wall], [x0 + len, width / 2, height]),
  ];

  parts.push(
    makeBox([x0 - 4, -width / 2 - 4, 4], [x0 + len + 4, width / 2 + 4, 12]),
  );

  for (let rib = 0; rib < p.bores; rib++) {
    const x = x0 + (len * (rib + 0.5)) / p.bores;
    parts.push(
      makeBox(
        [x - 3, -width / 2 + wall, height - wall],
        [x + 3, width / 2 - wall, height + 4],
      ),
    );
  }

  parts.push(
    tubeZ(16, 11, height, height + 18).translate([x0 + 30, 0, 0]) as Shape3D,
  );
  cover = cover.fuseAll(parts);

  return cover;
}

export default makeValveCover;
