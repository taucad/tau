// Tier-0 smoke example (blueprint R2/D4): PicoGK_Examples HelloWorld.cs
// (CC0-1.0) on the explicit-session API. C# builds a cube mesh with
// Utils.mshCreateCube and shows it in the viewer; headless we build the same
// unit cube through the bulk mesh path and hand back its stats.

import type { Mesh, Pico } from 'picovoxel';

/** A 1 mm cube centered on the origin — 8 vertices, 12 triangles. */
export function helloWorld(pk: Pico): Mesh {
  const h = 0.5;
  // prettier-ignore
  const vertices = [
    -h, -h, -h,  h, -h, -h,  h, h, -h,  -h, h, -h, // bottom (z = -h)
    -h, -h,  h,  h, -h,  h,  h, h,  h,  -h, h,  h, // top    (z = +h)
  ];
  // prettier-ignore
  const triangles = [
    0, 2, 1, 0, 3, 2, // bottom
    4, 5, 6, 4, 6, 7, // top
    0, 1, 5, 0, 5, 4, // front
    1, 2, 6, 1, 6, 5, // right
    2, 3, 7, 2, 7, 6, // back
    3, 0, 4, 3, 4, 7, // left
  ];
  return pk.createMesh({ vertices, triangles });
}
