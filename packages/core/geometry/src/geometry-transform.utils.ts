/** Supported output coordinate systems. @public */
export type OutputCoordinateSystem = 'y-up' | 'z-up';

/** Supported output length units. @public */
export type OutputLengthUnit = 'meter' | 'millimeter';

/** Geometry coordinate-system and unit transform options. @public */
export type GeometryOutputTransformOptions = {
  coordinateSystem?: OutputCoordinateSystem;
  unit?: {
    length?: OutputLengthUnit;
  };
};

const normalizeSignedZero = (value: number): number => (value === 0 ? 0 : value);

const lengthScaleFromMillimeters = (unit: OutputLengthUnit | undefined): number =>
  unit === 'millimeter' ? 1 : 1 / 1000;

/**
 * Create a vertex transform from CAD source coordinates (Z-up millimeters) to
 * the requested export coordinate system and length unit.
 *
 * @param options - Output coordinate and unit convention.
 * @returns A vertex transform function.
 */
export function createVertexTransform(options: GeometryOutputTransformOptions = {}): VertexTransformFunction {
  const coordinateSystem = options.coordinateSystem ?? 'y-up';
  const scale = lengthScaleFromMillimeters(options.unit?.length);

  return (vertex) => {
    const sourceX = vertex[0] * scale;
    const sourceY = vertex[1] * scale;
    const sourceZ = vertex[2] * scale;

    if (coordinateSystem === 'z-up') {
      return [normalizeSignedZero(sourceX), normalizeSignedZero(sourceY), normalizeSignedZero(sourceZ)];
    }

    return [normalizeSignedZero(sourceX), normalizeSignedZero(sourceZ), normalizeSignedZero(-sourceY)];
  };
}

/** Vertex transform function signature for coordinate system selection. */
type VertexTransformFunction = (vertex: readonly [number, number, number]) => [number, number, number];

/**
 * Transform a flat array of vertex positions from z-up to y-up coordinate system and convert units.
 *
 * Processes a flat array of vertex coordinates in groups of 3, applying both coordinate
 * system transformation (z-up to y-up) and unit conversion (mm to meters).
 *
 * This is a convenience wrapper around `createVertexTransform` for processing multiple vertices
 * in a flat array format commonly used in mesh data.
 *
 * @param vertices - Flat array of vertex positions [x1, y1, z1, x2, y2, z2, ...]
 * @returns Float32Array with transformed positions
 * @public
 */
export function transformVertexArray(
  vertices: ArrayLike<number>,
  options: GeometryOutputTransformOptions = {},
): Float32Array<ArrayBuffer> {
  const transformedVertices = new Float32Array(vertices.length);
  const transform = createVertexTransform(options);

  for (let index = 0; index < vertices.length; index += 3) {
    const x = vertices[index];
    const y = vertices[index + 1];
    const z = vertices[index + 2];

    if (x === undefined || y === undefined || z === undefined) {
      continue;
    }

    const vertex: [number, number, number] = [x, y, z];
    const transformed = transform(vertex);

    transformedVertices[index] = transformed[0];
    transformedVertices[index + 1] = transformed[1];
    transformedVertices[index + 2] = transformed[2];
  }

  return transformedVertices;
}

/**
 * Transform normal vectors from z-up to y-up coordinate system.
 * Unlike vertices, normals are direction vectors so no unit conversion is needed.
 * Z-up to Y-up transformation: x' = x, y' = z, z' = -y
 *
 * @param normals - Flat array of normal components [x1, y1, z1, x2, y2, z2, ...]
 * @returns Float32Array with transformed normals
 * @public
 */
export function transformNormalArray(
  normals: ArrayLike<number>,
  options: Pick<GeometryOutputTransformOptions, 'coordinateSystem'> = {},
): Float32Array<ArrayBuffer> {
  const transformedNormals = new Float32Array(normals.length);
  const coordinateSystem = options.coordinateSystem ?? 'y-up';

  for (let index = 0; index < normals.length; index += 3) {
    const x = normals[index] ?? 0;
    const y = normals[index + 1] ?? 0;
    const z = normals[index + 2] ?? 0;
    transformedNormals[index] = normalizeSignedZero(x);
    transformedNormals[index + 1] = normalizeSignedZero(coordinateSystem === 'z-up' ? y : z);
    transformedNormals[index + 2] = normalizeSignedZero(coordinateSystem === 'z-up' ? z : -y);
  }

  return transformedNormals;
}

/** Remove zero-area and repeated triangles while preserving index-group ownership. @public */
export function compactTriangleIndices<Group extends { start: number; count: number }>(options: {
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  groups?: readonly Group[];
}): { indices: Uint32Array<ArrayBuffer>; groups: Group[]; removed: number } {
  const kept: number[] = [];
  const groups: Group[] = [];
  const sourceGroups = options.groups ?? [];
  let sourceGroupIndex = 0;
  let lastKeptGroupIndex = -1;
  let removed = 0;
  const canonical = new Uint32Array(options.positions.length / 3);
  const positionIds = new Map<string, number>();
  for (let index = 0; index < canonical.length; index++) {
    const key = `${options.positions[index * 3]!},${options.positions[index * 3 + 1]!},${options.positions[index * 3 + 2]!}`;
    const existing = positionIds.get(key);
    canonical[index] = existing ?? index;
    if (existing === undefined) {
      positionIds.set(key, index);
    }
  }
  const faces = new Set<string>();
  for (let offset = 0; offset + 2 < options.indices.length; offset += 3) {
    const a = options.indices[offset]!;
    const b = options.indices[offset + 1]!;
    const c = options.indices[offset + 2]!;
    const ax = options.positions[a * 3]!;
    const ay = options.positions[a * 3 + 1]!;
    const az = options.positions[a * 3 + 2]!;
    const ux = options.positions[b * 3]! - ax;
    const uy = options.positions[b * 3 + 1]! - ay;
    const uz = options.positions[b * 3 + 2]! - az;
    const vx = options.positions[c * 3]! - ax;
    const vy = options.positions[c * 3 + 1]! - ay;
    const vz = options.positions[c * 3 + 2]! - az;
    const areaSquared = (uy * vz - uz * vy) ** 2 + (uz * vx - ux * vz) ** 2 + (ux * vy - uy * vx) ** 2;
    const face = [canonical[a]!, canonical[b]!, canonical[c]!].sort((left, right) => left - right).join(':');
    if (areaSquared === 0 || faces.has(face)) {
      removed += 1;
      continue;
    }
    faces.add(face);
    kept.push(a, b, c);
    while (
      sourceGroupIndex < sourceGroups.length &&
      offset >= sourceGroups[sourceGroupIndex]!.start + sourceGroups[sourceGroupIndex]!.count
    ) {
      sourceGroupIndex += 1;
    }
    const group = sourceGroups[sourceGroupIndex];
    if (group && offset >= group.start) {
      const previous = groups.at(-1);
      if (previous && lastKeptGroupIndex === sourceGroupIndex) {
        previous.count += 3;
      } else {
        groups.push({ ...group, start: kept.length - 3, count: 3 });
      }
      lastKeptGroupIndex = sourceGroupIndex;
    } else {
      lastKeptGroupIndex = -1;
    }
  }
  return { indices: new Uint32Array(kept), groups, removed };
}
