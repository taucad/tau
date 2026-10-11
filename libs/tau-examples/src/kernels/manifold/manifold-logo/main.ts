/**
 * Manifold brandmark.
 *
 * Manifold's mark is its own `MengerSponge` sample — the model its README,
 * its editor icon and its favicon all carry. This follows the sample as
 * written, in `samples/src/menger_sponge.cpp` and again in the wasm bindings'
 * `menger-sponge.mjs`:
 *
 * ```javascript
 * function fractal(holes, hole, w, position, depth, maxDepth) {
 *   w /= 3;
 *   holes.push(hole.scale([w, w, 1]).translate([position[0], position[1], 0]));
 *   ...
 * }
 * ```
 *
 * The sample exists to make a point about robustness: every hole is cut by a
 * box whose sides are *exactly* coplanar with its neighbours', and the result
 * is still watertight. That is the property the library is named for, so the
 * mark is a correctness demonstration rather than an illustration.
 */
import type { Manifold as ManifoldType } from 'manifold-3d';
import { GLTFNode, Manifold } from 'manifold-3d/manifoldCAD';

export const defaultParams = {
  /**
   * Fractal depth. Warning: scales exponentially — the sample's own note. The
   * published mark is depth 3; depth 4 is nearly 400,000 triangles.
   */
  depth: 3,
  /** Edge of the cube, before the fractal is cut from it. */
  size: 100,
};

export type Params = typeof defaultParams;

/**
 * The square holes of one axis, as boxes.
 *
 * Each level cuts a bar through the centre of the current cell, then recurses
 * into the eight cells around it — the middle one is already gone. Widths
 * divide by three each time, so the boxes land exactly on the previous
 * level's grid and share whole faces with them.
 */
const fractal = (
  holes: ManifoldType[],
  hole: ManifoldType,
  {
    width,
    position,
    depth,
    maxDepth,
  }: {
    readonly width: number;
    readonly position: readonly [number, number];
    readonly depth: number;
    readonly maxDepth: number;
  },
): void => {
  const w = width / 3;
  holes.push(hole.scale([w, w, 1]).translate([position[0], position[1], 0]));

  if (depth === maxDepth) {
    return;
  }

  const offsets: ReadonlyArray<readonly [number, number]> = [
    [-w, -w],
    [-w, 0],
    [-w, w],
    [0, w],
    [w, w],
    [w, 0],
    [w, -w],
    [0, -w],
  ];

  for (const [dx, dy] of offsets) {
    fractal(holes, hole, {
      width: w,
      position: [position[0] + dx, position[1] + dy],
      depth: depth + 1,
      maxDepth,
    });
  }
};

/** The classic cubic fractal, cut on all three axes. */
export const mengerSponge = (n: number): ManifoldType => {
  const cube = Manifold.cube([1, 1, 1], true);
  const holes: ManifoldType[] = [];
  fractal(holes, cube, { width: 1, position: [0, 0], depth: 1, maxDepth: n });
  const hole = Manifold.union(holes);

  return Manifold.difference([
    cube,
    hole,
    hole.rotate([90, 0, 0]),
    hole.rotate([0, 90, 0]),
  ]);
};

/**
 * The mark's colour law, from the sample's `posColors`: each channel is
 * `(1 - pos) / 2`, so opposite corners take opposite hues and the three
 * visible faces each run a different pair of them.
 *
 * `position` is normalised to the cube, running `-1` to `1` on each axis, so
 * the channel runs the full `0` to `1`. Written literally against
 * `Manifold.cube([1, 1, 1], true)` — which spans `-0.5` to `0.5` — the
 * expression only reaches the middle half of the range and the mark comes out
 * pastel. The published mark is saturated, corner to corner, so it is the
 * normalised reading that matches it.
 *
 * `main` applies it the way the sample does, through `setProperties(3, …)`
 * declared as `COLOR_0`, and the vector render evaluates the same export.
 */
export const positionColor = (
  position: readonly [number, number, number],
): [number, number, number] => [
  (1 - position[0]) / 2,
  (1 - position[1]) / 2,
  (1 - position[2]) / 2,
];

export default function main(p: Params = defaultParams): GLTFNode {
  const node = new GLTFNode();
  // The unit cube spans -0.5 to 0.5, so positions are doubled onto the law's -1 to 1.
  node.manifold = mengerSponge(p.depth)
    .setProperties(3, (color, position) => {
      const [red, green, blue] = positionColor([
        position[0] * 2,
        position[1] * 2,
        position[2] * 2,
      ]);
      color[0] = red;
      color[1] = green;
      color[2] = blue;
    })
    .scale(p.size);
  // White, so the vertex colour is the colour; the kernel adds the normals.
  node.material = { baseColorFactor: [1, 1, 1], attributes: ['COLOR_0'] };

  return node;
}
