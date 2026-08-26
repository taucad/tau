/**
 * JSCAD brandmark.
 *
 * JSCAD's mark is not a drawing — it is a two-line CSG model, and the one its
 * own repository ships as `jscad.example.js`:
 *
 * ```javascript
 * const outer = subtract(cube({ size: 10 }), sphere({ radius: 6.8 }));
 * const inner = intersect(sphere({ radius: 4 }), cube({ size: 7 }));
 * ```
 *
 * Rebuilt here as BRep. The mark is what constructive solid geometry looks
 * like when both operations are on show at once: a difference that opens the
 * cube, and an intersection that shapes what sits inside it.
 */
import { makeBaseBox, makeSphere } from 'replicad';
import type { Shape3D } from 'replicad';

export const defaultParams = {
  /** Edge of the outer cube. */
  cube: 10,
  /**
   * Radius of the sphere cut from it. Larger than the cube's half-edge, so
   * the sphere breaks out through all six faces and leaves a round window in
   * each; smaller than the half-diagonal, so the eight corners survive and
   * the cube still reads as a cube.
   */
  cavity: 6.8,
  /** Radius of the ball inside. */
  ball: 4,
  /**
   * Edge of the cube it is intersected with. Smaller than the ball's
   * diameter, so the intersection flats off all six poles.
   */
  facet: 7,
  /**
   * The brandmark's own palette, which is also the one the UI icon has always
   * carried. `jscad.example.js` colorizes slightly differently — `[0.65, 0.25,
   * 0.8]` and `[0.7, 0.7, 0.1]`, a more violet purple — but the published mark
   * is the mid tone of these, and the icon should match the brand rather than
   * one script's call.
   */
  shellColor: '#a442a4',
  ballColor: '#a4a400',
};

export type Params = typeof defaultParams;

/**
 * A cube centred on the origin.
 *
 * `makeBaseBox` centres in X and Y but extrudes upward from `z = 0`, unlike
 * JSCAD's `cube`, which is centred on all three axes. Both solids here are
 * cut against a sphere at the origin, so the difference is the whole mark:
 * left uncentred, the cavity breaches only the bottom of the cube.
 */
const centredCube = (size: number): Shape3D =>
  makeBaseBox(size, size, size).translate([0, 0, -size / 2]);

/** The opened cube: a box with a spherical cavity that breaches every face. */
export const shell = (p: Params = defaultParams): Shape3D =>
  centredCube(p.cube).cut(makeSphere(p.cavity));

/** The ball inside: a sphere flattened to a circular facet at each pole. */
export const ball = (p: Params = defaultParams): Shape3D =>
  makeSphere(p.ball).intersect(centredCube(p.facet));

/** Radius of the round window the cavity opens in each cube face. */
export const windowRadius = (p: Params = defaultParams): number =>
  Math.sqrt(p.cavity ** 2 - (p.cube / 2) ** 2);

/** Radius of the flat the intersection cuts at each pole of the ball. */
export const facetRadius = (p: Params = defaultParams): number =>
  Math.sqrt(p.ball ** 2 - (p.facet / 2) ** 2);

export default function main(p: Params = defaultParams) {
  return [
    { shape: shell(p), color: p.shellColor, name: 'Shell' },
    { shape: ball(p), color: p.ballColor, name: 'Ball' },
  ];
}
