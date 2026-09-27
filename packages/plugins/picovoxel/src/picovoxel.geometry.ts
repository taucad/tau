import { cadMaterialDefaults } from '@taucad/runtime/types';
import { transformNormalArray, transformVectorArrayChecked, writeGlb } from '@taucad/geometry-core';
import type { GeometryOutputTransformOptions, GlbNode } from '@taucad/geometry-core';

import type { PicovoxelLane } from '#picovoxel.schemas.js';

const triangleMode = 4;

/** Structured-cloneable geometry retained after a PicoVoxel session is disposed. @public */
export type PicovoxelShapeSnapshot = {
  readonly name: string;
  /** Welded vertex positions, `[x, y, z, …]` in millimetres, Z up. */
  readonly vertices: Float32Array<ArrayBuffer>;
  /** Triangle vertex indices into `vertices`, three per triangle. */
  readonly triangles: Uint32Array<ArrayBuffer>;
  /** The lane whose session built this shape. */
  readonly lane: PicovoxelLane;
};

/** Durable native handle for PicoVoxel render, cache, and export phases. @public */
export type PicovoxelNativeHandle = { readonly shapes: readonly PicovoxelShapeSnapshot[] };

/**
 * Area-weighted smooth vertex normals on the source (Z-up) vertices.
 *
 * The arithmetic — the cross product, Float32 accumulation in triangle order, `Math.hypot`
 * normalization — is kept exactly, so the bytes match the de-indexed path this replaced.
 *
 * @param vertices - Welded vertex positions.
 * @param triangles - Triangle indices, already range-checked.
 * @returns One unit normal per vertex (zero for an isolated vertex).
 */
const computeVertexNormals = (
  vertices: Float32Array<ArrayBuffer>,
  triangles: Uint32Array<ArrayBuffer>,
): Float32Array<ArrayBuffer> => {
  const normals = new Float32Array(vertices.length);
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3;
    const b = triangles[offset + 1]! * 3;
    const c = triangles[offset + 2]! * 3;
    const abX = vertices[b]! - vertices[a]!;
    const abY = vertices[b + 1]! - vertices[a + 1]!;
    const abZ = vertices[b + 2]! - vertices[a + 2]!;
    const acX = vertices[c]! - vertices[a]!;
    const acY = vertices[c + 1]! - vertices[a + 1]!;
    const acZ = vertices[c + 2]! - vertices[a + 2]!;
    const normalX = abY * acZ - abZ * acY;
    const normalY = abZ * acX - abX * acZ;
    const normalZ = abX * acY - abY * acX;
    normals[a]! += normalX;
    normals[a + 1]! += normalY;
    normals[a + 2]! += normalZ;
    normals[b]! += normalX;
    normals[b + 1]! += normalY;
    normals[b + 2]! += normalZ;
    normals[c]! += normalX;
    normals[c + 1]! += normalY;
    normals[c + 2]! += normalZ;
  }
  for (let offset = 0; offset < normals.length; offset += 3) {
    const length = Math.hypot(normals[offset]!, normals[offset + 1]!, normals[offset + 2]!);
    if (length > 0) {
      normals[offset]! /= length;
      normals[offset + 1]! /= length;
      normals[offset + 2]! /= length;
    }
  }
  return normals;
};

/**
 * Drop the triangles whose area is exactly zero (D36).
 *
 * PicoVoxel's exact lane stays byte-identical to C# PicoGK, whose mesher emits a zero-area pair
 * wherever it places two vertices at one position; the Tau snapshot removes them instead. The test
 * is the cross product {@link computeVertexNormals} accumulates, in the same arithmetic, so a dropped
 * triangle contributed exactly nothing to any normal and zero to area and volume; a repeated index
 * always yields a zero cross product. Survivors keep their order and their bytes.
 *
 * @param vertices - Welded vertex positions.
 * @param triangles - Triangle indices, already range-checked.
 * @returns `triangles` itself when nothing is dropped, otherwise the surviving triangles.
 * @public
 */
export const dropZeroAreaTriangles = (
  vertices: Float32Array<ArrayBuffer>,
  triangles: Uint32Array<ArrayBuffer>,
): Uint32Array<ArrayBuffer> => {
  const kept = new Uint32Array(triangles.length);
  let length = 0;
  for (let offset = 0; offset < triangles.length; offset += 3) {
    const a = triangles[offset]! * 3;
    const b = triangles[offset + 1]! * 3;
    const c = triangles[offset + 2]! * 3;
    const abX = vertices[b]! - vertices[a]!;
    const abY = vertices[b + 1]! - vertices[a + 1]!;
    const abZ = vertices[b + 2]! - vertices[a + 2]!;
    const acX = vertices[c]! - vertices[a]!;
    const acY = vertices[c + 1]! - vertices[a + 1]!;
    const acZ = vertices[c + 2]! - vertices[a + 2]!;
    if (abY * acZ - abZ * acY !== 0 || abZ * acX - abX * acZ !== 0 || abX * acY - abY * acX !== 0) {
      kept[length++] = triangles[offset]!;
      kept[length++] = triangles[offset + 1]!;
      kept[length++] = triangles[offset + 2]!;
    }
  }
  return length === triangles.length ? triangles : kept.slice(0, length);
};

/**
 * One indexed triangle node per shape. Voxel meshes carry no B-rep edges, so no LINES primitive is
 * written; the kernel still claims `includeEdges` natively so the string-keyed fallback detector
 * never runs over a voxel mesh.
 *
 * @param shape - A durable shape snapshot.
 * @param options - Output coordinate system and length unit.
 * @returns The GLB node.
 */
const buildNode = (shape: PicovoxelShapeSnapshot, options: GeometryOutputTransformOptions): GlbNode => ({
  name: shape.name,
  primitives: [
    {
      mode: triangleMode,
      positions: transformVectorArrayChecked({
        vectors: shape.vertices,
        kind: 'position',
        options,
        invalidMessage: `PicoVoxel ${shape.name} contains a non-finite vertex.`,
      }),
      normals: transformNormalArray(computeVertexNormals(shape.vertices, shape.triangles), options),
      // The writer copies from this view into the GLB, so no copy is made here.
      indices: shape.triangles,
      material: {
        // ponytail: double-sided until a section-view check proves the native picogk plugin's
        // `false` renders voxel meshes correctly (D30).
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorFactor: [...cadMaterialDefaults.baseColorFactor],
          metallicFactor: cadMaterialDefaults.metalnessFactor,
          roughnessFactor: cadMaterialDefaults.roughnessFactor,
        },
      },
    },
  ],
});

/**
 * Convert durable PicoVoxel mesh snapshots to canonical Tau GLB bytes.
 *
 * The mesh stays indexed end to end; `EXT_mesh_manifold` stays off.
 *
 * @param handle - Structured-cloneable PicoVoxel mesh snapshots.
 * @param options - Output coordinate system and length unit.
 * @returns Binary glTF bytes; an empty handle yields the canonical empty scene.
 * @public
 */
export const picovoxelToGlb = (
  handle: PicovoxelNativeHandle,
  options: GeometryOutputTransformOptions = {},
): Uint8Array<ArrayBuffer> => writeGlb({ nodes: handle.shapes.map((shape) => buildNode(shape, options)) });
