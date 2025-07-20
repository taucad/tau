import type { Primitive } from '@gltf-transform/core';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Color, IndexedPolyhedron } from '~/components/geometry/kernel/utils/common.js';

type GeometryData = {
  positions: Float32Array;
  indices: Uint32Array;
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
function convertMeshToGeometry(meshData: IndexedPolyhedron): GeometryData {
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

      // Add positions
      positions[positionIndex++] = v1[0];
      positions[positionIndex++] = v1[1];
      positions[positionIndex++] = v1[2];

      positions[positionIndex++] = v2[0];
      positions[positionIndex++] = v2[1];
      positions[positionIndex++] = v2[2];

      positions[positionIndex++] = v3[0];
      positions[positionIndex++] = v3[1];
      positions[positionIndex++] = v3[2];

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
function createGltfDocument(meshData: IndexedPolyhedron): Document {
  const document = new Document();
  document.createBuffer();

  const scene = document.createScene();
  const mesh = document.createMesh();

  // Convert mesh data to geometry
  const geometry = convertMeshToGeometry(meshData);

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

  scene.addChild(document.createNode().setMesh(mesh));

  return document;
}

/**
 * Create a GLB (binary GLTF) blob from mesh data with colors
 */
export async function createGlb(meshData: IndexedPolyhedron): Promise<Blob> {
  const document = createGltfDocument(meshData);
  const glbBuffer = await new NodeIO().writeBinary(document);
  return new Blob([glbBuffer], { type: 'model/gltf-binary' });
}

/**
 * Create a GLTF (JSON format) blob from mesh data with colors
 * Note: This creates a self-contained GLTF with embedded binary data
 */
export async function createGltf(meshData: IndexedPolyhedron): Promise<Blob> {
  const document = createGltfDocument(meshData);

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
