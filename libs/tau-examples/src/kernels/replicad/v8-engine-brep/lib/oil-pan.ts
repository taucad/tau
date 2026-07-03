/**
 * Oil pan as additive thin-wall rail and sump geometry. The rail and sump
 * sides are compound-sketch rectangular tubes, not hollowed block solids.
 */
import { makeBox, type Shape3D } from 'replicad';
import { rectangularTubeZ } from './helpers.js';
import { defaultParams, crankStations, type Params } from './params.js';

export function makeOilPan(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const x0 = -6;
  const x1 = st.flangeStart - 8;
  const railTop = -125;
  const railWidth = 184;
  const wall = 4;
  const sumpX0 = st.totalLen * 0.4;
  const sumpDepth = 62;

  const pan: Shape3D = rectangularTubeZ({
    x0,
    x1,
    y0: -railWidth / 2,
    y1: railWidth / 2,
    z0: railTop - 10,
    z1: railTop,
    wall,
  });
  const shellParts: Shape3D[] = [
    rectangularTubeZ({
      x0: sumpX0,
      x1: sumpX0 + 200,
      y0: -78,
      y1: 78,
      z0: railTop - sumpDepth,
      z1: railTop,
      wall,
    }),
    makeBox(
      [sumpX0, -78, railTop - sumpDepth],
      [sumpX0 + 200, 78, railTop - sumpDepth + wall],
    ),
  ];

  return pan.fuseAll(shellParts);
}

export default makeOilPan;
