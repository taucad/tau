/**
 * Libassimp Fold Stack brandmark.
 *
 * Four source-format strata occupy one face of an isometric scene cube. At
 * the fold they resolve into one unified face: many model formats in, one
 * normalized Assimp scene out.
 */
import { draw, type Drawing, type Point2D } from 'replicad';

export const brandBox = 512;

const palette = {
  cream: '#fff0c2',
  gold: '#ffc53d',
  orange: '#ff6b00',
  flame: '#f0440a',
  ember: '#9f2d0b',
} as const;

const cube = {
  apex: [256, 52],
  left: [72, 158],
  centre: [256, 264],
  right: [440, 158],
  lowerLeft: [72, 354],
  bottom: [256, 460],
  lowerRight: [440, 354],
} as const satisfies Record<string, Point2D>;

export type LogoTile = {
  readonly shape: Drawing;
  readonly color: string;
  readonly name: string;
};

/** Design space is y-down like SVG; Replicad is y-up, so y is negated. */
const at = ([x, y]: Point2D): Point2D => [x, -y];

const polygon = (points: readonly Point2D[]): Drawing => {
  const pen = draw(at(points[0]!));

  for (const point of points.slice(1)) {
    pen.lineTo(at(point));
  }

  return pen.close();
};

const tile = (
  name: string,
  color: string,
  points: readonly Point2D[],
): LogoTile => ({ shape: polygon(points), color, name });

const mix = (start: Point2D, end: Point2D, amount: number): Point2D => [
  start[0] + (end[0] - start[0]) * amount,
  start[1] + (end[1] - start[1]) * amount,
];

const formatStrata = (): readonly LogoTile[] => {
  const colors = [palette.cream, palette.gold, palette.orange, palette.flame];
  const gap = 0.022;

  return colors.map((color, index) => {
    const low = index === 0 ? 0 : index / colors.length + gap;
    const high =
      index === colors.length - 1 ? 1 : (index + 1) / colors.length - gap;

    return tile(`Format stratum ${index + 1}`, color, [
      mix(cube.left, cube.lowerLeft, low),
      mix(cube.centre, cube.bottom, low),
      mix(cube.centre, cube.bottom, high),
      mix(cube.left, cube.lowerLeft, high),
    ]);
  });
};

export const createLibassimpLogo = (): readonly LogoTile[] => [
  tile('Left face ground', palette.ember, [
    cube.left,
    cube.centre,
    cube.bottom,
    cube.lowerLeft,
  ]),
  ...formatStrata(),
  tile('Top left', palette.gold, [cube.apex, cube.centre, cube.left]),
  tile('Top right', palette.cream, [cube.apex, cube.right, cube.centre]),
  tile('Unified scene', palette.orange, [
    cube.centre,
    cube.right,
    cube.lowerRight,
    cube.bottom,
  ]),
  tile('Scene facet', palette.flame, [
    cube.centre,
    cube.lowerRight,
    cube.bottom,
  ]),
];

const main = (): readonly LogoTile[] => createLibassimpLogo();

export default main;
