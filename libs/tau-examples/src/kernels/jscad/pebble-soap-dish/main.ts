/**
 * A pebble soap dish.
 *
 * The bowl is the convex hull of a ring of spheres, hollowed by a smaller copy
 * of itself. Hull is JSCAD's blunt instrument for a smooth organic solid;
 * a fillet on a box never quite becomes this pebble.
 */
import { booleans, hulls, primitives, transforms } from '@jscad/modeling';
import type { geometries } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { subtract, union } = booleans;
const { hull } = hulls;
const { sphere, cylinder } = primitives;
const { translate, scale } = transforms;

export const defaultParams = {
  /** Overall length. */
  length: 92,
  /** Overall width. */
  width: 62,
  /** Sphere radius that rounds the pebble. Larger is softer. */
  bead: 14,
  /** Floor and wall left after the inner hull is removed. */
  wall: 3.2,
  /** Drain hole diameter. */
  drainDiameter: 4,
  /** Sphere tessellation. Curves are mesh the moment they are created. */
  segments: 18,
};

type Params = typeof defaultParams;

const requireDish = (params: Params): void => {
  if (
    [
      params.length,
      params.width,
      params.bead,
      params.wall,
      params.drainDiameter,
    ].some((value) => !Number.isFinite(value) || value <= 0)
  ) {
    throw new RangeError('Dish dimensions must be positive.');
  }
  if (!Number.isInteger(params.segments) || params.segments < 8) {
    throw new RangeError('segments must be an integer of at least 8.');
  }
  if (params.bead * 2 >= Math.min(params.length, params.width)) {
    throw new RangeError('bead is too large for the dish.');
  }
  if (params.wall * 2 >= params.bead) {
    throw new RangeError('wall consumes the bead.');
  }
};

const pebble = (params: Params): Geom3 => {
  const rx = params.length / 2 - params.bead;
  const ry = params.width / 2 - params.bead;
  const places: ReadonlyArray<readonly [number, number]> = [
    [rx, 0],
    [-rx, 0],
    [0, ry],
    [0, -ry],
    [rx * 0.62, ry * 0.62],
    [rx * 0.62, -ry * 0.62],
    [-rx * 0.62, ry * 0.62],
    [-rx * 0.62, -ry * 0.62],
  ];
  return hull(
    places.map(([x, y]) =>
      translate(
        [x, y, params.bead],
        sphere({ radius: params.bead, segments: params.segments }),
      ),
    ),
  );
};

/**
 * Rounded soap dish with a flat-enough floor and five drain holes.
 * @param params - Plan size, bead radius, wall and drains.
 * @returns The dish mesh.
 */
export default function main(params: Params = defaultParams): Geom3 {
  requireDish(params);
  const outer = pebble(params);
  const bowl = translate([0, 0, params.wall], scale([0.84, 0.8, 0.62], outer));
  const drain = (x: number, y: number): Geom3 =>
    translate(
      [x, y, params.wall / 2],
      cylinder({
        radius: params.drainDiameter / 2,
        height: params.wall + 4,
        segments: 16,
        center: [0, 0, 0],
      }),
    );
  const span = Math.min(params.length, params.width) * 0.16;
  const dish = subtract(
    outer,
    union([
      bowl,
      drain(0, 0),
      drain(span, 0),
      drain(-span, 0),
      drain(0, span * 0.7),
      drain(0, -span * 0.7),
    ]),
  );
  return Object.assign(dish, { name: 'Soap dish' });
}
