/**
 * Flywheel. Bolts to the crank rear flange. A heavy disc with a clutch
 * friction face, a starter ring gear (modelled as a toothed rim), a central
 * pilot/register bore, and an 8-hole crank bolt circle matching the flange.
 * Local frame: axis along X, front (engine-side) face at X=0.
 */
import { makeCylinder, makeBox, type Shape3D } from 'replicad';
import {
  defaultParams as defaultParameters,
  cosd,
  sind,
  type Params,
} from './params.js';

export function makeFlywheel(p: Params = defaultParameters): Shape3D {
  const R = p.flywheelOuterDia / 2;
  const t = p.flywheelThk;

  // Main disc.
  let fw: Shape3D = makeCylinder(R - 8, t, [0, 0, 0], [1, 0, 0]);

  // Ring-gear rim (toothed) — build the rim then cut tooth gaps.
  const rim = makeCylinder(R, 12, [0, 0, 0], [1, 0, 0]).cut(
    makeCylinder(R - 12, 14, [-1, 0, 0], [1, 0, 0]),
  );
  let teethRim: Shape3D = rim;
  const teeth = p.ringGearTeeth;
  const toothSlots: Shape3D[] = [];
  for (let index = 0; index < teeth; index++) {
    const ang = (360 / teeth) * index;
    // Radial tooth-gap notch at the rim crest.
    const slot = makeBox([-1, -1.6, R - 3.5], [13, 1.6, R + 1]).rotate(
      ang,
      [0, 0, 0],
      [1, 0, 0],
    );
    toothSlots.push(slot);
  }
  teethRim = teethRim.cutAll(toothSlots);
  fw = fw.fuse(teethRim);

  // Clutch friction recess on the rear face.
  const recess = makeCylinder(
    p.flywheelClutchDia / 2,
    6,
    [t - 6, 0, 0],
    [1, 0, 0],
  );
  const cutTools: Shape3D[] = [recess];

  // Central register/pilot bore.
  cutTools.push(makeCylinder(18, t + 4, [-2, 0, 0], [1, 0, 0]));

  // 8-hole crank bolt circle (matches flange).
  for (let b = 0; b < p.flangeBolts; b++) {
    const ang = (360 / p.flangeBolts) * b;
    const by = (p.flangeBoltCircle / 2) * cosd(ang);
    const bz = (p.flangeBoltCircle / 2) * sind(ang);
    cutTools.push(
      makeCylinder(p.flangeBoltDia / 2, t + 4, [-2, by, bz], [1, 0, 0]),
    );
  }

  fw = fw.cutAll(cutTools);

  return fw;
}

export default makeFlywheel;
