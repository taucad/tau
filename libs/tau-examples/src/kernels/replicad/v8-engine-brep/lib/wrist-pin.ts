/**
 * Hollow wrist pin as a revolved tube profile, avoiding a cylinder-minus-
 * cylinder boolean for every piston assembly.
 */
import type { Shape3D } from 'replicad';
import { tubeX } from './helpers.js';
import { defaultParams, type Params } from './params.js';

export function makeWristPin(p: Params = defaultParams): Shape3D {
  return tubeX(
    p.wristPinOuterDia / 2 - 0.2,
    p.wristPinInnerDia / 2,
    p.wristPinLen,
  ).translate([-p.wristPinLen / 2, 0, 0]) as Shape3D;
}

export default makeWristPin;
