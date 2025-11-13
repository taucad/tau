import { geometries, maths } from '@jscad/modeling';
import type { Primitive } from '@gltf-transform/core';
import { Document, NodeIO } from '@gltf-transform/core';

/**
 * Extract triangulated mesh data from JSCAD shapes
 */
function extractMeshDataFromJscadShapes(shapes: unknown[]): {
  vertices: number[];
  normals: number[];
  indices: number[];
} {
  // Collect all polygons from all shapes
  const allPolygons: Array<{ vertices: maths.vec3.Vec3[] }> = [];
  for (const singleShape of shapes) {
    try {
      const polygons = geometries.geom3.toPolygons(singleShape as geometries.geom3.Geom3);
      allPolygons.push(...polygons);
    } catch {
      // Skip if not a valid geom3
      continue;
    }
  }

  // Build a mesh from the polygons with proper normals
  const vertices: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  let vertexIndex = 0;

  for (const polygon of allPolygons) {
    const polyVertices = polygon.vertices;
    if (polyVertices.length < 3) {
      continue;
    }

    // Calculate polygon normal using cross product
    const v1 = polyVertices[0];
    const v2 = polyVertices[1];
    const v3 = polyVertices[2];

    if (!v1 || !v2 || !v3) {
      continue;
    }

    // Compute edges
    const edge1 = maths.vec3.subtract(maths.vec3.create(), v2, v1);
    const edge2 = maths.vec3.subtract(maths.vec3.create(), v3, v1);

    // Compute normal via cross product
    const normal = maths.vec3.cross(maths.vec3.create(), edge1, edge2);
    maths.vec3.normalize(normal, normal);

    // Triangulate the polygon (simple fan triangulation)
    const firstVertex = polyVertices[0];
    if (!firstVertex) {
      continue;
    }

    for (let i = 1; i < polyVertices.length - 1; i++) {
      const vert1 = firstVertex;
      const vert2 = polyVertices[i];
      const vert3 = polyVertices[i + 1];

      if (!vert2 || !vert3) {
        continue;
      }

      // Add vertices
      vertices.push(vert1[0], vert1[1], vert1[2], vert2[0], vert2[1], vert2[2], vert3[0], vert3[1], vert3[2]);

      // Add the same normal for all three vertices of this triangle
      normals.push(normal[0], normal[1], normal[2], normal[0], normal[1], normal[2], normal[0], normal[1], normal[2]);

      // Add indices
      indices.push(vertexIndex, vertexIndex + 1, vertexIndex + 2);
      vertexIndex += 3;
    }
  }

  return { vertices, normals, indices };
}

/**
 * Create a glTF primitive from JSCAD mesh data
 */
function createPrimitiveFromJscadMesh(
  document: Document,
  vertices: number[],
  normals: number[],
  indices: number[],
): Primitive {
  // Convert to typed arrays
  const positions = new Float32Array(vertices);
  const normalsArray = new Float32Array(normals);
  const indicesArray = new Uint32Array(indices);

  // Create material with default styling
  const material = document
    .createMaterial()
    .setDoubleSided(true)
    .setMetallicFactor(0.1)
    .setRoughnessFactor(0.7)
    .setBaseColorFactor([0.8, 0.8, 0.8, 1]); // Light gray

  // Create primitive with triangulated data
  const primitive = document
    .createPrimitive()
    .setMode(4) // TRIANGLES mode
    .setMaterial(material)
    .setAttribute('POSITION', document.createAccessor().setType('VEC3').setArray(positions))
    .setAttribute('NORMAL', document.createAccessor().setType('VEC3').setArray(normalsArray))
    .setIndices(document.createAccessor().setType('SCALAR').setArray(indicesArray));

  return primitive;
}

/**
 * Create a GLTF document from JSCAD shapes
 */
function createGltfDocumentFromJscadShapes(shapes: unknown[]): Document {
  const document = new Document();
  document.createBuffer();

  const scene = document.createScene();

  // Extract mesh data from all shapes
  const { vertices, normals, indices } = extractMeshDataFromJscadShapes(shapes);

  // Only create mesh if we have geometry
  if (vertices.length > 0 && indices.length > 0) {
    const mesh = document.createMesh();
    const primitive = createPrimitiveFromJscadMesh(document, vertices, normals, indices);
    mesh.addPrimitive(primitive);

    const node = document.createNode().setMesh(mesh).setName('JSCAD_Geometry');
    scene.addChild(node);
  }

  return document;
}

/**
 * Convert JSCAD geometry to GLTF Blob for rendering
 *
 * @param shape - JSCAD geom2, geom3 object, or array of geometries
 * @returns GLTF blob
 */
export async function jscadToGltf(shape: unknown): Promise<Blob> {
  // Handle array of geometries
  const shapes = Array.isArray(shape) ? shape : [shape];

  // Create GLTF document using gltf-transform
  const document = createGltfDocumentFromJscadShapes(shapes);

  // Write as GLB binary format
  const glbBuffer = await new NodeIO().writeBinary(document);
  return new Blob([glbBuffer], { type: 'model/gltf-binary' });
}
