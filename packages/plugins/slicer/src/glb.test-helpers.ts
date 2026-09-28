/**
 * GLBs for slicer tests, written the way Tau kernels export them: glTF Y-up
 * metres, one node, mesh and triangle primitive per part.
 *
 * @module
 */

import { ColorUtils, Document, WebIO } from '@gltf-transform/core';

/** A vertex in printer space: Z-up millimetres. */
export type TestVertex = readonly [x: number, y: number, z: number];

/** One part of a test GLB. */
export type TestPart = Readonly<{
  vertices: readonly TestVertex[];
  /** Vertex indices, counter-clockwise from outside. */
  triangles: ReadonlyArray<readonly [number, number, number]>;
  /** The part's sRGB colour, such as `0xff0000`; the primitive has no material when absent. */
  color?: number;
}>;

/** A box's twelve triangles over the corners {@link boxVertices} lists. */
export const boxTriangles: ReadonlyArray<readonly [number, number, number]> = [
  [0, 2, 1],
  [0, 3, 2],
  [4, 5, 6],
  [4, 6, 7],
  [0, 1, 5],
  [0, 5, 4],
  [1, 2, 6],
  [1, 6, 5],
  [2, 3, 7],
  [2, 7, 6],
  [3, 0, 4],
  [3, 4, 7],
];

/**
 * A box's eight corners: the bottom face counter-clockwise from its minimum corner, then the top face.
 *
 * @param min - The minimum corner.
 * @param max - The maximum corner.
 * @returns The corners {@link boxTriangles} indexes.
 */
export const boxVertices = ([x0, y0, z0]: TestVertex, [x1, y1, z1]: TestVertex): TestVertex[] => [
  [x0, y0, z0],
  [x1, y0, z0],
  [x1, y1, z0],
  [x0, y1, z0],
  [x0, y0, z1],
  [x1, y0, z1],
  [x1, y1, z1],
  [x0, y1, z1],
];

/**
 * Write parts as a GLB in Tau's export convention.
 *
 * @param parts - The parts, in node order.
 * @returns Self-contained GLB bytes.
 */
export const writeTestGlb = async (parts: readonly TestPart[]): Promise<Uint8Array<ArrayBuffer>> => {
  const document = new Document();
  const buffer = document.createBuffer();
  const scene = document.createScene();
  for (const [index, part] of parts.entries()) {
    const position = document
      .createAccessor()
      .setType('VEC3')
      .setArray(Float32Array.from(part.vertices.flatMap(([x, y, z]) => [x / 1000, z / 1000, -y / 1000])))
      .setBuffer(buffer);
    const indices = document
      .createAccessor()
      .setType('SCALAR')
      .setArray(Uint32Array.from(part.triangles.flat()))
      .setBuffer(buffer);
    const primitive = document.createPrimitive().setAttribute('POSITION', position).setIndices(indices);
    if (part.color !== undefined) {
      primitive.setMaterial(
        document.createMaterial(`part-${index}`).setBaseColorFactor(ColorUtils.hexToFactor(part.color, [0, 0, 0, 1])),
      );
    }
    scene.addChild(
      document.createNode(`part-${index}`).setMesh(document.createMesh(`part-${index}`).addPrimitive(primitive)),
    );
  }
  return Uint8Array.from(await new WebIO().writeBinary(document));
};
