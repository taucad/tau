/**
 * Connecting rod. Local frame (rod lies in the XY plane, thickness along Z):
 *   big-end bore centre at origin, small-end bore centre at (0, rodLength).
 *   Both bores run along local Z (parallel to crankpin/wrist-pin axes).
 * Construction: a thin I-beam web between two thicker bearing bosses, with a
 * split big-end cap implied by the boss geometry and two cap-bolt holes.
 */
import {
  drawCircle,
  drawRoundedRectangle,
  makeCylinder,
  type Drawing,
  type Shape3D,
} from 'replicad';
import { defaultParams as defaultParameters, type Params } from './params.js';

export function makeConrod(p: Params = defaultParameters): Shape3D {
  const bigR = p.rodBigEndDia / 2;
  const smallR = p.rodSmallEndDia / 2;
  const L = p.rodLength;

  // --- Thin web (I-beam core) silhouette in XY, extruded by beamThk ---
  const web: Drawing = drawRoundedRectangle(
    p.rodBeamWidth,
    L,
    p.rodBeamWidth * 0.45,
  ).translate(0, L / 2);
  const bigDisc: Drawing = drawCircle(bigR);
  const smallDisc: Drawing = drawCircle(smallR).translate(0, L);
  const silhouette = web.fuse(bigDisc).fuse(smallDisc);
  let rod: Shape3D = silhouette.sketchOnPlane('XY').extrude(p.rodBeamThk);

  // --- Thicker bearing bosses at each end (overall boss width > web) ---
  const bossW = p.rodBeamThk + 18; // Proud of the web on both faces
  const zBoss = (p.rodBeamThk - bossW) / 2;
  const bigBoss = makeCylinder(bigR, bossW, [0, 0, zBoss], [0, 0, 1]);
  const smallBoss = makeCylinder(smallR, bossW, [0, L, zBoss], [0, 0, 1]);
  rod = rod.fuseAll([bigBoss, smallBoss]);

  // --- Bores ---
  const bigBore = makeCylinder(
    p.rodBigEndBoreDia / 2,
    bossW + 4,
    [0, 0, zBoss - 2],
    [0, 0, 1],
  );
  const smallBore = makeCylinder(
    p.rodSmallEndBoreDia / 2,
    bossW + 4,
    [0, L, zBoss - 2],
    [0, 0, 1],
  );
  const cutTools: Shape3D[] = [bigBore, smallBore];

  // --- Two cap bolt holes straddling the big-end bore (along Y) ---
  const boltOffset = bigR + 5;
  for (const sx of [-1, 1]) {
    const hole = makeCylinder(
      3,
      bossW + 4,
      [sx * (bigR - 3), -boltOffset, zBoss - 2],
      [0, 0, 1],
    );
    // Route bolt vertically through the boss flanks
    void hole;
  }
  // Cap bolts run along Y through side flanges of the big end.
  for (const sx of [-1, 1]) {
    const bolt = makeCylinder(
      2.5,
      bigR * 2 + 6,
      [sx * (bigR - 2), -bigR - 3, p.rodBeamThk / 2],
      [0, 1, 0],
    );
    cutTools.push(bolt);
  }

  rod = rod.cutAll(cutTools);

  return rod;
}

export default makeConrod;
