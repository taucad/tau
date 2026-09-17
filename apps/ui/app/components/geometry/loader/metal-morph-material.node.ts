/* oxlint-disable new-cap -- three/tsl `Fn`/`If`/`Loop` are shader graph factories */
import { Vector3, Vector4 } from 'three';
import type { Color } from 'three';
import { MeshPhysicalNodeMaterial } from 'three/webgpu';
import type { AttributeNode, Node, UniformArrayNode, UniformNode } from 'three/webgpu';
import {
  abs,
  attribute,
  cos,
  cross,
  dot,
  exp,
  float,
  Fn,
  If,
  int,
  log,
  Loop,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  positionLocal,
  saturate,
  sin,
  smoothstep,
  step,
  transformNormalToView,
  uniform,
  uniformArray,
  varyingProperty,
  vec3,
  vec4,
} from 'three/tsl';

import { metalMorphBodyColor } from '#components/geometry/loader/metal-morph.constants.js';
import { getMetalMorphPlaneTable, metalMorphShapeIds } from '#components/geometry/loader/metal-morph-shapes.js';

// Node types must stay literals for TSL generics; grouping them under one `as const` object satisfies
// `tau-lint(no-literal-const-assertion)` while preserving tsgo narrowing (a bare `'vec4'` widens).
const nodeTypes = { packedSample: 'vec4', scalar: 'float' } as const;

/** Vertex attribute carrying one shape's packed `normal.xyz, radius` sample, indexed like {@link metalMorphShapeIds}. */
export const metalMorphShapeAttributeName = (index: number): string => `shapeSample${index}`;

export type MetalMorphMaterialOptions = Readonly<{
  /** Linear base reflectance of the metal. */
  color?: Color;
  /** GGX roughness of the polished body at rest. */
  roughnessRest?: number;
  /** GGX roughness inside the liquid band; flowing metal stays glossy, only a touch softer than the polish. */
  roughnessMolten?: number;
  /**
   * Thin-film iridescence strength inside the liquid band (faint tempering colours on the flowing metal).
   * `0` leaves the thin-film model out of the shader entirely.
   */
  iridescence?: number;
  /**
   * Tilt the shading normal by the displacement gradient while the metal is liquid. Costs two extra field
   * evaluations per vertex, which small spinners cannot show.
   */
  perturbNormals?: boolean;
  /**
   * Recover the stellated forms' normals per fragment from their plane table. Their ridges and creases are
   * narrower than the shared mesh, so interpolated vertex normals zig-zag along them at hero sizes; small
   * spinners cannot show the difference and skip the loops.
   */
  exactStarNormals?: boolean;
  /** Back-ease overshoot applied to the travelling front; 0 removes the spring entirely. */
  overshoot?: number;
  /** Half-width of the transformation front, as a fraction of the body's extent along the sweep axis. */
  frontBand?: number;
  /** Broad laminar undulation of the liquid surface, in render units. */
  flowAmplitude?: number;
  /** Spatial frequency of the undulation. */
  flowScale?: number;
  /** Height of the ripple train trailing the crest, in render units. */
  rippleAmplitude?: number;
  /** Crest-to-crest spacing of the ripples, as a fraction of the body's extent along the sweep axis. */
  rippleWavelength?: number;
  /** Distance behind the crest over which the ripples fade, as a fraction of the body's extent. */
  rippleDecay?: number;
  /** Outward swell of the crest, in render units. */
  swell?: number;
  /** Radial amplitude of the settle wobble, in render units. */
  ringAmplitude?: number;
  /** Thin-film thickness, in nanometres, where the flowing metal is coolest. */
  filmThicknessThin?: number;
  /** Thin-film thickness, in nanometres, where the flowing metal is hottest. */
  filmThicknessThick?: number;
}>;

/**
 * Every parameter of the surface and the flow that a live uniform carries, so a surface can be tuned while
 * it runs and the values that land can be written back into the defaults.
 */
export type MetalMorphMaterialTuning = Readonly<{
  roughnessRest: number;
  roughnessMolten: number;
  /** Thin-film strength inside the liquid band; no effect on a material built with `iridescence: 0`. */
  iridescence: number;
  filmThicknessThin: number;
  filmThicknessThick: number;
  overshoot: number;
  frontBand: number;
  flowAmplitude: number;
  flowScale: number;
  rippleAmplitude: number;
  rippleWavelength: number;
  rippleDecay: number;
  swell: number;
  ringAmplitude: number;
}>;

/** The tuning parameters in a stable order, for iteration. */
export const metalMorphMaterialTuningKeys = [
  'roughnessRest',
  'roughnessMolten',
  'iridescence',
  'filmThicknessThin',
  'filmThicknessThick',
  'overshoot',
  'frontBand',
  'flowAmplitude',
  'flowScale',
  'rippleAmplitude',
  'rippleWavelength',
  'rippleDecay',
  'swell',
  'ringAmplitude',
] as const satisfies ReadonlyArray<keyof MetalMorphMaterialTuning>;

/** One live uniform per tuning parameter. */
export type MetalMorphTuningUniforms = Readonly<{
  [Key in keyof MetalMorphMaterialTuning]: UniformNode<'float', number>;
}>;

export type MetalMorphMaterialHandles = Readonly<{
  /** Shape attribute index the body morphs from. */
  uFromIndex: UniformNode<'float', number>;
  /** Shape attribute index the body morphs to. */
  uToIndex: UniformNode<'float', number>;
  /** Eased travel of the front, 0 (from) to 1 (to). */
  uProgress: UniformNode<'float', number>;
  /** Liquid amplitude envelope, 0 to 1. */
  uMolten: UniformNode<'float', number>;
  /** Signed settle wobble. */
  uRing: UniformNode<'float', number>;
  /** Seconds; animates the noise fields. */
  uTime: UniformNode<'float', number>;
  /** Unit axis, in object space, that the front travels along. */
  uSweepAxis: UniformNode<'vec3', Vector3>;
  /** Noise domain offset so every transition churns differently. */
  uSeedOffset: UniformNode<'vec3', Vector3>;
  /** The surface and flow parameters, live. */
  tuning: MetalMorphTuningUniforms;
}>;

/** Write every parameter present in `patch` into its uniform; the graph is untouched. */
export const applyMetalMorphMaterialTuning = (
  uniforms: MetalMorphTuningUniforms,
  patch: Partial<MetalMorphMaterialTuning>,
): void => {
  for (const key of metalMorphMaterialTuningKeys) {
    const value = patch[key];
    if (value !== undefined) {
      uniforms[key].value = value;
    }
  }
};

/** The parameters the uniforms currently carry. */
export const readMetalMorphMaterialTuning = (uniforms: MetalMorphTuningUniforms): MetalMorphMaterialTuning => ({
  roughnessRest: uniforms.roughnessRest.value,
  roughnessMolten: uniforms.roughnessMolten.value,
  iridescence: uniforms.iridescence.value,
  filmThicknessThin: uniforms.filmThicknessThin.value,
  filmThicknessThick: uniforms.filmThicknessThick.value,
  overshoot: uniforms.overshoot.value,
  frontBand: uniforms.frontBand.value,
  flowAmplitude: uniforms.flowAmplitude.value,
  flowScale: uniforms.flowScale.value,
  rippleAmplitude: uniforms.rippleAmplitude.value,
  rippleWavelength: uniforms.rippleWavelength.value,
  rippleDecay: uniforms.rippleDecay.value,
  swell: uniforms.swell.value,
  ringAmplitude: uniforms.ringAmplitude.value,
});

const defaultOptions: Required<Omit<MetalMorphMaterialOptions, 'color'>> = {
  roughnessRest: 0.1,
  roughnessMolten: 0.2,
  iridescence: 0.35,
  overshoot: 0.15,
  frontBand: 0.28,
  flowAmplitude: 0.03,
  flowScale: 1.7,
  rippleAmplitude: 0.016,
  rippleWavelength: 0.16,
  rippleDecay: 0.24,
  swell: 0.055,
  ringAmplitude: 0.02,
  filmThicknessThin: 140,
  filmThicknessThick: 480,
  perturbNormals: true,
  exactStarNormals: true,
};

/** Finite-difference step for the displacement gradient, in render units on the unit sphere. */
const gradientStep = 0.015;
/** Height, in render units, at which the undulation reads as fully heated for the film thickness. */
const heatHeight = 0.03;
/** Radians per second the ripple crests roll back through the wake. */
const rippleRollRate = 1.6;
/** The wake behind the crest stays liquid this many times longer than the metal ahead of it. */
const wakeWidth = 1.8;
const crestWidth = 0.8;
/** Nudge that keeps blended normals away from zero when two face normals oppose. */
const normalBlendNudge = 1e-4;
/** Radius reported for planes the sampled ray runs away from, so they never win the nearest-exit search. */
const unreachablePlaneRadius = 1e9;
/** Dimensionless guard that rejects planes the sampled ray grazes. */
const grazingDenominator = 1e-6;
/** Integer loop bounds for the TSL `Loop` helper, declared once so overload inference stays tractable. */
type LoopRange = { start: Node<'int'>; end: Node<'int'>; type: 'int'; condition: string };

/** Uniform mirrors of the stellated plane table; see `getMetalMorphPlaneTable`. */
type PlaneTableUniforms = Readonly<{
  planes: UniformArrayNode<'vec4'>;
  twins: UniformArrayNode<'vec4'>;
  descriptors: UniformArrayNode<'vec4'>;
  roundness: UniformArrayNode<'float'>;
}>;

/** Uniforms that place the travelling front along the sweep axis. */
export type FrontUniforms = Readonly<{
  uSweepAxis: UniformNode<'vec3', Vector3>;
  uProgress: UniformNode<'float', number>;
  uFrontBand: UniformNode<'float', number>;
}>;

/** Position of the crest along the sweep axis, 0 to 1, overshooting the body by one band at either end. */
const frontPositionOf = (uniforms: FrontUniforms): Node<'float'> =>
  uniforms.uProgress.mul(float(1).add(uniforms.uFrontBand.mul(2))).sub(uniforms.uFrontBand);

/** A TSL function of a point on the unit sphere, a noise seed and the time, returning a surface height. */
export type LiquidHeightField = (point: Node<'vec3'>, seed: Node<'vec3'>, time: Node<'float'>) => Node<'float'>;
/** A TSL function of a direction on the unit sphere returning `weight, frontness, alongSweep, local`. */
export type FrontField = (direction: Node<'vec3'>) => Node<'vec4'>;

/** Uniforms that shape the liquid displacement field on top of the front. */
export type DisplacementUniforms = FrontUniforms &
  Readonly<{
    uFlowScale: UniformNode<'float', number>;
    uFlowAmplitude: UniformNode<'float', number>;
    uRippleAmplitude: UniformNode<'float', number>;
    uRippleWavelength: UniformNode<'float', number>;
    uRippleDecay: UniformNode<'float', number>;
  }>;

/**
 * Reusable displacement height at a point on the unit sphere: one broad octave of laminar undulation plus a
 * train of ripples that trails the crest and fades into the wake, so the transformed metal reads as a wave
 * rolling over the body. Invoked three times per vertex (value and forward differences), so every local
 * stays unnamed.
 */
export const createDisplacementField = (uniforms: DisplacementUniforms): LiquidHeightField =>
  Fn(([point, seed, time]: [Node<'vec3'>, Node<'vec3'>, Node<'float'>]) => {
    const drift = vec3(float(0), time.mul(0.35), time.mul(0.2));
    const flow = mx_noise_float(point.mul(uniforms.uFlowScale).add(seed).add(drift)).toVar();
    // Distance behind the crest; the ripples only develop in the wake and fade with that distance.
    const wake = frontPositionOf(uniforms).sub(dot(point, uniforms.uSweepAxis).mul(0.5).add(0.5)).toVar();
    const envelope = smoothstep(float(0), uniforms.uFrontBand.mul(0.5), wake)
      .mul(exp(max(wake, float(0)).div(uniforms.uRippleDecay).negate()))
      .toVar();
    const crests = sin(
      wake
        .div(uniforms.uRippleWavelength)
        .mul(Math.PI * 2)
        .sub(time.mul(rippleRollRate)),
    );
    // A slow noise breaks the crests' regularity without adding any grain of its own.
    const grain = float(0.75).add(mx_noise_float(point.mul(1.4).sub(seed)).mul(0.25));
    return flow.mul(uniforms.uFlowAmplitude).add(crests.mul(envelope).mul(grain).mul(uniforms.uRippleAmplitude));
  });

/**
 * Travelling-front weights for one direction on the body, packed as `weight, frontness, alongSweep, local`.
 * Shared by the vertex stage (positions) and the fragment stage (exact normals), so every local stays unnamed.
 */
export const createFrontField = (
  uniforms: FrontUniforms & Readonly<{ uOvershoot: UniformNode<'float', number> }>,
): FrontField =>
  Fn(([direction]: [Node<'vec3'>]) => {
    // Vertices behind the front already carry the target form.
    const alongSweep = dot(direction, uniforms.uSweepAxis).mul(0.5).add(0.5).toVar();
    const frontPosition = frontPositionOf(uniforms).toVar();
    const local = float(1)
      .sub(smoothstep(frontPosition.sub(uniforms.uFrontBand), frontPosition.add(uniforms.uFrontBand), alongSweep))
      .toVar();
    // A gentle back-ease: the surface flows just past its target and settles as the crest passes.
    const shifted = local.sub(1).toVar();
    const weight = float(1)
      .add(uniforms.uOvershoot.add(1).mul(shifted).mul(shifted).mul(shifted))
      .add(uniforms.uOvershoot.mul(shifted).mul(shifted))
      .toVar();
    // Liquid amount peaks on the crest and lingers in the wake behind it.
    const ahead = alongSweep.sub(frontPosition).toVar();
    const width = mix(uniforms.uFrontBand.mul(wakeWidth), uniforms.uFrontBand.mul(crestWidth), step(float(0), ahead));
    const frontness = exp(ahead.div(width).pow(2).negate()).toVar();
    return vec4(weight, frontness, alongSweep, local);
  });

/**
 * Rounded outward normal of one stellated shape along a direction, recovered from the plane table with the
 * same log-sum-exp blends the CPU sampler uses for the vertex radii (`sampleRadial`): a softmin over the
 * facing sides of the spike the ray leaves through, then a softmax with the neighbouring spikes' planes
 * across the base edges so the concave creases fill. Invoked per fragment, so every local stays unnamed.
 */
const createStarNormalField = (table: PlaneTableUniforms) =>
  Fn(([shapeIndex, direction]: [Node<'float'>, Node<'vec3'>]) => {
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- TSL array element and loop nodes are typed as `any` in `@types/three`; the CPU twin in metal-morph-shapes.test.ts proves the lookup order. */
    const descriptor = vec4(table.descriptors.element(shapeIndex.toInt())).toVar();
    const roundness = float(table.roundness.element(shapeIndex.toInt())).toVar();
    const coreStart = descriptor.x.toInt().toVar();
    const coreCount = descriptor.y.toInt().toVar();
    const sideStart = descriptor.z.toInt().toVar();
    const sidesPerFace = descriptor.w.toInt().toVar();

    // Sharp nearest core exit selects the spike the ray leaves through.
    const coreRadius = float(unreachablePlaneRadius).toVar();
    const coreIndex = int(0).toVar();
    const coreRange: LoopRange = { start: int(0), end: coreCount, type: 'int', condition: '<' };
    Loop(coreRange, ({ i }) => {
      const plane = vec4(table.planes.element(coreStart.add(i))).toVar();
      const denominator = dot(plane.xyz, direction).toVar();
      const radius = plane.w.div(max(denominator, grazingDenominator)).toVar();
      If(denominator.greaterThan(grazingDenominator).and(radius.lessThan(coreRadius)), () => {
        coreRadius.assign(radius);
        coreIndex.assign(i);
      });
    });

    const spikeStart = sideStart.add(coreIndex.mul(sidesPerFace)).toVar();
    const sideRange: LoopRange = { start: int(0), end: sidesPerFace, type: 'int', condition: '<' };
    const sideRadius = float(unreachablePlaneRadius).toVar();
    Loop(sideRange, ({ i }) => {
      const plane = vec4(table.planes.element(spikeStart.add(i))).toVar();
      const denominator = dot(plane.xyz, direction).toVar();
      const radius = plane.w.div(max(denominator, grazingDenominator)).toVar();
      If(denominator.greaterThan(grazingDenominator).and(radius.lessThan(sideRadius)), () => {
        sideRadius.assign(radius);
      });
    });
    // Softmin over the spike's own sides: ridges and the tip round by the temperature.
    const spikeTotal = float(0).toVar();
    const spikeNormal = vec3(0, 0, 0).toVar();
    Loop(sideRange, ({ i }) => {
      const plane = vec4(table.planes.element(spikeStart.add(i))).toVar();
      const denominator = dot(plane.xyz, direction).toVar();
      If(denominator.greaterThan(grazingDenominator), () => {
        const weight = exp(plane.w.div(denominator).sub(sideRadius).negate().div(roundness));
        spikeTotal.addAssign(weight);
        spikeNormal.addAssign(plane.xyz.mul(weight));
      });
    });
    const spikeRadius = sideRadius.sub(roundness.mul(log(spikeTotal))).toVar();
    // Softmax with the neighbouring spikes' planes through the base edges: they surface only at the creases.
    const peak = spikeRadius.toVar();
    Loop(sideRange, ({ i }) => {
      const twin = vec4(table.twins.element(spikeStart.add(i))).toVar();
      const denominator = dot(twin.xyz, direction).toVar();
      const radius = twin.w.div(max(denominator, grazingDenominator)).toVar();
      If(denominator.greaterThan(grazingDenominator).and(radius.greaterThan(peak)), () => {
        peak.assign(radius);
      });
    });
    const blended = normalize(spikeNormal)
      .mul(exp(spikeRadius.sub(peak).div(roundness)))
      .toVar();
    Loop(sideRange, ({ i }) => {
      const twin = vec4(table.twins.element(spikeStart.add(i))).toVar();
      const denominator = dot(twin.xyz, direction).toVar();
      If(denominator.greaterThan(grazingDenominator), () => {
        const weight = exp(twin.w.div(denominator).sub(peak).div(roundness));
        blended.addAssign(twin.xyz.mul(weight));
      });
    });
    return normalize(blended);
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  });

/**
 * Liquid-metal body material for the loader. One TSL graph serves the WebGPU and WebGL 2 backends of the
 * node renderer; all animation flows through uniform mutation so the pipeline compiles once. Positions and
 * normals morph per vertex from the packed samples: the fillets of the plain solids are baked into those
 * normals, only the stellated forms recover their sharper ridges per fragment, and the liquid fields are
 * skipped by a uniform branch while the body rests.
 */
export const createMetalMorphNodeMaterial = (
  options?: MetalMorphMaterialOptions,
): { readonly material: MeshPhysicalNodeMaterial; readonly handles: MetalMorphMaterialHandles } => {
  const settings = { ...defaultOptions, ...options };
  const color = options?.color ?? metalMorphBodyColor;

  const uFromIndex = uniform(0, 'float');
  const uToIndex = uniform(0, 'float');
  const uProgress = uniform(1, 'float');
  const uMolten = uniform(0, 'float');
  const uRing = uniform(0, 'float');
  const uTime = uniform(0, 'float');
  const uSweepAxis = uniform(new Vector3(0, 1, 0));
  const uSeedOffset = uniform(new Vector3(0, 0, 0));
  const uOvershoot = uniform(settings.overshoot, 'float');
  const uFrontBand = uniform(settings.frontBand, 'float');
  const uFlowAmplitude = uniform(settings.flowAmplitude, 'float');
  const uFlowScale = uniform(settings.flowScale, 'float');
  const uRippleAmplitude = uniform(settings.rippleAmplitude, 'float');
  const uRippleWavelength = uniform(settings.rippleWavelength, 'float');
  const uRippleDecay = uniform(settings.rippleDecay, 'float');
  const uSwell = uniform(settings.swell, 'float');
  const uRingAmplitude = uniform(settings.ringAmplitude, 'float');
  const uRoughnessRest = uniform(settings.roughnessRest, 'float');
  const uRoughnessMolten = uniform(settings.roughnessMolten, 'float');
  const uIridescence = uniform(settings.iridescence, 'float');
  const uFilmThin = uniform(settings.filmThicknessThin, 'float');
  const uFilmThick = uniform(settings.filmThicknessThick, 'float');
  const useIridescence = settings.iridescence > 0;

  const planeTable = getMetalMorphPlaneTable();
  const toVector4 = (tuple: readonly [number, number, number, number]): Vector4 => new Vector4(...tuple);
  const uPlanes: UniformArrayNode<'vec4'> = uniformArray(planeTable.planes.map(toVector4), nodeTypes.packedSample);
  const uTwins: UniformArrayNode<'vec4'> = uniformArray(planeTable.twins.map(toVector4), nodeTypes.packedSample);
  const uDescriptors: UniformArrayNode<'vec4'> = uniformArray(
    planeTable.descriptors.map(toVector4),
    nodeTypes.packedSample,
  );
  const uRoundness: UniformArrayNode<'float'> = uniformArray([...planeTable.roundness], nodeTypes.scalar);

  const shapeAttributes: ReadonlyArray<AttributeNode<'vec4'>> = metalMorphShapeIds.map((_id, index) =>
    attribute(metalMorphShapeAttributeName(index), nodeTypes.packedSample),
  );
  // Branch-free selection: every packed sample is weighted by 1 when its index matches and 0 otherwise.
  const pickShape = (index: Node<'float'>): Node<'vec4'> => {
    let picked: Node<'vec4'> = vec4(0, 0, 0, 0);
    for (const [attributeIndex, sample] of shapeAttributes.entries()) {
      const weight = float(1).sub(min(abs(index.sub(attributeIndex)), float(1)));
      picked = picked.add(sample.mul(weight));
    }
    return picked;
  };

  const displacementField = createDisplacementField({
    uSweepAxis,
    uProgress,
    uFrontBand,
    uFlowScale,
    uFlowAmplitude,
    uRippleAmplitude,
    uRippleWavelength,
    uRippleDecay,
  });
  const frontField = createFrontField({ uSweepAxis, uProgress, uFrontBand, uOvershoot });
  const starNormalField = createStarNormalField({
    planes: uPlanes,
    twins: uTwins,
    descriptors: uDescriptors,
    roundness: uRoundness,
  });
  /* oxlint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- TSL array element nodes are typed as `any` in `@types/three`. */
  const isStellated = (index: Node<'float'>): Node<'bool'> =>
    vec4(uDescriptors.element(index.toInt())).w.greaterThan(float(0));

  const vNormal = varyingProperty('vec3', 'tauMorphNormalVarying');
  const vDirection = varyingProperty('vec3', 'tauMorphDirectionVarying');
  const vFromNormal = varyingProperty('vec3', 'tauMorphFromNormalVarying');
  const vToNormal = varyingProperty('vec3', 'tauMorphToNormalVarying');
  const vPerturbation = varyingProperty('vec3', 'tauMorphPerturbationVarying');
  const vMolten = varyingProperty('float', 'tauMorphMoltenVarying');
  const vHeat = varyingProperty('float', 'tauMorphHeatVarying');

  const material = new MeshPhysicalNodeMaterial({
    color,
    metalness: 1,
    roughness: settings.roughnessRest,
    ...(useIridescence
      ? {
          iridescence: settings.iridescence,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- three.js material property name
          iridescenceIOR: 1.28,
          iridescenceThicknessRange: [settings.filmThicknessThin, settings.filmThicknessThick],
        }
      : {}),
  });

  material.positionNode = Fn(() => {
    const direction = positionLocal.toVar('tauMorphDirection');
    const source = pickShape(uFromIndex).toVar('tauMorphSource');
    const target = pickShape(uToIndex).toVar('tauMorphTarget');
    const front = frontField(direction).toVar('tauMorphFront');
    const weight = front.x;
    const frontness = front.y;
    const alongSweep = front.z;

    const radius = mix(source.w, target.w, weight).toVar('tauMorphRadius');
    const faceNormal = normalize(
      mix(source.xyz, target.xyz, saturate(weight)).add(direction.mul(normalBlendNudge)),
    ).toVar('tauMorphVertexNormal');
    const molten = uMolten.mul(frontness).toVar('tauMorphMoltenAmount');
    const height = float(0).toVar('tauMorphHeight');
    const perturbation = vec3(0, 0, 0).toVar('tauMorphPerturbation');

    // The liquid fields only exist while a transition is under way; at rest one uniform branch skips them.
    If(uMolten.greaterThan(float(0)), () => {
      height.assign(displacementField(direction, uSeedOffset, uTime));
      if (settings.perturbNormals) {
        // Branch-free helper axis: world up unless the face normal is nearly vertical, then world right.
        const helperAxis = mix(vec3(0, 1, 0), vec3(1, 0, 0), step(float(0.9), abs(faceNormal.y)));
        const tangent = normalize(cross(faceNormal, helperAxis));
        const bitangent = cross(faceNormal, tangent);
        const probeStep = float(gradientStep);
        const gradientTangent = displacementField(direction.add(tangent.mul(probeStep)), uSeedOffset, uTime)
          .sub(height)
          .div(probeStep);
        const gradientBitangent = displacementField(direction.add(bitangent.mul(probeStep)), uSeedOffset, uTime)
          .sub(height)
          .div(probeStep);
        perturbation.assign(tangent.mul(gradientTangent).add(bitangent.mul(gradientBitangent)).mul(molten));
      }
    });

    const relief = height.add(uSwell).mul(molten).toVar('tauMorphRelief');
    const ringWave = uRing
      .mul(uRingAmplitude)
      .mul(cos(alongSweep.mul(Math.PI * 2)))
      .toVar('tauMorphRing');
    const displaced = direction.mul(radius.add(ringWave)).add(faceNormal.mul(relief));

    if (settings.exactStarNormals) {
      vDirection.assign(direction);
      vFromNormal.assign(source.xyz);
      vToNormal.assign(target.xyz);
    } else {
      vNormal.assign(faceNormal);
    }
    vPerturbation.assign(perturbation);
    vMolten.assign(molten);
    if (useIridescence) {
      vHeat.assign(smoothstep(float(-heatHeight), float(heatHeight), height));
    }

    return displaced;
  })();

  material.normalNode = settings.exactStarNormals
    ? Fn(() => {
        const direction = normalize(vDirection).toVar('tauMorphFragmentDirection');
        const front = frontField(direction).toVar('tauMorphFragmentFront');
        const fromNormal = normalize(vFromNormal).toVar('tauMorphFromNormal');
        const toNormal = normalize(vToNormal).toVar('tauMorphToNormal');
        // Uniform branches: only a stellated form pays for its plane loops, and a resting one pays once.
        If(isStellated(uFromIndex), () => {
          fromNormal.assign(starNormalField(uFromIndex, direction));
        });
        If(uToIndex.equal(uFromIndex), () => {
          toNormal.assign(fromNormal);
        }).ElseIf(isStellated(uToIndex), () => {
          toNormal.assign(starNormalField(uToIndex, direction));
        });
        const faceNormal = normalize(
          mix(fromNormal, toNormal, saturate(front.x)).add(direction.mul(normalBlendNudge)),
        ).toVar('tauMorphFragmentNormal');
        return transformNormalToView(normalize(faceNormal.sub(vPerturbation)));
      })()
    : Fn(() => transformNormalToView(normalize(vNormal.sub(vPerturbation))))();
  material.roughnessNode = mix(uRoughnessRest, uRoughnessMolten, vMolten);
  if (useIridescence) {
    material.iridescenceNode = vMolten.mul(uIridescence);
    material.iridescenceThicknessNode = mix(uFilmThin, uFilmThick, vHeat);
  }

  return {
    material,
    handles: {
      uFromIndex,
      uToIndex,
      uProgress,
      uMolten,
      uRing,
      uTime,
      uSweepAxis,
      uSeedOffset,
      tuning: {
        roughnessRest: uRoughnessRest,
        roughnessMolten: uRoughnessMolten,
        iridescence: uIridescence,
        filmThicknessThin: uFilmThin,
        filmThicknessThick: uFilmThick,
        overshoot: uOvershoot,
        frontBand: uFrontBand,
        flowAmplitude: uFlowAmplitude,
        flowScale: uFlowScale,
        rippleAmplitude: uRippleAmplitude,
        rippleWavelength: uRippleWavelength,
        rippleDecay: uRippleDecay,
        swell: uSwell,
        ringAmplitude: uRingAmplitude,
      },
    },
  };
};
