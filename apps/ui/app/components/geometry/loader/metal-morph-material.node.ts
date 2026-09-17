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
  /** Thin-film iridescence strength inside the liquid band (faint tempering colours on the flowing metal). */
  iridescence?: number;
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
}>;

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
};

/** Finite-difference step for the displacement gradient, in render units on the unit sphere. */
const gradientStep = 0.015;
/** Iridescence film thickness range in nanometres, mapped from the local heat field. */
const iridescenceThicknessNanometres = { thin: 140, thick: 480 } as const;
/** Height, in render units, at which the undulation reads as fully heated for the film thickness. */
const heatHeight = 0.03;
/** Radians per second the ripple crests roll back through the wake. */
const rippleRollRate = 1.6;
/** The wake behind the crest stays liquid this many times longer than the metal ahead of it. */
const wakeWidth = 1.8;
const crestWidth = 0.8;
/** Radius reported for planes the sampled ray runs away from, so they never win the nearest-exit search. */
const unreachablePlaneRadius = 1e9;
/** Dimensionless guard that rejects planes the sampled ray grazes. */
const grazingDenominator = 1e-6;
/** Integer loop bounds for the TSL `Loop` helper, declared once so overload inference stays tractable. */
type LoopRange = { start: Node<'int'>; end: Node<'int'>; type: 'int'; condition: string };
/** Nudge that keeps blended normals away from zero when two face normals oppose. */
const normalBlendNudge = 1e-4;

/** Uniform mirrors of the flattened plane table; see `getMetalMorphPlaneTable`. */
type PlaneTableUniforms = Readonly<{
  planes: UniformArrayNode<'vec4'>;
  twins: UniformArrayNode<'vec4'>;
  descriptors: UniformArrayNode<'vec4'>;
  roundness: UniformArrayNode<'float'>;
}>;

/** Uniforms that place the travelling front along the sweep axis. */
type FrontUniforms = Readonly<{
  uSweepAxis: UniformNode<'vec3', Vector3>;
  uProgress: UniformNode<'float', number>;
  uFrontBand: UniformNode<'float', number>;
}>;

/** Position of the crest along the sweep axis, 0 to 1, overshooting the body by one band at either end. */
const frontPositionOf = (uniforms: FrontUniforms): Node<'float'> =>
  uniforms.uProgress.mul(float(1).add(uniforms.uFrontBand.mul(2))).sub(uniforms.uFrontBand);

/**
 * Reusable displacement height at a point on the unit sphere: one broad octave of laminar undulation plus a
 * train of ripples that trails the crest and fades into the wake, so the transformed metal reads as a wave
 * rolling over the body. Invoked three times per vertex (value and forward differences), so every local
 * stays unnamed.
 */
const createDisplacementField = (
  uniforms: FrontUniforms &
    Readonly<{
      uFlowScale: UniformNode<'float', number>;
      uFlowAmplitude: UniformNode<'float', number>;
      uRippleAmplitude: UniformNode<'float', number>;
      uRippleWavelength: UniformNode<'float', number>;
      uRippleDecay: UniformNode<'float', number>;
    }>,
) =>
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
const createFrontField = (uniforms: FrontUniforms & Readonly<{ uOvershoot: UniformNode<'float', number> }>) =>
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
 * Rounded outward normal of one shape along a direction, recovered from the flattened plane table with the same
 * log-sum-exp blends the CPU sampler uses for the vertex radii (`sampleRadial`): a softmin over the facing
 * planes of the body or of the spike the ray leaves through, then, on a stellated form, a softmax with the
 * neighbouring spikes' planes across the base edges so the concave creases fill. Invoked twice per fragment, so
 * every local stays unnamed.
 */
const createRoundedNormalField = (table: PlaneTableUniforms) =>
  Fn(([shapeIndex, direction]: [Node<'float'>, Node<'vec3'>]) => {
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- TSL array element and loop nodes are typed as `any` in `@types/three`; the CPU twin in metal-morph-shapes.test.ts proves the lookup order. */
    const descriptor = vec4(table.descriptors.element(shapeIndex.toInt())).toVar();
    const roundness = float(table.roundness.element(shapeIndex.toInt())).toVar();
    const coreStart = descriptor.x.toInt().toVar();
    const coreCount = descriptor.y.toInt().toVar();
    const sideStart = descriptor.z.toInt().toVar();
    const sidesPerFace = descriptor.w.toInt().toVar();
    const blended = vec3(0, 0, 0).toVar();

    // Sharp nearest core exit: anchors the body softmin, or selects the spike on a stellated form.
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

    If(sidesPerFace.equal(int(0)), () => {
      Loop(coreRange, ({ i }) => {
        const plane = vec4(table.planes.element(coreStart.add(i))).toVar();
        const denominator = dot(plane.xyz, direction).toVar();
        If(denominator.greaterThan(grazingDenominator), () => {
          const weight = exp(plane.w.div(denominator).sub(coreRadius).negate().div(roundness));
          blended.addAssign(plane.xyz.mul(weight));
        });
      });
    }).Else(() => {
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
      blended.assign(normalize(spikeNormal).mul(exp(spikeRadius.sub(peak).div(roundness))));
      Loop(sideRange, ({ i }) => {
        const twin = vec4(table.twins.element(spikeStart.add(i))).toVar();
        const denominator = dot(twin.xyz, direction).toVar();
        If(denominator.greaterThan(grazingDenominator), () => {
          const weight = exp(twin.w.div(denominator).sub(peak).div(roundness));
          blended.addAssign(twin.xyz.mul(weight));
        });
      });
    });
    return normalize(blended);
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  });

/**
 * Liquid-metal body material for the loader. One TSL graph serves the WebGPU and WebGL 2 backends of the
 * node renderer; all animation flows through uniform mutation so the pipeline compiles once. Positions morph
 * per vertex; normals are recovered per fragment from the plane table so the fillets read as smooth metal and
 * the flats stay flat at any tessellation.
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
  const roundedNormalField = createRoundedNormalField({
    planes: uPlanes,
    twins: uTwins,
    descriptors: uDescriptors,
    roundness: uRoundness,
  });

  const vDirection = varyingProperty('vec3', 'tauMorphDirectionVarying');
  const vPerturbation = varyingProperty('vec3', 'tauMorphPerturbationVarying');
  const vMolten = varyingProperty('float', 'tauMorphMoltenVarying');
  const vHeat = varyingProperty('float', 'tauMorphHeatVarying');

  const material = new MeshPhysicalNodeMaterial({
    color,
    metalness: 1,
    roughness: settings.roughnessRest,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- three.js material property name
    iridescenceIOR: 1.28,
    iridescenceThicknessRange: [iridescenceThicknessNanometres.thin, iridescenceThicknessNanometres.thick],
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

    // Branch-free helper axis: world up unless the face normal is nearly vertical, then world right.
    const helperAxis = mix(vec3(0, 1, 0), vec3(1, 0, 0), step(float(0.9), abs(faceNormal.y)));
    const tangent = normalize(cross(faceNormal, helperAxis)).toVar('tauMorphTangent');
    const bitangent = cross(faceNormal, tangent).toVar('tauMorphBitangent');
    const probeStep = float(gradientStep);
    const height = displacementField(direction, uSeedOffset, uTime).toVar('tauMorphHeight');
    const gradientTangent = displacementField(direction.add(tangent.mul(probeStep)), uSeedOffset, uTime)
      .sub(height)
      .div(probeStep)
      .toVar('tauMorphGradientT');
    const gradientBitangent = displacementField(direction.add(bitangent.mul(probeStep)), uSeedOffset, uTime)
      .sub(height)
      .div(probeStep)
      .toVar('tauMorphGradientB');

    const relief = height.add(uSwell).mul(molten).toVar('tauMorphRelief');
    const ringWave = uRing
      .mul(uRingAmplitude)
      .mul(cos(alongSweep.mul(Math.PI * 2)))
      .toVar('tauMorphRing');
    const displaced = direction.mul(radius.add(ringWave)).add(faceNormal.mul(relief));

    vDirection.assign(direction);
    vPerturbation.assign(tangent.mul(gradientTangent).add(bitangent.mul(gradientBitangent)).mul(molten));
    vMolten.assign(molten);
    vHeat.assign(smoothstep(float(-heatHeight), float(heatHeight), height));

    return displaced;
  })();

  material.normalNode = Fn(() => {
    const direction = normalize(vDirection).toVar('tauMorphFragmentDirection');
    const front = frontField(direction).toVar('tauMorphFragmentFront');
    const fromNormal = roundedNormalField(uFromIndex, direction).toVar('tauMorphFromNormal');
    const toNormal = roundedNormalField(uToIndex, direction).toVar('tauMorphToNormal');
    const faceNormal = normalize(
      mix(fromNormal, toNormal, saturate(front.x)).add(direction.mul(normalBlendNudge)),
    ).toVar('tauMorphFragmentNormal');
    return transformNormalToView(normalize(faceNormal.sub(vPerturbation)));
  })();
  material.roughnessNode = mix(uRoughnessRest, uRoughnessMolten, vMolten);
  material.iridescenceNode = vMolten.mul(uIridescence);
  material.iridescenceThicknessNode = mix(
    float(iridescenceThicknessNanometres.thin),
    float(iridescenceThicknessNanometres.thick),
    vHeat,
  );

  return {
    material,
    handles: { uFromIndex, uToIndex, uProgress, uMolten, uRing, uTime, uSweepAxis, uSeedOffset },
  };
};
