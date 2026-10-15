// Runs main.ts outside Tau with the project's own @jscad/modeling and writes a binary STL. Like
// @jscad/stl-serializer, it snaps and triangulates each solid with `generalize` before writing it.
// Usage (after `npm ci --ignore-scripts`): node run.mjs <out.stl>
import { writeFileSync } from 'node:fs';

import jscad from '@jscad/modeling';

import main, { defaultParams } from './main.ts';

const { geometries, modifiers } = jscad;

const triangles = [main(defaultParams)]
  .flat()
  .map((solid) => modifiers.generalize({ snap: true, triangulate: true }, solid))
  // oxlint-disable-next-line typescript/no-unsafe-argument -- `generalize` is typed to return any geometry.
  .flatMap((solid) => geometries.geom3.toPolygons(solid))
  .flatMap(({ vertices }) => vertices.slice(2).map((vertex, index) => [vertices[0], vertices[index + 1], vertex]));
const stl = Buffer.alloc(84 + 50 * triangles.length);
stl.writeUInt32LE(triangles.length, 80);
for (const [index, triangle] of triangles.entries()) {
  for (const [corner, point] of triangle.entries()) {
    for (const [axis, value] of point.entries()) {
      stl.writeFloatLE(value, 84 + 50 * index + 12 + 12 * corner + 4 * axis);
    }
  }
}
writeFileSync(process.argv[2], stl);
