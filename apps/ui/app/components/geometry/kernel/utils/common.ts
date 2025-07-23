/**
 * A 3D vertex position in Cartesian coordinates.
 *
 * @example [1.5, -2.0, 0.0] represents point at x=1.5, y=-2.0, z=0.0
 */
export type Vertex = [number, number, number];

/**
 * A polygonal face defined by vertex indices.
 *
 * Contains an ordered list of vertex indices that form a polygon.
 * During glTF export, faces with 4+ vertices are triangulated using fan triangulation.
 *
 * @example [0, 1, 2] represents a triangle using vertices at indices 0, 1, and 2
 * @example [0, 1, 2, 3] represents a quad that will be split into triangles (0,1,2) and (0,2,3)
 */
export type Face = number[];

/**
 * RGB color components in normalized range [0.0, 1.0].
 *
 * @example [1.0, 0.0, 0.0] represents pure red
 * @example [0.5, 0.5, 0.5] represents 50% gray
 */
export type Color = [number, number, number]; // RGB values 0-1

/**
 * A complete 3D mesh representation using indexed geometry.
 *
 * This is the primary data structure for representing 3D shapes before
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
   * @example
   * // A simple pyramid with 4 vertices:
   * vertices: [
   *   [0, 0, 0],    // base vertex 0
   *   [1, 0, 0],    // base vertex 1
   *   [0.5, 1, 0],  // base vertex 2
   *   [0.5, 0.5, 1] // apex vertex 3
   * ]
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
   * @example
   * // Continuing the pyramid example:
   * faces: [
   *   [0, 1, 2],    // triangular base face
   *   [0, 3, 1],    // triangular side face 1
   *   [1, 3, 2],    // triangular side face 2
   *   [2, 3, 0]     // triangular side face 3
   * ]
   */
  faces: Face[];

  /**
   * Array of face colors, one per face.
   *
   * Each color corresponds to a face at the same index in the faces array.
   * During glTF export, face colors are replicated to all vertices of the
   * triangles created from that face during triangulation.
   *
   * @example
   * // Continuing the pyramid example (4 faces = 4 colors):
   * colors: [
   *   [0.8, 0.8, 0.8], // gray base
   *   [1.0, 0.0, 0.0], // red side 1
   *   [0.0, 1.0, 0.0], // green side 2
   *   [0.0, 0.0, 1.0]  // blue side 3
   * ]
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
     * @example
     * // Two line segments:
     * // Line 1: from (0,0,0) to (1,0,0)
     * // Line 2: from (1,0,0) to (1,1,0)
     * positions: [0,0,0, 1,0,0, 1,0,0, 1,1,0]
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
       * Starting index in the positions array (in groups of 6 values per line).
       * @example start: 0 means starting from the first line segment
       */
      start: number;

      /**
       * Number of line segments in this group.
       * @example count: 3 means this group contains 3 line segments
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
