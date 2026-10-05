import { draw, drawRectangle, type Drawing, type Point2D } from 'replicad';
import { tauBrandColor } from '../tau-brand.js';

// Letter grid, y up from the baseline. Bars are slightly thinner than stems so
// curves and bars read with the same weight as the verticals.
const letterGrid = {
  xHeight: 520,
  stem: 100,
  bar: 88,
  overshoot: 10,
  /** Cubic handle factor; 0.5523 is a circle, larger values square the bowls. */
  squareness: 0.6,
  /** The Tau symbol's sloped axis, used for the t's top and tail cuts. */
  axis: Math.atan(1 / Math.sqrt(15)),
  tHeight: 700,
  tLeftBar: 70,
  tRightBar: 140,
  tFoot: 176,
  tTail: 232,
  bowlWidth: 476,
  spacing: { markToT: 210, tToA: 44, aToU: 98 },
  markHeight: 700,
} as const;

const symbolScale = letterGrid.markHeight / (509.378 - 2.622);
const symbolVerticalOffset = 509.378 * symbolScale;
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

const rect = ([x0, y0]: Point2D, [x1, y1]: Point2D): Drawing =>
  drawRectangle(x1 - x0, y1 - y0).translate((x0 + x1) / 2, (y0 + y1) / 2);

const polygon = (points: readonly Point2D[]): Drawing => {
  const [first, ...rest] = points;
  const pen = draw(first);
  for (const point of rest) {
    pen.lineTo(point);
  }
  return pen.close();
};

/** Superellipse-like closed curve from four cubic quadrants. */
const bowl = ([cx, cy]: Point2D, rx: number, ry: number): Drawing => {
  const k = letterGrid.squareness;
  return draw([cx + rx, cy])
    .cubicBezierCurveTo(
      [cx, cy + ry],
      [cx + rx, cy + k * ry],
      [cx + k * rx, cy + ry],
    )
    .cubicBezierCurveTo(
      [cx - rx, cy],
      [cx - k * rx, cy + ry],
      [cx - rx, cy + k * ry],
    )
    .cubicBezierCurveTo(
      [cx, cy - ry],
      [cx - rx, cy - k * ry],
      [cx - k * rx, cy - ry],
    )
    .cubicBezierCurveTo(
      [cx + rx, cy],
      [cx + k * rx, cy - ry],
      [cx + rx, cy - k * ry],
    )
    .close();
};

const ring = (center: Point2D, rx: number, ry: number): Drawing => {
  const { stem, bar } = letterGrid;
  return bowl(center, rx, ry).cut(bowl(center, rx - stem, ry - bar));
};

/** The single-storey a is a squared bowl closed by a straight stem on the right. */
const createA = (x: number): Drawing => {
  const { xHeight, stem, overshoot, bowlWidth } = letterGrid;
  const rx = bowlWidth / 2;
  const ry = xHeight / 2 + overshoot;
  return ring([x + rx, xHeight / 2], rx, ry).fuse(
    rect([x + bowlWidth - stem, 0], [x + bowlWidth, xHeight]),
  );
};

/** The u is the a's bowl opened at the top, with the same right stem. */
const createU = (x: number): Drawing => {
  const { xHeight, stem, bar, overshoot, bowlWidth } = letterGrid;
  const rx = bowlWidth / 2;
  const cy = xHeight / 2;
  const ry = cy + overshoot;
  const outer = bowl([x + rx, cy], rx, ry).fuse(
    rect([x, cy], [x + bowlWidth, xHeight]),
  );
  const counter = bowl([x + rx, cy], rx - stem, ry - bar).fuse(
    rect([x + stem, cy], [x + bowlWidth - stem, xHeight + overshoot + 1]),
  );
  return outer
    .cut(counter)
    .fuse(rect([x + bowlWidth - stem, 0], [x + bowlWidth, xHeight]));
};

/** The t is a stem cut on the symbol's axis, an asymmetric bar and a foot that turns towards the a. */
const createT = (x: number): Drawing => {
  const {
    xHeight,
    stem,
    bar,
    overshoot,
    axis,
    tHeight,
    tLeftBar,
    tRightBar,
    tFoot,
    tTail,
  } = letterGrid;
  const left = x + tLeftBar;
  const right = left + stem;
  const rise = stem * Math.tan(axis);
  const footY = tFoot - overshoot;
  const top = polygon([
    [left, footY],
    [right, footY],
    [right, tHeight],
    [left, tHeight - rise],
  ]);
  const crossbar = rect([x, xHeight - bar], [right + tRightBar, xHeight]);
  const corner = ring([left + tFoot, footY], tFoot, tFoot).intersect(
    rect([left, -overshoot], [left + tFoot, footY]),
  );
  const tailEnd = right + tTail - stem;
  // The tail's terminal is cut on the symbol's axis, echoing the top of the stem.
  const tail = polygon([
    [left + tFoot - 1, -overshoot],
    [tailEnd, -overshoot],
    [tailEnd - bar * Math.tan(axis), -overshoot + bar],
    [left + tFoot - 1, -overshoot + bar],
  ]);
  return top.fuse(crossbar).fuse(corner).fuse(tail);
};

const symbolWidth = 512 * symbolScale;

/** The canonical Tau symbol, standing on the baseline at the letters' height. */
export const createSymbol = (): Drawing =>
  roundedPolygon(symbolTopPoints, symbolCornerRadii.top)
    .fuse(roundedPolygon(symbolLeftPoints, symbolCornerRadii.side))
    .fuse(roundedPolygon(symbolRightPoints, symbolCornerRadii.side));

/** The lowercase letters, set after the symbol. */
export const createLetters = (): Drawing => {
  const { spacing, bowlWidth, tLeftBar, stem, tRightBar } = letterGrid;
  const x = symbolWidth + spacing.markToT;
  const aX = x + tLeftBar + stem + tRightBar + spacing.tToA;
  const uX = aX + bowlWidth + spacing.aToU;
  return createT(x).fuse(createA(aX)).fuse(createU(uX));
};

export const createTauWordmark = (): Drawing =>
  createSymbol().fuse(createLetters());

const main = () => ({
  shape: createTauWordmark(),
  color: tauBrandColor,
  name: 'Tau wordmark',
});

export default main;
