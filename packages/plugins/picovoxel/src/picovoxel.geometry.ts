import { cadEdgeOverlayMaterialDefaults, cadMaterialDefaults } from '@taucad/runtime/types';
import {
  detectEdges,
  transformNormalArray,
  transformVertexArray,
  writeGlb,
} from '@taucad/geometry-core';
import type { GeometryOutputTransformOptions, GlbNode, GlbPrimitive } from '@taucad/geometry-core';

const triangleMode = 4;
const lineMode = 1;
const edgeThresholdDegrees = 30;
const unlitExtension = 'KHR_materials_unlit';

/** Structured-cloneable geometry retained after a Picovoxel session is disposed. @public */
export type PicovoxelShapeSnapshot = {
  readonly name: string;
  readonly vertices: Float32Array;
  readonly triangles: Uint32Array;
  readonly lane: 'exact' | 'fast';
};

/** Durable native handle for Picovoxel render, cache, and export phases. @public */
export type PicovoxelNativeHandle = { readonly shapes: readonly PicovoxelShapeSnapshot[] };

const computeVertexNormals = (vertices: Float32Array, triangles: Uint32Array): Float32Array => {
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
    for (const vertexOffset of [a, b, c]) {
      normals[vertexOffset]! += normalX;
      normals[vertexOffset + 1]! += normalY;
      normals[vertexOffset + 2]! += normalZ;
    }
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

const sequentialIndices = (vertexCount: number): Uint32Array => {
  const indices = new Uint32Array(vertexCount);
  for (const index of indices.keys()) {
    indices[index] = index;
  }
  return indices;
};

const expandTriangles = (
  vertices: Float32Array,
  normals: Float32Array,
  triangles: Uint32Array,
): { positions: Float32Array; normals: Float32Array } => {
  const positions = new Float32Array(triangles.length * 3);
  const expandedNormals = new Float32Array(triangles.length * 3);
  for (const [index, triangleIndex] of triangles.entries()) {
    const source = triangleIndex * 3;
    const target = index * 3;
    positions.set(vertices.subarray(source, source + 3), target);
    expandedNormals.set(normals.subarray(source, source + 3), target);
  }
  return { positions, normals: expandedNormals };
};

const buildNode = (
  shape: PicovoxelShapeSnapshot,
  options: GeometryOutputTransformOptions & { readonly includeEdges?: boolean },
): GlbNode => {
  const expanded = expandTriangles(
    shape.vertices,
    computeVertexNormals(shape.vertices, shape.triangles),
    shape.triangles,
  );
  const positions = transformVertexArray([...expanded.positions], options);
  const normals = transformNormalArray([...expanded.normals], options);
  const primitives: GlbPrimitive[] = [
    {
      mode: triangleMode,
      positions,
      normals,
      indices: sequentialIndices(positions.length / 3),
      material: {
        baseColorFactor: [...cadMaterialDefaults.baseColorFactor],
        metallicFactor: cadMaterialDefaults.metalnessFactor,
        roughnessFactor: cadMaterialDefaults.roughnessFactor,
        doubleSided: true,
        alphaMode: 'OPAQUE',
      },
    },
  ];

  if (options.includeEdges === true) {
    const edgePositions = detectEdges(shape.vertices, shape.triangles, edgeThresholdDegrees).positions;
    if (edgePositions.length > 0) {
      const transformedEdges = transformVertexArray([...edgePositions], options);
      primitives.push({
        mode: lineMode,
        positions: transformedEdges,
        indices: sequentialIndices(transformedEdges.length / 3),
        material: {
          ...cadEdgeOverlayMaterialDefaults,
          baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
          extensions: { [unlitExtension]: {} },
        },
      });
    }
  }

  return { name: shape.name, primitives };
};

/**
 * Convert durable Picovoxel mesh snapshots to canonical Tau GLB bytes.
 *
 * @param shapes - Structured-cloneable Picovoxel mesh snapshots.
 * @param options - Canonical coordinate, unit, and edge-output options.
 * @returns Canonical binary glTF bytes.
 * @public
 */
export const picovoxelToGlb = (
  shapes: PicovoxelNativeHandle,
  options: GeometryOutputTransformOptions & { readonly includeEdges?: boolean } = {},
): Uint8Array<ArrayBuffer> => {
  const nodes = shapes.shapes.map((shape) => buildNode(shape, options));
  const hasEdges = nodes.some((node) => node.primitives.some((primitive) => primitive.mode === lineMode));
  return writeGlb({
    nodes,
    ...(hasEdges ? { extensionsUsed: [unlitExtension] } : {}),
  });
};
