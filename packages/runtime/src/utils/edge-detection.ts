/**
 * Fallback edge detection algorithm for triangle meshes.
 *
 * This module ports the Three.js EdgesGeometry algorithm to work with raw typed arrays,
 * enabling edge detection to run in web workers without Three.js dependencies.
 * Kernels that can provide owner-local topology should emit `LINES` primitives before
 * middleware runs; this detector is only fallback inference for GLBs that contain
 * triangle-soup surfaces without owner-local edges. It is not a topology repair
 * stage.
 *
 * The algorithm uses dihedral angle thresholding to identify sharp edges:
 * - For each edge shared by two triangles, compute the angle between face normals
 * - If the angle exceeds the threshold, the edge is considered "sharp" and rendered
 * - Boundary edges (edges with only one adjacent face) are always included
 */

/**
 * Precision multiplier for vertex position hashing.
 *
 * Three.js EdgesGeometry uses 10^4 = 10000, but that assumes geometry
 * is in "typical" units where 1 unit ≈ 1 meter and features are 0.01m+.
 *
 * GLTF files are in meters per spec, so small objects like PCB text might
 * have features at 0.0001m (0.1mm) scale. With 10^4 precision, these would
 * hash to values like 1, causing collisions.
 *
 * We use 10^7 to handle features down to 0.0001mm (0.1 micrometer) which
 * is sufficient for CAD geometry including fine text and small details.
 */
const hashPrecisionMultiplier = 10_000_000;

/**
 * Degrees to radians conversion factor.
 */
const degreesToRadians = Math.PI / 180;

/**
 * Result of edge detection containing the edge geometry data.
 */
export type EdgeDetectionResult = {
  /**
   * Flat array of edge vertex positions [x1, y1, z1, x2, y2, z2, ...].
   * Each pair of vertices defines one edge.
   */
  positions: Float32Array<ArrayBuffer>;
  /**
   * Index array where each consecutive pair of indices defines an edge.
   * For LINES mode: [0, 1, 2, 3, ...] where (0,1) is first edge, (2,3) is second, etc.
   */
  indices: Uint32Array<ArrayBuffer>;
};

/**
 * Data stored for each edge during detection.
 */
type EdgeData = {
  /** Index of first vertex in the edge */
  index0: number;
  /** Index of second vertex in the edge */
  index1: number;
  /** Normal of the first face that encountered this edge [nx, ny, nz] */
  normal: Vertex3;
};

/**
 * Hash a vertex position to a string key with fixed precision.
 * This handles floating-point precision issues when matching vertices.
 *
 * Uses the same approach as Three.js EdgesGeometry: multiply by precision
 * and round to integer to avoid floating-point comparison issues.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param z - Z coordinate
 * @returns Hash string in format "x,y,z"
 */
function hashVertex(x: number, y: number, z: number): string {
  return `${Math.round(x * hashPrecisionMultiplier)},${Math.round(y * hashPrecisionMultiplier)},${Math.round(z * hashPrecisionMultiplier)}`;
}

/**
 * A 3D vertex as [x, y, z] tuple.
 */
type Vertex3 = [number, number, number];

/**
 * Compute the normal of a triangle defined by three vertices.
 * Uses cross product of two edge vectors.
 *
 * @param vertices - Object containing three vertices of the triangle
 * @param vertices.a - First vertex of the triangle
 * @param vertices.b - Second vertex of the triangle
 * @param vertices.c - Third vertex of the triangle
 * @returns Normalized normal vector [nx, ny, nz]
 */
function computeNormal(vertices: { a: Vertex3; b: Vertex3; c: Vertex3 }): Vertex3 {
  const { a, b, c } = vertices;

  // Edge vectors: CB and AB
  const cbx = c[0] - b[0];
  const cby = c[1] - b[1];
  const cbz = c[2] - b[2];

  const abx = a[0] - b[0];
  const aby = a[1] - b[1];
  const abz = a[2] - b[2];

  // Cross product: CB × AB
  let nx = cby * abz - cbz * aby;
  let ny = cbz * abx - cbx * abz;
  let nz = cbx * aby - cby * abx;

  // Normalize
  const length = Math.hypot(nx, ny, nz);
  if (length > 0) {
    nx /= length;
    ny /= length;
    nz /= length;
  }

  return [nx, ny, nz];
}

/**
 * Compute dot product of two 3D vectors.
 *
 * @param a - first 3D vector
 * @param b - second 3D vector
 * @returns the dot product of the two vectors
 */
function dot(a: Vertex3, b: Vertex3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * Detect fallback edges in a triangle mesh using dihedral angle thresholding.
 *
 * This algorithm identifies "sharp" edges where the angle between adjacent face normals
 * exceeds the specified threshold. Boundary edges (with only one adjacent face) are
 * always included. It intentionally does not repair T-junctions or infer kernel-native
 * topology; callers with better topology should emit their own line primitives.
 *
 * The algorithm runs in O(n) time where n is the number of triangles, using hash-based
 * edge matching for efficient lookup.
 *
 * @internal
 *
 * @param positions - Flat array of vertex positions [x1, y1, z1, x2, y2, z2, ...]
 * @param indices - Optional index array. If undefined, vertices are processed sequentially as triangles.
 * @param thresholdDegrees - Angle threshold in degrees. Edges with dihedral angle greater than
 *   this value are considered sharp. Default is 30 degrees.
 * @returns Edge geometry data with positions and indices for LINES primitive mode
 *
 * @example <caption>Sharp edges from indexed mesh</caption>
 * ```typescript
 * const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
 * const indices = new Uint32Array([0, 1, 2]);
 * const edges = detectEdges(positions, indices, 30);
 * ```
 */
export function detectEdges(
  positions: Float32Array,
  indices: Uint32Array | Uint16Array | undefined,
  thresholdDegrees = 30,
): EdgeDetectionResult {
  // Convert threshold to cosine for dot product comparison
  const thresholdCos = Math.cos(thresholdDegrees * degreesToRadians);

  // Map from edge hash to edge data (null means edge was matched and processed)
  const edgeData = new Map<string, EdgeData | undefined>();

  // Collected edge vertices for output
  const edgeVertices: number[] = [];

  // Helper to get vertex position by index
  const getVertex = (index: number): Vertex3 => {
    const index_ = index * 3;
    return [positions[index_] ?? 0, positions[index_ + 1] ?? 0, positions[index_ + 2] ?? 0];
  };

  // Determine number of triangles
  const indexCount = indices ? indices.length : positions.length / 3;
  const triangleCount = Math.floor(indexCount / 3);

  // Process each triangle
  for (let t = 0; t < triangleCount; t++) {
    // Get vertex indices for this triangle
    const index0 = indices ? (indices[t * 3] ?? 0) : t * 3;
    const i1 = indices ? (indices[t * 3 + 1] ?? 0) : t * 3 + 1;
    const i2 = indices ? (indices[t * 3 + 2] ?? 0) : t * 3 + 2;

    // Get vertex positions
    const a = getVertex(index0);
    const b = getVertex(i1);
    const c = getVertex(i2);

    // Compute face normal
    const normal = computeNormal({ a, b, c });

    // Hash vertex positions
    const hashA = hashVertex(a[0], a[1], a[2]);
    const hashB = hashVertex(b[0], b[1], b[2]);
    const hashC = hashVertex(c[0], c[1], c[2]);

    // Skip degenerate triangles (where any two vertices hash to the same value)
    // This is critical for complex geometry like text where degenerate triangles
    // can create spurious edges between letters
    if (hashA === hashB || hashB === hashC || hashC === hashA) {
      continue;
    }

    // Process three edges of the triangle
    const edges: Array<{
      hash: string;
      reverseHash: string;
      index0: number;
      index1: number;
    }> = [
      {
        hash: `${hashA}_${hashB}`,
        reverseHash: `${hashB}_${hashA}`,
        index0,
        index1: i1,
      },
      {
        hash: `${hashB}_${hashC}`,
        reverseHash: `${hashC}_${hashB}`,
        index0: i1,
        index1: i2,
      },
      {
        hash: `${hashC}_${hashA}`,
        reverseHash: `${hashA}_${hashC}`,
        index0: i2,
        index1: index0,
      },
    ];

    for (const edge of edges) {
      // Check if the reverse edge exists and hasn't been processed yet
      // (meaning this edge is shared by two faces)
      const existingEdge = edgeData.get(edge.reverseHash);

      if (existingEdge !== undefined) {
        // Edge is shared by two faces - check dihedral angle
        const dotProduct = dot(normal, existingEdge.normal);

        // If angle exceeds threshold (dot product below threshold), add edge
        if (dotProduct <= thresholdCos) {
          // Add edge vertices
          const [x0, y0, z0] = getVertex(existingEdge.index0);
          const [x1, y1, z1] = getVertex(existingEdge.index1);
          edgeVertices.push(x0, y0, z0, x1, y1, z1);
        }

        // Mark the edge as processed by setting to undefined (not deleting!)
        // This prevents subsequent triangles from re-using this edge hash
        // which matches Three.js behavior with edgeData[key] = null
        edgeData.set(edge.reverseHash, undefined);
      } else if (!edgeData.has(edge.hash)) {
        // Only store if we haven't already seen this edge (including processed ones)
        // This prevents overwriting when the same edge appears twice
        edgeData.set(edge.hash, {
          index0: edge.index0,
          index1: edge.index1,
          normal,
        });
      }
    }
  }

  // Add remaining edges as boundary edges (edges with only one adjacent face)
  // Skip processed edges (those set to undefined after matching)
  for (const edge of edgeData.values()) {
    if (edge !== undefined) {
      const [x0, y0, z0] = getVertex(edge.index0);
      const [x1, y1, z1] = getVertex(edge.index1);
      edgeVertices.push(x0, y0, z0, x1, y1, z1);
    }
  }

  // Create output arrays
  const edgeCount = edgeVertices.length / 6; // 6 floats per edge (2 vertices × 3 coords)
  const outputPositions = new Float32Array(edgeVertices);
  const outputIndices = new Uint32Array(edgeCount * 2);

  // Generate sequential indices for LINES mode
  for (let index = 0; index < edgeCount * 2; index++) {
    outputIndices[index] = index;
  }

  return {
    positions: outputPositions,
    indices: outputIndices,
  };
}
