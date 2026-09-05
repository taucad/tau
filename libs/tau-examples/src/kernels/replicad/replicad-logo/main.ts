/**
 * Replicad brandmark.
 *
 * Two of replicad's own vases, side by side — the shape its documentation
 * opens with, and the one the `vase` example already builds here. The mark is
 * the part, not a drawing of the part: the same revolved profile, shelled and
 * filleted, placed twice.
 *
 * The profile is emitted as explicit cubic Bezier poles rather than through
 * `smoothSplineTo`, because the vector render in `generate-logo.ts` needs the
 * same curve the solid is built from. The poles are exactly what
 * `smoothSplineTo` computes — see `profilePoles` — so the solid is unchanged.
 */
import { draw } from 'replicad';
import type { Shape3D, Point2D } from 'replicad';

export const defaultParams = {
  height: 100,
  baseWidth: 20,
  wallThickness: 2,
  lowerCircleRadius: 1.5,
  lowerCirclePosition: 0.25,
  higherCircleRadius: 0.75,
  higherCirclePosition: 0.75,
  topRadius: 0.9,
  /** Centre-to-centre spacing, in units of the widest silhouette radius. */
  spacing: 2.3,
};

export type Params = typeof defaultParams;

/** One cubic Bezier of the meridian, in (radius, height). */
export type ProfileSegment = {
  readonly start: Point2D;
  readonly startControl: Point2D;
  readonly endControl: Point2D;
  readonly end: Point2D;
};

const normalize = ([x, y]: Point2D): Point2D => {
  const length = Math.hypot(x, y);
  return [x / length, y / length];
};

/**
 * The meridian of the revolve, as cubic Beziers.
 *
 * This reproduces replicad's `smoothSplineTo` pole rule: the control distance
 * is a quarter of the chord, the start pole continues the previous curve's
 * tangent scaled by `startFactor`, and the end pole is pulled back along the
 * requested end tangent — here vertical at every waypoint, so the surface is
 * tangent-continuous across the joins.
 */
export const profilePoles = (p: Params = defaultParams): ProfileSegment[] => {
  const waypoints = [
    {
      position: p.lowerCirclePosition,
      radius: p.lowerCircleRadius,
      startFactor: 1,
    },
    {
      position: p.higherCirclePosition,
      radius: p.higherCircleRadius,
      startFactor: 3,
    },
    { position: 1, radius: p.topRadius, startFactor: 3 },
  ];

  let start: Point2D = [p.baseWidth, 0];
  // The meridian opens with a horizontal line out from the axis, so the first
  // spline leaves the base edge horizontally.
  let startTangent: Point2D = [1, 0];
  const segments: ProfileSegment[] = [];

  for (const waypoint of waypoints) {
    const end: Point2D = [
      p.baseWidth * waypoint.radius,
      p.height * waypoint.position,
    ];
    const reach = Math.hypot(end[0] - start[0], end[1] - start[1]) / 4;
    const [tx, ty] = normalize(startTangent);
    const startControl: Point2D = [
      start[0] + tx * waypoint.startFactor * reach,
      start[1] + ty * waypoint.startFactor * reach,
    ];
    // End tangent [0, 1], end factor 1.
    const endControl: Point2D = [end[0], end[1] - reach];

    segments.push({ start, startControl, endControl, end });
    startTangent = [end[0] - endControl[0], end[1] - endControl[1]];
    start = end;
  }

  return segments;
};

/** Widest radius the meridian reaches — the mark's half-width. */
export const maxRadius = (p: Params = defaultParams): number => {
  let widest = p.baseWidth;

  for (const { start, startControl, endControl, end } of profilePoles(p)) {
    for (let t = 0; t <= 1; t += 0.001) {
      const u = 1 - t;
      const radius =
        u * u * u * start[0] +
        3 * u * u * t * startControl[0] +
        3 * u * t * t * endControl[0] +
        t * t * t * end[0];
      widest = Math.max(widest, radius);
    }
  }

  return widest;
};

/** One vase: the meridian, revolved, shelled from the top, top edges rounded. */
const vase = (p: Params): Shape3D => {
  const meridian = draw().hLine(p.baseWidth);

  for (const { startControl, endControl, end } of profilePoles(p)) {
    meridian.cubicBezierCurveTo(end, startControl, endControl);
  }

  const solid = meridian
    .lineTo([0, p.height])
    .close()
    .sketchOnPlane('XZ')
    .revolve()
    .shell(p.wallThickness, (faceFinder) =>
      faceFinder.containsPoint([0, 0, p.height]),
    );

  return solid.fillet(p.wallThickness / 3, (edgeFinder) =>
    edgeFinder.inPlane('XY', p.height),
  );
};

export default function main(p: Params = defaultParams): Shape3D {
  const offset = (maxRadius(p) * p.spacing) / 2;

  return vase(p)
    .clone()
    .translate([-offset, 0, 0])
    .fuse(vase(p).translate([offset, 0, 0]));
}
