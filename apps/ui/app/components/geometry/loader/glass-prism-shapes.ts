import {
  prepareSolid,
  sampleRadial,
  sampleSolidsOntoIcosphere,
} from '#components/geometry/loader/metal-morph-shapes.js';
import type {
  MetalMorphShapeDefinition,
  PreparedSolid,
  RadialGeometryData,
  Vector3Tuple,
} from '#components/geometry/loader/metal-morph-shapes.js';

/**
 * Pure geometry for the glass prism loader.
 *
 * Every morphology is a convex solid on the metal loader's radial sampler, so the same icosphere topology
 * carries all five and the body morphs between them on the GPU. This module adds what glass needs on top:
 * the cross-section the light sheet cuts through the morphing body, sampled on the CPU with the same blend
 * the vertex stage uses, so the traced rays refract through the surface the eye sees.
 *
 * All values are dimensionless render units; the loader has no physical frame.
 */

export type GlassPrismShapeId = 'prism' | 'lens' | 'gem' | 'slab' | 'droplet';

/** Attribute order of the packed per-shape samples; the shader selects targets by this index. */
export const glassPrismShapeIds = [
  'prism',
  'lens',
  'gem',
  'slab',
  'droplet',
] as const satisfies readonly GlassPrismShapeId[];

export const glassPrismShapeLabels: Readonly<Record<GlassPrismShapeId, string>> = {
  prism: 'Prism',
  lens: 'Lens',
  gem: 'Brilliant',
  slab: 'Slab',
  droplet: 'Droplet',
};

/** What each morphology does to the beam, for captions. */
export const glassPrismShapeCaptions: Readonly<Record<GlassPrismShapeId, string>> = {
  prism:
    'A triangular prism spreads the beam into one clean spectrum, narrowing through minimum deviation as it turns.',
  lens: 'A biconvex lens folds the beam to a focus and lets it go again, each colour focusing at its own distance.',
  gem: 'A brilliant cut scatters the beam through its facets and bounces it off the pavilion into spectral shards.',
  slab: 'A parallel plate shifts the beam sideways and, near grazing angles, rings with internal reflections.',
  droplet: 'A near-spherical bead turns the beam back on itself once inside, the geometry of a rainbow.',
};

export type GlassPrismShapeDefinition = MetalMorphShapeDefinition<GlassPrismShapeId>;

/** Axis and angle, in radians, that turn a morphology from its authored pose into the one the sheet cuts. */
export type RestOrientation = Readonly<{ axis: Vector3Tuple; angle: number }>;

/**
 * How each morphology lies in the light sheet at rest. A form is authored around a vertical axis; the sheet
 * is horizontal, so the ones whose optics live in their profile are laid on their side: the beam meets the
 * lens face on and cuts the brilliant from table to culet, where its facets can throw fire.
 */
export const glassPrismRestOrientations: Readonly<Record<GlassPrismShapeId, RestOrientation>> = {
  prism: { axis: [0, 1, 0], angle: 0 },
  lens: { axis: [0, 0, 1], angle: Math.PI / 2 },
  gem: { axis: [1, 0, 0], angle: Math.PI / 2 },
  slab: { axis: [0, 1, 0], angle: 0.35 },
  droplet: { axis: [0, 1, 0], angle: 0 },
};

type Ring = Readonly<{ count: number; radius: number; y: number; phase?: number }>;

const ring = ({ count, radius, y, phase = 0 }: Ring): Vector3Tuple[] =>
  Array.from({ length: count }, (_unused, index) => {
    const angle = phase + (index / count) * Math.PI * 2;
    return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
  });

const goldenRatio = (1 + Math.sqrt(5)) / 2;
const icosahedronVertices: Vector3Tuple[] = [
  [0, 1, goldenRatio],
  [0, -1, goldenRatio],
  [0, 1, -goldenRatio],
  [0, -1, -goldenRatio],
  [1, goldenRatio, 0],
  [-1, goldenRatio, 0],
  [1, -goldenRatio, 0],
  [-1, -goldenRatio, 0],
  [goldenRatio, 0, 1],
  [goldenRatio, 0, -1],
  [-goldenRatio, 0, 1],
  [-goldenRatio, 0, -1],
];

/** Triangle circumradius and half-height of the prism, before scale. */
const prismProfile = { radius: 0.92, halfHeight: 0.55 } as const;
/** Rim radius, shoulder radius and shoulder height of the lens, before scale. */
const lensProfile = { rim: 1, shoulder: 0.66, shoulderHeight: 0.3, poleHeight: 0.44 } as const;
/** Girdle radius, table radius and heights of the brilliant, before scale. */
const gemProfile = { girdle: 1, table: 0.54, tableHeight: 0.42, culetDepth: 0.98 } as const;
/** Half-extents of the slab along x, y and z, before scale. */
const slabProfile: Vector3Tuple = [1, 0.34, 0.62];

/**
 * The five morphologies, framed so their extremes sit near one render unit from the origin. The lens and the
 * droplet carry a warm temperature so their facets melt into curved surfaces; the others keep crisp edges
 * a fillet only softens.
 */
export const glassPrismShapeDefinitions: Readonly<Record<GlassPrismShapeId, GlassPrismShapeDefinition>> = {
  prism: {
    id: 'prism',
    vertices: [
      ...ring({ count: 3, radius: prismProfile.radius, y: prismProfile.halfHeight, phase: Math.PI / 2 }),
      ...ring({ count: 3, radius: prismProfile.radius, y: -prismProfile.halfHeight, phase: Math.PI / 2 }),
    ],
    scale: 0.94,
    roundness: 0.02,
  },
  lens: {
    id: 'lens',
    vertices: [
      ...ring({ count: 20, radius: lensProfile.rim, y: 0 }),
      ...ring({ count: 20, radius: lensProfile.shoulder, y: lensProfile.shoulderHeight, phase: Math.PI / 20 }),
      ...ring({ count: 20, radius: lensProfile.shoulder, y: -lensProfile.shoulderHeight, phase: Math.PI / 20 }),
      [0, lensProfile.poleHeight, 0],
      [0, -lensProfile.poleHeight, 0],
    ],
    scale: 1,
    roundness: 0.07,
  },
  gem: {
    id: 'gem',
    vertices: [
      ...ring({ count: 16, radius: gemProfile.girdle, y: 0 }),
      ...ring({ count: 8, radius: gemProfile.table, y: gemProfile.tableHeight, phase: Math.PI / 16 }),
      [0, -gemProfile.culetDepth, 0],
    ],
    scale: 0.94,
    roundness: 0.014,
  },
  slab: {
    id: 'slab',
    vertices: [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sy) =>
        [-1, 1].map((sz): Vector3Tuple => [sx * slabProfile[0], sy * slabProfile[1], sz * slabProfile[2]]),
      ),
    ),
    scale: 0.9,
    roundness: 0.035,
  },
  droplet: { id: 'droplet', vertices: icosahedronVertices, scale: 0.6, roundness: 0.15 },
};

const preparedCache = new Map<GlassPrismShapeId, PreparedSolid<GlassPrismShapeId>>();

/** The plane set of one morphology, prepared once. */
export const getGlassPrismSolid = (id: GlassPrismShapeId): PreparedSolid<GlassPrismShapeId> => {
  const cached = preparedCache.get(id);
  if (cached !== undefined) {
    return cached;
  }
  const solid = prepareSolid(glassPrismShapeDefinitions[id]);
  preparedCache.set(id, solid);
  return solid;
};

export type GlassPrismGeometryData = RadialGeometryData<GlassPrismShapeId>;

const geometryDataCache = new Map<number, GlassPrismGeometryData>();

/** Every morphology sampled onto one icosphere, cached per detail level and shared by every loader at that tier. */
export const getGlassPrismGeometryData = (detail: number): GlassPrismGeometryData => {
  const cached = geometryDataCache.get(detail);
  if (cached !== undefined) {
    return cached;
  }
  const data = sampleSolidsOntoIcosphere(
    detail,
    glassPrismShapeIds.map((id) => getGlassPrismSolid(id)),
  );
  geometryDataCache.set(detail, data);
  return data;
};

/** Where the travelling front sits on the body, mirroring the vertex stage's `createFrontField`. */
export type MorphFront = Readonly<{
  /** Unit axis, in object space, the front travels along. */
  sweepAxis: Vector3Tuple;
  /** Eased travel of the front, 0 (source form) to 1 (target form). */
  progress: number;
  /** Half-width of the front, as a fraction of the body's extent along the sweep axis. */
  band: number;
  /** Back-ease overshoot applied to the travelling front. */
  overshoot: number;
}>;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * Blend weight from the source form to the target form along one direction, 0 ahead of the front and 1
 * behind it, with the same back-ease the vertex stage applies. The CPU twin of the shader's front field.
 */
export const morphWeightAt = (direction: Vector3Tuple, front: MorphFront): number => {
  const alongSweep =
    (direction[0] * front.sweepAxis[0] + direction[1] * front.sweepAxis[1] + direction[2] * front.sweepAxis[2]) * 0.5 +
    0.5;
  const frontPosition = front.progress * (1 + front.band * 2) - front.band;
  const local = 1 - smoothstep(frontPosition - front.band, frontPosition + front.band, alongSweep);
  const shifted = local - 1;
  return 1 + (front.overshoot + 1) * shifted * shifted * shifted + front.overshoot * shifted * shifted;
};

export type SheetCrossSectionOptions = Readonly<{
  from: PreparedSolid<GlassPrismShapeId>;
  to: PreparedSolid<GlassPrismShapeId>;
  /** The front between `from` and `to`; absent while the body rests on `from`. */
  front?: MorphFront;
  /** Maps a world-space direction into the body's object space, undoing its rotation. */
  toObjectSpace: (direction: Vector3Tuple) => Vector3Tuple;
  /** Uniform scale the body is drawn at. */
  scale: number;
  /** Number of directions sampled around the sheet. */
  count: number;
}>;

/**
 * The polygon the light sheet (the world plane `y = 0`) cuts out of the morphing body, as `x, z` pairs in
 * counter-clockwise order. Each point sits where the rendered surface does along that direction, fillets
 * included, so the traced rays meet the same silhouette the eye sees.
 */
export const sampleSheetCrossSection = (options: SheetCrossSectionOptions): Array<readonly [number, number]> => {
  const points: Array<readonly [number, number]> = [];
  for (let index = 0; index < options.count; index += 1) {
    const angle = (index / options.count) * Math.PI * 2;
    // Increasing angle from +x towards -z runs counter-clockwise when the sheet is viewed from above.
    const worldDirection: Vector3Tuple = [Math.cos(angle), 0, -Math.sin(angle)];
    const objectDirection = options.toObjectSpace(worldDirection);
    const fromRadius = sampleRadial(options.from, objectDirection).radius;
    let radius = fromRadius;
    if (options.front !== undefined && options.to !== options.from) {
      const toRadius = sampleRadial(options.to, objectDirection).radius;
      const weight = morphWeightAt(objectDirection, options.front);
      radius = fromRadius + (toRadius - fromRadius) * weight;
    }
    radius *= options.scale;
    points.push([worldDirection[0] * radius, worldDirection[2] * radius]);
  }
  return points;
};
