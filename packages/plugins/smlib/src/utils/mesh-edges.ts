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
  /** For each edge, the indices into `vertices` of its two end vertices (`ext.brep_dump`'s `v0`, `v1`). */
  ends: ReadonlyArray<readonly [number, number]>;
  /** The positions of the body's vertices, where one edge ends and the next begins. */
  vertices: ReadonlyArray<ArrayLike<number>>;
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
 * between B-rep vertices and branch points. A chain is given to the one B-rep edge that joins the
 * same two vertices (the edges' end vertices come from the kernel's topology, not from evaluating
 * each edge); where several do (two arcs between one pair of vertices) or its ends are not
 * vertices, to the edge nearest an interior point of it. Most chains so cost no kernel call. A chain
 * farther than the tolerance from every edge (a misclassified triangle) is left out.
 *
 * @param source - The mesh, its triangles' faces, the body's edges, their end vertices and the vertices' positions, and the chord tolerance.
 * @returns The polylines found for each edge id; an edge the mesh does not bound has none.
 */
export function meshBoundaryPolylines(source: BoundarySource): Map<number, number[][][]> {
  const { mesh, owners, edges, ends, vertices, tolerance } = source;
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
  const vertexAt = vertexLocator(vertices, reach);
  const pointVertex = new Map<number, number>();
  for (const point of adjacency.keys()) {
    const vertex = vertexAt(points[point * 3]!, points[point * 3 + 1]!, points[point * 3 + 2]!);
    if (vertex >= 0) {
      stops.add(point);
      pointVertex.set(point, vertex);
    }
  }

  const result = new Map<number, number[][][]>();
  if (adjacency.size === 0 || edges.length === 0) {
    return result;
  }
  const endsKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const byEnds = new Map<string, number[]>();
  for (const [edgeId, [first, last]] of ends.entries()) {
    const key = endsKey(first, last);
    byEnds.set(key, [...(byEnds.get(key) ?? []), edgeId]);
  }
  const margin = 2 * tolerance + 1e-6;
  const boxes = new Map<number, { low: number[]; high: number[] }>();
  const boxOf = (edgeId: number): { low: number[]; high: number[] } => {
    let box = boxes.get(edgeId);
    if (!box) {
      const { min, max } = edges[edgeId]!.bbox();
      box = { low: min.toArray().map((value) => value - margin), high: max.toArray().map((value) => value + margin) };
      boxes.set(edgeId, box);
    }
    return box;
  };
  const position = (point: number): number[] => [points[point * 3]!, points[point * 3 + 1]!, points[point * 3 + 2]!];
  const nearestEdge = (chain: number[], candidates: readonly number[]): number => {
    const middle = Math.floor(chain.length / 2);
    const probe =
      chain.length > 2
        ? position(chain[middle]!)
        : position(chain[0]!).map((value, axis) => (value + position(chain[1]!)[axis]!) / 2);
    let best = -1;
    let nearest = margin;
    for (const edgeId of candidates) {
      const { low, high } = boxOf(edgeId);
      if (probe.every((value, axis) => value >= low[axis]! && value <= high[axis]!)) {
        const distance = edges[edgeId]!.distanceTo(probe);
        if (distance <= nearest) {
          nearest = distance;
          best = edgeId;
        }
      }
    }
    return best;
  };
  const everyEdge = edges.map((_, edgeId) => edgeId);
  const assign = (chain: number[]): void => {
    if (chain.length < 2) {
      return;
    }
    const first = pointVertex.get(chain[0]!);
    const last = pointVertex.get(chain.at(-1)!);
    const joining = first === undefined || last === undefined ? [] : (byEnds.get(endsKey(first, last)) ?? []);
    const edgeId = joining.length === 1 ? joining[0]! : nearestEdge(chain, joining.length > 1 ? joining : everyEdge);
    if (edgeId < 0) {
      return;
    }
    const polylines = result.get(edgeId) ?? [];
    polylines.push(chain.map((point) => position(point)));
    result.set(edgeId, polylines);
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
  // One slot per distinct segment, in typed arrays: a mesh has about three segments per two triangles.
  const slots = new Map<number, number>();
  const capacity = corners.length;
  const ends = new Uint32Array(capacity * 2);
  const firstOwner = new Float64Array(capacity);
  const uses = new Uint32Array(capacity);
  const mixed = new Uint8Array(capacity);
  for (let corner = 0; corner < corners.length; corner++) {
    const owner = owners[Math.floor(corner / 3)]!;
    const a = corners[corner]!;
    const b = corners[corner % 3 === 2 ? corner - 2 : corner + 1]!;
    if (a === b) {
      continue;
    }
    const low = Math.min(a, b);
    const high = Math.max(a, b);
    const key = low * pointCount + high;
    let slot = slots.get(key);
    if (slot === undefined) {
      slot = slots.size;
      slots.set(key, slot);
      ends[slot * 2] = low;
      ends[slot * 2 + 1] = high;
      firstOwner[slot] = owner;
    } else if (firstOwner[slot] !== owner) {
      mixed[slot] = 1;
    }
    uses[slot]! += 1;
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
  for (let slot = 0; slot < slots.size; slot++) {
    if (mixed[slot] === 1 || uses[slot] === 1) {
      link(ends[slot * 2]!, ends[slot * 2 + 1]!);
      link(ends[slot * 2 + 1]!, ends[slot * 2]!);
    }
  }
  return adjacency;
}

/**
 * Find a B-rep vertex by position: a grid of the vertices, searched in the 27 cells around a point.
 * @param positions - The body's vertices' positions.
 * @param reach - How far a point may sit from its vertex.
 * @returns A lookup from a position to the index of the vertex within reach of it, or -1.
 */
function vertexLocator(
  positions: ReadonlyArray<ArrayLike<number>>,
  reach: number,
): (x: number, y: number, z: number) => number {
  const cell = (value: number): number => Math.floor(value / reach);
  const grid = new Map<string, number[]>();
  for (const [index, { 0: x, 1: y, 2: z }] of positions.entries()) {
    const key = `${cell(x!)},${cell(y!)},${cell(z!)}`;
    grid.set(key, [...(grid.get(key) ?? []), index]);
  }
  const offsets = [-1, 0, 1].flatMap((dx) => [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dz) => [dx, dy, dz])));
  return (x, y, z) => {
    let best = -1;
    let nearest = reach;
    for (const [dx, dy, dz] of offsets) {
      for (const index of grid.get(`${cell(x) + dx!},${cell(y) + dy!},${cell(z) + dz!}`) ?? []) {
        const { 0: vx, 1: vy, 2: vz } = positions[index]!;
        const distance = Math.hypot(vx! - x, vy! - y, vz! - z);
        if (distance <= nearest) {
          nearest = distance;
          best = index;
        }
      }
    }
    return best;
  };
}
