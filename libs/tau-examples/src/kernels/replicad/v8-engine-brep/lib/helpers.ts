import {
  CompoundSketch,
  draw,
  drawCircle,
  drawPolysides,
  makeCylinder,
  type Shape3D,
  type Sketch,
  type SketchInterface,
  type Sketches,
} from 'replicad';

export type Point2 = [number, number];
export type Point3 = [number, number, number];

export type PlaneName = 'XY' | 'YZ' | 'XZ';

type CurvePathSegment =
  | { kind: 'line'; to: Point2 }
  | { kind: 'arc'; to: Point2; via: Point2 };

type SketchOnPlaneResult = Sketch | SketchInterface | Sketches;

const isSketch = (candidate: SketchOnPlaneResult): candidate is Sketch =>
  'wire' in candidate && 'clone' in candidate;

const expectSketch = (
  candidate: SketchOnPlaneResult,
  label: string,
): Sketch => {
  if (isSketch(candidate)) {
    return candidate;
  }

  throw new Error(`${label} must produce exactly one closed sketch.`);
};

export const sketchFromPoints = (
  points: readonly Point2[],
  plane: PlaneName,
  origin?: number | Point3,
): Sketch => {
  if (points.length < 3) {
    throw new Error('A closed profile needs at least three points.');
  }

  const start = points[0];
  if (!start) {
    throw new Error('A closed profile needs a start point.');
  }

  let cursor = draw().movePointerTo(start);
  for (const point of points.slice(1)) {
    cursor = cursor.lineTo(point);
  }

  return expectSketch(
    cursor.close().sketchOnPlane(plane, origin),
    'Closed point profile',
  );
};

export const sketchFromCurvePath = (
  start: Point2,
  segments: readonly CurvePathSegment[],
  plane: PlaneName,
  origin?: number | Point3,
): Sketch => {
  if (segments.length < 2) {
    throw new Error('A closed curve profile needs at least two segments.');
  }

  let cursor = draw().movePointerTo(start);
  for (const segment of segments) {
    if (segment.kind === 'line') {
      cursor = cursor.lineTo(segment.to);
      continue;
    }

    cursor = cursor.threePointsArcTo(segment.to, segment.via);
  }

  return expectSketch(
    cursor.close().sketchOnPlane(plane, origin),
    'Closed curve profile',
  );
};

export const circleSketch = (
  radius: number,
  plane: PlaneName,
  origin?: number | Point3,
  center: Point2 = [0, 0],
): Sketch =>
  expectSketch(
    drawCircle(radius)
      .translate(center[0], center[1])
      .sketchOnPlane(plane, origin),
    'Circle profile',
  );

export const rectangleSketch = (
  min: Point2,
  max: Point2,
  plane: PlaneName,
  origin?: number | Point3,
): Sketch =>
  sketchFromPoints(
    [
      [min[0], min[1]],
      [max[0], min[1]],
      [max[0], max[1]],
      [min[0], max[1]],
    ],
    plane,
    origin,
  );

export const compoundExtrudeSketch = (
  outer: Sketch,
  holes: readonly Sketch[],
  height: number,
): Shape3D => new CompoundSketch([outer, ...holes]).extrude(height);

export const tubeX = (
  outerRadius: number,
  innerRadius: number,
  length: number,
): Shape3D =>
  sketchFromPoints(
    [
      [0, innerRadius],
      [0, outerRadius],
      [length, outerRadius],
      [length, innerRadius],
    ],
    'XZ',
  ).revolve([1, 0, 0]);

export const tubeZ = (
  outerRadius: number,
  innerRadius: number,
  zStart: number,
  zEnd: number,
): Shape3D =>
  sketchFromPoints(
    [
      [innerRadius, zStart],
      [outerRadius, zStart],
      [outerRadius, zEnd],
      [innerRadius, zEnd],
    ],
    'XZ',
  ).revolve([0, 0, 1]);

export const revolvedX = (points: readonly Point2[]): Shape3D =>
  sketchFromPoints(points, 'XZ').revolve([1, 0, 0]);

export const revolvedZFromCurvePath = (
  start: Point2,
  segments: readonly CurvePathSegment[],
): Shape3D => sketchFromCurvePath(start, segments, 'XZ').revolve([0, 0, 1]);

export const extrudeXCurveFromYZ = (
  start: Point2,
  segments: readonly CurvePathSegment[],
  xStart: number,
  length: number,
): Shape3D =>
  sketchFromCurvePath(start, segments, 'YZ', xStart).extrude(length);

export const compoundExtrudeSketchXY = (
  outer: Sketch,
  holes: readonly Sketch[],
  height: number,
): Shape3D => compoundExtrudeSketch(outer, holes, height);

export const capsuleSketch = (
  firstCenter: Point2,
  firstRadius: number,
  secondCenter: Point2,
  secondRadius: number,
  plane: PlaneName,
  origin?: number | Point3,
): Sketch => {
  const dx = secondCenter[0] - firstCenter[0];
  const dy = secondCenter[1] - firstCenter[1];
  const distance = Math.hypot(dx, dy);
  if (distance <= Math.abs(firstRadius - secondRadius)) {
    throw new Error(
      'A two-circle capsule requires neither circle to fully contain the other.',
    );
  }

  const ux = dx / distance;
  const uy = dy / distance;
  const radiusDelta = (firstRadius - secondRadius) / distance;
  const side = Math.sqrt(Math.max(0, 1 - radiusDelta * radiusDelta));
  const normals: [Point2, Point2] = [
    [ux * radiusDelta - uy * side, uy * radiusDelta + ux * side],
    [ux * radiusDelta + uy * side, uy * radiusDelta - ux * side],
  ];
  const firstA: Point2 = [
    firstCenter[0] + normals[0][0] * firstRadius,
    firstCenter[1] + normals[0][1] * firstRadius,
  ];
  const secondA: Point2 = [
    secondCenter[0] + normals[0][0] * secondRadius,
    secondCenter[1] + normals[0][1] * secondRadius,
  ];
  const firstB: Point2 = [
    firstCenter[0] + normals[1][0] * firstRadius,
    firstCenter[1] + normals[1][1] * firstRadius,
  ];
  const secondB: Point2 = [
    secondCenter[0] + normals[1][0] * secondRadius,
    secondCenter[1] + normals[1][1] * secondRadius,
  ];
  const secondOuter: Point2 = [
    secondCenter[0] + ux * secondRadius,
    secondCenter[1] + uy * secondRadius,
  ];
  const firstOuter: Point2 = [
    firstCenter[0] - ux * firstRadius,
    firstCenter[1] - uy * firstRadius,
  ];

  return sketchFromCurvePath(
    firstA,
    [
      { kind: 'line', to: secondA },
      { kind: 'arc', to: secondB, via: secondOuter },
      { kind: 'line', to: firstB },
      { kind: 'arc', to: firstA, via: firstOuter },
    ],
    plane,
    origin,
  );
};

export const capsuleExtrude = (
  firstCenter: Point2,
  firstRadius: number,
  secondCenter: Point2,
  secondRadius: number,
  plane: PlaneName,
  origin: number | Point3 | undefined,
  height: number,
): Shape3D =>
  capsuleSketch(
    firstCenter,
    firstRadius,
    secondCenter,
    secondRadius,
    plane,
    origin,
  ).extrude(height);

export const tubeBetween = (a: Point3, b: Point3, radius: number): Shape3D => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const length = Math.hypot(dx, dy, dz);
  return makeCylinder(radius, length, a, [
    dx / length,
    dy / length,
    dz / length,
  ]);
};

export const rectangularTubeZ = (options: {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  wall: number;
}): Shape3D => {
  const { x0, x1, y0, y1, z0, z1, wall } = options;
  return compoundExtrudeSketchXY(
    rectangleSketch([x0, y0], [x1, y1], 'XY', z0),
    [rectangleSketch([x0 + wall, y0 + wall], [x1 - wall, y1 - wall], 'XY', z0)],
    z1 - z0,
  );
};

export const hexPrismZ = (
  acrossFlats: number,
  zStart: number,
  height: number,
): Shape3D => {
  const radius = acrossFlats / Math.sqrt(3);
  return drawPolysides(radius, 6).sketchOnPlane('XY', zStart).extrude(height);
};
