/**
 * Forged piston, built in a canonical local frame:
 *   +Z = piston/cylinder axis (crown up)
 *   wrist-pin bore along local X, pin centre at the local origin.
 * Crown sits at z = compHeight, skirt extends to z = -skirtLen.
 * Features: domed crown, three ring grooves (2 compression + 1 oil),
 * through wrist-pin bore.
 */
import { makeCylinder, makeSphere, type Shape3D } from 'replicad';
import { defaultParams as defaultParameters, type Params } from './params.js';

export function makePiston(p: Params = defaultParameters): Shape3D {
  const r = p.crownDia / 2;
  const top = p.pistonCompHeight; // Crown face Z
  const bottom = -p.pistonSkirtLen;

  // Main body (crown + skirt) as one cylinder.
  let piston: Shape3D = makeCylinder(
    r,
    top - bottom,
    [0, 0, bottom],
    [0, 0, 1],
  );

  // Domed crown: intersect a large sphere cap so the top bulges by domeRise.
  const sphR = (r * r + p.domeRise * p.domeRise) / (2 * p.domeRise);
  const dome = makeSphere(sphR).translate([0, 0, top + p.domeRise - sphR]);
  // Cut the body flat at crown, then fuse the dome cap above it.
  const cap = dome.intersect(
    makeCylinder(r, p.domeRise + 1, [0, 0, top - 0.5], [0, 0, 1]),
  );
  piston = piston.fuse(cap);

  // Three ring grooves below the crown (annular cuts).
  const firstGrooveZ = top - 4;
  const cutTools: Shape3D[] = [];
  for (let g = 0; g < 3; g++) {
    const z = firstGrooveZ - g * (p.ringGrooveWidth + 3);
    const outer = makeCylinder(
      r + 0.5,
      p.ringGrooveWidth,
      [0, 0, z],
      [0, 0, 1],
    );
    const inner = makeCylinder(
      r - p.ringGrooveDepth,
      p.ringGrooveWidth + 2,
      [0, 0, z - 1],
      [0, 0, 1],
    );
    const ring = outer.cut(inner);
    cutTools.push(ring);
  }

  // Wrist-pin bore through the skirt, along local X, centred at origin.
  const pinBore = makeCylinder(
    p.pinBoreDia / 2,
    r * 2 + 4,
    [-r - 2, 0, 0],
    [1, 0, 0],
  );
  cutTools.push(pinBore);

  piston = piston.cutAll(cutTools);

  return piston;
}

export default makePiston;
