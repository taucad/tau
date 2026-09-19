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

export type MetalMorphShapeDefinition<Id extends string = MetalMorphShapeId> = Readonly<{
  id: Id;
  /** Convex core vertices before `scale` is applied. */
  vertices: readonly Vector3Tuple[];
  /** Uniform scale that brings the core into the loader's unit framing. */
  scale: number;
  /** Distance from the origin to the apex of the pyramid raised on every core face; absent for plain solids. */
  spikeApexRadius?: number;
  /**
   * Log-sum-exp temperature, in render units, that fillets every edge, corner, ridge, tip and crease. Planes
   * meeting at a flatter dihedral blend over a wider band at the same temperature, so shallow solids are cooler.
   */
  roundness: number;
}>;

export type RadialSample = Readonly<{
  /** Distance from the origin to the rounded surface along the sampled direction. */
  radius: number;
  /** Unit outward normal of the rounded surface, blended from the planes that shape it there. */
  normal: Vector3Tuple;
}>;

/** A plane bounding the solid: everything the radial samplers need from a {@link ConvexFace}. */
export type RadialPlane = Readonly<{
  normal: Vector3Tuple;
  offset: number;
}>;

export type PreparedSolid<Id extends string = MetalMorphShapeId> = Readonly<{
  id: Id;
  roundness: number;
  faces: readonly ConvexFace[];
  /** Side planes of the pyramid raised on `faces[index]`, when the solid is stellated. */
  spikes?: ReadonlyArray<readonly ConvexFace[]>;
  /** For `spikes[face][side]`, the neighbouring pyramid's side plane raised on the same core edge. */
  creases?: ReadonlyArray<readonly ConvexFace[]>;
}>;

export type MetalMorphGeometryData = Readonly<{
  detail: number;
  vertexCount: number;
  /** Unit directions, three floats per vertex; doubles as the mesh `position` attribute. */
  directions: Float32Array;
  index: Uint32Array;
  /**
   * Interleaved samples, {@link metalMorphSampleStride} floats per vertex, keyed by shape: `normal.xyz, radius`
   * then the unit direction the sample was taken along and one float of padding. That direction is the vertex's
   * icosphere direction drawn into the shape's fillets (see {@link concentrateDirection}), so it differs per shape.
   */
  shapes: Readonly<Record<MetalMorphShapeId, Float32Array>>;
}>;

/** Floats per vertex in a packed shape buffer: two `vec4` slots, so both attributes read from one GPU buffer. */
export const metalMorphSampleStride = 8;
/** Float offset of the sampling direction inside a packed vertex. */
export const metalMorphDirectionOffset = 4;

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

/**
 * The five forms, framed so their extremes sit near one render unit from the origin. Each temperature was
 * chosen so the fillet reaches about 0.075 render units into every face from its edges, whatever the dihedral.
 */
export const metalMorphShapeDefinitions: Readonly<Record<MetalMorphShapeId, MetalMorphShapeDefinition>> = {
  'escher-star': {
    id: 'escher-star',
    vertices: rhombicDodecahedronVertices,
    scale: 0.3,
    spikeApexRadius: 1,
    roundness: 0.026,
  },
  'stella-octangula': {
    id: 'stella-octangula',
    vertices: octahedronVertices,
    scale: 0.36,
    spikeApexRadius: 1,
    roundness: 0.03,
  },
  cube: { id: 'cube', vertices: cubeVertices, scale: 0.6, roundness: 0.044 },
  dodecahedron: { id: 'dodecahedron', vertices: dodecahedronVertices, scale: 0.57, roundness: 0.029 },
  icosahedron: { id: 'icosahedron', vertices: icosahedronVertices, scale: 0.52, roundness: 0.02 },
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

const vertexKey = (point: Vector3Tuple): string => point.map((component) => Math.round(component * 1e5) + 0).join(',');

const edgeKey = (start: Vector3Tuple, end: Vector3Tuple): string => {
  const first = vertexKey(start);
  const second = vertexKey(end);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
};

/**
 * For every side plane of every spike, the neighbouring spike's side plane raised on the same core edge: the
 * two planes meet along the concave crease between the spikes.
 */
const pairCreases = (spikes: ReadonlyArray<readonly ConvexFace[]>): ConvexFace[][] => {
  const owners = new Map<string, ConvexFace[]>();
  for (const sides of spikes) {
    for (const side of sides) {
      const key = edgeKey(side.vertices[0]!, side.vertices[1]!);
      const claimants = owners.get(key) ?? [];
      claimants.push(side);
      owners.set(key, claimants);
    }
  }
  return spikes.map((sides) =>
    sides.map((side) => {
      const twin = owners.get(edgeKey(side.vertices[0]!, side.vertices[1]!))?.find((claimant) => claimant !== side);
      if (twin === undefined) {
        throw new Error('Every core edge must be shared by exactly two spikes.');
      }
      return twin;
    }),
  );
};

/** Build the plane sets a radial sampler needs for one shape definition. */
export const prepareSolid = <Id extends string>(definition: MetalMorphShapeDefinition<Id>): PreparedSolid<Id> => {
  const faces = extractConvexFaces(definition.vertices.map((vertex) => scaleVector(vertex, definition.scale)));
  const solid: PreparedSolid<Id> = { id: definition.id, roundness: definition.roundness, faces };
  if (definition.spikeApexRadius === undefined) {
    return solid;
  }
  const apexRadius = definition.spikeApexRadius;
  const spikes = faces.map((face) => pyramidSidePlanes(face, scaleVector(face.normal, apexRadius)));
  return { ...solid, spikes, creases: pairCreases(spikes) };
};

/** A direction to sample together with the temperature that rounds the sampled solid. */
type RadialQuery = Readonly<{
  direction: Vector3Tuple;
  roundness: number;
}>;

/** Exit through the nearest facing plane along `direction`, or `index: -1` when no plane faces it. */
const nearestExit = (planes: readonly RadialPlane[], direction: Vector3Tuple): { index: number; radius: number } => {
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

/**
 * Smooth exit through a plane set: a log-sum-exp minimum over the radial exits of every facing plane. Where
 * several planes tie (edges, corners, ridges, tips) the surface is filleted over a band that scales with the
 * temperature, while a face centre, many temperatures away from any other plane, stays exact. The normal
 * blends the plane normals with the same weights. `undefined` when no plane faces the direction.
 */
const softExit = (planes: readonly RadialPlane[], query: RadialQuery): RadialSample | undefined => {
  const nearest = nearestExit(planes, query.direction);
  if (nearest.index < 0) {
    return undefined;
  }
  let total = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const plane of planes) {
    const denominator = dot(plane.normal, query.direction);
    if (denominator <= grazingDenominatorTolerance) {
      continue;
    }
    const weight = Math.exp(-(plane.offset / denominator - nearest.radius) / query.roundness);
    total += weight;
    x += weight * plane.normal[0];
    y += weight * plane.normal[1];
    z += weight * plane.normal[2];
  }
  return { radius: nearest.radius - query.roundness * Math.log(total), normal: normalize([x, y, z]) };
};

/**
 * Smooth union of a spike with its neighbours across the base edges: a log-sum-exp maximum over the spike's
 * own exit and the neighbouring side planes through those edges. Under this spike a neighbour's plane lies
 * beneath the surface, so it only shows along the shared crease, which fills by the band a convex edge loses.
 */
const fillCreases = (spike: RadialSample, twins: readonly RadialPlane[], query: RadialQuery): RadialSample => {
  const candidates: RadialSample[] = [spike];
  let peak = spike.radius;
  for (const twin of twins) {
    const denominator = dot(twin.normal, query.direction);
    if (denominator <= grazingDenominatorTolerance) {
      continue;
    }
    const radius = twin.offset / denominator;
    candidates.push({ radius, normal: twin.normal });
    peak = Math.max(peak, radius);
  }
  let total = 0;
  let x = 0;
  let y = 0;
  let z = 0;
  for (const candidate of candidates) {
    const weight = Math.exp((candidate.radius - peak) / query.roundness);
    total += weight;
    x += weight * candidate.normal[0];
    y += weight * candidate.normal[1];
    z += weight * candidate.normal[2];
  }
  return { radius: peak + query.roundness * Math.log(total), normal: normalize([x, y, z]) };
};

/** Distance and surface normal where a ray from the origin along `direction` leaves the rounded solid. */
export const sampleRadial = (solid: PreparedSolid<string>, direction: Vector3Tuple): RadialSample => {
  const query: RadialQuery = { direction, roundness: solid.roundness };
  const core = nearestExit(solid.faces, direction);
  const sides = solid.spikes?.[core.index];
  const twins = solid.creases?.[core.index];
  if (sides === undefined || twins === undefined) {
    const body = softExit(solid.faces, query);
    if (body === undefined) {
      throw new Error(`No face of ${solid.id} faces the sampled direction.`);
    }
    return body;
  }
  const spike = softExit(sides, query);
  if (spike === undefined) {
    throw new Error(`No side of the ${solid.id} spike faces the sampled direction.`);
  }
  return fillCreases(spike, twins, query);
};

/**
 * A planar triangle of the sharp solid: a pyramid flank of a stellated form, whose three edges are a ridge, a
 * ridge and a crease, or one wedge of a plain face fanned from its centroid, where only the outer edge is real.
 */
type FeaturePatch = Readonly<{
  corners: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple];
  /** Whether the edge opposite each corner is a feature of the solid rather than a construction line. */
  isFeature: readonly [boolean, boolean, boolean];
  /** Band width as a fraction of the altitude onto each edge, so the band is one width in render units. */
  band: readonly [number, number, number];
}>;

/**
 * Width, in render units, of the band along every feature inside which samples are drawn toward it. Four times
 * the reach of a fillet: wide enough that several rows land inside every fillet, narrow enough that each patch
 * keeps an untouched interior.
 */
const featureBand = 0.3;
/** A band never claims more than this share of a patch, so every patch keeps an untouched interior. */
const maximumBandShare = 0.45;

const featurePatchesCache = new Map<MetalMorphShapeId, ReadonlyArray<readonly FeaturePatch[]>>();

const patchOf = (
  corners: readonly [Vector3Tuple, Vector3Tuple, Vector3Tuple],
  isFeature: readonly [boolean, boolean, boolean],
): FeaturePatch => {
  const doubleArea = length(cross(subtract(corners[1], corners[0]), subtract(corners[2], corners[0])));
  const bandOnto = (first: Vector3Tuple, second: Vector3Tuple): number =>
    Math.min(maximumBandShare, featureBand / (doubleArea / length(subtract(second, first))));
  return {
    corners,
    isFeature,
    band: [bandOnto(corners[1], corners[2]), bandOnto(corners[2], corners[0]), bandOnto(corners[0], corners[1])],
  };
};

/** Feature patches of every core face: the flanks of the pyramid raised on it, or the face fanned into wedges. */
const featurePatchesOf = (solid: PreparedSolid): ReadonlyArray<readonly FeaturePatch[]> => {
  const cached = featurePatchesCache.get(solid.id);
  if (cached !== undefined) {
    return cached;
  }
  const patches = solid.faces.map((face, faceIndex): FeaturePatch[] => {
    const sides = solid.spikes?.[faceIndex];
    if (sides !== undefined) {
      return sides.map((side) =>
        patchOf([side.vertices[0]!, side.vertices[1]!, side.vertices[2]!], [true, true, true]),
      );
    }
    const centroid = centroidOf(face.vertices);
    return face.vertices.map((start, index) =>
      patchOf([centroid, start, face.vertices[(index + 1) % face.vertices.length]!], [true, false, false]),
    );
  });
  featurePatchesCache.set(solid.id, patches);
  return patches;
};

/**
 * Coordinates of `direction` between the unit directions of a patch's corners, summing to one. Taken against
 * the corners themselves they would follow the radial projection, which crowds a spike's samples at its base
 * and stretches them fourfold toward its apex, because the flank lies nearly edge-on to its rays. Against the
 * corner directions they are close to uniform over the patch of sphere, so the samples land evenly across the
 * plane. A resting flank is flat and would not care; a morphing one blends two such parametrisations, and any
 * stretch in either shows up as facets.
 */
const directionalBarycentrics = (
  corners: FeaturePatch['corners'],
  direction: Vector3Tuple,
): readonly [number, number, number] | undefined => {
  const [unitA, unitB, unitC] = [normalize(corners[0]), normalize(corners[1]), normalize(corners[2])];
  // Cramer's rule on `u unitA + v unitB + w unitC = t direction`: each weight is a scalar triple product.
  const u = dot(direction, cross(unitB, unitC));
  const v = dot(direction, cross(unitC, unitA));
  const w = dot(direction, cross(unitA, unitB));
  const total = u + v + w;
  if (Math.abs(total) < grazingDenominatorTolerance) {
    return undefined;
  }
  return [u / total, v / total, w / total];
};

/**
 * Where a coordinate inside the band lands. It collapses quadratically onto the edge, so the rows nearest a
 * ridge meet on its crest rather than zig-zag across it, and rejoins the identity with no kink at the band's
 * far side. Higher orders and narrower bands were measured and resolve the fillets no better.
 */
const collapse = (coordinate: number, band: number): number => {
  if (coordinate >= band) {
    return coordinate;
  }
  const share = coordinate / band;
  return band * share * share * (2 - share);
};

/** How strongly a construction line pulls at `coordinate` from a real edge: fully on it, not at all past the band. */
const bandFade = (coordinate: number, band: number): number => {
  const remaining = Math.max(0, 1 - coordinate / band);
  return remaining * remaining;
};

/**
 * Draw a sampling direction toward the features of a solid.
 *
 * The rounded surface is flat except inside fillet bands far narrower than the shared mesh, and a flat patch
 * is exact under any triangulation. Sampled uniformly, a fillet catches one or two vertex rows at irregular
 * offsets from its crest, so the silhouette zig-zags from vertex to vertex. Moving the samples into the
 * fillets spends the same vertices where the curvature is.
 *
 * The pull acts on barycentric coordinates, so a point on an edge slides along that edge and both patches
 * sharing it agree on where it goes: the map stays continuous. Past the band a coordinate is untouched, which
 * keeps the interior of every patch linear, so a morph between two shapes shows no facets. A
 * construction line only pulls inside the band of the real edge it ends on, which is what gathers samples
 * around a corner without gathering them along the line or at a face centre.
 */
export const concentrateDirection = (solid: PreparedSolid, direction: Vector3Tuple): Vector3Tuple => {
  const core = nearestExit(solid.faces, direction);
  let best: { patch: FeaturePatch; weights: readonly [number, number, number]; inside: number } | undefined;
  for (const patch of featurePatchesOf(solid)[core.index] ?? []) {
    const weights = directionalBarycentrics(patch.corners, direction);
    if (weights === undefined) {
      continue;
    }
    const inside = Math.min(...weights);
    if (best === undefined || inside > best.inside) {
      best = { patch, weights, inside };
    }
  }
  if (best === undefined) {
    return direction;
  }
  const { patch } = best;
  // On a cell boundary the direction can fall a rounding error outside every patch; clamping absorbs it.
  const weights = best.weights.map((weight) => Math.max(weight, 0));
  let nearFeature = 0;
  for (const [index, weight] of weights.entries()) {
    if (patch.isFeature[index]!) {
      nearFeature = Math.max(nearFeature, bandFade(weight, patch.band[index]!));
    }
  }
  const pulled = weights.map((weight, index) => {
    const strength = patch.isFeature[index]! ? 1 : nearFeature;
    return weight - strength * (weight - collapse(weight, patch.band[index]!));
  });
  const total = pulled[0]! + pulled[1]! + pulled[2]!;
  const [a, b, c] = patch.corners;
  return normalize([
    (pulled[0]! * a[0] + pulled[1]! * b[0] + pulled[2]! * c[0]) / total,
    (pulled[0]! * a[1] + pulled[1]! * b[1] + pulled[2]! * c[1]) / total,
    (pulled[0]! * a[2] + pulled[1]! * b[2] + pulled[2]! * c[2]) / total,
  ]);
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

/** Packed radial samples of a set of solids on one shared icosphere; see {@link sampleSolidsOntoIcosphere}. */
export type RadialGeometryData<Id extends string> = Readonly<{
  detail: number;
  vertexCount: number;
  /** Unit directions, three floats per vertex; doubles as the mesh `position` attribute. */
  directions: Float32Array;
  index: Uint32Array;
  /** Packed `normal.xyz, radius` samples, four floats per vertex, keyed by shape. */
  shapes: Readonly<Record<Id, Float32Array>>;
}>;

/**
 * Sample every solid onto one icosphere subdivided `detail` times, packing `normal.xyz, radius` per vertex
 * and shape, so a GPU can morph between them by interpolating the packed samples.
 */
export const sampleSolidsOntoIcosphere = <Id extends string>(
  detail: number,
  solids: ReadonlyArray<PreparedSolid<Id>>,
): RadialGeometryData<Id> => {
  const { positions, index } = buildIcosphere(detail);
  const vertexCount = positions.length / 3;
  const entries = solids.map((solid) => {
    const packed = new Float32Array(vertexCount * 4);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const direction: Vector3Tuple = [positions[vertex * 3]!, positions[vertex * 3 + 1]!, positions[vertex * 3 + 2]!];
      const sample = sampleRadial(solid, direction);
      packed[vertex * 4] = sample.normal[0];
      packed[vertex * 4 + 1] = sample.normal[1];
      packed[vertex * 4 + 2] = sample.normal[2];
      packed[vertex * 4 + 3] = sample.radius;
    }
    return [solid.id, packed] as const;
  });
  return {
    detail,
    vertexCount,
    directions: positions,
    index,
    // Every solid contributes exactly one entry, so the record is complete for the id union.
    shapes: Object.fromEntries(entries) as Record<Id, Float32Array>,
  };
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
    const packed = new Float32Array(vertexCount * metalMorphSampleStride);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const direction = concentrateDirection(solid, [
        positions[vertex * 3]!,
        positions[vertex * 3 + 1]!,
        positions[vertex * 3 + 2]!,
      ]);
      const sample = sampleRadial(solid, direction);
      packed.set([...sample.normal, sample.radius, ...direction, 0], vertex * metalMorphSampleStride);
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

/**
 * Per-shape plane bookkeeping for the fragment shader: core plane start and count, side plane start, sides per
 * core face. All zero for a plain solid, whose fillets are wide enough to interpolate from the vertex normals.
 */
export type PlaneDescriptor = readonly [number, number, number, number];

export type MetalMorphPlaneTable = Readonly<{
  /** `normal.xyz, offset` per plane: each stellated shape's core planes followed by its pyramid side planes. */
  planes: readonly PlaneTuple[];
  /** Aligned with `planes`: for a side plane, the neighbouring spike's plane through the same core edge; zero for core planes. */
  twins: readonly PlaneTuple[];
  /** Indexed like {@link metalMorphShapeIds}. */
  descriptors: readonly PlaneDescriptor[];
  /** Log-sum-exp temperature per shape, indexed like {@link metalMorphShapeIds}. */
  roundness: readonly number[];
}>;

type PlaneRange = Readonly<{ start: number; count: number }>;

const planeOf = (plane: RadialPlane): PlaneTuple => [plane.normal[0], plane.normal[1], plane.normal[2], plane.offset];

const planesInRange = (planes: readonly PlaneTuple[], range: PlaneRange): RadialPlane[] =>
  planes
    .slice(range.start, range.start + range.count)
    .map((plane) => ({ normal: [plane[0], plane[1], plane[2]], offset: plane[3] }));

let planeTableCache: MetalMorphPlaneTable | undefined;

/**
 * Flatten the stellated shapes' planes into one table so a fragment shader can recover their rounded normal
 * along any direction with bounded loops: spike ridges and creases are narrower than the shared mesh, so
 * interpolated vertex normals would zig-zag along them. Plain solids need no planes.
 */
export const getMetalMorphPlaneTable = (): MetalMorphPlaneTable => {
  if (planeTableCache !== undefined) {
    return planeTableCache;
  }
  const planes: PlaneTuple[] = [];
  const twins: PlaneTuple[] = [];
  const descriptors: PlaneDescriptor[] = [];
  const roundness: number[] = [];
  for (const id of metalMorphShapeIds) {
    const solid = prepareSolid(metalMorphShapeDefinitions[id]);
    roundness.push(solid.roundness);
    if (solid.spikes === undefined || solid.creases === undefined) {
      descriptors.push([0, 0, 0, 0]);
      continue;
    }
    const coreStart = planes.length;
    for (const face of solid.faces) {
      planes.push(planeOf(face));
      twins.push([0, 0, 0, 0]);
    }
    const sideStart = planes.length;
    for (const [faceIndex, sides] of solid.spikes.entries()) {
      for (const [sideIndex, plane] of sides.entries()) {
        const twin = solid.creases[faceIndex]?.[sideIndex];
        if (twin === undefined) {
          throw new Error(`Spike ${faceIndex} of ${id} has no crease pairing for side ${sideIndex}.`);
        }
        planes.push(planeOf(plane));
        twins.push(planeOf(twin));
      }
    }
    descriptors.push([coreStart, solid.faces.length, sideStart, solid.spikes[0]?.length ?? 0]);
  }
  planeTableCache = { planes, twins, descriptors, roundness };
  return planeTableCache;
};

/** CPU twin of the fragment shader's stellated lookup; must agree with {@link sampleRadial} for the stars. */
export const sampleFromPlaneTable = (
  table: MetalMorphPlaneTable,
  shapeIndex: number,
  direction: Vector3Tuple,
): RadialSample => {
  const descriptor = table.descriptors[shapeIndex];
  const roundness = table.roundness[shapeIndex];
  if (descriptor === undefined || roundness === undefined) {
    throw new Error(`No plane descriptor for shape index ${shapeIndex}.`);
  }
  const [coreStart, coreCount, sideStart, sidesPerFace] = descriptor;
  if (sidesPerFace === 0) {
    throw new Error(`Shape index ${shapeIndex} is not stellated; its normals interpolate from the vertices.`);
  }
  const query: RadialQuery = { direction, roundness };
  const core = nearestExit(planesInRange(table.planes, { start: coreStart, count: coreCount }), direction);
  const range: PlaneRange = { start: sideStart + core.index * sidesPerFace, count: sidesPerFace };
  const spike = softExit(planesInRange(table.planes, range), query);
  if (spike === undefined) {
    throw new Error(`No side plane of shape ${shapeIndex} faces the sampled direction.`);
  }
  return fillCreases(spike, planesInRange(table.twins, range), query);
};
