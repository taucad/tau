type Surface = {
  positions: Float32Array<ArrayBuffer>;
  normals: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
};

/**
 * Split render vertices into final-bounds box charts while preserving smooth source normals.
 * @internal
 * @param source - Original welded mesh and its computed normals.
 * @returns Chart-split mesh, UV0 and orthogonal tangent frames derived from triangle UVs.
 */
export const projectSurfaceCoordinates = (
  source: Surface,
): Surface & {
  texCoords: Float32Array<ArrayBuffer>;
  tangents: Float32Array<ArrayBuffer>;
} => {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let offset = 0; offset < source.positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis]!, source.positions[offset + axis]!);
      maximum[axis] = Math.max(maximum[axis]!, source.positions[offset + axis]!);
    }
  }
  const positions: number[] = [];
  const normals: number[] = [];
  const coordinates: number[] = [];
  const tangentSums: number[] = [];
  const bitangentSums: number[] = [];
  const indices = new Uint32Array(source.indices.length);
  const mapped = new Map<number, number>();
  // ponytail: six box charts leave curved-surface seams; add authored UVs when artistic mapping is needed.
  for (let triangle = 0; triangle < source.indices.length; triangle += 3) {
    const a = source.indices[triangle]! * 3;
    const b = source.indices[triangle + 1]! * 3;
    const c = source.indices[triangle + 2]! * 3;
    const edge1 = [
      source.positions[b]! - source.positions[a]!,
      source.positions[b + 1]! - source.positions[a + 1]!,
      source.positions[b + 2]! - source.positions[a + 2]!,
    ];
    const edge2 = [
      source.positions[c]! - source.positions[a]!,
      source.positions[c + 1]! - source.positions[a + 1]!,
      source.positions[c + 2]! - source.positions[a + 2]!,
    ];
    const normal = [
      edge1[1]! * edge2[2]! - edge1[2]! * edge2[1]!,
      edge1[2]! * edge2[0]! - edge1[0]! * edge2[2]!,
      edge1[0]! * edge2[1]! - edge1[1]! * edge2[0]!,
    ];
    const absolute = normal.map((component) => Math.abs(component));
    const axis =
      absolute[0]! >= absolute[1]! && absolute[0]! >= absolute[2]! ? 0 : absolute[1]! >= absolute[2]! ? 1 : 2;
    const sign = normal[axis]! < 0 ? -1 : 1;
    const chart = axis * 2 + (sign < 0 ? 1 : 0);
    const uAxis = axis === 0 ? 1 : 0;
    const vAxis = axis === 2 ? 1 : 2;
    const uSign = axis === 1 ? -sign : sign;
    for (let corner = triangle; corner < triangle + 3; corner++) {
      const vertex = source.indices[corner]!;
      const key = vertex * 6 + chart;
      let target = mapped.get(key);
      if (target === undefined) {
        target = positions.length / 3;
        mapped.set(key, target);
        positions.push(
          source.positions[vertex * 3]!,
          source.positions[vertex * 3 + 1]!,
          source.positions[vertex * 3 + 2]!,
        );
        normals.push(source.normals[vertex * 3]!, source.normals[vertex * 3 + 1]!, source.normals[vertex * 3 + 2]!);
        const width = maximum[uAxis]! - minimum[uAxis]!;
        const height = maximum[vAxis]! - minimum[vAxis]!;
        const u = width > 0 ? (source.positions[vertex * 3 + uAxis]! - minimum[uAxis]!) / width : 0;
        coordinates.push(
          uSign > 0 ? u : 1 - u,
          height > 0 ? (source.positions[vertex * 3 + vAxis]! - minimum[vAxis]!) / height : 0,
        );
        tangentSums.push(0, 0, 0);
        bitangentSums.push(0, 0, 0);
      }
      indices[corner] = target;
    }
    const first = indices[triangle]!;
    const second = indices[triangle + 1]!;
    const third = indices[triangle + 2]!;
    const du1 = coordinates[second * 2]! - coordinates[first * 2]!;
    const dv1 = coordinates[second * 2 + 1]! - coordinates[first * 2 + 1]!;
    const du2 = coordinates[third * 2]! - coordinates[first * 2]!;
    const dv2 = coordinates[third * 2 + 1]! - coordinates[first * 2 + 1]!;
    const determinant = du1 * dv2 - du2 * dv1;
    for (const vertex of [first, second, third]) {
      for (let component = 0; component < 3; component++) {
        tangentSums[vertex * 3 + component]! +=
          determinant === 0
            ? component === uAxis
              ? uSign
              : 0
            : (edge1[component]! * dv2 - edge2[component]! * dv1) / determinant;
        bitangentSums[vertex * 3 + component]! +=
          determinant === 0
            ? component === vAxis
              ? 1
              : 0
            : (edge2[component]! * du1 - edge1[component]! * du2) / determinant;
      }
    }
  }
  const tangents = new Float32Array((positions.length / 3) * 4);
  for (let vertex = 0; vertex < positions.length / 3; vertex++) {
    const offset = vertex * 3;
    const nx = normals[offset]!;
    const ny = normals[offset + 1]!;
    const nz = normals[offset + 2]!;
    const dot = nx * tangentSums[offset]! + ny * tangentSums[offset + 1]! + nz * tangentSums[offset + 2]!;
    let tx = tangentSums[offset]! - nx * dot;
    let ty = tangentSums[offset + 1]! - ny * dot;
    let tz = tangentSums[offset + 2]! - nz * dot;
    // oxlint-disable-next-line unicorn/prefer-modern-math-apis -- DP18: Math.sqrt is correctly rounded, while Math.hypot is implementation-approximated.
    let length = Math.sqrt(tx * tx + ty * ty + tz * tz);
    if (length === 0) {
      [tx, ty, tz] = Math.abs(nx) < 0.9 ? [0, -nz, ny] : [nz, 0, -nx];
      // oxlint-disable-next-line unicorn/prefer-modern-math-apis -- Keep the same deterministic normalization as above.
      length = Math.sqrt(tx * tx + ty * ty + tz * tz);
    }
    tx /= length;
    ty /= length;
    tz /= length;
    const handedness =
      (ny * tz - nz * ty) * bitangentSums[offset]! +
      (nz * tx - nx * tz) * bitangentSums[offset + 1]! +
      (nx * ty - ny * tx) * bitangentSums[offset + 2]!;
    tangents.set([tx, ty, tz, handedness < 0 ? -1 : 1], vertex * 4);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    texCoords: new Float32Array(coordinates),
    tangents,
  };
};
