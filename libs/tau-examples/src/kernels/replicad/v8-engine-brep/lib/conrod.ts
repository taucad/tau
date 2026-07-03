/**
 * Connecting rod with 2D profile holes embedded in the base extrusion and
 * bearing bosses modeled as revolved tubes.
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import { defaultParams, type Params } from './params.js';

export function makeConrod(p: Params = defaultParams): Shape3D {
  const bigR = p.rodBigEndDia / 2 + p.rodBearingWall + 4;
  const smallR = p.rodSmallEndDia / 2;
  const bossW = 3;
  const zBoss = (p.rodBeamThk - bossW) / 2;

  const bigEnd = makeCylinder(bigR, bossW, [0, 0, zBoss], [0, 0, 1]);
  const smallEnd = makeCylinder(
    smallR,
    bossW,
    [0, p.rodLength, zBoss],
    [0, 0, 1],
  );
  const beam = makeBox(
    [-p.rodBeamWidth / 2, -bigR * 0.25, zBoss],
    [p.rodBeamWidth / 2, p.rodLength + smallR * 0.25, zBoss + bossW],
  );
  let rod: Shape3D = bigEnd.fuseAll([smallEnd, beam]);

  rod = rod.cutAll([
    makeCylinder(
      p.rodBigEndBoreDia / 2 + p.rodBearingWall + 1,
      bossW + 4,
      [0, 0, zBoss - 2],
      [0, 0, 1],
    ),
    makeCylinder(
      p.rodSmallEndBoreDia / 2 + 1,
      bossW + 4,
      [0, p.rodLength, zBoss - 2],
      [0, 0, 1],
    ),
    makeCylinder(
      p.rodBoltDia / 2,
      bigR * 2 + 10,
      [-p.rodBeamWidth / 2 - p.rodBoltDia, -bigR - 5, zBoss + bossW / 2],
      [0, 1, 0],
    ),
    makeCylinder(
      p.rodBoltDia / 2,
      bigR * 2 + 10,
      [p.rodBeamWidth / 2 + p.rodBoltDia, -bigR - 5, zBoss + bossW / 2],
      [0, 1, 0],
    ),
  ]);

  return rod;
}

export default makeConrod;
