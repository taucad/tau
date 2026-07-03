import { makeBox, type Shape3D, type ShapeConfig } from 'replicad';
import { tubeX } from './helpers.js';
import {
  defaultParams,
  PIN_PHASE,
  cosd,
  crankStations,
  sind,
  type Params,
} from './params.js';

export function makeMainBearing(p: Params = defaultParams): Shape3D {
  return tubeX(
    p.mainJournalDia / 2 + p.mainBearingWall,
    p.mainJournalDia / 2 + 0.6,
    p.mainJournalLen - 2,
  );
}

export function makeRodBearing(p: Params = defaultParams): Shape3D {
  return tubeX(
    p.crankpinDia / 2 + p.rodBearingWall,
    p.crankpinDia / 2 + 0.5,
    p.crankpinLen - 2,
  );
}

export function makeMainCap(p: Params = defaultParams): Shape3D {
  const halfWidth = p.mainJournalDia / 2 + 18;
  const height = 34;
  const cap = makeBox(
    [-p.mainJournalLen / 2, -halfWidth, -height],
    [p.mainJournalLen / 2, halfWidth, 0],
  );
  const boltA = makeBox(
    [-p.mainJournalLen / 2 + 4, -halfWidth + 7, -height - 5],
    [p.mainJournalLen / 2 - 4, -halfWidth + 17, -height],
  );
  const boltB = boltA
    .clone()
    .translate([0, 2 * (halfWidth - 12), 0]) as Shape3D;
  return cap.fuseAll([boltA, boltB]);
}

export function makeBottomEndParts(p: Params = defaultParams): ShapeConfig[] {
  const st = crankStations(p);
  const mainBearing = makeMainBearing(p);
  const mainCap = makeMainCap(p);
  const rodBearing = makeRodBearing(p);
  const parts: ShapeConfig[] = [];

  for (let index = 0; index <= p.bores; index++) {
    const x = st.mainCenter[index]!;
    parts.push({
      shape: mainBearing
        .clone()
        .translate([x - p.mainJournalLen / 2 + 1, 0, 0]) as Shape3D,
      color: '#d6b36a',
      name: `Main Bearing ${index + 1}`,
    });
    parts.push({
      shape: mainCap
        .clone()
        .translate([x, 0, -p.mainJournalDia / 2 - 4]) as Shape3D,
      color: '#55575d',
      name: `Main Bearing Cap ${index + 1}`,
    });
  }

  for (let index = 0; index < p.bores; index++) {
    const phase = PIN_PHASE[index % PIN_PHASE.length]!;
    parts.push({
      shape: rodBearing
        .clone()
        .translate([
          st.pinStart[index]! + 1,
          p.crankThrow * cosd(phase),
          p.crankThrow * sind(phase),
        ]) as Shape3D,
      color: '#d6b36a',
      name: `Rod Bearing ${index + 1}`,
    });
  }

  return parts;
}

export default makeBottomEndParts;
