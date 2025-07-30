import type { Primitive } from '@gltf-transform/core';
import { Document, NodeIO } from '@gltf-transform/core';
import { normalizeColor } from '#components/geometry/kernel/replicad/utils/normalize-color.js';
import { transformVerticesGltf } from '#components/geometry/kernel/utils/common.js';
import type { Geometry3D } from '#types/cad.types.js';

/**
 * Transform a flat array of vertex positions from z-up to y-up coordinate system and convert units
 *
 * This is necessary as Replicad uses z-up coordinates and millimeter units,
 * while glTF uses y-up coordinates and meter units.
 */
function transformVertexArray(vertices: number[]): Float32Array {
  const transformedVertices = new Float32Array(vertices.length);

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];

    if (x === undefined || y === undefined || z === undefined) {
      continue;
    }

    const vertex: [number, number, number] = [x, y, z];
    const transformed = transformVerticesGltf(vertex);
    transformedVertices[i] = transformed[0];
    transformedVertices[i + 1] = transformed[1];
    transformedVertices[i + 2] = transformed[2];
  }

  return transformedVertices;
}

/**
 * Create a glTF primitive directly from replicad Shape3D data
 * This preserves the original triangulation from replicad without re-triangulating
 */
function createPrimitiveFromReplicadShape(document: Document, shape: Geometry3D): Primitive {
  const { faces } = shape;
  const { vertices: vertexData, triangles, normals } = faces;

  // Convert flat arrays to typed arrays and transform coordinates
  const positions = transformVertexArray(vertexData);
  const indices = new Uint32Array(triangles);
  const normalsArray = transformVertexArray(normals);

  // Handle color - normalize and convert to RGB array
  let baseColor: [number, number, number, number] = [0.8, 0.8, 0.8, 1]; // Default light gray
  if (shape.color) {
    try {
      const normalizedColor = normalizeColor(shape.color);
      // Convert hex to RGB (normalize color returns hex)
      const hex = normalizedColor.color;
      const r = Number.parseInt(hex.slice(1, 3), 16) / 255;
      const g = Number.parseInt(hex.slice(3, 5), 16) / 255;
      const b = Number.parseInt(hex.slice(5, 7), 16) / 255;
      // Use alpha from normalization, but allow shape.opacity to override
      const alpha = shape.opacity ?? normalizedColor.alpha;
      baseColor = [r, g, b, alpha];
    } catch (error) {
      console.warn('Failed to parse color:', shape.color, error);
      throw new Error('Failed to parse color', { cause: error });
    }
  } else {
    console.log('No color specified for shape, using default light gray');
  }

  // Create material
  const material = document
    .createMaterial()
    .setDoubleSided(true)
    .setMetallicFactor(0.1)
    .setRoughnessFactor(0.7)
    .setBaseColorFactor(baseColor);

  if (shape.color) {
    material.setName(shape.color);
  } else {
    material.setName(`default`);
  }

  // Set alpha mode based on opacity
  if (baseColor[3] < 1) {
    material.setAlphaMode('BLEND');
  } else {
    material.setAlphaMode('OPAQUE');
  }

  // Create primitive with replicad's triangulated data
  const primitive = document
    .createPrimitive()
    .setMode(4) // TRIANGLES mode
    .setMaterial(material)
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indices));

  // Add normals
  primitive.setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(normalsArray));

  return primitive;
}

/**
 * Create line primitive from replicad edge data
 */
function createLinePrimitiveFromReplicadEdges(
  document: Document,
  edges: Geometry3D['edges'],
  name: string,
): Primitive | undefined {
  if (edges.lines.length === 0) {
    return undefined;
  }

  // Convert edges to typed arrays and transform coordinates
  const linePositions = transformVertexArray(edges.lines);

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
    .setName(`outline-${name}`)
    .setBaseColorFactor([0.141, 0.259, 0.141, 1]); // #244224 color

  const linePrimitive = document
    .createPrimitive()
    .setMode(1) // LINES mode
    .setMaterial(lineMaterial)
    .setName(`outline-${name}`)
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(linePositions))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(lineIndices));

  return linePrimitive;
}

/**
 * Create a GLTF document directly from replicad Shape3D data
 * This preserves the original triangulation without re-triangulating
 */
function createGltfDocumentFromReplicadShapes(shapes: Geometry3D[]): Document {
  const document = new Document();
  document.createBuffer();

  const scene = document.createScene();

  // Process each shape as a separate mesh to preserve individual materials/colors
  for (const [shapeIndex, shape] of shapes.entries()) {
    const mesh = document.createMesh();

    // Add main surface primitive
    if (shape.faces.vertices.length > 0 && shape.faces.triangles.length > 0) {
      const surfacePrimitive = createPrimitiveFromReplicadShape(document, shape);
      mesh.addPrimitive(surfacePrimitive);
    }

    // Add line primitive for edges if available
    const linePrimitive = createLinePrimitiveFromReplicadEdges(document, shape.edges, shape.name);
    if (linePrimitive) {
      mesh.addPrimitive(linePrimitive);
    }

    // Add mesh to scene only if it has primitives
    if (mesh.listPrimitives().length > 0) {
      const node = document.createNode().setMesh(mesh);

      // Set node name if shape has a name
      if (shape.name) {
        node.setName(shape.name);
      } else {
        node.setName(`Shape_${shapeIndex}`);
      }

      scene.addChild(node);
    }
  }

  return document;
}

/**
 * Convert replicad shapes to GLB blob format (preserving original triangulation)
 */
async function createGlbFromReplicadShapes(shapes: Geometry3D[]): Promise<Blob> {
  const document = createGltfDocumentFromReplicadShapes(shapes);
  const glbBuffer = await new NodeIO().writeBinary(document);
  return new Blob([glbBuffer], { type: 'model/gltf-binary' });
}

/**
 * Convert replicad shapes to GLTF blob format (preserving original triangulation)
 */
async function createGltfFromReplicadShapes(shapes: Geometry3D[]): Promise<Blob> {
  const document = createGltfDocumentFromReplicadShapes(shapes);

  // Use writeJSON which returns both the JSON and binary data
  const gltfData = await new NodeIO().writeJSON(document);

  // For a self-contained GLTF file, we need to embed the binary data as base64
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

/**
 * Convert replicad shapes to GLTF blob format
 * @param shapes - Array of Shape3D objects from replicad
 * @param format - Output format: 'glb' for binary, 'gltf' for JSON
 * @returns GLTF blob
 *
 * This function preserves the original triangulation from replicad without re-triangulating,
 * resulting in better rendering quality and performance.
 */
export async function convertReplicadShapesToGltf(shapes: Geometry3D[], format: 'glb' | 'gltf' = 'glb'): Promise<Blob> {
  if (format === 'gltf') {
    return createGltfFromReplicadShapes(shapes);
  }

  return createGlbFromReplicadShapes(shapes);
}
