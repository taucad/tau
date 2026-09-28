/**
 * GLB mesh extraction shared by every slicing engine.
 *
 * Tau kernels export glTF-space Y-up metres; printers want Z-up millimetres
 * with the part on the plate. Every triangle primitive of every node is
 * transformed by its world matrix, mapped into printer space and welded by
 * position so a per-face export becomes one closed shell. The same triangles
 * are also welded per material colour, one part per colour, for an engine
 * that prints each colour with its own filament.
 *
 * @module
 */

import { ColorUtils, Logger, WebIO } from '@gltf-transform/core';
import type { vec4 } from '@gltf-transform/core';

/** Welded triangle soup in Z-up millimetres. @internal */
export type TriangleMesh = Readonly<{
  /** `[x, y, z]` per vertex. */
  positions: Float32Array;
  /** Three vertex indices per triangle, counter-clockwise from outside. */
  indices: Uint32Array;
  /** Axis-aligned bounds in millimetres. */
  bounds: Readonly<{ min: readonly [number, number, number]; max: readonly [number, number, number] }>;
  /**
   * Material colour as sRGB `#RRGGBB`: a part's own, or for a whole model the first coloured
   * primitive's. `undefined` for the part without a material, or a model with none.
   */
  color: string | undefined;
}>;

/** A whole model welded as one mesh, and the same triangles welded again as one part per colour. @internal */
export type TriangleModel = TriangleMesh &
  Readonly<{
    /** One mesh per material colour, in first-appearance order; primitives without a material form one part. */
    parts: readonly TriangleMesh[];
  }>;

type Welder = {
  positions: number[];
  indices: number[];
  byKey: Map<string, number>;
  min: number[];
  max: number[];
};

const triangleMode = 4;
const metresToMillimetres = 1000;
const weldResolution = 1e4;

const createWelder = (): Welder => ({
  positions: [],
  indices: [],
  byKey: new Map(),
  min: [Infinity, Infinity, Infinity],
  max: [-Infinity, -Infinity, -Infinity],
});

const weld = (welder: Welder, key: string, point: readonly [number, number, number]): number => {
  const existing = welder.byKey.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const index = welder.positions.length / 3;
  welder.positions.push(...point);
  welder.byKey.set(key, index);
  for (const [axis, value] of point.entries()) {
    welder.min[axis] = Math.min(welder.min[axis]!, value);
    welder.max[axis] = Math.max(welder.max[axis]!, value);
  }
  return index;
};

// The factor is linear; the hex is sRGB, as slicers and CSS read it. `ColorUtils.factorToHex` truncates
// each channel, so an authored `#FF0000` would come back as `#FE0000`; rounding keeps it.
const srgbHex = (factor: vec4): string => {
  const srgb = ColorUtils.convertLinearToSRGB<vec4>(factor, [0, 0, 0, 0]);
  const channels = [srgb[0], srgb[1], srgb[2]].map((channel) =>
    Math.round(Math.min(Math.max(channel, 0), 1) * 255)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${channels.join('').toUpperCase()}`;
};

const meshOf = (welder: Welder, color: string | undefined): TriangleMesh => ({
  positions: Float32Array.from(welder.positions),
  indices: Uint32Array.from(welder.indices),
  bounds: {
    min: [welder.min[0]!, welder.min[1]!, welder.min[2]!],
    max: [welder.max[0]!, welder.max[1]!, welder.max[2]!],
  },
  color,
});

/**
 * Read every triangle primitive of a GLB into one welded Z-up millimetre mesh, and into one welded
 * part per material colour in the same space.
 *
 * Primitives whose sRGB base colour is equal share a part, and primitives without a material form
 * one part. A model with one colour has one part, equal to the whole mesh.
 *
 * @internal
 * @param glb - Self-contained GLB bytes.
 * @returns The welded mesh and its parts.
 * @throws Error - When the GLB cannot be read or carries no triangles.
 */
export const readTriangleMesh = async (glb: Uint8Array<ArrayBuffer>): Promise<TriangleModel> => {
  const io = new WebIO().setLogger(new Logger(Logger.Verbosity.SILENT));
  const document = await io.readBinary(glb);
  const whole = createWelder();
  const parts = new Map<string | undefined, Welder>();
  let color: string | undefined;
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
      const material = primitive.getMaterial();
      const partColor = material ? srgbHex(material.getBaseColorFactor()) : undefined;
      color ??= partColor;
      let part = parts.get(partColor);
      if (part === undefined) {
        part = createWelder();
        parts.set(partColor, part);
      }
      const array = position.getArray()!;
      const count = position.getCount();
      const local = new Uint32Array(count);
      const partLocal = new Uint32Array(count);
      for (let vertex = 0; vertex < count; vertex += 1) {
        const x = array[vertex * 3]!;
        const y = array[vertex * 3 + 1]!;
        const z = array[vertex * 3 + 2]!;
        const worldX = matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12];
        const worldY = matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13];
        const worldZ = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
        // Convert glTF Y-up metres to printer Z-up millimetres.
        const point = [
          worldX * metresToMillimetres,
          -worldZ * metresToMillimetres,
          worldY * metresToMillimetres,
        ] as const;
        const key = `${Math.round(point[0] * weldResolution)},${Math.round(point[1] * weldResolution)},${Math.round(point[2] * weldResolution)}`;
        local[vertex] = weld(whole, key, point);
        partLocal[vertex] = weld(part, key, point);
      }
      const indexArray = primitive.getIndices()?.getArray();
      const triangleCount = indexArray ? Math.floor(indexArray.length / 3) : Math.floor(count / 3);
      for (let triangle = 0; triangle < triangleCount; triangle += 1) {
        const corner = (offset: number): number =>
          indexArray ? indexArray[triangle * 3 + offset]! : triangle * 3 + offset;
        const a = corner(0);
        const b = corner(1);
        const c = corner(2);
        // Corners welded together make a degenerate triangle, in the whole mesh and in its part alike.
        if (local[a] !== local[b] && local[b] !== local[c] && local[a] !== local[c]) {
          whole.indices.push(local[a]!, local[b]!, local[c]!);
          part.indices.push(partLocal[a]!, partLocal[b]!, partLocal[c]!);
        }
      }
    }
  }
  if (whole.indices.length === 0) {
    throw new Error('The GLB carries no triangle primitives.');
  }
  return {
    ...meshOf(whole, color),
    parts: [...parts].filter(([, part]) => part.indices.length > 0).map(([key, part]) => meshOf(part, key)),
  };
};

/**
 * Whether a mesh has no open edge: every welded edge borders an even number of triangles.
 *
 * A colour on some faces of a solid, rather than on a whole solid, makes a part that fails this.
 *
 * @internal
 * @param mesh - A welded mesh.
 * @returns `true` when no edge lies on an open boundary.
 */
export const isClosedMesh = (mesh: TriangleMesh): boolean => {
  const vertexCount = mesh.positions.length / 3;
  const open = new Set<number>();
  for (let offset = 0; offset < mesh.indices.length; offset += 3) {
    for (const [from, to] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const a = mesh.indices[offset + from]!;
      const b = mesh.indices[offset + to]!;
      const edge = Math.min(a, b) * vertexCount + Math.max(a, b);
      // Each use toggles the edge, so an edge used an odd number of times stays open.
      if (!open.delete(edge)) {
        open.add(edge);
      }
    }
  }
  return open.size === 0;
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
