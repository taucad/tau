/**
 * A topology-free slice of a triangle soup by one plane: the cut segments of every triangle the plane crosses, their
 * ends welded, then chained into closed loops and open chains. It needs no certified surface, so it caps whatever
 * closes at the plane and reports what does not.
 */

/** The triangles to slice and the plane to slice them by, in one frame. */
export type SectionLoopSliceInput = Readonly<{
  /** Nine coordinates per triangle. Triangles the plane does not cross are skipped. */
  triangles: Float64Array;
  /** The plane as `(normal, constant)`: a point's distance from it is `dot(normal, p) - constant`. */
  plane: readonly [number, number, number, number];
  /** Cut points closer than this, in the plane, are one point. */
  weldTolerance: number;
}>;

/** What one plane cut: loops that close, chains that do not, and the geometry that draws them. */
export type SectionLoopSlice = Readonly<{
  /** Closed loops, three coordinates per point, the first point not repeated. */
  closedLoops: readonly Float64Array[];
  /** Open chains, three coordinates per point, from one end to the other. */
  openChains: readonly Float64Array[];
  /**
   * A fan of triangles over each closed loop, nine coordinates per triangle. Counted even-odd, the fans cover exactly
   * the area the loops enclose, so the stencil fills it with no triangulation.
   */
  fill: Float32Array;
  /** The sliced triangles whose cut lies on an open chain, nine coordinates per triangle. */
  openTriangles: Float32Array;
  /** Cut segments kept after welding and cancelling coincident pairs. */
  segmentCount: number;
  sliceMilliseconds: number;
}>;

/** The two unit axes of the plane, for welding in its own two dimensions. */
const planeAxes = (normal: readonly [number, number, number]): readonly [number[], number[]] => {
  const [nx, ny, nz] = normal;
  const [ax, ay, az] = Math.abs(nz) < 0.9 ? [0, 0, 1] : [0, 1, 0];
  let ux = ay * nz - az * ny;
  let uy = az * nx - ax * nz;
  let uz = ax * ny - ay * nx;
  const length = Math.hypot(ux, uy, uz) || 1;
  ux /= length;
  uy /= length;
  uz /= length;
  return [
    [ux, uy, uz],
    [ny * uz - nz * uy, nz * ux - nx * uz, nx * uy - ny * ux],
  ];
};

/** Lexicographic order of two points of `triangles`, so both triangles of a shared edge cut it identically. */
const comparePoints = (triangles: Float64Array, left: number, right: number): number =>
  triangles[left]! - triangles[right]! ||
  triangles[left + 1]! - triangles[right + 1]! ||
  triangles[left + 2]! - triangles[right + 2]!;

type Graph = Readonly<{
  /** Two welded points per edge. */
  edgeEnds: Int32Array;
  /** The triangle each edge was cut from. */
  edgeTriangles: Int32Array;
  edgeCount: number;
  points: Float64Array;
  pointCount: number;
}>;

/** Cuts every crossing triangle, welds the cut points and cancels coincident segment pairs. */
const buildCutGraph = (input: SectionLoopSliceInput): Graph => {
  const { triangles, plane, weldTolerance } = input;
  const [nx, ny, nz, constant] = plane;
  const [u, v] = planeAxes([nx, ny, nz]);
  const triangleCount = Math.floor(triangles.length / 9);
  const tolerance = Math.max(weldTolerance, Number.MIN_VALUE);
  const toleranceSquared = tolerance * tolerance;

  let points = new Float64Array(64 * 3);
  let pointUv = new Float64Array(64 * 2);
  let pointCount = 0;
  const cells = new Map<string, number[]>();

  const weld = (x: number, y: number, z: number): number => {
    const pu = x * u[0]! + y * u[1]! + z * u[2]!;
    const pv = x * v[0]! + y * v[1]! + z * v[2]!;
    const cu = Math.floor(pu / tolerance);
    const cv = Math.floor(pv / tolerance);
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        const candidates = cells.get(`${cu + du}:${cv + dv}`);
        if (!candidates) {
          continue;
        }
        for (const point of candidates) {
          const offsetU = pointUv[point * 2]! - pu;
          const offsetV = pointUv[point * 2 + 1]! - pv;
          if (offsetU * offsetU + offsetV * offsetV <= toleranceSquared) {
            return point;
          }
        }
      }
    }
    if (pointCount * 3 >= points.length) {
      const grownPoints = new Float64Array(points.length * 2);
      grownPoints.set(points);
      points = grownPoints;
      const grownUv = new Float64Array(pointUv.length * 2);
      grownUv.set(pointUv);
      pointUv = grownUv;
    }
    points[pointCount * 3] = x;
    points[pointCount * 3 + 1] = y;
    points[pointCount * 3 + 2] = z;
    pointUv[pointCount * 2] = pu;
    pointUv[pointCount * 2 + 1] = pv;
    const key = `${cu}:${cv}`;
    const cell = cells.get(key);
    if (cell) {
      cell.push(pointCount);
    } else {
      cells.set(key, [pointCount]);
    }
    return pointCount++;
  };

  const distance = (offset: number): number =>
    nx * triangles[offset]! + ny * triangles[offset + 1]! + nz * triangles[offset + 2]! - constant;

  /** Where the edge between two vertices crosses the plane, computed from its lower end so it is order-free. */
  const hit = (first: number, second: number): number => {
    const [low, high] = comparePoints(triangles, first, second) <= 0 ? [first, second] : [second, first];
    const lowDistance = distance(low);
    const highDistance = distance(high);
    if (lowDistance === 0) {
      return weld(triangles[low]!, triangles[low + 1]!, triangles[low + 2]!);
    }
    if (highDistance === 0) {
      return weld(triangles[high]!, triangles[high + 1]!, triangles[high + 2]!);
    }
    const t = lowDistance / (lowDistance - highDistance);
    return weld(
      triangles[low]! + (triangles[high]! - triangles[low]!) * t,
      triangles[low + 1]! + (triangles[high + 1]! - triangles[low + 1]!) * t,
      triangles[low + 2]! + (triangles[high + 2]! - triangles[low + 2]!) * t,
    );
  };

  // Coincident segments cancel in pairs: a wall shared by two solids, or a doubled face, bounds nothing.
  const segments = new Map<number, Readonly<{ start: number; end: number; triangle: number; parity: number }>>();
  const pairKeys: number[] = [];
  for (let triangle = 0; triangle < triangleCount; triangle++) {
    const base = triangle * 9;
    const d0 = distance(base);
    const d1 = distance(base + 3);
    const d2 = distance(base + 6);
    // Half-open: a vertex on the plane counts as below it, so every crossing triangle has exactly two crossing edges.
    const a0 = d0 > 0;
    const a1 = d1 > 0;
    const a2 = d2 > 0;
    if (a0 === a1 && a1 === a2) {
      continue;
    }
    const ends: number[] = [];
    if (a0 !== a1) {
      ends.push(hit(base, base + 3));
    }
    if (a1 !== a2) {
      ends.push(hit(base + 3, base + 6));
    }
    if (a2 !== a0) {
      ends.push(hit(base + 6, base));
    }
    const [start, end] = ends as [number, number];
    if (start === end) {
      continue;
    }
    const low = Math.min(start, end);
    const high = Math.max(start, end);
    // Point indices stay far below 2^26, so the key is exact.
    const key = low * 67_108_864 + high;
    const existing = segments.get(key);
    if (existing) {
      segments.set(key, { ...existing, parity: existing.parity + 1 });
    } else {
      segments.set(key, { start, end, triangle, parity: 1 });
      pairKeys.push(key);
    }
  }

  const edgeEnds = new Int32Array(pairKeys.length * 2);
  const edgeTriangles = new Int32Array(pairKeys.length);
  let edgeCount = 0;
  for (const key of pairKeys) {
    const segment = segments.get(key)!;
    if (segment.parity % 2 === 0) {
      continue;
    }
    edgeEnds[edgeCount * 2] = segment.start;
    edgeEnds[edgeCount * 2 + 1] = segment.end;
    edgeTriangles[edgeCount] = segment.triangle;
    edgeCount++;
  }
  return { edgeEnds, edgeTriangles, edgeCount, points, pointCount };
};

type Walk = Readonly<{ points: number[]; edges: number[] }>;

/**
 * Splits the cut graph into open chains and closed loops. Chains are peeled first from every point with an odd number
 * of unused segments, each stopping where it reaches a dead end or a branch, so a spur or a crack becomes a chain and
 * the loops it touched stay closed. What remains has an even number of segments at every point and splits into
 * loops; a point where two loops touch, as at a voxel pinch, keeps both closed.
 */
const chainCutGraph = (graph: Graph): Readonly<{ loops: Walk[]; chains: Walk[] }> => {
  const { edgeEnds, edgeCount, pointCount } = graph;
  const degree = new Int32Array(pointCount);
  for (let edge = 0; edge < edgeCount; edge++) {
    degree[edgeEnds[edge * 2]!]!++;
    degree[edgeEnds[edge * 2 + 1]!]!++;
  }
  const firstEdge = new Int32Array(pointCount + 1);
  for (let point = 0; point < pointCount; point++) {
    firstEdge[point + 1] = firstEdge[point]! + degree[point]!;
  }
  const incident = new Int32Array(edgeCount * 2);
  const fill = firstEdge.slice(0, pointCount);
  for (let edge = 0; edge < edgeCount; edge++) {
    incident[fill[edgeEnds[edge * 2]!]!++] = edge;
    incident[fill[edgeEnds[edge * 2 + 1]!]!++] = edge;
  }
  const used = new Uint8Array(edgeCount);
  const cursor = firstEdge.slice(0, pointCount);
  const remaining = new Int32Array(degree);

  const nextEdge = (point: number): number => {
    const end = firstEdge[point + 1]!;
    while (cursor[point]! < end) {
      const edge = incident[cursor[point]!]!;
      if (!used[edge]) {
        return edge;
      }
      cursor[point]!++;
    }
    return -1;
  };
  const take = (edge: number, from: number): number => {
    used[edge] = 1;
    const to = edgeEnds[edge * 2]! === from ? edgeEnds[edge * 2 + 1]! : edgeEnds[edge * 2]!;
    remaining[from]!--;
    remaining[to]!--;
    return to;
  };

  const chains: Walk[] = [];
  const odd: number[] = [];
  for (let point = 0; point < pointCount; point++) {
    if (remaining[point]! % 2 === 1) {
      odd.push(point);
    }
  }
  while (odd.length > 0) {
    const start = odd.pop()!;
    if (remaining[start]! % 2 === 0) {
      continue;
    }
    const points = [start];
    const edges: number[] = [];
    let point = start;
    for (;;) {
      const edge = nextEdge(point);
      if (edge < 0) {
        break;
      }
      point = take(edge, point);
      points.push(point);
      edges.push(edge);
      if (remaining[point] !== 1) {
        break;
      }
    }
    chains.push({ points, edges });
    for (const end of [start, point]) {
      if (remaining[end]! % 2 === 1) {
        odd.push(end);
      }
    }
  }

  const loops: Walk[] = [];
  for (let start = 0; start < pointCount; start++) {
    while (remaining[start]! > 0) {
      const points = [start];
      const edges: number[] = [];
      let point = start;
      for (;;) {
        const edge = nextEdge(point);
        if (edge < 0) {
          break;
        }
        point = take(edge, point);
        edges.push(edge);
        if (point === start) {
          break;
        }
        points.push(point);
      }
      if (points.length >= 3) {
        loops.push({ points, edges });
      }
    }
  }
  return { loops, chains };
};

const toCoordinates = (points: readonly number[], positions: Float64Array): Float64Array => {
  const coordinates = new Float64Array(points.length * 3);
  for (const [index, point] of points.entries()) {
    coordinates[index * 3] = positions[point * 3]!;
    coordinates[index * 3 + 1] = positions[point * 3 + 1]!;
    coordinates[index * 3 + 2] = positions[point * 3 + 2]!;
  }
  return coordinates;
};

/** Slices `input.triangles` by `input.plane` into closed loops, open chains, and the geometry that draws them. */
export const sliceSectionLoops = (input: SectionLoopSliceInput): SectionLoopSlice => {
  const startedAt = performance.now();
  const graph = buildCutGraph(input);
  const { loops, chains } = chainCutGraph(graph);

  let fillTriangleCount = 0;
  for (const loop of loops) {
    fillTriangleCount += loop.points.length - 2;
  }
  const fill = new Float32Array(fillTriangleCount * 9);
  let written = 0;
  const writePoint = (point: number): void => {
    fill[written++] = graph.points[point * 3]!;
    fill[written++] = graph.points[point * 3 + 1]!;
    fill[written++] = graph.points[point * 3 + 2]!;
  };
  for (const { points } of loops) {
    for (let index = 1; index < points.length - 1; index++) {
      writePoint(points[0]!);
      writePoint(points[index]!);
      writePoint(points[index + 1]!);
    }
  }

  const openTriangleSet = new Set<number>();
  for (const { edges } of chains) {
    for (const edge of edges) {
      openTriangleSet.add(graph.edgeTriangles[edge]!);
    }
  }
  const openTriangles = new Float32Array(openTriangleSet.size * 9);
  let openWritten = 0;
  for (const triangle of [...openTriangleSet].sort((left, right) => left - right)) {
    for (let offset = 0; offset < 9; offset++) {
      openTriangles[openWritten++] = input.triangles[triangle * 9 + offset]!;
    }
  }

  return {
    closedLoops: loops.map(({ points }) => toCoordinates(points, graph.points)),
    openChains: chains.map(({ points }) => toCoordinates(points, graph.points)),
    fill,
    openTriangles,
    segmentCount: graph.edgeCount,
    sliceMilliseconds: performance.now() - startedAt,
  };
};
