/**
 * Whether a triangle surface bounds a solid the stencil can cap exactly: a balanced welded edge census.
 *
 * The stencil counts back faces up and front faces down along each view ray, so its count is the winding number of
 * the surface about the cap point exactly when the surface is a closed, consistently oriented cycle: every edge, once
 * coincident vertices are welded, is crossed as often from one side as from the other. That is all this checks.
 * Pinched vertices and edges shared by four faces wind correctly and pass; a hole, a crack or a flipped face does not.
 */

/** What a census needs: every vertex in one frame, and three vertices per triangle. */
export type SectionClosureInput = Readonly<{
  /** The x, y and z of every vertex. */
  positions: Float64Array;
  triangleVertices: Uint32Array;
}>;

export type SectionClosureCensus = Readonly<{
  isClosed: boolean;
  /** Undirected welded edges whose two directions are not used equally often. */
  unbalancedEdgeCount: number;
  /** Edges unbalanced by index alone, before any weld. */
  indexUnbalancedEdgeCount: number;
  milliseconds: number;
}>;

/** Positions closer than this share of the surface's bounding diagonal are one vertex. */
export const sectionClosureWeldShare = 1e-6;

const boundsDiagonal = (positions: Float64Array): number => {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let offset = 0; offset < positions.length; offset += 3) {
    minX = Math.min(minX, positions[offset]!);
    minY = Math.min(minY, positions[offset + 1]!);
    minZ = Math.min(minZ, positions[offset + 2]!);
    maxX = Math.max(maxX, positions[offset]!);
    maxY = Math.max(maxY, positions[offset + 1]!);
    maxZ = Math.max(maxZ, positions[offset + 2]!);
  }
  return positions.length === 0 ? 0 : Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
};

type UnbalancedEdge = Readonly<{ low: number; high: number; net: number }>;

/**
 * The edges used more often in one direction than the other, by vertex index. Each half-edge is a key `2 × pair + d`
 * (`d` 1 when it runs from the higher index to the lower), so one sort of a typed array groups each undirected edge.
 */
const indexUnbalancedEdges = (input: SectionClosureInput): UnbalancedEdge[] => {
  const { triangleVertices } = input;
  const vertexCount = input.positions.length / 3;
  const keys = new Float64Array(triangleVertices.length);
  for (let triangle = 0; triangle < triangleVertices.length; triangle += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const start = triangleVertices[triangle + corner]!;
      const end = triangleVertices[triangle + ((corner + 1) % 3)]!;
      keys[triangle + corner] = start < end ? (start * vertexCount + end) * 2 : (end * vertexCount + start) * 2 + 1;
    }
  }
  keys.sort();
  const unbalanced: UnbalancedEdge[] = [];
  let index = 0;
  while (index < keys.length) {
    const pair = Math.floor(keys[index]! / 2);
    let net = 0;
    while (index < keys.length && Math.floor(keys[index]! / 2) === pair) {
      net += keys[index]! % 2 === 0 ? 1 : -1;
      index++;
    }
    if (net !== 0) {
      unbalanced.push({ low: Math.floor(pair / vertexCount), high: pair % vertexCount, net });
    }
  }
  return unbalanced;
};

/** Welds the given vertices by position: each maps to the first of them within `tolerance`. */
const weldVertices = (
  vertices: ReadonlySet<number>,
  positions: Float64Array,
  tolerance: number,
): Map<number, number> => {
  const cells = new Map<string, number[]>();
  const representative = new Map<number, number>();
  const toleranceSquared = tolerance * tolerance;
  const cell = (value: number): number => Math.floor(value / tolerance);
  for (const vertex of [...vertices].sort((left, right) => left - right)) {
    const [x, y, z] = [positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!];
    const [cx, cy, cz] = [cell(x), cell(y), cell(z)];
    let found: number | undefined;
    for (let dx = -1; dx <= 1 && found === undefined; dx++) {
      for (let dy = -1; dy <= 1 && found === undefined; dy++) {
        for (let dz = -1; dz <= 1 && found === undefined; dz++) {
          found = cells
            .get(`${cx + dx},${cy + dy},${cz + dz}`)
            ?.find(
              (other) =>
                (positions[other * 3]! - x) ** 2 +
                  (positions[other * 3 + 1]! - y) ** 2 +
                  (positions[other * 3 + 2]! - z) ** 2 <=
                toleranceSquared,
            );
        }
      }
    }
    if (found === undefined) {
      const key = `${cx},${cy},${cz}`;
      cells.set(key, [...(cells.get(key) ?? []), vertex]);
      representative.set(vertex, vertex);
    } else {
      representative.set(vertex, representative.get(found)!);
    }
  }
  return representative;
};

/**
 * Runs the census in two stages: by index over every edge, then, only if some edge is unbalanced, by position over
 * the vertices of those edges. A seam of duplicated vertices (a glTF split at a normal or UV crease) leaves its edges
 * unbalanced by index and balanced once welded; a balanced edge stays balanced under any weld, so it is never
 * revisited.
 */
export const censusSectionSurfaceClosure = (input: SectionClosureInput): SectionClosureCensus => {
  const startedAt = performance.now();
  const unbalanced = indexUnbalancedEdges(input);
  if (unbalanced.length === 0) {
    return {
      isClosed: input.triangleVertices.length > 0,
      unbalancedEdgeCount: 0,
      indexUnbalancedEdgeCount: 0,
      milliseconds: performance.now() - startedAt,
    };
  }
  const vertices = new Set<number>();
  for (const { low, high } of unbalanced) {
    vertices.add(low);
    vertices.add(high);
  }
  const tolerance = Math.max(boundsDiagonal(input.positions) * sectionClosureWeldShare, Number.MIN_VALUE);
  const welded = weldVertices(vertices, input.positions, tolerance);
  const nets = new Map<string, number>();
  for (const { low, high, net } of unbalanced) {
    const start = welded.get(low)!;
    const end = welded.get(high)!;
    if (start === end) {
      continue;
    }
    const key = start < end ? `${start},${end}` : `${end},${start}`;
    nets.set(key, (nets.get(key) ?? 0) + (start < end ? net : -net));
  }
  let unbalancedEdgeCount = 0;
  for (const net of nets.values()) {
    unbalancedEdgeCount += net === 0 ? 0 : 1;
  }
  return {
    isClosed: unbalancedEdgeCount === 0,
    unbalancedEdgeCount,
    indexUnbalancedEdgeCount: unbalanced.length,
    milliseconds: performance.now() - startedAt,
  };
};
