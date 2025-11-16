import { geometries, maths } from '@jscad/modeling';
import type { Primitive } from '@gltf-transform/core';
import { Document, NodeIO } from '@gltf-transform/core';

/**
 * Extract triangulated mesh data from JSCAD shapes
 *
 * Processes JSCAD geometries (geom3 objects) and converts them into WebGL-compatible
 * mesh data with vertex positions, surface normals, and triangle indices. This function
 * handles multiple shapes and performs polygon extraction and triangulation.
 *
 * Key operations:
 * 1. Extracts polygons from each JSCAD geom3 object using geometries.geom3.toPolygons()
 * 2. Calculates smooth surface normals using cross products of polygon edges
 * 3. Triangulates polygons using fan triangulation (simple and fast method)
 * 4. Flattens data into Float32Array-compatible formats for GPU rendering
 *
 * The function throws an error if any shape cannot be converted to a geom3 polygon.
 * Polygons with fewer than 3 vertices are skipped as they cannot form triangles.
 * All three vertices of each triangle share the same normal (flat shading).
 *
 * @param shapes - Array of JSCAD geometry objects (typically geom3 type)
 * @returns Object containing flattened mesh data:
 *          - vertices: Flat array of x,y,z coordinates [x1,y1,z1,x2,y2,z2,...]
 *          - normals: Flat array of normal vectors (one per vertex) [nx1,ny1,nz1,...]
 *          - indices: Triangle indices pointing into vertex array [v0,v1,v2,v3,v4,v5,...]
 *
 * @internal This is a helper function. For public API, see jscadToGltf().
 *
 * @example
 * ```typescript
 * // JSCAD shapes from user code execution
 * const { vertices, normals, indices } = extractMeshDataFromJscadShapes([sphere, cube]);
 * // vertices: [0, 0, 0, 1, 0, 0, 1, 1, 0, ...]  (flat XYZ coordinates)
 * // normals: [0, 0, 1, 0, 0, 1, 0.707, 0.707, 0, ...]  (normalized direction vectors)
 * // indices: [0, 1, 2, 3, 4, 5, ...]  (triangle vertex indices)
 * ```
 */
function extractMeshDataFromJscadShapes(shapes: unknown[]): {
  vertices: number[];
  normals: number[];
  indices: number[];
} {
  // Collect all polygons from all shapes
  const allPolygons: Array<{ vertices: maths.vec3.Vec3[] }> = [];
  for (const [index, singleShape] of shapes.entries()) {
    try {
      const polygons = geometries.geom3.toPolygons(singleShape as geometries.geom3.Geom3);
      allPolygons.push(...polygons);
    } catch (error) {
      // Determine shape type for error message
      let shapeType: string;
      if (singleShape === null) {
        shapeType = 'null';
      } else if (singleShape === undefined) {
        shapeType = 'undefined';
      } else if (typeof singleShape === 'object') {
        // Handle objects (including arrays, typed arrays, etc.)
        const ctorName = (singleShape as Record<string, unknown>).constructor.name;
        shapeType = ctorName ? String(ctorName) : 'Object';
      } else {
        shapeType = typeof singleShape;
      }

      const errorMessage = error instanceof Error ? error.message : String(error);

      throw new Error(
        `Failed to convert shape at index ${index} to GLTF polygon. Shape type: ${shapeType}. ${errorMessage}`,
      );
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
 *
 * Constructs a complete glTF primitive (mesh component) from pre-processed vertex data.
 * This includes geometry attributes (positions, normals), indices, and material properties.
 *
 * Material setup:
 * - Double-sided rendering enabled for robustness (handles reversed normals)
 * - Metallic: 0.1 (slightly reflective, mostly matte)
 * - Roughness: 0.7 (matte surface)
 * - Base color: Light gray [0.8, 0.8, 0.8, 1.0] for neutral appearance
 *
 * Primitive mode 4 specifies TRIANGLES (each 3 indices = 1 triangle).
 *
 * @param document - glTF Document to create mesh components within
 * @param vertices - Flat array of vertex positions [x1,y1,z1,x2,y2,z2,...]
 * @param normals - Flat array of normals [nx1,ny1,nz1,nx2,ny2,nz2,...]
 * @param indices - Flat array of triangle indices [v0,v1,v2,v3,v4,v5,...]
 * @returns Configured glTF Primitive ready to be added to a Mesh
 *
 * @internal This is a helper function. For public API, see jscadToGltf().
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
 *
 * Orchestrates the complete conversion pipeline from JSCAD geometries to a glTF document.
 * This function:
 * 1. Creates a new glTF Document with a buffer
 * 2. Creates a scene and extracts mesh data from all shapes
 * 3. Creates a mesh with a primitive containing the geometry
 * 4. Adds the mesh to the scene
 *
 * If no valid geometry is extracted (empty vertices or indices), the scene contains no mesh
 * but the document is still valid (which jscadToGltf handles by checking for empty geometry).
 *
 * @param shapes - Array of JSCAD geometry objects to convert
 * @returns Complete glTF Document ready for serialization to GLB format
 *
 * @internal This is a helper function. For public API, see jscadToGltf().
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
 * Public API for converting JSCAD geometries into renderable glTF format (GLB binary).
 * This is the primary integration point between the JSCAD CAD engine and the 3D viewer.
 *
 * Conversion pipeline:
 * 1. Normalizes input to array format (single shape -> [shape])
 * 2. Creates glTF document with mesh data extraction, triangulation, and normals
 * 3. Serializes to GLB (binary glTF) format for efficient transmission and storage
 *
 * The function handles:
 * - Single shapes or arrays of shapes
 * - Empty geometry (returns valid GLB with empty scene)
 * - Throws error for invalid or unconvertible shapes
 *
 * Material properties are set to sensible defaults (light gray, matte, double-sided)
 * suitable for preview visualization. For production export, use specialized exporters.
 *
 * @param shape - JSCAD geometry object(s):
 *               - Single geom3/geom2 object
 *               - Array of geometry objects
 *               - Any shape produced by @jscad/modeling functions
 * @returns Promise resolving to GLB Blob (binary glTF format)
 *          Type: 'model/gltf-binary'
 *
 * @throws {Error} If any shape cannot be converted to GLTF polygon
 * @throws May reject if glTF serialization fails (rare, typically only for memory issues)
 *
 * @example
 * ```typescript
 * import { box } from '@jscad/modeling/primitives';
 * import { jscadToGltf } from '#components/geometry/kernel/jscad/jscad-to-gltf.js';
 *
 * const shape = box({ size: 10 });
 * const gltfBlob = await jscadToGltf(shape);
 * // Use gltfBlob with Three.js or other WebGL viewers
 * ```
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
