/**
 * Flywheel as an axial disc with explicit coaxial bore and bolt holes. The
 * simple native cylinder avoids duplicate coincident faces from stepped
 * revolved profiles while preserving the inspection-critical circular features.
 */
import type { Shape3D } from 'replicad';
import {
  circleSketch,
  compoundExtrudeSketch,
  sketchFromPoints,
  type Point2,
} from './helpers.js';
import { defaultParams, cosd, sind, type Params } from './params.js';

function toothedRingProfile(p: Params): Shape3D {
  const outerR = p.flywheelOuterDia / 2 + 2;
  const rootR = p.flywheelOuterDia / 2 - 5;
  const innerR = p.flywheelOuterDia / 2 - 13;
  const points: Point2[] = [];
  for (let tooth = 0; tooth < p.ringGearTeeth; tooth++) {
    const a0 = (360 / p.ringGearTeeth) * tooth;
    points.push(
      [rootR * cosd(a0), rootR * sind(a0)],
      [
        outerR * cosd(a0 + 360 / p.ringGearTeeth / 2),
        outerR * sind(a0 + 360 / p.ringGearTeeth / 2),
      ],
    );
  }

  return compoundExtrudeSketch(
    sketchFromPoints(points, 'YZ', 0),
    [circleSketch(innerR, 'YZ', 0)],
    12,
  );
}

export function makeFlywheel(p: Params = defaultParams): Shape3D {
  const radius = p.flywheelOuterDia / 2;
  const thickness = p.flywheelThk;
  const boreR = 18;
  const holes = [circleSketch(boreR, 'YZ', 0)];

  for (let bolt = 0; bolt < p.flangeBolts; bolt++) {
    const angle = (360 / p.flangeBolts) * bolt;
    holes.push(
      circleSketch(p.flangeBoltDia / 2, 'YZ', 0, [
        (p.flangeBoltCircle / 2) * cosd(angle),
        (p.flangeBoltCircle / 2) * sind(angle),
      ]),
    );
  }

  let flywheel = compoundExtrudeSketch(
    circleSketch(radius, 'YZ', 0),
    holes,
    thickness,
  );

  if (p.flywheelToothDetail === 'exact') {
    flywheel = flywheel.fuseAll([toothedRingProfile(p)]);
  }

  return flywheel;
}

export default makeFlywheel;
