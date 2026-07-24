import { draw, type Drawing, type Point2D } from 'replicad';
import { tauBrandColor } from '../tau-brand.js';

const symbolScale = 1200 / 512;
const symbolVerticalOffset = 2.622 * symbolScale;
const r24 = 24 * symbolScale;
const r60 = 60 * symbolScale;

const scaleSymbolPoint = ([x, y]: Point2D): Point2D => [
  x * symbolScale,
  y * symbolScale + symbolVerticalOffset,
];

const symbolTopPoints: readonly Point2D[] = (
  [
    [256, -37.873],
    [392.533, -2.622],
    [494.933, -29.063],
    [256, -90.754],
    [17.067, -29.063],
    [119.467, -2.622],
  ] satisfies readonly Point2D[]
).map((point) => scaleSymbolPoint(point));

const symbolLeftPoints: readonly Point2D[] = (
  [
    [0, -59.906],
    [238.933, -121.598],
    [238.933, -509.378],
    [187.733, -496.16],
    [187.733, -161.261],
    [0, -112.792],
  ] satisfies readonly Point2D[]
).map((point) => scaleSymbolPoint(point));

const symbolRightPoints: readonly Point2D[] = (
  [
    [512, -59.906],
    [273.067, -121.598],
    [273.067, -509.378],
    [324.267, -496.16],
    [324.267, -161.261],
    [512, -112.787],
  ] satisfies readonly Point2D[]
).map((point) => scaleSymbolPoint(point));

const symbolCornerRadii = {
  top: [r24, r60, 0, r60, 0, r60],
  side: [0, r60, 0, r60, r24, r60],
} as const;

const aOuterPoints: readonly Point2D[] = [
  [1960, -681.76],
  [1480, -805.74],
  [1480, -1187.64],
  [1320, -1146.31],
  [1320, -103.35],
  [1720, -0.11],
  [2120, -103.35],
  [2120, -1146.31],
  [1960, -1187.71],
];

const aCounterPoints: readonly Point2D[] = [
  [1480, -640.4],
  [1960, -516.52],
  [1959.85, -227.38],
  [1719.98, -165.41],
  [1480, -227.3],
];

const uPoints: readonly Point2D[] = [
  [2760, -1187.68],
  [2360, -1084.44],
  [2360, -41.48],
  [2520, -0.18],
  [2520, -961.96],
  [2760, -1023.94],
  [3000, -962],
  [3000, -41.58],
  [3160, -0.25],
  [3160, -1084.44],
];

const aOuterCornerRadii = [r24, r24, 0, r24, r60, r60, r60, r24, 0] as const;
const aCounterCornerRadii = [r24, r24, r24, r24, r24] as const;
const uCornerRadii = [r60, r60, r24, 0, r24, r24, r24, r24, 0, r60] as const;

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

const createA = (): Drawing =>
  roundedPolygon(aOuterPoints, aOuterCornerRadii).cut(
    roundedPolygon(aCounterPoints, aCounterCornerRadii),
  );

export const createTauWordmark = (): Drawing =>
  roundedPolygon(symbolTopPoints, symbolCornerRadii.top)
    .fuse(roundedPolygon(symbolLeftPoints, symbolCornerRadii.side))
    .fuse(roundedPolygon(symbolRightPoints, symbolCornerRadii.side))
    .fuse(createA())
    .fuse(roundedPolygon(uPoints, uCornerRadii));

const main = () => ({
  shape: createTauWordmark(),
  color: tauBrandColor,
  name: 'Tau wordmark',
});

export default main;
