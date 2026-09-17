/**
 * Spectral ray tracing through the light sheet of the glass prism loader.
 *
 * The sheet is the plane the beam travels in; the body's cross-section in that plane is a convex polygon.
 * A bundle of parallel white rays meets it and every wavelength takes its own path: Fresnel-weighted
 * refraction and reflection at each face, total internal reflection where the angle demands it, a bounded
 * number of interactions. The result is a list of coloured segments the renderer draws as glowing ribbons.
 *
 * Everything here is pure and dimensionless; the caller decides how far a leaving ray reaches.
 */

/** A point or direction in the sheet, as `x, z`. */
export type SheetVector = readonly [number, number];

export type SpectralSample = Readonly<{
  /** Nanometres. */
  wavelength: number;
  /** Linear RGB the wavelength contributes; the set sums to white. */
  color: readonly [number, number, number];
}>;

/** Cauchy coefficients: `n = base + dispersion / λ²` with λ in micrometres. */
export type GlassDispersion = Readonly<{
  base: number;
  dispersion: number;
}>;

/**
 * A dense flint with its dispersion pushed well past nature, about twice a real flint's, so every
 * morphology shows colour, not only the prism, and a spectrum still reads at spinner sizes.
 */
export const defaultGlassDispersion: GlassDispersion = { base: 1.55, dispersion: 0.03 };

export type LightBeam = Readonly<{
  /** Where the bundle starts, outside the body. */
  origin: SheetVector;
  /** Unit direction of travel. */
  direction: SheetVector;
  /** Full width of the bundle across its direction. */
  width: number;
  rayCount: number;
}>;

export type RaySegmentKind = 'incident' | 'internal' | 'exit' | 'stray';

export type RaySegment = Readonly<{
  start: SheetVector;
  end: SheetVector;
  color: readonly [number, number, number];
  /** Radiant weight, 1 for the full white beam. */
  intensity: number;
  kind: RaySegmentKind;
  /** True for a ray that leaves the sheet: the ribbon fades towards `end`. */
  taper: boolean;
}>;

export type LightSheetTraceOptions = Readonly<{
  /** Convex cross-section as `x, z` points, either winding. */
  polygon: readonly SheetVector[];
  beam: LightBeam;
  glass?: GlassDispersion;
  wavelengths?: readonly SpectralSample[];
  /** Face interactions a ray may have after entering, counting refractions and internal reflections. */
  maxInteractions?: number;
  /** Radiant weight below which a branch is dropped. */
  minIntensity?: number;
  /**
   * Weight applied to the light the entry face reflects away. Physically it keeps its Fresnel share; drawn
   * at full strength it competes with the spectrum, so the loader dims it.
   */
  strayScale?: number;
  /** Distance a ray travels once it has left the body or missed it. */
  reach: number;
}>;

const rawSpectrum: ReadonlyArray<{ wavelength: number; color: readonly [number, number, number] }> = [
  { wavelength: 430, color: [0.3, 0, 1] },
  { wavelength: 470, color: [0, 0.3, 1] },
  { wavelength: 500, color: [0, 0.9, 0.6] },
  { wavelength: 540, color: [0.2, 1, 0.05] },
  { wavelength: 580, color: [1, 0.85, 0] },
  { wavelength: 620, color: [1, 0.3, 0] },
  { wavelength: 660, color: [0.85, 0, 0.05] },
];

const channelTotals: [number, number, number] = [0, 0, 0];
for (const sample of rawSpectrum) {
  channelTotals[0] += sample.color[0];
  channelTotals[1] += sample.color[1];
  channelTotals[2] += sample.color[2];
}

/** Seven samples from violet to red whose colours sum to white, so the split beam adds back to the beam. */
export const spectralSamples: readonly SpectralSample[] = rawSpectrum.map((sample) => ({
  wavelength: sample.wavelength,
  color: [sample.color[0] / channelTotals[0], sample.color[1] / channelTotals[1], sample.color[2] / channelTotals[2]],
}));

/** Refractive index of `glass` at `wavelengthNanometres`. */
export const refractiveIndex = (glass: GlassDispersion, wavelengthNanometres: number): number => {
  const micrometres = wavelengthNanometres / 1000;
  return glass.base + glass.dispersion / (micrometres * micrometres);
};

/** Distance along a ray below which a hit counts as the surface the ray is already on. */
const surfaceEpsilon = 1e-6;
const defaultMaxInteractions = 4;
const defaultMinIntensity = 0.03;
const defaultStrayScale = 1;

const white: readonly [number, number, number] = [1, 1, 1];

type Edge = Readonly<{
  start: SheetVector;
  end: SheetVector;
  /** Unit outward normal. */
  normal: SheetVector;
}>;

type Hit = Readonly<{
  point: SheetVector;
  normal: SheetVector;
  distance: number;
  edge: number;
}>;

const dot = (a: SheetVector, b: SheetVector): number => a[0] * b[0] + a[1] * b[1];
const add = (a: SheetVector, b: SheetVector, scale = 1): SheetVector => [a[0] + b[0] * scale, a[1] + b[1] * scale];
const normalize = (a: SheetVector): SheetVector => {
  const length = Math.hypot(a[0], a[1]);
  return length > 0 ? [a[0] / length, a[1] / length] : [1, 0];
};

const buildEdges = (polygon: readonly SheetVector[]): Edge[] => {
  let doubleArea = 0;
  for (const [index, point] of polygon.entries()) {
    const next = polygon[(index + 1) % polygon.length]!;
    doubleArea += point[0] * next[1] - next[0] * point[1];
  }
  // Counter-clockwise polygons turn left along each edge, so the outward normal is the right-hand normal.
  const outwardSign = doubleArea >= 0 ? 1 : -1;
  return polygon.map((start, index) => {
    const end = polygon[(index + 1) % polygon.length]!;
    const along = normalize([end[0] - start[0], end[1] - start[1]]);
    return { start, end, normal: [along[1] * outwardSign, -along[0] * outwardSign] };
  });
};

type Ray = Readonly<{ origin: SheetVector; direction: SheetVector }>;

/** Nearest edge crossed by the ray beyond `surfaceEpsilon`, ignoring `skipEdge`. */
const intersect = (edges: readonly Edge[], { origin, direction }: Ray, skipEdge: number): Hit | undefined => {
  let best: Hit | undefined;
  for (const [index, edge] of edges.entries()) {
    if (index === skipEdge) {
      continue;
    }
    const edgeVector: SheetVector = [edge.end[0] - edge.start[0], edge.end[1] - edge.start[1]];
    const denominator = direction[0] * edgeVector[1] - direction[1] * edgeVector[0];
    if (Math.abs(denominator) < 1e-12) {
      continue;
    }
    const offset: SheetVector = [edge.start[0] - origin[0], edge.start[1] - origin[1]];
    const distance = (offset[0] * edgeVector[1] - offset[1] * edgeVector[0]) / denominator;
    const along = (offset[0] * direction[1] - offset[1] * direction[0]) / denominator;
    if (distance <= surfaceEpsilon || along < -1e-9 || along > 1 + 1e-9) {
      continue;
    }
    if (best === undefined || distance < best.distance) {
      best = { point: add(origin, direction, distance), normal: edge.normal, distance, edge: index };
    }
  }
  return best;
};

/** Unpolarised Fresnel reflectance for a ray meeting an interface from index `from` into index `into`. */
export const fresnelReflectance = (cosIncident: number, from: number, into: number): number => {
  const sinTransmitted = (from / into) * Math.sqrt(Math.max(0, 1 - cosIncident * cosIncident));
  if (sinTransmitted >= 1) {
    return 1;
  }
  const cosTransmitted = Math.sqrt(1 - sinTransmitted * sinTransmitted);
  const perpendicular = (from * cosIncident - into * cosTransmitted) / (from * cosIncident + into * cosTransmitted);
  const parallel = (from * cosTransmitted - into * cosIncident) / (from * cosTransmitted + into * cosIncident);
  return (perpendicular * perpendicular + parallel * parallel) / 2;
};

/**
 * Refract `direction` through a surface whose normal faces against it, from index `from` into index `into`;
 * `undefined` under total internal reflection.
 */
export const refractDirection = (
  direction: SheetVector,
  facingNormal: SheetVector,
  indices: Readonly<{ from: number; into: number }>,
): SheetVector | undefined => {
  const eta = indices.from / indices.into;
  const cosIncident = -dot(direction, facingNormal);
  const sinTransmittedSquared = eta * eta * (1 - cosIncident * cosIncident);
  if (sinTransmittedSquared >= 1) {
    return undefined;
  }
  const cosTransmitted = Math.sqrt(1 - sinTransmittedSquared);
  return normalize(add([direction[0] * eta, direction[1] * eta], facingNormal, eta * cosIncident - cosTransmitted));
};

const reflectDirection = (direction: SheetVector, normal: SheetVector): SheetVector =>
  add(direction, normal, -2 * dot(direction, normal));

/**
 * Trace the beam through the polygon for every wavelength; see the module description. Segments come back in
 * drawing order: the shared white incident rays first, then each wavelength's paths.
 */
export const traceLightSheet = (options: LightSheetTraceOptions): RaySegment[] => {
  const glass = options.glass ?? defaultGlassDispersion;
  const wavelengths = options.wavelengths ?? spectralSamples;
  const maxInteractions = options.maxInteractions ?? defaultMaxInteractions;
  const minIntensity = options.minIntensity ?? defaultMinIntensity;
  const strayScale = options.strayScale ?? defaultStrayScale;
  const edges = buildEdges(options.polygon);
  const direction = normalize(options.beam.direction);
  const across: SheetVector = [-direction[1], direction[0]];
  const segments: RaySegment[] = [];

  /** A ray leaving the sheet: it runs on for `reach` and fades along the way. */
  const leave = (
    ray: Ray,
    light: Readonly<{ color: readonly [number, number, number]; intensity: number }>,
    kind: RaySegmentKind,
  ): void => {
    segments.push({
      start: ray.origin,
      end: add(ray.origin, ray.direction, options.reach),
      color: light.color,
      intensity: light.intensity,
      kind,
      taper: true,
    });
  };

  type Branch = { origin: SheetVector; direction: SheetVector; intensity: number; edge: number; depth: number };

  const traceWavelength = (entry: Hit, sample: SpectralSample): void => {
    const index = refractiveIndex(glass, sample.wavelength);
    const entryCos = -dot(direction, entry.normal);
    const entryReflectance = fresnelReflectance(entryCos, 1, index);
    const refracted = refractDirection(direction, entry.normal, { from: 1, into: index });
    if (refracted === undefined) {
      return;
    }
    const stray = entryReflectance * strayScale;
    if (stray >= minIntensity) {
      leave(
        { origin: entry.point, direction: reflectDirection(direction, entry.normal) },
        { color: sample.color, intensity: stray },
        'stray',
      );
    }
    const branches: Branch[] = [
      { origin: entry.point, direction: refracted, intensity: 1 - entryReflectance, edge: entry.edge, depth: 1 },
    ];
    while (branches.length > 0) {
      const branch = branches.pop()!;
      const hit = intersect(edges, branch, branch.edge);
      if (hit === undefined) {
        // A degenerate polygon can leak a ray; let it go rather than loop.
        leave(branch, { color: sample.color, intensity: branch.intensity }, 'exit');
        continue;
      }
      segments.push({
        start: branch.origin,
        end: hit.point,
        color: sample.color,
        intensity: branch.intensity,
        kind: 'internal',
        taper: false,
      });
      // Inside the body the outward normal faces along the ray; the interface normal faces against it.
      const facingNormal: SheetVector = [-hit.normal[0], -hit.normal[1]];
      const cosIncident = -dot(branch.direction, facingNormal);
      const reflectance = fresnelReflectance(cosIncident, index, 1);
      const transmitted = refractDirection(branch.direction, facingNormal, { from: index, into: 1 });
      if (transmitted !== undefined && branch.intensity * (1 - reflectance) >= minIntensity) {
        leave(
          { origin: hit.point, direction: transmitted },
          { color: sample.color, intensity: branch.intensity * (1 - reflectance) },
          'exit',
        );
      }
      const reflectedIntensity = branch.intensity * reflectance;
      if (branch.depth < maxInteractions && reflectedIntensity >= minIntensity) {
        branches.push({
          origin: hit.point,
          direction: reflectDirection(branch.direction, facingNormal),
          intensity: reflectedIntensity,
          edge: hit.edge,
          depth: branch.depth + 1,
        });
      }
    }
  };

  const entries: Array<Hit | undefined> = [];
  for (let ray = 0; ray < options.beam.rayCount; ray += 1) {
    const offset = options.beam.rayCount === 1 ? 0 : (ray / (options.beam.rayCount - 1) - 0.5) * options.beam.width;
    const origin = add(options.beam.origin, across, offset);
    const entry = intersect(edges, { origin, direction }, -1);
    entries.push(entry);
    if (entry === undefined) {
      leave({ origin, direction }, { color: white, intensity: 1 }, 'incident');
    } else {
      segments.push({ start: origin, end: entry.point, color: white, intensity: 1, kind: 'incident', taper: false });
    }
  }
  for (const sample of wavelengths) {
    for (const entry of entries) {
      if (entry !== undefined) {
        traceWavelength(entry, sample);
      }
    }
  }
  return segments;
};
