/**
 * Spark plug with all round sections represented by one revolved profile.
 * The hex is the only non-axisymmetric body.
 */
import type { Shape3D } from 'replicad';
import { hexPrismZ, revolvedZFromCurvePath } from './helpers.js';
import { defaultParams, type Params } from './params.js';

export function makeSparkPlug(p: Params = defaultParams): Shape3D {
  const threadR = p.plugThreadDia / 2;
  const hexZ0 = p.plugReach;
  const hexZ1 = hexZ0 + 14;
  const ceramicZ1 = hexZ1 + 22;
  const terminalZ1 = ceramicZ1 + 16;
  const plug: Shape3D = revolvedZFromCurvePath(
    [0, -3.5],
    [
      { kind: 'line', to: [1.2, -3.5] },
      { kind: 'line', to: [1.2, 0] },
      { kind: 'line', to: [threadR, 0] },
      { kind: 'line', to: [threadR, hexZ0] },
      { kind: 'line', to: [6.2, hexZ0] },
      { kind: 'line', to: [6.2, hexZ1] },
      { kind: 'line', to: [5, hexZ1] },
      { kind: 'line', to: [5, ceramicZ1] },
      { kind: 'line', to: [3, ceramicZ1] },
      { kind: 'line', to: [3, terminalZ1] },
      { kind: 'line', to: [0, terminalZ1] },
    ],
  );
  const hex = hexPrismZ(p.plugHexAcross, hexZ0, 14);

  return plug.fuseAll([hex]);
}

export default makeSparkPlug;
