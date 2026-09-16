/**
 * Pure geometry for the metal morph loader.
 *
 * Every form is a star-convex solid seen from the origin, so one shared icosphere topology can carry all of
 * them: each icosphere direction stores, per shape, the distance to the surface along that direction plus the
 * outward normal of the face it lands on. The GPU then morphs by interpolating those packed samples.
 *
 * All values are dimensionless render units; the loader has no physical frame.
 */

export type MetalMorphShapeId = 'escher-star' | 'stella-octangula' | 'cube' | 'dodecahedron' | 'icosahedron';

/** Attribute order of the packed per-shape samples; the shader selects targets by this index. */
export const metalMorphShapeIds = [
  'escher-star',
  'stella-octangula',
  'cube',
  'dodecahedron',
  'icosahedron',
] as const satisfies readonly MetalMorphShapeId[];

export const metalMorphShapeLabels: Readonly<Record<MetalMorphShapeId, string>> = {
  'escher-star': 'Escher star',
  'stella-octangula': 'Stella octangula',
  cube: 'Cube',
  dodecahedron: 'Dodecahedron',
  icosahedron: 'Icosahedron',
};

export type Vector3Tuple = readonly [number, number, number];

export type ConvexFace = Readonly<{
  /** Unit outward normal. */
  normal: Vector3Tuple;
  /** Plane offset so that `dot(normal, point) === offset` for every point on the face. */
  offset: number;
  /** Face polygon, counter-clockwise when viewed from outside. */
  vertices: readonly Vector3Tuple[];
}>;

export type MetalMorphShapeDefinition = Readonly<{
  id: MetalMorphShapeId;
  /** Convex core vertices before `scale` is applied. */
  vertices: readonly Vector3Tuple[];
  /** Uniform scale that brings the core into the loader's unit framing. */
  scale: number;
  /** Distance from the origin to the apex of the pyramid raised on every core face; absent for plain solids. */
  spikeApexRadius?: number;
}>;

export type RadialSample = Readonly<{
  /** Distance from the origin to the surface along the sampled direction. */
  radius: number;
  /** Unit outward normal of the face hit along the sampled direction. */
  normal: Vector3Tuple;
}>;

export type PreparedSolid = Readonly<{
  id: MetalMorphShapeId;
  faces: readonly ConvexFace[];
  /** Side planes of the pyramid raised on `faces[index]`, when the solid is stellated. */
  spikes?: ReadonlyArray<readonly ConvexFace[]>;
}>;

export type MetalMorphGeometryData = Readonly<{
  detail: number;
  vertexCount: number;
  /** Unit directions, three floats per vertex; doubles as the mesh `position` attribute. */
  directions: Float32Array;
  index: Uint32Array;
  /** Packed `normal.xyz, radius` samples, four floats per vertex, keyed by shape. */
  shapes: Readonly<Record<MetalMorphShapeId, Float32Array>>;
}>;

const goldenRatio = (1 + Math.sqrt(5)) / 2;
/** Dimensionless coplanarity guard for unit-scale solids. */
const coplanarTolerance = 1e-6;
/** Dimensionless guard that rejects planes the sampled ray runs parallel to. */
const grazingDenominatorTolerance = 1e-9;

const subtract = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vector3Tuple, b: Vector3Tuple): Vector3Tuple => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vector3Tuple, b: Vector3Tuple): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vector3Tuple): number => Math.hypot(a[0], a[1], a[2]);
const scaleVector = (a: Vector3Tuple, factor: number): Vector3Tuple => [a[0] * factor, a[1] * factor, a[2] * factor];
const normalize = (a: Vector3Tuple): Vector3Tuple => scaleVector(a, 1 / length(a));
const negate = (a: Vector3Tuple): Vector3Tuple => [-a[0], -a[1], -a[2]];

const signedPermutations = (values: Vector3Tuple): Vector3Tuple[] => {
  const result: Vector3Tuple[] = [];
  for (const x of values[0] === 0 ? [0] : [values[0], -values[0]]) {
    for (const y of values[1] === 0 ? [0] : [values[1], -values[1]]) {
      for (const z of values[2] === 0 ? [0] : [values[2], -values[2]]) {
        result.push([x, y, z]);
      }
    }
  }
  return result;
};

const cyclicPermutations = (values: Vector3Tuple): Vector3Tuple[] => {
  const rotations: readonly Vector3Tuple[] = [
    values,
    [values[2], values[0], values[1]],
    [values[1], values[2], values[0]],
  ];
  return rotations.flatMap((tuple) => signedPermutations(tuple));
};

const cubeVertices = signedPermutations([1, 1, 1]);
const octahedronVertices = cyclicPermutations([1, 0, 0]);
const icosahedronVertices = cyclicPermutations([0, 1, goldenRatio]);
const dodecahedronVertices = [...cubeVertices, ...cyclicPermutations([0, 1 / goldenRatio, goldenRatio])];
const rhombicDodecahedronVertices = [...cubeVertices, ...cyclicPermutations([2, 0, 0])];

/** The five forms, framed so their extremes sit near one render unit from the origin. */
export const metalMorphShapeDefinitions: Readonly<Record<MetalMorphShapeId, MetalMorphShapeDefinition>> = {
  'escher-star': { id: 'escher-star', vertices: rhombicDodecahedronVertices, scale: 0.3, spikeApexRadius: 1 },
  'stella-octangula': { id: 'stella-octangula', vertices: octahedronVertices, scale: 0.36, spikeApexRadius: 1 },
  cube: { id: 'cube', vertices: cubeVertices, scale: 0.6 },
  dodecahedron: { id: 'dodecahedron', vertices: dodecahedronVertices, scale: 0.57 },
  icosahedron: { id: 'icosahedron', vertices: icosahedronVertices, scale: 0.52 },
};

const centroidOf = (points: readonly Vector3Tuple[]): Vector3Tuple => {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of points) {
    x += point[0];
    y += point[1];
    z += point[2];
  }
  return [x / points.length, y / points.length, z / points.length];
};

/**
 * Outward plane through three vertices when every other vertex lies on one side of it; `undefined` when the
 * points are collinear or the plane cuts the solid.
 */
const supportingPlane = (
  vertices: readonly Vector3Tuple[],
  corners: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple],
): { normal: Vector3Tuple; offset: number } | undefined => {
  const [a, b, c] = corners;
  const raw = cross(subtract(b, a), subtract(c, a));
  if (length(raw) < coplanarTolerance) {
    return undefined;
  }
  const normal = normalize(raw);
  const offset = dot(normal, a);
  let above = 0;
  let below = 0;
  for (const point of vertices) {
    const side = dot(normal, point) - offset;
    if (side > coplanarTolerance) {
      above += 1;
    } else if (side < -coplanarTolerance) {
      below += 1;
    }
  }
  if (above > 0 && below > 0) {
    return undefined;
  }
  return above > 0 ? { normal: negate(normal), offset: -offset } : { normal, offset };
};

const planeKey = (normal: Vector3Tuple, offset: number): string =>
  [...normal, offset].map((component) => Math.round(component * 1e5) + 0).join('|');

const orderPolygon = (normal: Vector3Tuple, points: readonly Vector3Tuple[]): Vector3Tuple[] => {
  const centroid = centroidOf(points);
  const firstPoint = points[0];
  if (firstPoint === undefined) {
    return [];
  }
  const tangent = normalize(subtract(firstPoint, centroid));
  const bitangent = cross(normal, tangent);
  return [...points].sort((a, b) => {
    const aOffset = subtract(a, centroid);
    const bOffset = subtract(b, centroid);
    return (
      Math.atan2(dot(aOffset, bitangent), dot(aOffset, tangent)) -
      Math.atan2(dot(bOffset, bitangent), dot(bOffset, tangent))
    );
  });
};

/**
 * Recover the faces of a convex polyhedron from its vertex set: every plane through three vertices that keeps
 * all other vertices on one side is a face, its polygon being all vertices on that plane.
 */
export const extractConvexFaces = (vertices: readonly Vector3Tuple[]): ConvexFace[] => {
  const planes = new Map<string, { normal: Vector3Tuple; offset: number }>();
  for (const [first, a] of vertices.entries()) {
    for (let second = first + 1; second < vertices.length; second += 1) {
      for (let third = second + 1; third < vertices.length; third += 1) {
        const plane = supportingPlane(vertices, [a, vertices[second]!, vertices[third]!]);
        if (plane === undefined) {
          continue;
        }
        const key = planeKey(plane.normal, plane.offset);
        if (!planes.has(key)) {
          planes.set(key, plane);
        }
      }
    }
  }

  return [...planes.values()]
    .map(({ normal, offset }) => ({
      normal,
      offset,
      vertices: orderPolygon(
        normal,
        vertices.filter((point) => Math.abs(dot(normal, point) - offset) <= coplanarTolerance),
      ),
    }))
    .sort((a, b) => a.normal[0] - b.normal[0] || a.normal[1] - b.normal[1] || a.normal[2] - b.normal[2]);
};

const pyramidSidePlanes = (face: ConvexFace, apex: Vector3Tuple): ConvexFace[] => {
  const centroid = centroidOf(face.vertices);
  return face.vertices.map((start, index) => {
    const end = face.vertices[(index + 1) % face.vertices.length]!;
    const raw = normalize(cross(subtract(end, start), subtract(apex, start)));
    const normal = dot(raw, subtract(centroid, start)) > 0 ? negate(raw) : raw;
    return { normal, offset: dot(normal, start), vertices: [start, end, apex] };
  });
};

/** Build the plane sets a radial sampler needs for one shape definition. */
export const prepareSolid = (definition: MetalMorphShapeDefinition): PreparedSolid => {
  const faces = extractConvexFaces(definition.vertices.map((vertex) => scaleVector(vertex, definition.scale)));
  if (definition.spikeApexRadius === undefined) {
    return { id: definition.id, faces };
  }
  const apexRadius = definition.spikeApexRadius;
  return {
    id: definition.id,
    faces,
    spikes: faces.map((face) => pyramidSidePlanes(face, scaleVector(face.normal, apexRadius))),
  };
};

const nearestExit = (planes: readonly ConvexFace[], direction: Vector3Tuple): { index: number; radius: number } => {
  let bestIndex = -1;
  let bestRadius = Number.POSITIVE_INFINITY;
  for (const [index, plane] of planes.entries()) {
    const denominator = dot(plane.normal, direction);
    if (denominator <= grazingDenominatorTolerance) {
      continue;
    }
    const radius = plane.offset / denominator;
    if (radius < bestRadius) {
      bestRadius = radius;
      bestIndex = index;
    }
  }
  return { index: bestIndex, radius: bestRadius };
};

/** Distance and face normal where a ray from the origin along `direction` leaves the solid. */
export const sampleRadial = (solid: PreparedSolid, direction: Vector3Tuple): RadialSample => {
  const core = nearestExit(solid.faces, direction);
  const coreFace = solid.faces[core.index];
  if (coreFace === undefined) {
    throw new Error(`No face of ${solid.id} faces the sampled direction.`);
  }
  const spike = solid.spikes?.[core.index];
  if (spike === undefined) {
    return { radius: core.radius, normal: coreFace.normal };
  }
  const exit = nearestExit(spike, direction);
  const plane = spike[exit.index];
  return plane === undefined
    ? { radius: core.radius, normal: coreFace.normal }
    : { radius: exit.radius, normal: plane.normal };
};

const icosahedronFaces: ReadonlyArray<readonly [number, number, number]> = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1],
];

const rawIcosahedronBaseVertices: readonly Vector3Tuple[] = [
  [-1, goldenRatio, 0],
  [1, goldenRatio, 0],
  [-1, -goldenRatio, 0],
  [1, -goldenRatio, 0],
  [0, -1, goldenRatio],
  [0, 1, goldenRatio],
  [0, -1, -goldenRatio],
  [0, 1, -goldenRatio],
  [goldenRatio, 0, -1],
  [goldenRatio, 0, 1],
  [-goldenRatio, 0, -1],
  [-goldenRatio, 0, 1],
];
const icosahedronBaseVertices: readonly Vector3Tuple[] = rawIcosahedronBaseVertices.map((vertex) => normalize(vertex));

/** Vertex count of an icosphere subdivided `detail` times. */
export const icosphereVertexCount = (detail: number): number => 10 * 4 ** detail + 2;

/** Indexed unit icosphere with shared vertices, subdivided `detail` times. */
export const buildIcosphere = (detail: number): { positions: Float32Array; index: Uint32Array } => {
  const positions: number[] = icosahedronBaseVertices.flatMap((vertex) => [...vertex]);
  let faces: number[][] = icosahedronFaces.map((face) => [...face]);
  const midpoints = new Map<number, number>();

  const midpoint = (a: number, b: number): number => {
    const key = Math.min(a, b) * 1e7 + Math.max(a, b);
    const cached = midpoints.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const merged = normalize([
      (positions[a * 3]! + positions[b * 3]!) / 2,
      (positions[a * 3 + 1]! + positions[b * 3 + 1]!) / 2,
      (positions[a * 3 + 2]! + positions[b * 3 + 2]!) / 2,
    ]);
    const index = positions.length / 3;
    positions.push(...merged);
    midpoints.set(key, index);
    return index;
  };

  for (let level = 0; level < detail; level += 1) {
    faces = faces.flatMap(([a, b, c]) => {
      const ab = midpoint(a!, b!);
      const bc = midpoint(b!, c!);
      const ca = midpoint(c!, a!);
      return [
        [a!, ab, ca],
        [b!, bc, ab],
        [c!, ca, bc],
        [ab, bc, ca],
      ];
    });
  }

  return { positions: new Float32Array(positions), index: new Uint32Array(faces.flat()) };
};

const geometryDataCache = new Map<number, MetalMorphGeometryData>();

/**
 * Sample every shape onto one icosphere. Results are cached per detail level because the data is immutable and
 * every loader instance at that quality shares it.
 */
export const getMetalMorphGeometryData = (detail: number): MetalMorphGeometryData => {
  const cached = geometryDataCache.get(detail);
  if (cached !== undefined) {
    return cached;
  }
  const { positions, index } = buildIcosphere(detail);
  const vertexCount = positions.length / 3;
  const entries = metalMorphShapeIds.map((id) => {
    const solid = prepareSolid(metalMorphShapeDefinitions[id]);
    const packed = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const direction: Vector3Tuple = [positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!];
      const sample = sampleRadial(solid, direction);
      packed[vertex * 4] = sample.normal[0];
      packed[vertex * 4 + 1] = sample.normal[1];
      packed[vertex * 4 + 2] = sample.normal[2];
      packed[vertex * 4 + 3] = sample.radius;
    }
    return [id, packed] as const;
  });
  const data: MetalMorphGeometryData = {
    detail,
    vertexCount,
    directions: positions,
    index,
    shapes: Object.fromEntries(entries) as Record<MetalMorphShapeId, Float32Array>,
  };
  geometryDataCache.set(detail, data);
  return data;
};

export type PlaneTuple = readonly [number, number, number, number];

/** Per-shape plane bookkeeping for the fragment shader: core plane start and count, side plane start, sides per core face. */
export type PlaneDescriptor = readonly [number, number, number, number];

export type MetalMorphPlaneTable = Readonly<{
  /** `normal.xyz, offset` per plane: each shape's core planes followed by its pyramid side planes. */
  planes: readonly PlaneTuple[];
  /** Indexed like {@link metalMorphShapeIds}. */
  descriptors: readonly PlaneDescriptor[];
}>;

let planeTableCache: MetalMorphPlaneTable | undefined;

/**
 * Flatten every shape's planes into one table so a fragment shader can recover the exact face normal along any
 * direction with two bounded loops instead of relying on interpolated vertex normals.
 */
export const getMetalMorphPlaneTable = (): MetalMorphPlaneTable => {
  if (planeTableCache !== undefined) {
    return planeTableCache;
  }
  const planes: PlaneTuple[] = [];
  const descriptors: PlaneDescriptor[] = [];
  for (const id of metalMorphShapeIds) {
    const solid = prepareSolid(metalMorphShapeDefinitions[id]);
    const coreStart = planes.length;
    for (const face of solid.faces) {
      planes.push([face.normal[0], face.normal[1], face.normal[2], face.offset]);
    }
    const sideStart = planes.length;
    const sidesPerFace = solid.spikes?.[0]?.length ?? 0;
    for (const sides of solid.spikes ?? []) {
      for (const plane of sides) {
        planes.push([plane.normal[0], plane.normal[1], plane.normal[2], plane.offset]);
      }
    }
    descriptors.push([coreStart, solid.faces.length, sideStart, sidesPerFace]);
  }
  planeTableCache = { planes, descriptors };
  return planeTableCache;
};

const nearestTablePlane = (
  table: MetalMorphPlaneTable,
  range: { readonly start: number; readonly count: number },
  direction: Vector3Tuple,
): { index: number; radius: number } => {
  let bestIndex = -1;
  let bestRadius = Number.POSITIVE_INFINITY;
  for (let offset = 0; offset < range.count; offset += 1) {
    const plane = table.planes[range.start + offset]!;
    const denominator = plane[0] * direction[0] + plane[1] * direction[1] + plane[2] * direction[2];
    if (denominator <= grazingDenominatorTolerance) {
      continue;
    }
    const radius = plane[3] / denominator;
    if (radius < bestRadius) {
      bestRadius = radius;
      bestIndex = offset;
    }
  }
  return { index: bestIndex, radius: bestRadius };
};

/** CPU twin of the fragment shader's plane-table lookup; must agree with {@link sampleRadial}. */
export const sampleFromPlaneTable = (
  table: MetalMorphPlaneTable,
  shapeIndex: number,
  direction: Vector3Tuple,
): RadialSample => {
  const descriptor = table.descriptors[shapeIndex];
  if (descriptor === undefined) {
    throw new Error(`No plane descriptor for shape index ${shapeIndex}.`);
  }
  const [coreStart, coreCount, sideStart, sidesPerFace] = descriptor;
  const core = nearestTablePlane(table, { start: coreStart, count: coreCount }, direction);
  const corePlane = table.planes[coreStart + core.index]!;
  if (sidesPerFace === 0) {
    return { radius: core.radius, normal: [corePlane[0], corePlane[1], corePlane[2]] };
  }
  const side = nearestTablePlane(
    table,
    { start: sideStart + core.index * sidesPerFace, count: sidesPerFace },
    direction,
  );
  const sidePlane = table.planes[sideStart + core.index * sidesPerFace + side.index]!;
  return { radius: side.radius, normal: [sidePlane[0], sidePlane[1], sidePlane[2]] };
};
