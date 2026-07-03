/**
 * Engine block as discrete BRep-native casting features: bank deck plates,
 * main-bearing saddles, and side skirt rails. The block no longer occupies the
 * whole crankcase volume, so rotating and reciprocating parts have real
 * assembly clearance instead of being visually embedded in a monolithic body.
 */
import { makeBox, makeCylinder, type Shape3D } from 'replicad';
import { rectangularTubeZ } from './helpers.js';
import {
  defaultParams,
  bankLayouts,
  cosd,
  sind,
  crankStations,
  type Params,
} from './params.js';

const placeBankPart = (
  shape: Shape3D,
  deckAngle: number,
  translation: [number, number, number],
): Shape3D =>
  shape
    .rotate(deckAngle - 90, [0, 0, 0], [1, 0, 0])
    .translate(translation) as Shape3D;

export function makeBlock(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const deckCastings: Shape3D[] = [];
  const bankSideWalls: Shape3D[] = [];
  const mainSaddles: Shape3D[] = [];
  const mainWebs: Shape3D[] = [];
  const x0 = st.mainStart[0]! - 14;
  const x1 = st.flangeStart - 6;
  const deckLen = x1 - x0;
  const deckWidth = 152;
  const deckTop = -p.gasketThk - 0.2;
  const deckBottom = deckTop - p.blockDeckThk;
  const bankWallDrop = 150;
  const bankWallThk = 24;

  for (const bank of bankLayouts(p)) {
    const normalY = cosd(bank.deckAngle);
    const normalZ = sind(bank.deckAngle);
    let deckPlate: Shape3D = makeBox(
      [x0, -deckWidth / 2, deckBottom],
      [x0 + deckLen, deckWidth / 2, deckTop],
    );
    const boreCuts: Shape3D[] = [];

    for (let bore = 0; bore < p.bores; bore++) {
      const x = st.pinCenter[bore]! + bank.xShift - 7;
      boreCuts.push(
        makeCylinder(
          p.bore / 2 + 10,
          p.blockDeckThk + 4,
          [x, 0, deckBottom - 2],
          [0, 0, 1],
        ),
      );
      for (const valveY of [-p.valveCenterOffset, p.valveCenterOffset]) {
        boreCuts.push(
          makeCylinder(
            30,
            p.blockDeckThk + 4,
            [x, valveY, deckBottom - 2],
            [0, 0, 1],
          ),
        );
      }
    }

    deckPlate = deckPlate.cutAll(boreCuts);
    deckCastings.push(
      placeBankPart(deckPlate, bank.deckAngle, [
        0,
        normalY * p.deckHeight,
        normalZ * p.deckHeight + 10,
      ]),
    );
    bankSideWalls.push(
      placeBankPart(
        makeBox(
          [x0, -deckWidth / 2, deckBottom - bankWallDrop],
          [x0 + deckLen, -deckWidth / 2 + bankWallThk, deckTop],
        ),
        bank.deckAngle,
        [0, normalY * p.deckHeight, normalZ * p.deckHeight + 10],
      ),
      placeBankPart(
        makeBox(
          [x0, deckWidth / 2 - bankWallThk, deckBottom - bankWallDrop],
          [x0 + deckLen, deckWidth / 2, deckTop],
        ),
        bank.deckAngle,
        [0, normalY * p.deckHeight, normalZ * p.deckHeight + 10],
      ),
    );
  }

  const saddleHalfLength = p.mainJournalLen / 2 - 1;
  const saddleHalfWidth = p.mainJournalDia / 2 + p.mainBearingWall + 18;
  const saddleTop = p.mainJournalDia / 2 + p.mainBearingWall + 16;
  const saddleBottom = -2;
  const tunnelRadius = p.mainJournalDia / 2 + p.mainBearingWall + 2;
  const mainWebHalfLength = p.mainWebThk / 2;

  for (const x of st.mainCenter) {
    mainSaddles.push(
      makeBox(
        [x - saddleHalfLength, -saddleHalfWidth, saddleBottom],
        [x + saddleHalfLength, saddleHalfWidth, saddleTop],
      ).cutAll([
        makeCylinder(
          tunnelRadius,
          2 * saddleHalfLength + 4,
          [x - saddleHalfLength - 2, 0, 0],
          [1, 0, 0],
        ),
      ]),
    );
    mainWebs.push(
      makeBox(
        [x - mainWebHalfLength, -150, -54],
        [x + mainWebHalfLength, 150, 30],
      ).cutAll([
        makeCylinder(
          tunnelRadius + 8,
          2 * mainWebHalfLength + 4,
          [x - mainWebHalfLength - 2, 0, 0],
          [1, 0, 0],
        ),
      ]),
    );
  }

  const crankcaseShell = rectangularTubeZ({
    x0,
    x1,
    y0: -172,
    y1: 172,
    z0: -96,
    z1: 64,
    wall: 22,
  });

  return crankcaseShell.fuseAll([
    ...bankSideWalls,
    ...deckCastings,
    ...mainSaddles,
    ...mainWebs,
  ]);
}

export default makeBlock;
