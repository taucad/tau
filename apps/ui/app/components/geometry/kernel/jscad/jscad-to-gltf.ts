import { geometries, maths } from '@jscad/modeling';
import type { Primitive } from '@gltf-transform/core';
import { Document, NodeIO } from '@gltf-transform/core';

/**
 * Type guard to check if a shape has a color property
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

  // JSCAD colors are already in 0-1 range
  const r = color[0] ?? 0.8;
  const g = color[1] ?? 0.8;
  const b = color[2] ?? 0.8;
  const a = color[3] ?? 1;

  return [r, g, b, a];
}

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
 * - Base color: Provided color or light gray [0.8, 0.8, 0.8, 1.0] for neutral appearance
 * - Alpha mode: BLEND if color has transparency, otherwise OPAQUE
 *
 * Primitive mode 4 specifies TRIANGLES (each 3 indices = 1 triangle).
 *
 * @param document - glTF Document to create mesh components within
 * @param meshData - Object containing mesh data and optional color
 * @returns Configured glTF Primitive ready to be added to a Mesh
 *
 * @internal This is a helper function. For public API, see jscadToGltf().
 */
function createPrimitiveFromJscadMesh(
  document: Document,
  meshData: {
    vertices: number[];
    normals: number[];
    indices: number[];
    color?: [number, number, number, number];
  },
): Primitive {
  const { vertices, normals, indices, color } = meshData;

  // Convert to typed arrays
  const positions = new Float32Array(vertices);
  const normalsArray = new Float32Array(normals);
  const indicesArray = new Uint32Array(indices);

  // Use provided color or default to light gray
  const baseColor: [number, number, number, number] = color ?? [0.8, 0.8, 0.8, 1];

  // Create material with color styling
  const material = document
    .createMaterial()
    .setDoubleSided(true)
    .setMetallicFactor(0.1)
    .setRoughnessFactor(0.7)
    .setBaseColorFactor(baseColor);

  // Set alpha mode based on opacity
  if (baseColor[3] < 1) {
    material.setAlphaMode('BLEND');
  } else {
    material.setAlphaMode('OPAQUE');
  }

  // Set material name based on color for debugging
  if (color) {
    const colorString = `rgba(${Math.round(color[0] * 255)},${Math.round(color[1] * 255)},${Math.round(color[2] * 255)},${color[3].toFixed(2)})`;
    material.setName(colorString);
  } else {
    material.setName('default');
  }

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
 * Create a GLTF document from JSCAD shapes with color support
 *
 * Orchestrates the complete conversion pipeline from JSCAD geometries to a glTF document.
 * This function:
 * 1. Creates a new glTF Document with a buffer
 * 2. Creates a separate mesh/node for each shape to preserve individual geometry
 * 3. Applies color from each shape to its material
 * 4. Adds all meshes to the scene
 *
 * Color handling:
 * - Each shape gets its own mesh with its own material
 * - Colors are preserved from colorize() applied to individual shapes
 * - Transparent colors (alpha < 1) are handled with BLEND alpha mode
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

  // Process each shape separately to preserve individual geometry
  for (const [shapeIndex, shape] of shapes.entries()) {
    // Extract color from this shape
    const color = extractColorFromShape(shape);

    // Extract mesh data from this single shape
    const { vertices, normals, indices } = extractMeshDataFromJscadShapes([shape]);

    // Only create mesh if we have geometry
    if (vertices.length > 0 && indices.length > 0) {
      const mesh = document.createMesh();
      const primitive = createPrimitiveFromJscadMesh(document, { vertices, normals, indices, color });
      mesh.addPrimitive(primitive);

      // Create a descriptive node name
      const nodeName = `JSCAD_Shape_${shapeIndex}`;

      const node = document.createNode().setMesh(mesh).setName(nodeName);
      scene.addChild(node);
    }
  }

  return document;
}

/**
 * Convert JSCAD geometry to GLTF Blob for rendering with full color support
 *
 * Public API for converting JSCAD geometries into renderable glTF format (GLB binary).
 * This is the primary integration point between the JSCAD CAD engine and the 3D viewer.
 *
 * Conversion pipeline:
 * 1. Normalizes input to array format (single shape -> [shape])
 * 2. Creates separate mesh/node for each shape to preserve individual geometry
 * 3. Creates glTF document with mesh data extraction, triangulation, normals, and colors
 * 4. Serializes to GLB (binary glTF) format for efficient transmission and storage
 *
 * Color support:
 * - Automatically detects and preserves colors applied via colorize() from @jscad/modeling
 * - Each shape gets its own mesh with its own material and color
 * - Supports both opaque and transparent colors (RGB and RGBA)
 * - Colors are defined as [R, G, B, A] arrays with values 0-1
 *
 * The function handles:
 * - Single shapes or arrays of shapes
 * - Colored and non-colored shapes (defaults to light gray)
 * - Empty geometry (returns valid GLB with empty scene)
 * - Throws error for invalid or unconvertible shapes
 *
 * Material properties are set to sensible defaults (matte, double-sided, low metallic)
 * suitable for preview visualization. For production export, use specialized exporters.
 *
 * @param shape - JSCAD geometry object(s):
 *               - Single geom3/geom2 object (colored or default)
 *               - Array of geometry objects
 *               - Any shape produced by @jscad/modeling functions
 *               - Shapes created with colorize() will preserve their colors
 * @returns Promise resolving to GLB Blob (binary glTF format)
 *          Type: 'model/gltf-binary'
 *
 * @throws {Error} If any shape cannot be converted to GLTF polygon
 * @throws May reject if glTF serialization fails (rare, typically only for memory issues)
 *
 * @example
 * ```typescript
 * import { primitives, colors } from '@jscad/modeling';
 * import { jscadToGltf } from '#components/geometry/kernel/jscad/jscad-to-gltf.js';
 *
 * // Simple shape without color
 * const shape = primitives.cube({ size: 10 });
 * const gltfData = await jscadToGltf(shape);
 *
 * // Colored shapes (each will be a separate mesh with its own color)
 * const redSphere = colors.colorize([1, 0, 0], primitives.sphere({ radius: 5 }));
 * const blueCube = colors.colorize([0, 0, 1, 0.5], primitives.cube({ size: 10 })); // transparent
 * const coloredGltf = await jscadToGltf([redSphere, blueCube]);
 * ```
 */
export async function jscadToGltf(shape: unknown): Promise<Uint8Array> {
  // Handle array of geometries
  const shapes = Array.isArray(shape) ? shape : [shape];

  // Create GLTF document using gltf-transform
  const document = createGltfDocumentFromJscadShapes(shapes);

  // Write as GLB binary format
  const glbBuffer = await new NodeIO().writeBinary(document);
  return glbBuffer;
}
