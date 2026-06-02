/**
 * Vertex welding for CAD tessellations that duplicate boundary vertices per
 * triangle (no shared indices) but align coincident positions within float noise.
 *
 * @module
 * @internal
 */

/**
 * Coincidence epsilon for merging duplicate positions (in glTF meter-scale units).
 *
 * Must stay in sync with the historical watertight analyser contract.
 */
export const spatialEpsilon = 1e-5;

type WeldedNeighborContext = {
  position: readonly [number, number, number];
  cell: readonly [number, number, number];
  positions: ReadonlyArray<[number, number, number]>;
  positionToCanonical: Map<string, number>;
  epsilonSquared: number;
};

const findWeldedCanonicalNeighbor = (context: WeldedNeighborContext): number => {
  const [x, y, z] = context.position;
  const [cellX, cellY, cellZ] = context.cell;
  const { positions, positionToCanonical, epsilonSquared } = context;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        const neighborKey = `${cellX + dx},${cellY + dy},${cellZ + dz}`;
        const candidate = positionToCanonical.get(neighborKey);
        if (candidate === undefined) {
          continue;
        }
        const other = positions[candidate];
        if (!other) {
          continue;
        }
        const [ox, oy, oz] = other;
        const ddx = x - ox;
        const ddy = y - oy;
        const ddz = z - oz;
        if (ddx * ddx + ddy * ddy + ddz * ddz <= epsilonSquared) {
          return candidate;
        }
      }
    }
  }
  return -1;
};

/**
 * Welds nearly-coincident positions and returns, for each input vertex index,
 * the canonical vertex index (`0..length-1`) representing its welded cluster.
 *
 * @param positions - One triple per vertex, in document units (meters for glTF)
 * @returns `vertexMap` where `vertexMap[i]` is the canonical index for input `i`
 */
export const weldPositions = (positions: ReadonlyArray<[number, number, number]>): Int32Array => {
  const gridSize = spatialEpsilon * 2;
  const epsilonSquared = spatialEpsilon * spatialEpsilon;
  const positionToCanonical = new Map<string, number>();
  const vertexMap = new Int32Array(positions.length);

  for (const [i, position] of positions.entries()) {
    const [x, y, z] = position;
    const cx = Math.round(x / gridSize);
    const cy = Math.round(y / gridSize);
    const cz = Math.round(z / gridSize);

    const canonical = findWeldedCanonicalNeighbor({
      position: [x, y, z],
      cell: [cx, cy, cz],
      positions,
      positionToCanonical,
      epsilonSquared,
    });

    if (canonical === -1) {
      const key = `${cx},${cy},${cz}`;
      positionToCanonical.set(key, i);
      vertexMap[i] = i;
    } else {
      vertexMap[i] = canonical;
    }
  }

  return vertexMap;
};
