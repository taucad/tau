/**
 * Oil pan (sump). A shallow flange rail with a deep sump section, hollowed,
 * hung under the crankcase. Built in the global frame; bolts under the block.
 */
import { makeBox, type Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  crankStations,
  type Params,
} from './params.js';

export function makeOilPan(p: Params = defaultParameters): Shape3D {
  const st = crankStations(p);
  const x0 = -6;
  const x1 = st.totalLen + 6;
  const railTop = -100; // Overlaps the block pan rail (block bottom at -110)
  const railW = 184; // Wide enough to seat on the block's ±100 outer rails
  const wall = 4;

  // Flange rail (overlaps up into the block bottom rails for a sealed joint).
  let pan: Shape3D = makeBox(
    [x0, -railW / 2, railTop - 10],
    [x1, railW / 2, railTop],
  );

  // Deep sump (rear-biased).
  const sumpX0 = st.totalLen * 0.4;
  const sumpDepth = 62;
  const sump = makeBox(
    [sumpX0, -78, railTop - sumpDepth],
    [sumpX0 + 200, 78, railTop],
  );
  pan = pan.fuseAll([sump]);

  // Hollow the whole pan from above.
  const cavity = makeBox(
    [x0 + wall, -railW / 2 + wall, railTop - sumpDepth + wall],
    [x1 - wall, railW / 2 - wall, railTop + 0.1],
  );
  pan = pan.cutAll([cavity]);

  return pan;
}

export default makeOilPan;
