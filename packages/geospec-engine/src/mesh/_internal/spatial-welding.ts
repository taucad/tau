/**
 * Spatial welding: 3×3×3 grid-hash canonical-neighbour merge.
 *
 * Kept in sync with the watertight contract — the welded index set is what
 * decides edge incidence, so loosening `spatialEpsilon` here silently changes
 * every watertight verdict.
 *
 * @module
 */

/** Merge radius, in subject units (mm). */
export const spatialEpsilon = 1e-5;

const neighbourOffsets: ReadonlyArray<readonly [number, number, number]> = (() => {
  const offsets: Array<readonly [number, number, number]> = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        offsets.push([x, y, z]);
      }
    }
  }
  return offsets;
})();

/**
 * Weld a flat `[x,y,z,…]` position buffer.
 *
 * @param positions - Flat coordinate triples.
 * @param vertexCount - Number of vertices in the buffer.
 * @param epsilon - Merge radius.
 * @returns For each vertex, the index of its canonical representative.
 * @public
 */
export const weldFlatPositions = (
  positions: ArrayLike<number>,
  vertexCount: number,
  epsilon: number = spatialEpsilon,
): Int32Array => {
  const canonical = new Int32Array(vertexCount);
  // One representative per cell is sufficient and complete: two representatives
  // could only share a cell if they were within `epsilon` on all three axes, in
  // which case the second would have merged into the first.
  const representatives = new Map<string, number>();
  for (let index = 0; index < vertexCount; index++) {
    const x = positions[index * 3]!;
    const y = positions[index * 3 + 1]!;
    const z = positions[index * 3 + 2]!;
    const cellX = Math.floor(x / epsilon);
    const cellY = Math.floor(y / epsilon);
    const cellZ = Math.floor(z / epsilon);
    let representative = -1;
    for (const [offsetX, offsetY, offsetZ] of neighbourOffsets) {
      const candidate = representatives.get(`${cellX + offsetX},${cellY + offsetY},${cellZ + offsetZ}`);
      if (
        candidate !== undefined &&
        Math.abs(positions[candidate * 3]! - x) <= epsilon &&
        Math.abs(positions[candidate * 3 + 1]! - y) <= epsilon &&
        Math.abs(positions[candidate * 3 + 2]! - z) <= epsilon
      ) {
        representative = candidate;
        break;
      }
    }
    if (representative < 0) {
      representative = index;
      representatives.set(`${cellX},${cellY},${cellZ}`, index);
    }
    canonical[index] = representative;
  }
  return canonical;
};

/**
 * Weld an array of coordinate triples.
 *
 * @param positions - Vertex positions.
 * @param epsilon - Merge radius.
 * @returns For each vertex, the index of its canonical representative.
 * @public
 */
export const weldPositions = (
  positions: ReadonlyArray<readonly [number, number, number]>,
  epsilon: number = spatialEpsilon,
): Int32Array => {
  const flat = new Float64Array(positions.length * 3);
  for (const [index, position] of positions.entries()) {
    flat[index * 3] = position[0];
    flat[index * 3 + 1] = position[1];
    flat[index * 3 + 2] = position[2];
  }
  return weldFlatPositions(flat, positions.length, epsilon);
};
