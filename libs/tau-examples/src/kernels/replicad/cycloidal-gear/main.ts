/**
 * Parametric Cycloidal Gear
 * A customizable gear using hypocycloid and epicycloid curves.
 */
import {
  drawCircle,
  drawParametricFunction,
} from 'replicad';
import type { Point2D } from 'replicad';

export const defaultParams = {
  height: 40, // Height of the gear
  r1: 12, // Primary radius
  r2: 1, // Secondary radius
  circleDiameter: 2, // Diameter of the center hole
  twistAngle: 90, // Angle of twist for extrusion
};

/**
 * Creates a hypocycloid curve
 * @param t - Parameter value (angle)
 * @param r1 - Radius of fixed circle
 * @param r2 - Radius of rolling circle
 * @returns Coordinates [x, y] of point on curve
 */
function hypocycloid(
  t: number,
  r1: number,
  r2: number,
): Point2D {
  return [
    (r1 - r2) * Math.cos(t) +
      r2 * Math.cos((r1 / r2) * t - t),
    (r1 - r2) * Math.sin(t) +
      r2 *
        Math.sin(-((r1 / r2) * t - t)),
  ];
}

/**
 * Creates an epicycloid curve
 * @param t - Parameter value (angle)
 * @param r1 - Radius of fixed circle
 * @param r2 - Radius of rolling circle
 * @returns Coordinates [x, y] of point on curve
 */
function epicycloid(
  t: number,
  r1: number,
  r2: number,
): Point2D {
  return [
    (r1 + r2) * Math.cos(t) -
      r2 * Math.cos((r1 / r2) * t + t),
    (r1 + r2) * Math.sin(t) -
      r2 * Math.sin((r1 / r2) * t + t),
  ];
}

/**
 * Creates a combined gear profile using both curves
 * @param t - Parameter value (angle)
 * @param r1 - Primary radius
 * @param r2 - Secondary radius
 * @returns Coordinates [x, y] of point on curve
 */
function gear(
  t: number,
  r1 = defaultParams.r1,
  r2 = defaultParams.r2,
): Point2D {
  if (
    (-1) **
      (1 +
        Math.floor(
          (t / 2 / Math.PI) * (r1 / r2),
        )) <
    0
  ) {
    return epicycloid(t, r1, r2);
  }

  return hypocycloid(t, r1, r2);
}

export default function main(
  p = defaultParams,
) {
  // Create gear using parametric function
  const base = drawParametricFunction(
    (t) =>
      gear(2 * Math.PI * t, p.r1, p.r2),
  )
    .sketchOnPlane()
    .extrude(p.height, {
      twistAngle: p.twistAngle,
    });

  // Create center hole
  const hole = drawCircle(
    p.circleDiameter,
  )
    .sketchOnPlane()
    .extrude(p.height);

  // Cut hole from gear
  return base.cut(hole);
}
