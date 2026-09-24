/**
 * GLB mesh extraction shared by both slicing engines.
 *
 * Tau kernels export glTF-space Y-up metres; printers want Z-up millimetres
 * with the part on the plate. Every triangle primitive of every node is
 * transformed by its world matrix, mapped into printer space and welded by
 * position so a per-face export becomes one closed shell.
 *
 * @module
 */

import { Logger, WebIO } from '@gltf-transform/core';

/** Welded triangle soup in Z-up millimetres. @internal */
export type TriangleMesh = Readonly<{
  /** `[x, y, z]` per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle, counter-clockwise from outside. */
  indices: Uint32Array;
  /** Axis-aligned bounds in millimetres. */
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
}>;

const triangleMode = 4;
const metresToMillimetres = 1000;
const weldResolution = 1e4;

/**
 * Read every triangle primitive of a GLB into one welded Z-up millimetre mesh.
 *
 * @internal
 * @param glb - Self-contained GLB bytes.
 * @returns The welded mesh.
 * @throws Error - When the GLB cannot be read or carries no triangles.
 */
export const readTriangleMesh = async (glb: Uint8Array<ArrayBuffer>): Promise<TriangleMesh> => {
  const io = new WebIO().setLogger(new Logger(Logger.Verbosity.SILENT));
  const document = await io.readBinary(glb);
  const positions: number[] = [];
  const indices: number[] = [];
  const welded = new Map<string, number>();
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const weld = (x: number, y: number, z: number): number => {
    const key = `${Math.round(x * weldResolution)},${Math.round(y * weldResolution)},${Math.round(z * weldResolution)}`;
    const existing = welded.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const index = positions.length / 3;
    positions.push(x, y, z);
    welded.set(key, index);
    for (const [axis, value] of [x, y, z].entries()) {
      min[axis] = Math.min(min[axis]!, value);
      max[axis] = Math.max(max[axis]!, value);
    }
    return index;
  };
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) {
      continue;
    }
    const matrix = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (primitive.getMode() !== triangleMode || !position) {
        continue;
      }
      const array = position.getArray()!;
      const count = position.getCount();
      const local = new Uint32Array(count);
      for (let vertex = 0; vertex < count; vertex += 1) {
        const x = array[vertex * 3]!;
        const y = array[vertex * 3 + 1]!;
        const z = array[vertex * 3 + 2]!;
        const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        // Convert glTF Y-up metres to printer Z-up millimetres.
        local[vertex] = weld(worldX * metresToMillimetres, -worldZ * metresToMillimetres, worldY * metresToMillimetres);
      }
      const indexArray = primitive.getIndices()?.getArray();
      const triangleCount = indexArray ? Math.floor(indexArray.length / 3) : Math.floor(count / 3);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const corner = (offset: number): number =>
          local[indexArray ? indexArray[triangle * 3 + offset]! : triangle * 3 + offset]!;
        const a = corner(0);
        const b = corner(1);
        const c = corner(2);
        if (a !== b && b !== c && a !== c) {
          indices.push(a, b, c);
        }
      }
    }
  }
  if (indices.length === 0) {
    throw new Error('The GLB carries no triangle primitives.');
  }
  return {
    positions: Float32Array.from(positions),
    indices: Uint32Array.from(indices),
    bounds: { min: [min[0]!, min[1]!, min[2]!], max: [max[0]!, max[1]!, max[2]!] },
  };
};

/**
 * Serialise a mesh as binary STL for the companion service upload.
 *
 * @internal
 * @param mesh - Welded mesh.
 * @returns Binary STL bytes.
 */
export const writeBinaryStl = (mesh: TriangleMesh): Uint8Array<ArrayBuffer> => {
  const triangleCount = mesh.indices.length / 3;
  const bytes = new Uint8Array(84 + triangleCount * 50);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('@taucad/slicer binary stl'), 0);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const corner = (offset: number): readonly [number, number, number] => {
      const index = mesh.indices[triangle * 3 + offset]! * 3;
      return [mesh.positions[index]!, mesh.positions[index + 1]!, mesh.positions[index + 2]!];
    };
    const corners = [corner(0), corner(1), corner(2)] as const;
    const [p, q, r] = corners;
    const ux = q[0] - p[0];
    const uy = q[1] - p[1];
    const uz = q[2] - p[2];
    const vx = r[0] - p[0];
    const vy = r[1] - p[1];
    const vz = r[2] - p[2];
    const normal = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    const length = Math.hypot(...normal) || 1;
    for (const component of normal) {
      view.setFloat32(offset, component / length, true);
      offset += 4;
    }
    for (const corner of corners) {
      for (const component of corner) {
        view.setFloat32(offset, component, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return bytes;
};
