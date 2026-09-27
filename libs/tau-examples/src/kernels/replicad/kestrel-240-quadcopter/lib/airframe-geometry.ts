import { drawRoundedRectangle, makeBox, makeCylinder } from 'replicad';
import { nacaBody } from './naca.js';
import { buildArm, buildArmBlank } from '../parts/airframe/arm.js';
import { buildRootClamp } from '../parts/airframe/root-clamp.js';

export const quadrants = [
  [-1, -1, 'FL'],
  [-1, 1, 'FR'],
  [1, -1, 'RL'],
  [1, 1, 'RR'],
] as const;
export const shellFasteners = [
  [-43, -23],
  [-43, 23],
  [12, -19],
  [12, 19],
] as const;
export const batteryStrapStations = [-50, -10] as const;
export const sparAngle = (sx: number, sy: number) =>
  (Math.atan2(-sx * 33, sy * 75) * 180) / Math.PI;

export function bodyOuter() {
  return nacaBody(176, 0.36).translate([-88, 0, 0]);
}
export function bodyInner() {
  return bodyOuter().translate([25, 0, 0]).scale(0.91).translate([-25, 0, 0]);
}
export function placeArm(
  sx: number,
  sy: number,
  arm = buildArm({ sweep: sx * 28.6 }),
) {
  if (sy < 0) {
    arm = arm.mirror('XZ');
  }
  return arm.translate([sx * 56.4, sy * 20, 0]);
}
export function placeClamp(sx: number, sy: number) {
  return buildRootClamp()
    .rotate(sparAngle(sx, sy), [0, 0, 0], [0, 0, 1])
    .translate([sx * 61.68, sy * 32, 0]);
}

export function buildShell(upper: boolean) {
  const outer = bodyOuter();
  let shell = outer.clone().cut(bodyInner());
  // Internal bosses and bridge are clipped to the analytic outer mould line.
  const bosses = shellFasteners.map(([x, y]) =>
    makeCylinder(4.2, 11, [x, y, upper ? 0.2 : -10.8]),
  );
  if (!upper) {
    bosses.push(
      drawRoundedRectangle(10, 50, 4)
        .sketchOnPlane('XY', -9)
        .extrude(3)
        .translate([-67, 0, 0]),
    );
    for (const x of [14, 34]) {
      for (const y of [-10, 10]) {
        bosses.push(makeCylinder(3.6, 15, [x, y, -28.4]));
      }
    }
  }
  shell = shell.fuseAll(bosses).intersect(outer);
  const holes = shellFasteners.map(([x, y]) =>
    makeCylinder(upper ? 1.4 : 1.8, 32, [x, y, -16]),
  );
  if (upper) {
    holes.push(
      ...shellFasteners.map(([x, y]) => makeCylinder(2.6, 50, [x, y, 2.5])),
    );
  }
  // Captive insert pockets in the gimbal bridge and clearance for avionics stack screws.
  if (!upper) {
    for (const y of [-7, 7]) {
      holes.push(makeCylinder(1.65, 6, [-65.8, y, -10]));
    }
    for (const x of [14, 34]) {
      for (const y of [-10, 10]) {
        holes.push(
          makeCylinder(1.1, 20, [x, y, -29]),
          makeCylinder(2.55, 4, [x, y, -13.4]),
        );
      }
    }
    // The bridge sits below the yaw collar; only the drive passes through it.
    holes.push(makeCylinder(1.6, 10, [-70, 0, -9]));
  }
  // Arm/clamp ports have matching native surfaces, not faceted boolean cutters.
  holes.push(
    ...quadrants.flatMap(([sx, sy]) => [
      placeArm(sx, sy, buildArmBlank({ sweep: sx * 28.6 }).scale(1.01)),
      placeClamp(sx, sy).scale(1.01, [sx * 61.68, sy * 32, 0]),
    ]),
  );
  holes.push(
    ...quadrants.map(([sx, sy]) =>
      makeCylinder(4.2, 90, [sx * 52, sy * 10, 0], [sx * 33, sy * 75, 0]),
    ),
  );
  holes.push(makeCylinder(1.5, 30, [70, 0, 0], [1, 0, 0]));
  shell = shell.cutAll(holes);
  return shell.intersect(
    makeBox([-72, -80, upper ? 0.2 : -80], [100, 80, upper ? 80 : -0.2]),
  );
}
