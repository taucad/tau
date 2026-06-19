/**
 * A 3D vertex position in Cartesian coordinates (e.g., `[1.5, -2.0, 0.0]`).
 */
export type Vertex = [number, number, number];

/**
 * A polygonal face defined by vertex indices.
 *
 * Contains an ordered list of vertex indices that form a polygon.
 * During glTF export, faces with 4+ vertices are triangulated using fan triangulation
 * (e.g., `[0, 1, 2]` for a triangle, `[0, 1, 2, 3]` for a quad split into two triangles).
 */
export type Face = number[];

/**
 * RGBA color components in normalized range [0.0, 1.0]
 * (e.g., `[1.0, 0.0, 0.0, 1.0]` for opaque red, `[0.0, 0.0, 1.0, 0.5]` for semi-transparent blue).
 */
export type Color = [number, number, number, number]; // RGBA values 0-1

/**
 * A complete 3D mesh representation using indexed geometry.
 *
 * This is the primary data structure for representing 3D geometries before
 * conversion to rendering formats like glTF. It uses an indexed approach
 * where faces reference shared vertices by index, which is memory efficient
 * and preserves topological relationships.
 */
export type IndexedPolyhedron = {
  /**
   * Array of unique 3D vertex positions.
   *
   * Each vertex is shared by multiple faces, reducing memory usage.
   * The index of each vertex in this array is used to reference it from faces.
   *
   * @example <caption>Vertex position data</caption>
   * ```text
   * // A simple pyramid with 4 vertices:
   * vertices: [
   *   [0, 0, 0],    // base vertex 0
   *   [1, 0, 0],    // base vertex 1
   *   [0.5, 1, 0],  // base vertex 2
   *   [0.5, 0.5, 1] // apex vertex 3
   * ]
   * ```
   */
  vertices: Vertex[];

  /**
   * Array of polygonal faces, each defined by vertex indices.
   *
   * Each face is a polygon defined by an ordered sequence of vertex indices.
   * The winding order determines the face normal direction (typically counter-clockwise = outward).
   * Faces can be triangles, quads, or higher-order polygons.
   *
   * During glTF export:
   * - Triangles are used directly
   * - Quads and n-gons are triangulated using fan triangulation from the first vertex
   *
   * @example <caption>Triangular face indices</caption>
   * ```text
   * // Continuing the pyramid example:
   * faces: [
   *   [0, 1, 2],    // triangular base face
   *   [0, 3, 1],    // triangular side face 1
   *   [1, 3, 2],    // triangular side face 2
   *   [2, 3, 0]     // triangular side face 3
   * ]
   * ```
   */
  faces: Face[];

  /**
   * Array of face colors, one per face.
   *
   * Each color corresponds to a face at the same index in the faces array.
   * During glTF export, face colors are replicated to all vertices of the
   * triangles created from that face during triangulation.
   *
   * @example <caption>Per-face color assignment</caption>
   * ```text
   * // Continuing the pyramid example (4 faces = 4 colors):
   * colors: [
   *   [0.8, 0.8, 0.8], // gray base
   *   [1.0, 0.0, 0.0], // red side 1
   *   [0.0, 1.0, 0.0], // green side 2
   *   [0.0, 0.0, 1.0]  // blue side 3
   * ]
   * ```
   */
  colors: Color[];

  /**
   * Optional line data for edges and wireframe display.
   *
   * Contains geometric line segments that represent edges, wireframes,
   * or other linear features. This data is preserved separately from
   * the face geometry and can be rendered as line segments in 3D viewers.
   */
  lines?: {
    /**
     * Flattened array of line endpoint positions.
     *
     * Format: [x1, y1, z1, x2, y2, z2, x3, y3, z3, ...]
     * - Every 6 consecutive numbers define one line segment
     * - Line segment from (x1,y1,z1) to (x2,y2,z2)
     * - Next line segment from (x3,y3,z3) to (x4,y4,z4), etc.
     *
     * @example <caption>Flattened line segment pairs</caption>
     * ```text
     * // Two line segments:
     * // Line 1: from (0,0,0) to (1,0,0)
     * // Line 2: from (1,0,0) to (1,1,0)
     * positions: [0,0,0, 1,0,0, 1,0,0, 1,1,0]
     * ```
     */
    positions: number[];

    /**
     * Optional grouping information for line segments.
     *
     * Allows logical grouping of line segments that belong to the same
     * geometric edge or feature. Useful for preserving original CAD
     * edge information during export/import cycles.
     */
    edgeGroups?: Array<{
      /**
       * Starting index in the positions array, in groups of 6 values per line segment
       * (e.g., `0` for the first line segment).
       */
      start: number;

      /**
       * Number of line segments in this group (e.g., `3` for three line segments).
       */
      count: number;

      /**
       * Unique identifier for the original geometric edge.
       * Used to maintain edge identity across format conversions.
       */
      edgeId: number;
    }>;
  };
};

export type OutputCoordinateSystem = 'y-up' | 'z-up';

export type OutputLengthUnit = 'meter' | 'millimeter';

export type GeometryOutputTransformOptions = {
  coordinateSystem?: OutputCoordinateSystem;
  unit?: {
    length?: OutputLengthUnit;
  };
};

const normalizeSignedZero = (value: number): number => (value === 0 ? 0 : value);

const lengthScaleFromMillimeters = (unit: OutputLengthUnit | undefined): number =>
  unit === 'millimeter' ? 1 : 1 / 1000;

/**
 * Create a vertex transform from CAD source coordinates (Z-up millimeters) to
 * the requested export coordinate system and length unit.
 *
 * @param options - Output coordinate and unit convention.
 * @returns A vertex transform function.
 */
export function createVertexTransform(options: GeometryOutputTransformOptions = {}): VertexTransformFunction {
  const coordinateSystem = options.coordinateSystem ?? 'y-up';
  const scale = lengthScaleFromMillimeters(options.unit?.length);

  return (vertex) => {
    const sourceX = vertex[0] * scale;
    const sourceY = vertex[1] * scale;
    const sourceZ = vertex[2] * scale;

    if (coordinateSystem === 'z-up') {
      return [normalizeSignedZero(sourceX), normalizeSignedZero(sourceY), normalizeSignedZero(sourceZ)];
    }

    return [normalizeSignedZero(sourceX), normalizeSignedZero(sourceZ), normalizeSignedZero(-sourceY)];
  };
}

/**
 * Transform a normal from CAD source coordinates (Z-up) to the requested output
 * coordinate system. Normals are directions, so units do not apply.
 *
 * @param normal - Normal vector in source CAD coordinates.
 * @param coordinateSystem - Requested output coordinate system.
 * @returns Transformed normal vector.
 */
export function transformNormalVector(
  normal: readonly [number, number, number],
  coordinateSystem: OutputCoordinateSystem = 'y-up',
): [number, number, number] {
  if (coordinateSystem === 'z-up') {
    return [normalizeSignedZero(normal[0]), normalizeSignedZero(normal[1]), normalizeSignedZero(normal[2])];
  }

  return [normalizeSignedZero(normal[0]), normalizeSignedZero(normal[2]), normalizeSignedZero(-normal[1])];
}

/**
 * Transform vertex coordinates from z-up millimeters to y-up meters.
 *
 * @param vertex - xyz position in z-up millimeter space.
 * @returns xyz position in y-up meter space.
 */
export function transformVerticesGltf(vertex: readonly [number, number, number]): [number, number, number] {
  return createVertexTransform({ coordinateSystem: 'y-up', unit: { length: 'meter' } })(vertex);
}

/**
 * Convert vertex units from millimeters to meters without coordinate system transformation.
 * Used when the output coordinate system matches the source (z-up → z-up).
 *
 * @param vertex - xyz position in millimeter space
 * @returns xyz position in meter space
 */
export function transformVerticesZup(vertex: readonly [number, number, number]): [number, number, number] {
  return createVertexTransform({ coordinateSystem: 'z-up', unit: { length: 'meter' } })(vertex);
}

/** Vertex transform function signature for coordinate system selection. */
export type VertexTransformFunction = (vertex: readonly [number, number, number]) => [number, number, number];

/**
 * Transform a flat array of vertex positions from z-up to y-up coordinate system and convert units.
 *
 * Processes a flat array of vertex coordinates in groups of 3, applying both coordinate
 * system transformation (z-up to y-up) and unit conversion (mm to meters).
 *
 * This is a convenience wrapper around transformVerticesGltf for processing multiple vertices
 * in a flat array format commonly used in mesh data.
 *
 * @param vertices - Flat array of vertex positions [x1, y1, z1, x2, y2, z2, ...]
 * @returns Float32Array with transformed positions
 */
export function transformVertexArray(
  vertices: number[],
  options: GeometryOutputTransformOptions = {},
): Float32Array<ArrayBuffer> {
  const transformedVertices = new Float32Array(vertices.length);
  const transform = createVertexTransform(options);

  for (let index = 0; index < vertices.length; index += 3) {
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];

    if (x === undefined || y === undefined || z === undefined) {
      continue;
    }

    const vertex: [number, number, number] = [x, y, z];
    const transformed = transform(vertex);

    transformedVertices[index] = transformed[0];
    transformedVertices[index + 1] = transformed[1];
    transformedVertices[index + 2] = transformed[2];
  }

  return transformedVertices;
}

/**
 * Transform normal vectors from z-up to y-up coordinate system.
 * Unlike vertices, normals are direction vectors so no unit conversion is needed.
 * Z-up to Y-up transformation: x' = x, y' = z, z' = -y
 *
 * @param normals - Flat array of normal components [x1, y1, z1, x2, y2, z2, ...]
 * @returns Float32Array with transformed normals
 */
export function transformNormalArray(
  normals: number[],
  options: Pick<GeometryOutputTransformOptions, 'coordinateSystem'> = {},
): Float32Array<ArrayBuffer> {
  const transformedNormals = new Float32Array(normals.length);
  const coordinateSystem = options.coordinateSystem ?? 'y-up';

  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index] ?? 0;
    const y = normals[index + 1] ?? 0;
    const z = normals[index + 2] ?? 0;
    const transformed = transformNormalVector([x, y, z], coordinateSystem);
    transformedNormals[index] = transformed[0];
    transformedNormals[index + 1] = transformed[1];
    transformedNormals[index + 2] = transformed[2];
  }

  return transformedNormals;
}
