import { cadMaterialDefaults } from '@taucad/types/constants';
import type { Color, IndexedPolyhedron, VertexTransformFunction } from '#framework/common.js';
import { transformVerticesGltf } from '#framework/common.js';
import { srgbTupleToLinear } from '#utils/color-space.js';
import { writeGlb, writeGltfJson } from '#utils/glb-writer.js';
import type { GlbInput, GlbNode, GlbPrimitive } from '#utils/glb-writer.js';
import { formatShapeName } from '#utils/shape-names.js';

/**
 * Geometry data for a single color group, optimized for glTF primitive creation.
 *
 * Each color group becomes a separate primitive with its own material.
 * This approach (like Replicad) ensures proper rendering of opaque vs transparent geometry.
 */
type ColorGroupGeometry = {
  /** The RGBA color for this group's material */
  color: Color;
  /** Flattened vertex positions [x1,y1,z1, x2,y2,z2, ...] */
  positions: Float32Array<ArrayBuffer>;
  /** Triangle indices [i1,i2,i3, ...] */
  indices: Uint32Array<ArrayBuffer>;
  /** Per-vertex normals [nx1,ny1,nz1, ...] */
  normals: Float32Array<ArrayBuffer>;
};

/**
 * Convert RGBA color to a unique string key for grouping.
 * Uses fixed precision to handle floating point variations.
 *
 * @param color - the RGBA color tuple
 * @returns a comma-separated string key for the color
 */
function colorToKey(color: Color): string {
  return `${color[0].toFixed(4)},${color[1].toFixed(4)},${color[2].toFixed(4)},${color[3].toFixed(4)}`;
}

/**
 * Calculate the normal vector for a triangle using cross product.
 * The normal points in the direction determined by the right-hand rule
 * when traversing vertices v1 -> v2 -> v3 counter-clockwise.
 *
 * @param v1 - First vertex of the triangle
 * @param v2 - Second vertex of the triangle
 * @param v3 - Third vertex of the triangle
 * @returns Normalized normal vector [nx, ny, nz]
 */
function calculateTriangleNormal(
  v1: readonly [number, number, number],
  v2: readonly [number, number, number],
  v3: readonly [number, number, number],
): [number, number, number] {
  const edge1X = v2[0] - v1[0];
  const edge1Y = v2[1] - v1[1];
  const edge1Z = v2[2] - v1[2];

  const edge2X = v3[0] - v1[0];
  const edge2Y = v3[1] - v1[1];
  const edge2Z = v3[2] - v1[2];

  const normalX = edge1Y * edge2Z - edge1Z * edge2Y;
  const normalY = edge1Z * edge2X - edge1X * edge2Z;
  const normalZ = edge1X * edge2Y - edge1Y * edge2X;

  const length = Math.hypot(normalX, normalY, normalZ);

  if (length === 0) {
    return [0, 0, 1];
  }

  return [normalX / length, normalY / length, normalZ / length];
}

/**
 * Triangle data collected during face processing.
 */
type TriangleData = {
  v1: [number, number, number];
  v2: [number, number, number];
  v3: [number, number, number];
  normal: [number, number, number];
};

/**
 * Group faces by their unique color and convert to geometry arrays.
 * Each unique color becomes a separate ColorGroupGeometry.
 *
 * Transforms vertices using the provided transform function (defaults to Z-up → Y-up / mm → m).
 *
 * This approach (like Replicad) ensures:
 * - Opaque colors get OPAQUE materials
 * - Transparent colors get BLEND materials
 * - No vertex color issues with transparency
 *
 * @param meshData - the indexed polyhedron with vertices, faces, and colors
 * @param transform - vertex transform function (defaults to Y-up glTF-spec transform)
 * @returns array of color group geometries ready for primitive creation
 */
function groupFacesByColor(
  meshData: IndexedPolyhedron,
  transform: VertexTransformFunction = transformVerticesGltf,
): ColorGroupGeometry[] {
  const { vertices, faces, colors } = meshData;

  const colorGroups = new Map<string, { color: Color; triangles: TriangleData[] }>();

  for (const [faceIndex, face] of faces.entries()) {
    const faceColor: Color = colors[faceIndex] ?? [1, 1, 1, 1];

    if (face.length < 3) {
      continue;
    }

    const colorKey = colorToKey(faceColor);

    if (!colorGroups.has(colorKey)) {
      colorGroups.set(colorKey, { color: faceColor, triangles: [] });
    }

    const group = colorGroups.get(colorKey)!;

    for (let index = 1; index < face.length - 1; index++) {
      const index1 = face[0];
      const index2 = face[index];
      const index3 = face[index + 1];

      if (index1 === undefined || index2 === undefined || index3 === undefined) {
        continue;
      }

      const v1 = vertices[index1];
      const v2 = vertices[index2];
      const v3 = vertices[index3];

      if (!v1 || !v2 || !v3) {
        continue;
      }

      const transformedV1 = transform(v1);
      const transformedV2 = transform(v2);
      const transformedV3 = transform(v3);

      const normal = calculateTriangleNormal(transformedV1, transformedV2, transformedV3);

      group.triangles.push({
        v1: transformedV1,
        v2: transformedV2,
        v3: transformedV3,
        normal,
      });
    }
  }

  const geometries: ColorGroupGeometry[] = [];

  for (const { color, triangles } of colorGroups.values()) {
    if (triangles.length === 0) {
      continue;
    }

    const numberTriangles = triangles.length;
    const positions = new Float32Array(numberTriangles * 3 * 3);
    const normals = new Float32Array(numberTriangles * 3 * 3);
    const indices = new Uint32Array(numberTriangles * 3);

    let positionIndex = 0;
    let normalIndex = 0;

    for (let triIndex = 0; triIndex < numberTriangles; triIndex++) {
      const tri = triangles[triIndex]!;

      positions[positionIndex++] = tri.v1[0];
      positions[positionIndex++] = tri.v1[1];
      positions[positionIndex++] = tri.v1[2];

      positions[positionIndex++] = tri.v2[0];
      positions[positionIndex++] = tri.v2[1];
      positions[positionIndex++] = tri.v2[2];

      positions[positionIndex++] = tri.v3[0];
      positions[positionIndex++] = tri.v3[1];
      positions[positionIndex++] = tri.v3[2];

      normals[normalIndex++] = tri.normal[0];
      normals[normalIndex++] = tri.normal[1];
      normals[normalIndex++] = tri.normal[2];

      normals[normalIndex++] = tri.normal[0];
      normals[normalIndex++] = tri.normal[1];
      normals[normalIndex++] = tri.normal[2];

      normals[normalIndex++] = tri.normal[0];
      normals[normalIndex++] = tri.normal[1];
      normals[normalIndex++] = tri.normal[2];

      indices[triIndex * 3] = triIndex * 3;
      indices[triIndex * 3 + 1] = triIndex * 3 + 1;
      indices[triIndex * 3 + 2] = triIndex * 3 + 2;
    }

    geometries.push({
      color,
      positions,
      normals,
      indices,
    });
  }

  return geometries;
}

/**
 * Convert a ColorGroupGeometry into a GlbPrimitive with material properties.
 *
 * @param geometry - color-grouped mesh data with positions, normals, and indices
 * @returns primitive ready for GLB serialization
 */
function colorGroupToPrimitive(geometry: ColorGroupGeometry): GlbPrimitive {
  const { color, positions, indices, normals } = geometry;

  // `color` is sRGB-encoded `[0..1]` (e.g. parsed from OpenSCAD OFF integer
  // colors). glTF `baseColorFactor` is linear-space — see
  // docs/policy/color-space-policy.md.
  const linearBaseColor = srgbTupleToLinear(color);

  return {
    mode: 4,
    positions,
    normals,
    indices,
    material: {
      baseColorFactor: linearBaseColor,
      metallicFactor: cadMaterialDefaults.metalnessFactor,
      roughnessFactor: cadMaterialDefaults.roughnessFactor,
      doubleSided: true,
      alphaMode: linearBaseColor[3] < 1 ? 'BLEND' : 'OPAQUE',
    },
  };
}

/**
 * Build a GlbInput from an IndexedPolyhedron.
 *
 * @param meshData - the indexed polyhedron to convert
 * @param transform - vertex transform function
 * @returns the GlbInput for the writer
 */
function buildGlbInput(
  meshData: IndexedPolyhedron,
  transform: VertexTransformFunction = transformVerticesGltf,
): GlbInput {
  const colorGroups = groupFacesByColor(meshData, transform);
  const nodes: GlbNode[] = [];

  const primitives: GlbPrimitive[] = [];
  if (colorGroups.length === 0) {
    primitives.push({
      mode: 4,
      positions: new Float32Array([0, 0, 0]),
      normals: new Float32Array([0, 0, 1]),
      indices: new Uint32Array([0]),
      material: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: cadMaterialDefaults.metalnessFactor,
        roughnessFactor: cadMaterialDefaults.roughnessFactor,
        doubleSided: true,
        alphaMode: 'OPAQUE',
      },
    });
  } else {
    for (const colorGroup of colorGroups) {
      primitives.push(colorGroupToPrimitive(colorGroup));
    }
  }

  if (meshData.lines?.positions.length) {
    const originalLinePositions = meshData.lines.positions;
    const linePositions = new Float32Array(originalLinePositions.length);

    for (let index = 0; index < originalLinePositions.length; index += 3) {
      const x = originalLinePositions[index];
      const y = originalLinePositions[index + 1];
      const z = originalLinePositions[index + 2];

      if (x === undefined || y === undefined || z === undefined) {
        continue;
      }

      const vertex: [number, number, number] = [x, y, z];
      const transformed = transform(vertex);
      linePositions[index] = transformed[0];
      linePositions[index + 1] = transformed[1];
      linePositions[index + 2] = transformed[2];
    }

    const lineIndices = new Uint32Array(linePositions.length / 3);
    for (let index = 0; index < lineIndices.length; index++) {
      lineIndices[index] = index;
    }

    primitives.push({
      mode: 1,
      positions: linePositions,
      indices: lineIndices,
      material: {
        baseColorFactor: [0.141, 0.259, 0.141, 1],
        metallicFactor: 0,
        roughnessFactor: 1,
        doubleSided: true,
        alphaMode: 'OPAQUE',
      },
    });
  }

  nodes.push({ name: formatShapeName(0), primitives });

  return { nodes };
}

/**
 * Creates a GLB (binary glTF) byte array from mesh data with per-face colors.
 *
 * @param meshData - the polyhedron geometry to encode
 * @param transform - vertex transform function (defaults to Y-up glTF-spec transform)
 * @returns the GLB binary as a byte array
 */
export function createGlb(meshData: IndexedPolyhedron, transform?: VertexTransformFunction): Uint8Array<ArrayBuffer> {
  const input = buildGlbInput(meshData, transform);
  return writeGlb(input);
}

/**
 * Creates a self-contained glTF JSON file from mesh data with per-face colors.
 *
 * Binary data is base64-encoded inline so the result needs no separate `.bin` files.
 *
 * @param meshData - the polyhedron geometry to encode
 * @param transform - vertex transform function (defaults to Y-up glTF-spec transform)
 * @returns the glTF JSON as a UTF-8-encoded byte array
 */
export function createGltf(meshData: IndexedPolyhedron, transform?: VertexTransformFunction): Uint8Array<ArrayBuffer> {
  const input = buildGlbInput(meshData, transform);
  return writeGltfJson(input);
}
