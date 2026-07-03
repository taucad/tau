/**
 * Hollow wrist (gudgeon) pin. Local frame: axis along X, centred at origin.
 */
import { makeCylinder, type Shape3D } from 'replicad';
import { defaultParams as defaultParameters, type Params } from './params.js';

export function makeWristPin(p: Params = defaultParameters): Shape3D {
  const outer = makeCylinder(
    p.wristPinOuterDia / 2,
    p.wristPinLen,
    [-p.wristPinLen / 2, 0, 0],
    [1, 0, 0],
  );
  const bore = makeCylinder(
    p.wristPinInnerDia / 2,
    p.wristPinLen + 2,
    [-p.wristPinLen / 2 - 1, 0, 0],
    [1, 0, 0],
  );
  return outer.cut(bore);
}

export default makeWristPin;
