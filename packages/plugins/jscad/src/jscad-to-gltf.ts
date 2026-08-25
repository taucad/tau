import type { geometries as JscadGeometries, maths as JscadMaths } from '@jscad/modeling';
import { Primitive } from '@gltf-transform/core';
import { KHRMaterialsUnlit } from '@gltf-transform/extensions';

import { cadEdgeOverlayMaterialDefaults, cadMaterialDefaults } from '@taucad/runtime/types';
import {
  detectEdges,
  transformNormalArray,
  transformVertexArray,
  srgbTupleToLinear,
  writeGlb,
} from '@taucad/geometry-core';
import type { GeometryOutputTransformOptions, GlbInput, GlbNode, GlbPrimitive } from '@taucad/geometry-core';

import { getRenderableJscadParts } from '#jscad-parts.js';
import type { JscadPartDescriptor } from '#jscad-parts.js';

import type { JscadModeling } from '#jscad-modeling.js';

type JscadVec3 = JscadMaths.vec3.Vec3;
type JscadGeom3 = JscadGeometries.geom3.Geom3;
type JscadPolygon = { vertices: JscadVec3[] };
type Vertex3 = [number, number, number];
/**
 */
export type JscadMeshTriangle = {
  index0: number;
  index1: number;
  index2: number;
  normal: Vertex3;
};
/**
 */
export type JscadMeshData = {
  vertices: number[];
  normals: number[];
  indices: number[];
  triangles: JscadMeshTriangle[];
};
const jscadEdgeThresholdDegrees = 30;
const hashPrecisionMultiplier = 10_000_000;

/**
 * Type guard to check if a shape has a color property
 *
 * @param shape - the value to check for a color property
 * @returns whether the shape has a numeric color array
 */
function hasColor(shape: unknown): shape is { color: number[] } {
  return (
    typeof shape === 'object' &&
    shape !== null &&
    'color' in shape &&
    Array.isArray((shape as Record<string, unknown>)['color'])
  );
}

/**
 * Extract color from JSCAD shape, returning normalized RGBA values
 * @param shape - JSCAD geometry object that may have a color property
 * @returns RGBA array [r, g, b, a] with values 0-1, or undefined if no color
 */
function extractColorFromShape(shape: unknown): [number, number, number, number] | undefined {
  if (!hasColor(shape)) {
    return undefined;
  }

  const { color } = shape;
  if (color.length < 3) {
    return undefined;
  }

  const r = color[0] ?? 0.8;
  const g = color[1] ?? 0.8;
  const b = color[2] ?? 0.8;
  const a = color[3] ?? 1;

  return [r, g, b, a];
}

function getShapeType(shape: unknown): string {
  if (shape === null) {
    return 'null';
  }
  if (shape === undefined) {
    return 'undefined';
  }
  if (typeof shape === 'object') {
    const ctorName = (shape as Record<string, unknown>).constructor.name;
    return ctorName ? String(ctorName) : 'Object';
  }

  return typeof shape;
}

function createShapeConversionError(shape: unknown, shapeIndex: number, error: unknown): Error {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return new Error(
    `Failed to convert shape at index ${shapeIndex} to GLTF polygon. Shape type: ${getShapeType(shape)}. ${errorMessage}`,
  );
}

/**
 */
export function normalizeJscadShapeForRenderMesh(
  shape: unknown,
  shapeIndex: number,
  modeling: JscadModeling,
): JscadGeom3 {
  try {
    const exportSource = modeling.geometries.geom3.clone(shape as JscadGeom3);
    return modeling.modifiers.generalize({ snap: true, triangulate: true }, exportSource) as JscadGeom3;
  } catch (error) {
    throw createShapeConversionError(shape, shapeIndex, error);
  }
}

function getRenderablePolygons(shape: unknown, shapeIndex: number, modeling: JscadModeling): JscadPolygon[] {
  const normalizedShape = normalizeJscadShapeForRenderMesh(shape, shapeIndex, modeling);
  try {
    return modeling.geometries.geom3.toPolygons(normalizedShape) as JscadPolygon[];
  } catch (error) {
    throw createShapeConversionError(shape, shapeIndex, error);
  }
}

function computeTriangleNormal(v1: JscadVec3, v2: JscadVec3, v3: JscadVec3): Vertex3 {
  const edge1X = v2[0] - v1[0];
  const edge1Y = v2[1] - v1[1];
  const edge1Z = v2[2] - v1[2];

  const edge2X = v3[0] - v1[0];
  const edge2Y = v3[1] - v1[1];
  const edge2Z = v3[2] - v1[2];

  let normalX = edge1Y * edge2Z - edge1Z * edge2Y;
  let normalY = edge1Z * edge2X - edge1X * edge2Z;
  let normalZ = edge1X * edge2Y - edge1Y * edge2X;

  const length = Math.hypot(normalX, normalY, normalZ);
  if (length > 0) {
    normalX /= length;
    normalY /= length;
    normalZ /= length;
  }

  return [normalX, normalY, normalZ];
}

function hashVertex(vertex: Vertex3): string {
  return `${Math.round(vertex[0] * hashPrecisionMultiplier)},${Math.round(vertex[1] * hashPrecisionMultiplier)},${Math.round(vertex[2] * hashPrecisionMultiplier)}`;
}

/**
 * Extract normalized surface and topology data from a JSCAD shape.
 *
 * Tau uses an export-only JSCAD normalization path that mirrors upstream
 * serializers: clone the source geometry, then run
 * `generalize({ snap: true, triangulate: true })`. GLB surfaces and
 * owner-local edge lines are derived from that normalized evidence without
 * mutating the original native shape.
 *
 * @internal
 *
 * @param shape - JSCAD geometry object
 * @param shapeIndex - index used for error context
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns Object containing flattened mesh data:
 *          - vertices: flat x,y,z coordinates
 *          - normals: flat normal vectors
 *          - indices: triangle indices
 *          - triangles: triangle metadata for topology edge extraction
 *
 * @see {@link jscadToGltf} — the public API that orchestrates these helpers
 */
export function extractMeshDataFromJscadShape(
  shape: unknown,
  shapeIndex: number,
  modeling: JscadModeling,
): JscadMeshData {
  const polygons = getRenderablePolygons(shape, shapeIndex, modeling);
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const triangles: JscadMeshTriangle[] = [];
  let vertexIndex = 0;

  for (const polygon of polygons) {
    const polyVertices = polygon.vertices;
    if (polyVertices.length < 3) {
      continue;
    }

    const firstVertex = polyVertices[0];
    if (!firstVertex) {
      continue;
    }

    for (let index = 1; index < polyVertices.length - 1; index++) {
      const vert1 = firstVertex;
      const vert2 = polyVertices[index];
      const vert3 = polyVertices[index + 1];

      if (!vert2 || !vert3) {
        continue;
      }

      const normal = computeTriangleNormal(vert1, vert2, vert3);
      const hash0 = hashVertex([vert1[0], vert1[1], vert1[2]]);
      const hash1 = hashVertex([vert2[0], vert2[1], vert2[2]]);
      const hash2 = hashVertex([vert3[0], vert3[1], vert3[2]]);
      if (hash0 === hash1 || hash1 === hash2 || hash2 === hash0) {
        continue;
      }

      vertices.push(vert1[0], vert1[1], vert1[2], vert2[0], vert2[1], vert2[2], vert3[0], vert3[1], vert3[2]);
      normals.push(normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]);
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      triangles.push({
        index0: vertexIndex,
        index1: vertexIndex + 1,
        index2: vertexIndex + 2,
        normal,
      });
      vertexIndex += 3;
    }
  }

  return { vertices, normals, indices, triangles };
}

/**
 * Extract JSCAD-owned edge lines from normalized triangle topology.
 *
 * This mirrors the fallback detector's boundary/sharp-edge semantics, but it
 * runs on JSCAD's upstream serializer-style export topology before middleware
 * fallback ever sees triangle soup. Coplanar internal segments introduced by
 * triangulation are suppressed by the dihedral classifier, while T-junctions
 * are split by JSCAD's `generalize({ triangulate: true })` path.
 *
 * @param meshData - normalized triangle data for one JSCAD part
 * @param thresholdDegrees - minimum dihedral angle to treat as a visible edge
 * @returns flattened line endpoint positions
 */
function extractTopologyEdgePositions(meshData: JscadMeshData, thresholdDegrees = jscadEdgeThresholdDegrees): number[] {
  return [
    ...detectEdges(new Float32Array(meshData.vertices), new Uint32Array(meshData.indices), thresholdDegrees).positions,
  ];
}

function createSequentialIndices(vertexCount: number): Uint32Array<ArrayBuffer> {
  const indices = new Uint32Array(vertexCount);
  for (let index = 0; index < indices.length; index++) {
    indices[index] = index;
  }

  return indices;
}

/**
 * Build a GlbNode from a single normalized JSCAD part.
 *
 * @param part - the normalized JSCAD part descriptor
 * @param transformOptions - coordinate-system and unit conversion options
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns the GlbNode, or undefined if no renderable geometry
 */
function buildNodeFromJscadPart(
  part: JscadPartDescriptor,
  transformOptions: GeometryOutputTransformOptions & { includeEdges?: boolean },
  modeling: JscadModeling,
): GlbNode | undefined {
  const { shape } = part;
  const color = extractColorFromShape(shape);
  const meshData = extractMeshDataFromJscadShape(shape, part.index, modeling);
  const { vertices, normals, indices } = meshData;

  if (vertices.length === 0 || indices.length === 0) {
    return undefined;
  }

  const positions = transformVertexArray(vertices, transformOptions);
  const normalsArray = transformNormalArray(normals, transformOptions);
  const indicesArray = new Uint32Array(indices);

  const baseColor: [number, number, number, number] = color ?? [0.8, 0.8, 0.8, 1];

  // JSCAD `colorize()` produces sRGB-encoded `[0..1]` tuples. glTF
  // `baseColorFactor` is linear-space — see docs/policy/color-space-policy.md.
  const linearBaseColor = srgbTupleToLinear(baseColor);

  const primitive: GlbPrimitive = {
    mode: Primitive.Mode['TRIANGLES']!,
    positions,
    normals: normalsArray,
    indices: indicesArray,
    material: {
      baseColorFactor: linearBaseColor,
      metallicFactor: cadMaterialDefaults.metalnessFactor,
      roughnessFactor: cadMaterialDefaults.roughnessFactor,
      doubleSided: true,
      alphaMode: linearBaseColor[3] < 1 ? 'BLEND' : 'OPAQUE',
    },
  };

  const primitives: GlbPrimitive[] = [primitive];
  const edgeVertices = transformOptions.includeEdges === true ? extractTopologyEdgePositions(meshData) : [];
  if (edgeVertices.length > 0) {
    const linePositions = transformVertexArray(edgeVertices, transformOptions);
    primitives.push({
      mode: Primitive.Mode['LINES']!,
      positions: linePositions,
      indices: createSequentialIndices(linePositions.length / 3),
      material: {
        ...cadEdgeOverlayMaterialDefaults,
        baseColorFactor: [...cadEdgeOverlayMaterialDefaults.baseColorFactor],
        extensions: {
          [KHRMaterialsUnlit.EXTENSION_NAME]: {},
        },
      },
    });
  }

  return {
    name: part.name,
    primitives,
  };
}

/**
 * Convert JSCAD geometry to GLTF Blob for rendering with full color support.
 *
 * Always produces spec-compliant GLTF with:
 * - Y-up coordinate system (per glTF specification)
 * - Meter units (per glTF specification)
 *
 * Public API for converting JSCAD geometries into renderable glTF format (GLB binary).
 * This is the primary integration point between the JSCAD CAD engine and the 3D viewer.
 *
 * Conversion pipeline:
 * 1. Normalizes JSCAD output using upstream flattening semantics and geometry filtering
 * 2. Builds export-only normalized evidence with JSCAD's triangle-export convention
 * 3. Creates a named mesh/node for each renderable part to preserve assembly structure
 * 4. Applies coordinate transformation (Z-up/mm to Y-up/meters)
 * 5. Creates GLB primitives with surface triangles, owner-local edge lines, normals, and colors
 * 6. Serializes to GLB (binary glTF) format for efficient transmission and storage
 *
 * Color support:
 * - Automatically detects and preserves colors applied via colorize() from @jscad/modeling
 * - Each shape gets its own mesh with its own material and color
 * - Supports both opaque and transparent colors (RGB and RGBA)
 * - Colors are defined as [R, G, B, A] arrays with values 0-1
 *
 * The function handles:
 * - Single shapes, arrays, nested arrays, or normalized part descriptors
 * - Colored and non-colored shapes (defaults to light gray)
 * - Empty geometry (returns valid GLB with empty scene)
 * - Throws error for invalid or unconvertible shapes
 *
 * Material properties are set to sensible defaults (matte, double-sided, low metalness)
 * suitable for preview visualization. For production export, use specialized exporters.
 *
 * @internal
 *
 * @param shape - JSCAD geometry object(s):
 *               - Single geom3/geom2 object (colored or default)
 *               - Array of geometry objects
 *               - Any shape produced by @jscad/modeling functions
 *               - Shapes created with colorize() will preserve their colors
 * @param transformOptions - coordinate-system and unit conversion options
 * @param modeling - resolved `@jscad/modeling` API from the kernel context
 * @returns GLB binary (binary glTF format)
 *
 * @throws {Error} If any shape cannot be converted to GLTF polygon
 *
 * @example <caption>Converting JSCAD shapes to glTF</caption>
 * ```typescript
 * const shape = primitives.cube({ size: 10 });
 * const glb = jscadToGltf(shape, {}, modeling);
 *
 * const redSphere = colors.colorize([1, 0, 0], primitives.sphere({ radius: 5 }));
 * const blueCube = colors.colorize([0, 0, 1, 0.5], primitives.cube({ size: 10 }));
 * const coloredGlb = jscadToGltf([redSphere, blueCube], {}, modeling);
 * ```
 */
export function jscadToGltf(
  shape: unknown,
  transformOptions: GeometryOutputTransformOptions & { includeEdges?: boolean },
  modeling: JscadModeling,
): Uint8Array<ArrayBuffer> {
  const parts = getRenderableJscadParts(shape, modeling);

  const nodes: GlbNode[] = [];
  for (const part of parts) {
    const node = buildNodeFromJscadPart(part, transformOptions, modeling);
    if (node) {
      nodes.push(node);
    }
  }

  const hasLinePrimitives = nodes.some((node) =>
    node.primitives.some((primitive) => primitive.mode === Primitive.Mode['LINES']),
  );
  const input: GlbInput = {
    nodes,
    ...(hasLinePrimitives ? { extensionsUsed: [KHRMaterialsUnlit.EXTENSION_NAME] } : {}),
  };
  return writeGlb(input);
}
