/**
 * The mesh bundle the SMLibPy worker writes for `mesh`: `TAUSMLB1`, a little-endian `u32` header length, the JSON
 * header (space-padded to four bytes) and one binary body the header slices as `[byteOffset, byteLength]`. Positions,
 * normals and lines are `f32` millimetres in the model's Z-up frame; triangles are `u32` indices.
 */
import type { GlbImage, GlbMaterial, GlbResources } from '@taucad/geometry-core';
import { z } from 'zod';

const magic = 'TAUSMLB1';
const sliceSchema = z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]);
const rangeShape = { start: z.number().int().nonnegative(), count: z.number().int().nonnegative() };
const faceGroupsSchema = z.array(z.object({ ...rangeShape, faceId: z.number().int().nonnegative() }));
const edgeGroupsSchema = z.array(z.object({ ...rangeShape, edgeId: z.number().int().nonnegative() }));

const bundleHeaderSchema = z.object({
  shapes: z.array(
    z.object({
      name: z.string().optional(),
      color: z.string().optional(),
      opacity: z.number().optional(),
      metalness: z.number().optional(),
      roughness: z.number().optional(),
      material: z.record(z.string(), z.unknown()).optional(),
      faces: z.object({
        vertices: sliceSchema,
        normals: sliceSchema,
        triangles: sliceSchema,
        faceGroups: faceGroupsSchema,
      }),
      edges: z.object({ lines: sliceSchema, edgeGroups: edgeGroupsSchema }),
    }),
  ),
  images: z
    .array(
      z
        .object({
          name: z.string().optional(),
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          data: sliceSchema,
        })
        .loose(),
    )
    .optional(),
  textures: z.array(z.record(z.string(), z.unknown())).optional(),
  samplers: z.array(z.record(z.string(), z.unknown())).optional(),
  mechanism: z.unknown().optional(),
});

/**
 * One tessellated SMLibPy shape: an indexed triangle mesh grouped by B-rep face and B-rep edge polylines grouped by
 * edge, in millimetres and the model's Z-up frame, with the appearance the model gave it.
 */
export type SmlibpyGeometry = {
  name?: string;
  color?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  material?: GlbMaterial;
  faces: {
    vertices: Float32Array;
    normals: Float32Array;
    triangles: Uint32Array;
    texCoords?: number[];
    tangents?: number[];
    /** Index ranges (`start`, `count` in indices) of each B-rep face, in `faces()` order. */
    faceGroups: Array<{ start: number; count: number; faceId: number }>;
  };
  edges: {
    /** De-indexed line segments, six scalars per segment. */
    lines: Float32Array;
    /** Scalar ranges (`start`, `count`) of each B-rep edge, in the body's edge order. */
    edgeGroups: Array<{ start: number; count: number; edgeId: number }>;
  };
};

/** One read mesh bundle: the shapes, the model's glTF resources and its mechanism source. */
export type SmlibpyMeshBundle = GlbResources & { geometries: SmlibpyGeometry[]; mechanism?: unknown };

/**
 * Read a mesh bundle the worker wrote.
 *
 * @param bytes - The bundle's bytes.
 * @returns Its shapes, resources and mechanism source.
 * @throws {Error} When the bytes are not a well-formed bundle.
 */
export const readSmlibpyMeshBundle = (bytes: Uint8Array<ArrayBuffer>): SmlibpyMeshBundle => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || new TextDecoder().decode(bytes.subarray(0, 8)) !== magic) {
    throw new Error('SMLibPy worker wrote a mesh bundle without its header.');
  }
  const headerLength = view.getUint32(8, true);
  const bodyStart = 12 + headerLength;
  if (bodyStart > bytes.byteLength) {
    throw new Error('SMLibPy mesh bundle header exceeds the bundle.');
  }
  const header = bundleHeaderSchema.parse(JSON.parse(new TextDecoder().decode(bytes.subarray(12, bodyStart))));
  const slice = ([offset, length]: readonly [number, number]): Uint8Array<ArrayBuffer> => {
    if (bodyStart + offset + length > bytes.byteLength) {
      throw new Error('SMLibPy mesh bundle slice exceeds the bundle.');
    }
    // A copy: the slices are aligned in the body but the body need not be aligned in `bytes`.
    return new Uint8Array(bytes.slice(bodyStart + offset, bodyStart + offset + length));
  };
  const floats = (range: readonly [number, number]): Float32Array => new Float32Array(slice(range).buffer);
  const indices = (range: readonly [number, number]): Uint32Array => new Uint32Array(slice(range).buffer);
  return {
    geometries: header.shapes.map(({ faces, edges, material, ...appearance }) => ({
      ...appearance,
      ...(material === undefined ? {} : { material: material as GlbMaterial }),
      faces: {
        vertices: floats(faces.vertices),
        normals: floats(faces.normals),
        triangles: indices(faces.triangles),
        faceGroups: faces.faceGroups,
      },
      edges: { lines: floats(edges.lines), edgeGroups: edges.edgeGroups },
    })),
    ...(header.images === undefined
      ? {}
      : {
          images: header.images.map(({ data, ...image }): GlbImage => ({ ...image, data: slice(data) })),
        }),
    ...(header.textures === undefined ? {} : { textures: header.textures as GlbResources['textures'] }),
    ...(header.samplers === undefined ? {} : { samplers: header.samplers as GlbResources['samplers'] }),
    ...(header.mechanism === undefined ? {} : { mechanism: header.mechanism }),
  };
};
