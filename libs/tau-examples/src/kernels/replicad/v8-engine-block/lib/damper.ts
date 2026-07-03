/**
 * Harmonic damper / serpentine pulley. Mounts on the crank snout (front).
 * A grooved outer ring (belt grooves cut as annular V-slots), an inertia ring,
 * and a hub with a central snout bore. Local frame: axis along X, front face
 * of the part placed by the assembly at the snout.
 */
import { makeCylinder, type Shape3D } from 'replicad';
import { defaultParams as defaultParameters, type Params } from './params.js';

export function makeDamper(p: Params = defaultParameters): Shape3D {
  const R = p.damperOuterDia / 2;
  const t = p.damperThk;

  // Main inertia ring.
  let damper: Shape3D = makeCylinder(R, t, [0, 0, 0], [1, 0, 0]);

  // Belt grooves: annular V-slots along the outer rim.
  const cutTools: Shape3D[] = [];
  for (let g = 0; g < p.damperGrooves; g++) {
    const x = 3 + g * ((t - 6) / p.damperGrooves);
    const outer = makeCylinder(R + 1, 1.6, [x, 0, 0], [1, 0, 0]);
    const inner = makeCylinder(R - 5, 4, [x - 1, 0, 0], [1, 0, 0]);
    cutTools.push(outer.cut(inner));
  }

  // Lighten with a recessed back face (web between hub and rim).
  const recess = makeCylinder(R - 22, t - 10, [x0Back(t), 0, 0], [1, 0, 0]);
  cutTools.push(
    recess.cut(makeCylinder(p.snoutDia / 2 + 14, t, [-1, 0, 0], [1, 0, 0])),
  );

  // Central snout bore + keyway-ish flat (just the bore for our model).
  const bore = makeCylinder(p.snoutDia / 2, t + 4, [-2, 0, 0], [1, 0, 0]);
  cutTools.push(bore);

  damper = damper.cutAll(cutTools);

  return damper;
}

function x0Back(t: number): number {
  return 8; // Recess starts 8mm from the front face, opens to the back
}

export default makeDamper;
