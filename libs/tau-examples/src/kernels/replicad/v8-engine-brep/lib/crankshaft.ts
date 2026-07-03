/**
 * Cross-plane V8 crankshaft as one manufactured solid. Journals, crankpins,
 * web lobes, and flange are batched into one BRep; oil galleries and flange
 * holes are one drilled-feature batch.
 */
import { makeCylinder, type Shape3D } from 'replicad';
import { capsuleExtrude } from './helpers.js';
import {
  defaultParams,
  PIN_PHASE,
  cosd,
  sind,
  crankStations,
  type Params,
} from './params.js';

function makeWeb(p: Params, xStart: number, phaseDeg: number): Shape3D {
  const dirY = cosd(phaseDeg);
  const dirZ = sind(phaseDeg);
  return capsuleExtrude(
    [-p.counterweightOffset * dirY, -p.counterweightOffset * dirZ],
    p.counterweightDia / 2,
    [p.crankThrow * dirY, p.crankThrow * dirZ],
    p.webHubPinDia / 2,
    'YZ',
    xStart,
    p.webThickness,
  );
}

export function makeCrankshaft(p: Params = defaultParams): Shape3D {
  const st = crankStations(p);
  const crankParts: Shape3D[] = [
    makeCylinder(p.snoutDia / 2, p.snoutLen, [st.snoutStart, 0, 0], [1, 0, 0]),
  ];

  for (let i = 0; i <= p.bores; i++) {
    crankParts.push(
      makeCylinder(
        p.mainJournalDia / 2,
        p.mainJournalLen,
        [st.mainStart[i]!, 0, 0],
        [1, 0, 0],
      ),
    );
  }

  for (let i = 0; i < p.bores; i++) {
    const phase = PIN_PHASE[i % PIN_PHASE.length]!;
    const pinY = p.crankThrow * cosd(phase);
    const pinZ = p.crankThrow * sind(phase);

    crankParts.push(makeWeb(p, st.webStart[2 * i]!, phase));
    crankParts.push(
      makeCylinder(
        p.crankpinDia / 2,
        p.crankpinLen,
        [st.pinStart[i]!, pinY, pinZ],
        [1, 0, 0],
      ),
    );
    crankParts.push(makeWeb(p, st.webStart[2 * i + 1]!, phase));
  }

  let flange: Shape3D = makeCylinder(
    p.flangeDia / 2,
    p.flangeThk,
    [st.flangeStart, 0, 0],
    [1, 0, 0],
  );
  const flangeCutTools: Shape3D[] = [
    makeCylinder(11, p.flangeThk + 4, [st.flangeStart - 2, 0, 0], [1, 0, 0]),
  ];
  for (let bolt = 0; bolt < p.flangeBolts; bolt++) {
    const angle = (360 / p.flangeBolts) * bolt;
    flangeCutTools.push(
      makeCylinder(
        p.flangeBoltDia / 2,
        p.flangeThk + 4,
        [
          st.flangeStart - 2,
          (p.flangeBoltCircle / 2) * cosd(angle),
          (p.flangeBoltCircle / 2) * sind(angle),
        ],
        [1, 0, 0],
      ),
    );
  }
  flange = flange.cutAll(flangeCutTools);
  crankParts.push(flange);

  const [first, ...remainingCrankParts] = crankParts;
  const crank = first!.fuseAll(remainingCrankParts);
  const oilGalleryTools: Shape3D[] = [];

  for (let i = 0; i < p.bores; i++) {
    const phase = PIN_PHASE[i % PIN_PHASE.length]!;
    const pinY = p.crankThrow * cosd(phase);
    const pinZ = p.crankThrow * sind(phase);
    oilGalleryTools.push(
      makeCylinder(
        p.oilGalleryDia / 2,
        p.crankThrow + p.crankpinDia,
        [st.pinCenter[i]!, pinY / 2, pinZ / 2],
        [0, pinY || 1, pinZ],
      ),
    );
  }

  return crank.cutAll(oilGalleryTools);
}

export default makeCrankshaft;
