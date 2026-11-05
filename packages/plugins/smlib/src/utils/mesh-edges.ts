import type * as SmlibModule from '@classcad/smlibwasm';

type NumberArray = ArrayLike<number>;

/** A whole-body mesh: positions and triangle corners. */
export type BoundaryMesh = { vertices: NumberArray; triangles: NumberArray };

/** A whole-body mesh, which face each triangle belongs to, and the B-rep entities it is matched against. */
export type BoundarySource = {
  mesh: BoundaryMesh;
  /** The face id of each triangle; all equal when faces are not known. */
  owners: ArrayLike<number>;
  /** The body's edges, in `edges()` order; their index is the edge id. */
  edges: readonly SmlibModule.Edge[];
  /** The body's vertices, where one edge ends and the next begins. */
  vertices: readonly SmlibModule.Vertex[];
  /** The mesh's chord tolerance. */
  tolerance: number;
};

/**
 * The polylines of each B-rep edge, read from the face mesh's own boundary samples.
 *
 * SMLib meshes a body in one pass, so neighbouring faces share the points where they meet: those
 * points are the mesh's samples of the B-rep edge between them. Sampling the edge's curve again
 * (at other parameters) draws a line that cuts across the faceted surface by up to the chord
 * tolerance, which shows as edges floating off or sinking into the surface when zoomed in. Lines
 * read from the mesh lie exactly on the triangles' edges instead, as OCCT's PolygonOnTriangulation
 * does for the OpenCascade-based kernels.
 *
 * A triangle edge is on a B-rep edge where the triangles either side of it belong to different
 * faces, or where only one triangle uses it (the border of a sheet). Those segments are chained
 * between B-rep vertices and branch points, and each chain is given to the B-rep edge nearest an
 * interior point of it. A chain farther than the tolerance from every edge (a misclassified
 * triangle) is left out.
 *
 * @param source - The mesh, its triangles' faces, the body's edges and vertices, and the chord tolerance.
 * @returns The polylines found for each edge id; an edge the mesh does not bound has none.
 */
export function meshBoundaryPolylines(source: BoundarySource): Map<number, number[][][]> {
  const { mesh, owners, edges, vertices, tolerance } = source;
  const { points, corners } = weld(mesh);
  const pointCount = points.length / 3;
  const adjacency = boundaryAdjacency(corners, owners, pointCount);
  const stops = new Set<number>();
  for (const [point, neighbours] of adjacency) {
    if (neighbours.length !== 2) {
      stops.add(point);
    }
  }
  const reach = Math.max(tolerance * 1e-2, 1e-6);
  for (const point of nearestBoundaryPoints(points, [...adjacency.keys()], { vertices, reach })) {
    stops.add(point);
  }

  const result = new Map<number, number[][][]>();
  if (adjacency.size === 0 || edges.length === 0) {
    return result;
  }
  const margin = 2 * tolerance + 1e-6;
  const boxes = edges.map((edge) => {
    const box = edge.bbox();
    return {
      low: box.min.toArray().map((value) => value - margin),
      high: box.max.toArray().map((value) => value + margin),
    };
  });
  const position = (point: number): number[] => [points[point * 3]!, points[point * 3 + 1]!, points[point * 3 + 2]!];
  const assign = (chain: number[]): void => {
    if (chain.length < 2) {
      return;
    }
    const middle = Math.floor(chain.length / 2);
    const probe =
      chain.length > 2
        ? position(chain[middle]!)
        : position(chain[0]!).map((value, axis) => (value + position(chain[1]!)[axis]!) / 2);
    let best = -1;
    let nearest = Number.POSITIVE_INFINITY;
    for (const [edgeId, edge] of edges.entries()) {
      const { low, high } = boxes[edgeId]!;
      if (!probe.every((value, axis) => value >= low[axis]! && value <= high[axis]!)) {
        continue;
      }
      const distance = edge.distanceTo(probe);
      if (distance < nearest) {
        nearest = distance;
        best = edgeId;
      }
    }
    if (best < 0 || nearest > margin) {
      return;
    }
    const polylines = result.get(best) ?? [];
    polylines.push(chain.map((point) => position(point)));
    result.set(best, polylines);
  };

  const visited = new Set<number>();
  const segmentKey = (a: number, b: number): number => (a < b ? a * pointCount + b : b * pointCount + a);
  const walk = (start: number, next: number): number[] => {
    const chain = [start];
    let previous = start;
    let current = next;
    for (;;) {
      visited.add(segmentKey(previous, current));
      chain.push(current);
      if (current === start || stops.has(current)) {
        return chain;
      }
      const onward = unvisitedNeighbour(adjacency.get(current)!, current, (a, b) => visited.has(segmentKey(a, b)));
      if (onward === undefined) {
        return chain;
      }
      previous = current;
      current = onward;
    }
  };
  // Open chains run from stop to stop; what is left are closed loops with no stop on them.
  for (const start of [...stops].sort((a, b) => a - b)) {
    for (const next of adjacency.get(start) ?? []) {
      if (!visited.has(segmentKey(start, next))) {
        assign(walk(start, next));
      }
    }
  }
  for (const [start, neighbours] of adjacency) {
    for (const next of neighbours) {
      if (!visited.has(segmentKey(start, next))) {
        assign(walk(start, next));
      }
    }
  }
  return result;
}

/**
 * The first neighbour of a point along a segment not yet walked.
 * @param neighbours - The point's neighbours along the boundary.
 * @param point - The point.
 * @param isVisited - Whether the segment between two points was walked.
 * @returns The neighbour, or undefined when every segment from the point was walked.
 */
function unvisitedNeighbour(
  neighbours: readonly number[],
  point: number,
  isVisited: (a: number, b: number) => boolean,
): number | undefined {
  return neighbours.find((neighbour) => !isVisited(point, neighbour));
}

/**
 * Merge coincident mesh points, so faces that share a boundary sample share its index.
 * @param mesh - The mesh.
 * @returns The distinct positions and the triangle corners re-indexed onto them.
 */
function weld(mesh: BoundaryMesh): { points: number[]; corners: Uint32Array } {
  const ids = new Map<string, number>();
  const points: number[] = [];
  const vertexCount = mesh.vertices.length / 3;
  const remap = new Uint32Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const x = mesh.vertices[vertex * 3]!;
    const y = mesh.vertices[vertex * 3 + 1]!;
    const z = mesh.vertices[vertex * 3 + 2]!;
    const key = `${x},${y},${z}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = points.length / 3;
      ids.set(key, id);
      points.push(x, y, z);
    }
    remap[vertex] = id;
  }
  const corners = new Uint32Array(mesh.triangles.length);
  for (let corner = 0; corner < corners.length; corner++) {
    corners[corner] = remap[mesh.triangles[corner]!]!;
  }
  return { points, corners };
}

/**
 * The segments of the mesh that lie on a B-rep edge, as each point's neighbours along them: those
 * whose triangles belong to different faces, and those only one triangle uses.
 * @param corners - Welded triangle corners.
 * @param owners - The face id of each triangle.
 * @param pointCount - How many welded points there are.
 * @returns The boundary points and their neighbours, in mesh order.
 */
function boundaryAdjacency(corners: Uint32Array, owners: ArrayLike<number>, pointCount: number): Map<number, number[]> {
  type Use = { a: number; b: number; owner: number; count: number; boundary: boolean };
  const uses = new Map<number, Use>();
  for (let triangle = 0; triangle < corners.length / 3; triangle++) {
    const owner = owners[triangle]!;
    for (const [from, to] of [
      [0, 1],
      [1, 2],
      [2, 0],
    ] as const) {
      const a = corners[triangle * 3 + from]!;
      const b = corners[triangle * 3 + to]!;
      if (a === b) {
        continue;
      }
      const key = a < b ? a * pointCount + b : b * pointCount + a;
      const use = uses.get(key);
      if (use === undefined) {
        uses.set(key, { a: Math.min(a, b), b: Math.max(a, b), owner, count: 1, boundary: false });
      } else {
        use.count += 1;
        use.boundary ||= use.owner !== owner;
      }
    }
  }
  const adjacency = new Map<number, number[]>();
  const link = (from: number, to: number): void => {
    const neighbours = adjacency.get(from);
    if (neighbours) {
      neighbours.push(to);
    } else {
      adjacency.set(from, [to]);
    }
  };
  for (const { a, b, count, boundary } of uses.values()) {
    if (boundary || count === 1) {
      link(a, b);
      link(b, a);
    }
  }
  return adjacency;
}

/**
 * The boundary point at each B-rep vertex, where one edge's samples end and the next one's begin.
 * @param points - Welded positions.
 * @param boundary - The boundary points.
 * @param near - The body's vertices, and how far a sample may sit from its vertex.
 * @returns The boundary point nearest each vertex, within reach.
 */
function nearestBoundaryPoints(
  points: readonly number[],
  boundary: readonly number[],
  near: { vertices: readonly SmlibModule.Vertex[]; reach: number },
): number[] {
  const { vertices, reach } = near;
  if (vertices.length === 0 || boundary.length === 0) {
    return [];
  }
  const cellKey = (x: number, y: number, z: number): string =>
    `${Math.floor(x / reach)},${Math.floor(y / reach)},${Math.floor(z / reach)}`;
  const grid = new Map<string, number[]>();
  for (const point of boundary) {
    const key = cellKey(points[point * 3]!, points[point * 3 + 1]!, points[point * 3 + 2]!);
    grid.set(key, [...(grid.get(key) ?? []), point]);
  }
  const offsets = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => [dx, dy, dz])));
  const found: number[] = [];
  for (const vertex of vertices) {
    const at = [vertex.x, vertex.y, vertex.z];
    const candidates = offsets.flatMap(
      ([dx, dy, dz]) => grid.get(cellKey(at[0]! + dx! * reach, at[1]! + dy! * reach, at[2]! + dz! * reach)) ?? [],
    );
    let best = -1;
    let nearest = reach;
    for (const point of candidates) {
      const distance = Math.hypot(
        points[point * 3]! - at[0]!,
        points[point * 3 + 1]! - at[1]!,
        points[point * 3 + 2]! - at[2]!,
      );
      if (distance <= nearest) {
        nearest = distance;
        best = point;
      }
    }
    if (best >= 0) {
      found.push(best);
    }
  }
  return found;
}
