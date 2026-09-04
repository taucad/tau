const degreesToRadians = Math.PI / 180;

type Vertex3 = [number, number, number];

type EdgeData = {
  index0: number;
  index1: number;
  normal: Vertex3;
};

/** Edge geometry represented as indexed line segments. @public */
export type EdgeDetectionResult = {
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
};

const hashVertex = ([x, y, z]: Vertex3): string => `${x},${y},${z}`;

const computeNormal = (a: Vertex3, b: Vertex3, c: Vertex3): Vertex3 => {
  const cbx = c[0] - b[0];
  const cby = c[1] - b[1];
  const cbz = c[2] - b[2];
  const abx = a[0] - b[0];
  const aby = a[1] - b[1];
  const abz = a[2] - b[2];
  const nx = cby * abz - cbz * aby;
  const ny = cbz * abx - cbx * abz;
  const nz = cbx * aby - cby * abx;
  const length = Math.hypot(nx, ny, nz);
  return length === 0 ? [0, 0, 0] : [nx / length, ny / length, nz / length];
};

const dot = (a: Vertex3, b: Vertex3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Detect boundary and sharp dihedral edges in triangle positions.
 *
 * Vertices are welded by exact Float32 position so indexed meshes and triangle soup
 * share the same classification. Boundary edges are always emitted; shared
 * edges are emitted when their face-normal angle meets the threshold.
 *
 * @param positions - Flat XYZ vertex positions.
 * @param indices - Optional triangle indices; omit for sequential triangle soup.
 * @param thresholdDegrees - Minimum face-normal angle classified as sharp.
 * @returns Indexed line-segment positions.
 * @public
 */
export const detectEdges = (
  positions: Float32Array,
  indices: Uint32Array | Uint16Array | undefined,
  thresholdDegrees = 30,
): EdgeDetectionResult => {
  const thresholdCos = Math.cos(thresholdDegrees * degreesToRadians);
  const edgeData = new Map<string, EdgeData | undefined>();
  const edgeVertices: number[] = [];
  const getVertex = (index: number): Vertex3 => {
    const offset = index * 3;
    return [positions[offset] ?? 0, positions[offset + 1] ?? 0, positions[offset + 2] ?? 0];
  };

  const indexCount = indices?.length ?? positions.length / 3;
  for (let triangle = 0; triangle < Math.floor(indexCount / 3); triangle++) {
    const index0 = indices?.[triangle * 3] ?? triangle * 3;
    const index1 = indices?.[triangle * 3 + 1] ?? triangle * 3 + 1;
    const index2 = indices?.[triangle * 3 + 2] ?? triangle * 3 + 2;
    const a = getVertex(index0);
    const b = getVertex(index1);
    const c = getVertex(index2);
    const hashA = hashVertex(a);
    const hashB = hashVertex(b);
    const hashC = hashVertex(c);
    if (hashA === hashB || hashB === hashC || hashC === hashA) {
      continue;
    }

    const normal = computeNormal(a, b, c);
    const edges = [
      { hash: `${hashA}_${hashB}`, reverseHash: `${hashB}_${hashA}`, index0, index1 },
      { hash: `${hashB}_${hashC}`, reverseHash: `${hashC}_${hashB}`, index0: index1, index1: index2 },
      { hash: `${hashC}_${hashA}`, reverseHash: `${hashA}_${hashC}`, index0: index2, index1: index0 },
    ];

    for (const edge of edges) {
      const existing = edgeData.get(edge.reverseHash);
      if (existing) {
        if (dot(normal, existing.normal) <= thresholdCos) {
          edgeVertices.push(...getVertex(existing.index0), ...getVertex(existing.index1));
        }
        edgeData.set(edge.reverseHash, undefined);
      } else if (!edgeData.has(edge.hash)) {
        edgeData.set(edge.hash, { index0: edge.index0, index1: edge.index1, normal });
      }
    }
  }

  for (const edge of edgeData.values()) {
    if (edge) {
      edgeVertices.push(...getVertex(edge.index0), ...getVertex(edge.index1));
    }
  }

  return {
    positions: new Float32Array(edgeVertices),
    indices: Uint32Array.from({ length: edgeVertices.length / 3 }, (_, index) => index),
  };
};
