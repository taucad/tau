import { makeCylinder, type ShapeConfig } from 'replicad';
import { tubeBetween } from './helpers.js';
import {
  defaultParams,
  crankStations,
  cylinderPlacements,
  cosd,
  sind,
  type Params,
} from './params.js';

export function makeExhaustParts(p: Params = defaultParams): ShapeConfig[] {
  const st = crankStations(p);
  const parts: ShapeConfig[] = [];
  const halfBank = p.bankAngle / 2;
  const collectorZ = p.deckHeight * sind(halfBank) - 35;

  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'L' : 'R';
    const collectorY = side * (p.deckHeight * cosd(halfBank) + 135);
    parts.push({
      shape: makeCylinder(
        p.exhaustCollectorDia / 2,
        st.totalLen - p.snoutLen - p.flangeThk,
        [st.mainStart[0]!, collectorY, collectorZ],
        [1, 0, 0],
      ),
      color: '#68605a',
      name: `Exhaust Collector ${sideName}`,
    });
  }

  for (const placement of cylinderPlacements(p)) {
    const side = placement.bankSide === 'L' ? -1 : 1;
    const sideName = placement.bankSide;
    const collectorCenterY =
      side * (p.deckHeight * cosd(p.bankAngle / 2) + 135);
    const portSurfaceY = side * (153 + p.exhaustRunnerDia / 2);
    const collectorSurfaceY =
      collectorCenterY +
      side * (p.exhaustCollectorDia / 2 + p.exhaustRunnerDia / 2 + 1.2);
    const start: [number, number, number] = [
      placement.x,
      placement.deckY + portSurfaceY,
      placement.deckZ + 42,
    ];
    const end: [number, number, number] = [
      placement.x,
      collectorSurfaceY,
      p.deckHeight * sind(p.bankAngle / 2) - 35,
    ];
    parts.push({
      shape: tubeBetween(start, end, p.exhaustRunnerDia / 2),
      color: '#746a62',
      name: `Exhaust Runner ${sideName}${placement.boreIndex + 1}`,
    });
  }

  return parts;
}

export default makeExhaustParts;
