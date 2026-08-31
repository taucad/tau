import { draw, type Drawing, type Point2D } from 'replicad';
import type { LogoTile } from './main.js';

const palette = {
  butter: '#ffd86a',
  gold: '#ffbd22',
  orange: '#ff6500',
  flame: '#ef3e0b',
  red: '#cf2f0a',
  ember: '#57170c',
} as const;

const cube = {
  apex: [256, 32],
  left: [40, 154],
  centre: [256, 276],
  right: [472, 154],
  lowerLeft: [40, 358],
  bottom: [256, 480],
  lowerRight: [472, 358],
} as const satisfies Record<string, Point2D>;

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

const leftFace = [cube.left, cube.centre, cube.bottom, cube.lowerLeft] as const;

const rightFace = [
  cube.centre,
  cube.right,
  cube.lowerRight,
  cube.bottom,
] as const;

const band = (
  name: string,
  color: string,
  [start, end]: readonly [number, number],
): LogoTile =>
  tile(name, color, [
    mix(cube.left, cube.lowerLeft, start),
    mix(cube.centre, cube.bottom, start),
    mix(cube.centre, cube.bottom, end),
    mix(cube.left, cube.lowerLeft, end),
  ]);

export type LogoVariant = {
  readonly create: () => readonly LogoTile[];
  readonly description: string;
  readonly file: string;
  readonly name: string;
};

const fullBleed = (): readonly LogoTile[] => [
  tile('Left ground', palette.ember, leftFace),
  band('Gold format', palette.gold, [0, 0.3]),
  band('Orange format', palette.orange, [0.34, 0.64]),
  band('Flame format', palette.flame, [0.68, 1]),
  tile('Top left', palette.gold, [cube.apex, cube.centre, cube.left]),
  tile('Top right', palette.butter, [cube.apex, cube.right, cube.centre]),
  tile('Unified scene', palette.orange, rightFace),
  tile('Scene facet', palette.flame, [
    cube.centre,
    cube.lowerRight,
    cube.bottom,
  ]),
];

const emberSpine = (): readonly LogoTile[] => [
  tile('Left ground', palette.ember, leftFace),
  band('Gold format', palette.gold, [0, 0.28]),
  band('Orange format', palette.orange, [0.34, 0.62]),
  band('Red format', palette.red, [0.68, 1]),
  tile('Top left', palette.gold, [cube.apex, cube.centre, cube.left]),
  tile('Top right', palette.orange, [cube.apex, cube.right, cube.centre]),
  tile('Unified scene', palette.flame, rightFace),
  tile('Scene facet', palette.red, [cube.centre, cube.lowerRight, cube.bottom]),
  tile('Fold spine', palette.ember, [
    [246, 270],
    [266, 281],
    [266, 474],
    [246, 463],
  ]),
];

const signalRibbon = (): readonly LogoTile[] => [
  tile('Left face', palette.red, leftFace),
  tile('Right face', palette.flame, rightFace),
  band('Format signal', palette.butter, [0.18, 0.52]),
  tile('Resolved signal', palette.gold, [
    mix(cube.centre, cube.bottom, 0.18),
    mix(cube.right, cube.lowerRight, 0.18),
    mix(cube.right, cube.lowerRight, 0.52),
    mix(cube.centre, cube.bottom, 0.52),
  ]),
  tile('Top left', palette.gold, [cube.apex, cube.centre, cube.left]),
  tile('Top right', palette.orange, [cube.apex, cube.right, cube.centre]),
  tile('Lower left', palette.flame, [
    mix(cube.left, cube.lowerLeft, 0.58),
    mix(cube.centre, cube.bottom, 0.58),
    cube.bottom,
    cube.lowerLeft,
  ]),
  tile('Lower right', palette.ember, [
    mix(cube.centre, cube.bottom, 0.58),
    mix(cube.right, cube.lowerRight, 0.58),
    cube.lowerRight,
    cube.bottom,
  ]),
];

const foundryFrame = (): readonly LogoTile[] => {
  const innerLeft: Point2D = [56, 168];
  const innerCentre: Point2D = [249, 280];
  const innerLowerLeft: Point2D = [56, 344];
  const innerBottom: Point2D = [249, 456];

  const innerBand = (
    name: string,
    color: string,
    [start, end]: readonly [number, number],
  ): LogoTile =>
    tile(name, color, [
      mix(innerLeft, innerLowerLeft, start),
      mix(innerCentre, innerBottom, start),
      mix(innerCentre, innerBottom, end),
      mix(innerLeft, innerLowerLeft, end),
    ]);

  return [
    tile('Foundry frame', palette.ember, [
      cube.apex,
      cube.right,
      cube.lowerRight,
      cube.bottom,
      cube.lowerLeft,
      cube.left,
    ]),
    tile('Inset top left', palette.gold, [
      [252, 51],
      [249, 267],
      [57, 158],
    ]),
    tile('Inset top right', palette.butter, [
      [261, 51],
      [455, 159],
      [263, 268],
    ]),
    innerBand('Inset gold format', palette.gold, [0, 0.29]),
    innerBand('Inset orange format', palette.orange, [0.36, 0.64]),
    innerBand('Inset flame format', palette.flame, [0.71, 1]),
    tile('Inset unified scene', palette.orange, [
      [263, 281],
      [456, 170],
      [456, 345],
      [263, 456],
    ]),
    tile('Inset scene facet', palette.flame, [
      [263, 281],
      [456, 345],
      [263, 456],
    ]),
  ];
};

export const logoVariants: readonly LogoVariant[] = [
  {
    create: fullBleed,
    description: 'Full-bleed crop, three broad strata',
    file: '01-full-bleed-stack.svg',
    name: 'Full-Bleed Stack',
  },
  {
    create: emberSpine,
    description: 'Dark central fold, hotter face contrast',
    file: '02-ember-spine.svg',
    name: 'Ember Spine',
  },
  {
    create: signalRibbon,
    description: 'One oversized signal band wraps the fold',
    file: '03-signal-ribbon.svg',
    name: 'Signal Ribbon',
  },
  {
    create: foundryFrame,
    description: 'Heavy outer keyline survives favicon scale',
    file: '04-foundry-frame.svg',
    name: 'Foundry Frame',
  },
];
