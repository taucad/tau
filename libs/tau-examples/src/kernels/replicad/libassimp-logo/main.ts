/**
 * The libassimp brandmark: a hexagonal aperture.
 *
 * The opening is a regular hexagon. Each of its edges, extended outward,
 * becomes the slit between two blades, exactly as a camera iris is built.
 * Six blades admit every format through one opening, and the gold core
 * inside is the one scene that comes out.
 *
 * Nothing is drawn by hand. Every vertex derives from four datums (rim
 * radius, opening radius, slit width, core inset) and every colour is the
 * output of one shading model: blades are ranked by their exposure to a
 * three-quarter key light and spaced evenly along a warm ramp, so the lit
 * side is bright, the far side dark, and no two blades share a tone.
 */
import {
  draw,
  drawPolysides,
  drawRoundedRectangle,
  type Drawing,
  type Point2D,
} from 'replicad';

export const defaultParams = {
  blades: 6,
  opening: 88,
  slitWidth: 18,
  coreGap: 16,
};

/** Brand coordinate system, shared with the Tau and nanoraster marks. */
export const brandBox = 512;
/** Circumradius of the rim: a ~6% safe area inside the brand box. */
export const safeRadius = 236;

/** Seven warm stops in near-even lightness steps. Blades use the first six; gold is the core alone. */
export const palette = {
  oxblood: '#7a220c',
  ember: '#a32f0c',
  rust: '#c93e0b',
  flame: '#ea520a',
  orange: '#ff6f12',
  amber: '#ff9a2e',
  gold: '#ffc53d',
  /** Banner highlights only. */
  cream: '#fff0c2',
} as const;

const ramp = [
  palette.oxblood,
  palette.ember,
  palette.rust,
  palette.flame,
  palette.orange,
  palette.amber,
  palette.gold,
];

const hexToRgb = (hex: string): [number, number, number] => [
  Number.parseInt(hex.slice(1, 3), 16),
  Number.parseInt(hex.slice(3, 5), 16),
  Number.parseInt(hex.slice(5, 7), 16),
];

const rgbToHex = (rgb: readonly number[]): string =>
  `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

/** Colour at `t` in `[0, 1]` along the ramp, oxblood to gold. */
export const tone = (t: number): string => {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (ramp.length - 1);
  const index = Math.min(ramp.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const fromStop = ramp[index];
  const toStop = ramp[index + 1];
  if (fromStop === undefined || toStop === undefined) {
    throw new RangeError(`Ramp has no stop pair at ${index}`);
  }
  const from = hexToRgb(fromStop);
  const to = hexToRgb(toStop);
  const lerp = (a: number, b: number): number => a + (b - a) * mix;
  return rgbToHex([
    lerp(from[0], to[0]),
    lerp(from[1], to[1]),
    lerp(from[2], to[2]),
  ]);
};

const normalize3 = (
  v: readonly [number, number, number],
): [number, number, number] => {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
};

/** Three-quarter key light, upper left. */
const light = normalize3([-0.45, 0.6, 0.66]);

/** Cosine between the normal of a facet tilted away in `direction` by `slope` and the key light. */
const exposure = (direction: Point2D, slope: number): number => {
  const normal = normalize3([direction[0] * slope, direction[1] * slope, 1]);
  return normal[0] * light[0] + normal[1] * light[1] + normal[2] * light[2];
};

/**
 * Equalised shading for a ring of faces: rank by exposure, then space the
 * ranks evenly over the six blade stops. A raw Lambert sample clamped at a
 * ceiling gave two lit blades the same tone; ranking cannot.
 */
export const shadeRing = (
  directions: readonly Point2D[],
  slope: number,
): string[] => {
  const bladeCeiling = (ramp.length - 2) / (ramp.length - 1);
  const order = directions
    .map((direction, index) => ({ index, lambert: exposure(direction, slope) }))
    .toSorted((left, right) => left.lambert - right.lambert);
  const fills: string[] = Array.from({ length: directions.length }, () => '');
  for (const [rank, { index }] of order.entries()) {
    fills[index] = tone((rank / (directions.length - 1)) * bladeCeiling);
  }
  return fills;
};

const radians = (degrees: number): number => (degrees * Math.PI) / 180;
const polar = (radius: number, degrees: number): Point2D => [
  radius * Math.cos(radians(degrees)),
  radius * Math.sin(radians(degrees)),
];
const add = (a: Point2D, b: Point2D): Point2D => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Point2D, b: Point2D): Point2D => [a[0] - b[0], a[1] - b[1]];
const angleOf = (v: Point2D): number =>
  (Math.atan2(v[1], v[0]) * 180) / Math.PI;
const midpoint = (a: Point2D, b: Point2D): Point2D => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

const polygon = (points: readonly Point2D[]): Drawing => {
  const pen = draw(points[0]);
  for (const point of points.slice(1)) {
    pen.lineTo(point);
  }
  return pen.close();
};

/**
 * A slit extending a polygon edge past its end vertex. The opening is
 * traversed clockwise, so its interior lies to the right of each edge; the
 * slit occupies `[0, width]` on that side, which beyond the vertex is the
 * next blade. The blade behind the edge keeps a clean, colinear corner.
 */
const slitLength = 700;
const edgeSlit = (from: Point2D, degrees: number, width: number): Drawing =>
  drawRoundedRectangle(slitLength, width)
    .translate(slitLength / 2, -width / 2)
    .rotate(degrees)
    .translate(from[0], from[1]);

export type LogoTile = {
  readonly name: string;
  readonly shape: Drawing;
  readonly color: string;
};

/**
 * Builds the mark y-up about the origin. The generator places it in the
 * 512 brand box with one SVG transform; the runtime frames it by bounds.
 */
export const createLibassimpLogo = (p = defaultParams): LogoTile[] => {
  const { blades, opening, slitWidth, coreGap } = p;
  const flatTop = 180 / blades;
  const poly = (radius: number): Drawing =>
    drawPolysides(radius, blades).rotate(flatTop);
  const rim = poly(safeRadius);
  const vertex = (index: number): Point2D =>
    polar(opening, 90 + flatTop - (360 / blades) * index);

  const facings = Array.from({ length: blades }, (_, index) =>
    polar(1, angleOf(midpoint(vertex(index + 1), vertex(index + 2))) + 18),
  );
  const fills = shadeRing(facings, 0.62);

  const tiles = fills.map((color, index): LogoTile => {
    const previous = vertex(index);
    const v0 = vertex(index + 1);
    const v1 = vertex(index + 2);
    const d0 = angleOf(sub(v0, previous));
    const d1 = angleOf(sub(v1, v0));
    const wedge = polygon([
      v1,
      v0,
      add(v0, polar(900, d0)),
      add(v1, polar(900, d1)),
    ]);
    const blade = rim
      .intersect(wedge)
      .cut(poly(opening))
      .cut(edgeSlit(v0, d0, slitWidth))
      .cut(edgeSlit(v1, d1, slitWidth));
    return { name: `blade ${index + 1}`, shape: blade, color };
  });

  const core = poly(opening - coreGap / Math.cos(Math.PI / blades));
  return [...tiles, { name: 'core', shape: core, color: palette.gold }];
};

export default createLibassimpLogo;
