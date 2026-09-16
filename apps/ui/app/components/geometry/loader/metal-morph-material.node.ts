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
  floor,
  Fn,
  hash,
  If,
  int,
  Loop,
  max,
  min,
  mix,
  mx_noise_float,
  normalize,
  positionLocal,
  saturate,
  smoothstep,
  sqrt,
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

// The attribute type must stay a literal `'vec4'` for TSL generics; grouping it under one `as const` object
// satisfies `tau-lint(no-literal-const-assertion)` while preserving tsgo narrowing (a bare `'vec4'` widens).
const shapeAttributeTypes = { packedSample: 'vec4' } as const;

/** Vertex attribute carrying one shape's packed `normal.xyz, radius` sample, indexed like {@link metalMorphShapeIds}. */
export const metalMorphShapeAttributeName = (index: number): string => `shapeSample${index}`;

export type MetalMorphMaterialOptions = Readonly<{
  /** Linear base reflectance of the metal. */
  color?: Color;
  /** GGX roughness of the polished body at rest. */
  roughnessRest?: number;
  /** GGX roughness inside the molten band; liquid metal reads slightly oily. */
  roughnessMolten?: number;
  /** Thin-film iridescence strength inside the molten band (tempering colours on heated steel). */
  iridescence?: number;
  /** Back-ease overshoot applied to the travelling front; 0 removes the snap. */
  overshoot?: number;
  /** Half-width of the transformation front, as a fraction of the body's extent along the sweep axis. */
  frontBand?: number;
  /** Low-frequency liquid undulation, in render units. */
  flowAmplitude?: number;
  /** Spatial frequency of the liquid undulation. */
  flowScale?: number;
  /** Height of the packed "atom" domes that granulate the molten surface, in render units. */
  atomAmplitude?: number;
  /** Atoms per render unit along the surface. */
  atomScale?: number;
  /** Outward swell of the molten band, in render units. */
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
  roughnessMolten: 0.34,
  iridescence: 0.7,
  overshoot: 1.3,
  frontBand: 0.2,
  flowAmplitude: 0.05,
  flowScale: 2.3,
  atomAmplitude: 0.028,
  atomScale: 9,
  swell: 0.045,
  ringAmplitude: 0.03,
};

/** Keeps the eight-cell atom lattice exact: jitter below 0.35 guarantees the nearest feature is a checked cell. */
const atomJitter = 0.34;
/** Finite-difference step for the displacement gradient, in render units on the unit sphere. */
const gradientStep = 0.015;
/** Iridescence film thickness range in nanometres, mapped from the local heat field. */
const iridescenceThicknessNanometres = { thin: 140, thick: 480 } as const;
/** Positive integer lattice hash: integer offsets keep the truncating hash inputs distinct and non-negative. */
const latticeOffset = 512;
const latticeSecondChannel = 1_000_003;
const latticeThirdChannel = 2_000_003;
/** Radius reported for planes the sampled ray runs away from, so they never win the nearest-exit search. */
const unreachablePlaneRadius = 1e9;
/** Dimensionless guard that rejects planes the sampled ray grazes. */
const grazingDenominator = 1e-6;
/** Integer loop bounds for the TSL `Loop` helper, declared once so overload inference stays tractable. */
type LoopRange = { start: Node<'int'>; end: Node<'int'>; type: 'int'; condition: string };
/** Nudge that keeps blended normals away from zero when two face normals oppose. */
const normalBlendNudge = 1e-4;

/**
 * Three pseudo-random values per integer lattice cell. `hash` truncates its seed to an unsigned integer, so
 * channels are separated by integer offsets rather than fractions.
 */
const latticeHash = Fn(([cell]: [Node<'vec3'>]) => {
  const seed = dot(cell.add(vec3(latticeOffset, latticeOffset, latticeOffset)), vec3(1, 131, 17_161)).toVar();
  return vec3(hash(seed), hash(seed.add(latticeSecondChannel)), hash(seed.add(latticeThirdChannel)));
});

/**
 * Distance to the nearest jittered lattice point using only the eight cells whose centres surround the
 * point. With jitter below 0.35 the nearest point always lies in one of those cells, so the field is exact.
 */
const atomField = Fn(([point]: [Node<'vec3'>]) => {
  const shifted = point.sub(0.5).toVar();
  const cell = floor(shifted).toVar();
  const local = shifted.sub(cell).add(0.5).toVar();
  const nearest = float(9).toVar();
  for (const dx of [0, 1]) {
    for (const dy of [0, 1]) {
      for (const dz of [0, 1]) {
        const offset = vec3(dx, dy, dz);
        const jitter = latticeHash(cell.add(offset)).sub(0.5).mul(atomJitter);
        const feature = offset.add(0.5).add(jitter);
        const delta = feature.sub(local).toVar();
        nearest.assign(min(nearest, dot(delta, delta)));
      }
    }
  }
  return sqrt(nearest);
});

/**
 * Reusable displacement height at a point on the unit sphere: two octaves of Perlin flow plus packed atom
 * domes. Invoked three times per vertex (value and forward differences), so every local stays unnamed.
 */
const createDisplacementField = (uniforms: {
  readonly uFlowScale: UniformNode<'float', number>;
  readonly uFlowAmplitude: UniformNode<'float', number>;
  readonly uAtomScale: UniformNode<'float', number>;
  readonly uAtomAmplitude: UniformNode<'float', number>;
}) =>
  Fn(([point, seed, time]: [Node<'vec3'>, Node<'vec3'>, Node<'float'>]) => {
    const drift = vec3(float(0), time.mul(0.6), time.mul(0.35));
    const flow = mx_noise_float(point.mul(uniforms.uFlowScale).add(seed).add(drift))
      .add(
        mx_noise_float(
          point
            .mul(uniforms.uFlowScale.mul(2.3))
            .sub(seed)
            .add(vec3(time.mul(0.5), 0, 0)),
        ).mul(0.45),
      )
      .toVar();
    const atomDistance = atomField(point.mul(uniforms.uAtomScale).add(seed.mul(3.1)).add(time.mul(0.12)));
    const dome = float(1)
      .sub(smoothstep(float(0), float(0.62), atomDistance))
      .toVar();
    return flow.mul(uniforms.uFlowAmplitude).add(dome.mul(dome).mul(uniforms.uAtomAmplitude));
  });

/**
 * Travelling-front weights for one direction on the body, packed as `weight, frontness, alongSweep, local`.
 * Shared by the vertex stage (positions) and the fragment stage (exact normals), so every local stays unnamed.
 */
const createFrontField = (uniforms: {
  readonly uSweepAxis: UniformNode<'vec3', Vector3>;
  readonly uProgress: UniformNode<'float', number>;
  readonly uFrontBand: UniformNode<'float', number>;
  readonly uOvershoot: UniformNode<'float', number>;
}) =>
  Fn(([direction]: [Node<'vec3'>]) => {
    // Vertices behind the front already carry the target form.
    const alongSweep = dot(direction, uniforms.uSweepAxis).mul(0.5).add(0.5).toVar();
    const frontPosition = uniforms.uProgress
      .mul(float(1).add(uniforms.uFrontBand.mul(2)))
      .sub(uniforms.uFrontBand)
      .toVar();
    const local = float(1)
      .sub(smoothstep(frontPosition.sub(uniforms.uFrontBand), frontPosition.add(uniforms.uFrontBand), alongSweep))
      .toVar();
    // Back-ease overshoot: the surface snaps past its target and springs back as the front passes.
    const shifted = local.sub(1).toVar();
    const weight = float(1)
      .add(uniforms.uOvershoot.add(1).mul(shifted).mul(shifted).mul(shifted))
      .add(uniforms.uOvershoot.mul(shifted).mul(shifted))
      .toVar();
    // Liquid amount peaks on the front itself.
    const frontness = exp(alongSweep.sub(frontPosition).div(uniforms.uFrontBand.mul(0.9)).pow(2).negate()).toVar();
    return vec4(weight, frontness, alongSweep, local);
  });

/**
 * Exact outward normal of one shape along a direction, recovered from the flattened plane table with the same
 * two-level nearest-exit search the CPU sampler uses. Invoked twice per fragment, so every local stays unnamed.
 */
const createExactNormalField = (planes: UniformArrayNode<'vec4'>, descriptors: UniformArrayNode<'vec4'>) =>
  Fn(([shapeIndex, direction]: [Node<'float'>, Node<'vec3'>]) => {
    /* oxlint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- TSL array element and loop nodes are typed as `any` in `@types/three`; the CPU twin in metal-morph-shapes.test.ts proves the lookup order. */
    const descriptor = vec4(descriptors.element(shapeIndex.toInt())).toVar();
    const coreStart = descriptor.x.toInt().toVar();
    const coreCount = descriptor.y.toInt().toVar();
    const sideStart = descriptor.z.toInt().toVar();
    const sidesPerFace = descriptor.w.toInt().toVar();
    const bestRadius = float(unreachablePlaneRadius).toVar();
    const bestIndex = int(0).toVar();
    const bestNormal = vec3(0, 0, 1).toVar();
    const coreRange: LoopRange = { start: int(0), end: coreCount, type: 'int', condition: '<' };
    Loop(coreRange, ({ i }) => {
      const plane = vec4(planes.element(coreStart.add(i))).toVar();
      const denominator = dot(plane.xyz, direction).toVar();
      const radius = plane.w.div(max(denominator, grazingDenominator)).toVar();
      If(denominator.greaterThan(grazingDenominator).and(radius.lessThan(bestRadius)), () => {
        bestRadius.assign(radius);
        bestIndex.assign(i);
        bestNormal.assign(plane.xyz);
      });
    });
    If(sidesPerFace.greaterThan(int(0)), () => {
      const spikeStart = sideStart.add(bestIndex.mul(sidesPerFace)).toVar();
      const bestSideRadius = float(unreachablePlaneRadius).toVar();
      const sideRange: LoopRange = { start: int(0), end: sidesPerFace, type: 'int', condition: '<' };
      Loop(sideRange, ({ i }) => {
        const plane = vec4(planes.element(spikeStart.add(i))).toVar();
        const denominator = dot(plane.xyz, direction).toVar();
        const radius = plane.w.div(max(denominator, grazingDenominator)).toVar();
        If(denominator.greaterThan(grazingDenominator).and(radius.lessThan(bestSideRadius)), () => {
          bestSideRadius.assign(radius);
          bestNormal.assign(plane.xyz);
        });
      });
    });
    return bestNormal;
    /* oxlint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
  });

/**
 * Liquid-metal body material for the loader. One TSL graph serves the WebGPU and WebGL 2 backends of the
 * node renderer; all animation flows through uniform mutation so the pipeline compiles once. Positions morph
 * per vertex; normals are recovered exactly per fragment so facet edges stay razor sharp at any tessellation.
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
  const uAtomAmplitude = uniform(settings.atomAmplitude, 'float');
  const uAtomScale = uniform(settings.atomScale, 'float');
  const uSwell = uniform(settings.swell, 'float');
  const uRingAmplitude = uniform(settings.ringAmplitude, 'float');
  const uRoughnessRest = uniform(settings.roughnessRest, 'float');
  const uRoughnessMolten = uniform(settings.roughnessMolten, 'float');
  const uIridescence = uniform(settings.iridescence, 'float');

  const planeTable = getMetalMorphPlaneTable();
  const uPlanes: UniformArrayNode<'vec4'> = uniformArray(
    planeTable.planes.map((plane) => new Vector4(...plane)),
    shapeAttributeTypes.packedSample,
  );
  const uDescriptors: UniformArrayNode<'vec4'> = uniformArray(
    planeTable.descriptors.map((descriptor) => new Vector4(...descriptor)),
    shapeAttributeTypes.packedSample,
  );

  const shapeAttributes: ReadonlyArray<AttributeNode<'vec4'>> = metalMorphShapeIds.map((_id, index) =>
    attribute(metalMorphShapeAttributeName(index), shapeAttributeTypes.packedSample),
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

  const displacementField = createDisplacementField({ uFlowScale, uFlowAmplitude, uAtomScale, uAtomAmplitude });
  const frontField = createFrontField({ uSweepAxis, uProgress, uFrontBand, uOvershoot });
  const exactNormalField = createExactNormalField(uPlanes, uDescriptors);

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
    vHeat.assign(smoothstep(float(-0.06), float(0.06), height));

    return displaced;
  })();

  material.normalNode = Fn(() => {
    const direction = normalize(vDirection).toVar('tauMorphFragmentDirection');
    const front = frontField(direction).toVar('tauMorphFragmentFront');
    const fromNormal = exactNormalField(uFromIndex, direction).toVar('tauMorphFromNormal');
    const toNormal = exactNormalField(uToIndex, direction).toVar('tauMorphToNormal');
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
