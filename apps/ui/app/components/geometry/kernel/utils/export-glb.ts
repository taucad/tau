import type { Primitive } from '@gltf-transform/core';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Color, IndexedPolyhedron } from '#components/geometry/kernel/utils/common.js';
import { transformVerticesGltf } from '#components/geometry/kernel/utils/common.js';

/**
 * Geometry data optimized for glTF primitive creation.
 *
 * This represents the final triangulated mesh data that will be directly used
 * to create glTF primitives. All faces from the original polyhedron are
 * converted to triangles using fan triangulation.
 */
type GeometryData = {
  /**
   * Flattened array of vertex positions in 3D space.
   *
   * Format: [x1, y1, z1, x2, y2, z2, ...]
   * - Each vertex uses 3 consecutive Float32 values (x, y, z coordinates)
   * - Total length = (number of triangles × 3 vertices per triangle × 3 components)
   * - Used as the POSITION attribute in glTF
   *
   * @example
   * // For 2 triangles:
   * // Triangle 1: vertices at (0,0,0), (1,0,0), (0,1,0)
   * // Triangle 2: vertices at (1,0,0), (1,1,0), (0,1,0)
   * positions = [0,0,0, 1,0,0, 0,1,0, 1,0,0, 1,1,0, 0,1,0]
   */
  positions: Float32Array;

  /**
   * Triangle vertex indices for indexed rendering.
   *
   * Format: [idx1, idx2, idx3, idx4, idx5, idx6, ...]
   * - Each triangle uses 3 consecutive indices
   * - Indices reference positions in the positions array (groups of 3)
   * - For non-indexed geometry, this is typically sequential: [0,1,2,3,4,5,...]
   * - Total length = (number of triangles × 3 indices per triangle)
   *
   * @example
   * // For 2 triangles with 6 vertices:
   * indices = [0,1,2, 3,4,5]
   * // Triangle 1 uses vertices 0,1,2 from positions array
   * // Triangle 2 uses vertices 3,4,5 from positions array
   */
  indices: Uint32Array;

  /**
   * Per-vertex color data (optional).
   *
   * Format: [r1, g1, b1, r2, g2, b2, ...]
   * - Each vertex uses 3 consecutive Float32 values (RGB components)
   * - Color values are in range [0.0, 1.0]
   * - Same length as positions array (both have 3 components per vertex)
   * - Used as the COLOR_0 attribute in glTF
   * - If undefined, the primitive will use the material's base color
   *
   * Note: Face colors from IndexedPolyhedron are replicated to all vertices
   * of triangles created from that face during triangulation.
   *
   * @example
   * // For 2 triangles (6 vertices), first triangle red, second blue:
   * colors = [1,0,0, 1,0,0, 1,0,0, 0,0,1, 0,0,1, 0,0,1]
   */
  colors?: Float32Array;
};

/**
 * Create a primitive from geometry data
 */
function createPrimitive(document: Document, baseColorFactor: Color, geometry: GeometryData): Primitive {
  const { positions, indices, colors } = geometry;

  const material = document
    .createMaterial()
    .setDoubleSided(true)
    .setAlphaMode('OPAQUE')
    .setMetallicFactor(0)
    .setRoughnessFactor(0.8)
    .setBaseColorFactor([...baseColorFactor, 1]); // Add alpha component

  const primitive = document
    .createPrimitive()
    .setMode(4) // TRIANGLES mode
    .setMaterial(material)
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices));

  if (colors) {
    primitive.setAttribute('COLOR_0', document.createAccessor().setType('VEC3').setArray(colors));
  }

  return primitive;
}

/**
 * Convert mesh data to geometry arrays suitable for glTF
 */
function convertMeshToGeometry(meshData: IndexedPolyhedron, enableTransform: boolean): GeometryData {
  const { vertices, faces, colors } = meshData;

  // Calculate total number of triangles
  let totalTriangles = 0;
  for (const face of faces) {
    if (face.length >= 3) {
      totalTriangles += face.length - 2; // Fan triangulation
    }
  }

  const positions = new Float32Array(totalTriangles * 3 * 3); // 3 vertices per triangle, 3 components per vertex
  const indices = new Uint32Array(totalTriangles * 3); // 3 indices per triangle
  const vertexColors = new Float32Array(totalTriangles * 3 * 3); // 3 vertices per triangle, 3 components per color

  let positionIndex = 0;
  let colorIndex = 0;
  let triangleIndex = 0;

  // Process each face
  for (const [faceIdx, face] of faces.entries()) {
    const faceColor = colors[faceIdx] ?? [1, 1, 1]; // Default to white

    if (face.length < 3) {
      continue; // Skip invalid faces
    }

    // Triangulate face using fan triangulation
    for (let i = 1; i < face.length - 1; i++) {
      const idx1 = face[0];
      const idx2 = face[i];
      const idx3 = face[i + 1];

      if (idx1 === undefined || idx2 === undefined || idx3 === undefined) {
        continue;
      }

      const v1 = vertices[idx1];
      const v2 = vertices[idx2];
      const v3 = vertices[idx3];

      if (!v1 || !v2 || !v3) {
        continue;
      }

      // Transform vertices from z-up to y-up coordinate system and convert units (mm to m)
      let transformedV1 = v1;
      let transformedV2 = v2;
      let transformedV3 = v3;
      if (enableTransform) {
        transformedV1 = transformVerticesGltf(v1);
        transformedV2 = transformVerticesGltf(v2);
        transformedV3 = transformVerticesGltf(v3);
      }

      // Add positions
      positions[positionIndex++] = transformedV1[0];
      positions[positionIndex++] = transformedV1[1];
      positions[positionIndex++] = transformedV1[2];

      positions[positionIndex++] = transformedV2[0];
      positions[positionIndex++] = transformedV2[1];
      positions[positionIndex++] = transformedV2[2];

      positions[positionIndex++] = transformedV3[0];
      positions[positionIndex++] = transformedV3[1];
      positions[positionIndex++] = transformedV3[2];

      // Add colors (same color for all vertices of this triangle)
      vertexColors[colorIndex++] = faceColor[0];
      vertexColors[colorIndex++] = faceColor[1];
      vertexColors[colorIndex++] = faceColor[2];

      vertexColors[colorIndex++] = faceColor[0];
      vertexColors[colorIndex++] = faceColor[1];
      vertexColors[colorIndex++] = faceColor[2];

      vertexColors[colorIndex++] = faceColor[0];
      vertexColors[colorIndex++] = faceColor[1];
      vertexColors[colorIndex++] = faceColor[2];

      // Add triangle indices
      indices[triangleIndex * 3] = triangleIndex * 3;
      indices[triangleIndex * 3 + 1] = triangleIndex * 3 + 1;
      indices[triangleIndex * 3 + 2] = triangleIndex * 3 + 2;
      triangleIndex++;
    }
  }

  // Trim arrays to actual size used
  const actualPositions = positions.slice(0, positionIndex);
  const actualColors = vertexColors.slice(0, colorIndex);
  const actualIndices = indices.slice(0, triangleIndex * 3);

  return {
    positions: actualPositions,
    indices: actualIndices,
    colors: actualColors.length > 0 ? actualColors : undefined,
  };
}

/**
 * Create a GLTF document from mesh data (shared between GLB and GLTF exports)
 */
function createGltfDocument(meshData: IndexedPolyhedron, enableTransform: boolean): Document {
  const document = new Document();
  document.createBuffer();

  const scene = document.createScene();
  const mesh = document.createMesh();

  // Convert mesh data to geometry
  const geometry = convertMeshToGeometry(meshData, enableTransform);

  if (geometry.positions.length === 0) {
    // Create a simple point if no geometry
    const emptyGeometry: GeometryData = {
      positions: new Float32Array([0, 0, 0]),
      indices: new Uint32Array([0]),
    };
    const primitive = createPrimitive(document, [1, 1, 1], emptyGeometry);
    mesh.addPrimitive(primitive);
  } else {
    // Use default white color for the entire mesh
    const primitive = createPrimitive(document, [1, 1, 1], geometry);
    mesh.addPrimitive(primitive);
  }

  const node = document.createNode().setMesh(mesh);
  scene.addChild(node);

  // Add lines as a separate mesh if available
  if (meshData.lines?.positions.length) {
    const linesMesh = document.createMesh();

    // Create line geometry - convert flat positions to Float32Array and transform coordinates
    const originalLinePositions = meshData.lines.positions;
    const linePositions = new Float32Array(originalLinePositions.length);

    // Transform line positions from z-up to y-up coordinate system and convert units (mm to m)
    for (let i = 0; i < originalLinePositions.length; i += 3) {
      const x = originalLinePositions[i];
      const y = originalLinePositions[i + 1];
      const z = originalLinePositions[i + 2];

      if (x === undefined || y === undefined || z === undefined) {
        continue;
      }

      const vertex: [number, number, number] = [x, y, z];
      const transformed = transformVerticesGltf(vertex);
      linePositions[i] = transformed[0];
      linePositions[i + 1] = transformed[1];
      linePositions[i + 2] = transformed[2];
    }

    // Create line indices - each pair of positions forms a line
    const lineIndices = new Uint32Array(linePositions.length / 3);
    for (let i = 0; i < lineIndices.length; i++) {
      lineIndices[i] = i;
    }

    const lineMaterial = document
      .createMaterial()
      .setDoubleSided(true)
      .setAlphaMode('OPAQUE')
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setBaseColorFactor([0.141, 0.259, 0.141, 1]); // #244224 color

    const linePrimitive = document
      .createPrimitive()
      .setMode(1) // LINES mode
      .setMaterial(lineMaterial)
      .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(linePositions))
      .setIndices(document.createAccessor().setType('SCALAR').setArray(lineIndices));

    linesMesh.addPrimitive(linePrimitive);

    // Add lines mesh to scene with a special name for identification
    const linesNode = document.createNode().setMesh(linesMesh);
    scene.addChild(linesNode);
  }

  return document;
}

/**
 * Create a GLB (binary GLTF) blob from mesh data with colors
 */
export async function createGlb(meshData: IndexedPolyhedron, enableTransform: boolean): Promise<Blob> {
  const document = createGltfDocument(meshData, enableTransform);
  const glbBuffer = await new NodeIO().writeBinary(document);
  return new Blob([glbBuffer], { type: 'model/gltf-binary' });
}

/**
 * Create a GLTF (JSON format) blob from mesh data with colors
 * Note: This creates a self-contained GLTF with embedded binary data
 */
export async function createGltf(meshData: IndexedPolyhedron, enableTransform: boolean): Promise<Blob> {
  const document = createGltfDocument(meshData, enableTransform);

  // Use writeJSON which returns both the JSON and binary data
  const gltfData = await new NodeIO().writeJSON(document);

  // For a self-contained GLTF file, we need to embed the binary data as base64
  // This creates a single .gltf file that doesn't require separate .bin files
  const gltfJson = gltfData.json;

  // If there are resources, embed them as data URIs
  const { resources } = gltfData;
  const buffers = gltfJson.buffers ?? [];

  for (const [resourceKey, resourceData] of Object.entries(resources)) {
    // Find the buffer that references this resource
    const bufferIndex = buffers.findIndex((buffer) => buffer.uri === resourceKey);
    const buffer = buffers[bufferIndex];
    if (buffer) {
      // Convert binary data to base64 using browser-compatible method
      const uint8Array = new Uint8Array(resourceData);
      let binaryString = '';
      for (const byte of uint8Array) {
        binaryString += String.fromCodePoint(byte);
      }

      // eslint-disable-next-line no-restricted-globals -- btoa is available in browsers
      const base64Data = btoa(binaryString);

      buffer.uri = `data:application/octet-stream;base64,${base64Data}`;
    }
  }

  // Convert to pretty-printed JSON string
  const gltfString = JSON.stringify(gltfJson, undefined, 2);

  return new Blob([gltfString], { type: 'model/gltf+json' });
}
