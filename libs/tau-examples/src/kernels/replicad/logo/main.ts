import { draw, type Drawing, type Point2D } from 'replicad';
import { tauBrandColor } from '../tau-brand.js';

const topPoints: readonly Point2D[] = [
  [256, -37.873],
  [392.533, -2.622],
  [494.933, -29.063],
  [256, -90.754],
  [17.067, -29.063],
  [119.467, -2.622],
];

const leftPoints: readonly Point2D[] = [
  [0, -59.906],
  [238.933, -121.598],
  [238.933, -509.378],
  [187.733, -496.16],
  [187.733, -161.261],
  [0, -112.792],
];

const rightPoints: readonly Point2D[] = [
  [512, -59.906],
  [273.067, -121.598],
  [273.067, -509.378],
  [324.267, -496.16],
  [324.267, -161.261],
  [512, -112.787],
];

const cornerRadii = {
  top: [24, 60, 0, 60, 0, 60],
  side: [0, 60, 0, 60, 24, 60],
} as const;

type Corner = {
  readonly start: Point2D;
  readonly end: Point2D;
  readonly midpoint?: Point2D;
};

type CornerInput = {
  readonly previous: Point2D;
  readonly vertex: Point2D;
  readonly next: Point2D;
  readonly radius: number;
};

const add = ([ax, ay]: Point2D, [bx, by]: Point2D): Point2D => [
  ax + bx,
  ay + by,
];
const subtract = ([ax, ay]: Point2D, [bx, by]: Point2D): Point2D => [
  ax - bx,
  ay - by,
];
const scale = ([x, y]: Point2D, factor: number): Point2D => [
  x * factor,
  y * factor,
];
const dot = ([ax, ay]: Point2D, [bx, by]: Point2D): number => ax * bx + ay * by;
const cross = ([ax, ay]: Point2D, [bx, by]: Point2D): number =>
  ax * by - ay * bx;
const normal = ([x, y]: Point2D): Point2D => [-y, x];
const unit = (vector: Point2D): Point2D =>
  scale(vector, 1 / Math.hypot(...vector));

const roundedCorner = ({
  previous,
  vertex,
  next,
  radius,
}: CornerInput): Corner => {
  if (radius === 0) {
    return { start: vertex, end: vertex };
  }

  const incoming = unit(subtract(vertex, previous));
  const outgoing = unit(subtract(next, vertex));
  const turn = Math.acos(Math.max(-1, Math.min(1, dot(incoming, outgoing))));
  const trim = radius * Math.tan(turn / 2);
  const start = subtract(vertex, scale(incoming, trim));
  const end = add(vertex, scale(outgoing, trim));
  const incomingNormal = normal(incoming);
  const outgoingNormal = normal(outgoing);
  const center = add(
    start,
    scale(
      incomingNormal,
      cross(subtract(end, start), outgoingNormal) /
        cross(incomingNormal, outgoingNormal),
    ),
  );
  const midpointDirection = unit(
    add(unit(subtract(start, center)), unit(subtract(end, center))),
  );

  return {
    start,
    end,
    midpoint: add(center, scale(midpointDirection, radius)),
  };
};

const roundedPolygon = (
  points: readonly Point2D[],
  radii: readonly number[],
): Drawing => {
  if (points.length !== radii.length) {
    throw new Error('Every logo corner must have one radius.');
  }

  const corners = points.map((vertex, index) =>
    roundedCorner({
      previous: points.at(index - 1)!,
      vertex,
      next: points[(index + 1) % points.length]!,
      radius: radii[index]!,
    }),
  );
  const first = corners[0]!;
  const pen = draw(first.start);

  for (const [index, corner] of corners.entries()) {
    if (index > 0) {
      pen.lineTo(corner.start);
    }
    if (corner.midpoint) {
      pen.threePointsArcTo(corner.end, corner.midpoint);
    }
  }

  return pen.close();
};

export const createTauLogo = (): Drawing =>
  roundedPolygon(topPoints, cornerRadii.top)
    .fuse(roundedPolygon(leftPoints, cornerRadii.side))
    .fuse(roundedPolygon(rightPoints, cornerRadii.side));

const main = () => ({
  shape: createTauLogo(),
  color: tauBrandColor,
  name: 'Tau logo',
});

export default main;
