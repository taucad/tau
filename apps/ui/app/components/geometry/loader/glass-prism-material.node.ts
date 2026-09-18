/* oxlint-disable new-cap -- three/tsl `Fn`/`If` are shader graph factories */
import { BackSide, Color, CustomBlending, DoubleSide, FrontSide, NormalBlending, OneFactor, Vector3 } from 'three';
import type { Texture } from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { AttributeNode, Node, UniformNode } from 'three/webgpu';
import {
  abs,
  attribute,
  cameraPosition,
  cos,
  cross,
  dot,
  exp,
  float,
  Fn,
  frontFacing,
  If,
  luminance,
  max,
  min,
  mix,
  normalize,
  oneMinus,
  pmremTexture,
  positionLocal,
  positionWorld,
  pow,
  reflect,
  refract,
  saturate,
  step,
  transformNormal,
  uniform,
  uv,
  varyingProperty,
  vec3,
  vec4,
} from 'three/tsl';
import { glassPrismChannelIndices, glassPrismTint } from '#components/geometry/loader/glass-prism.constants.js';
import { glassPrismShapeIds } from '#components/geometry/loader/glass-prism-shapes.js';
import {
  createDisplacementField,
  createFrontField,
  metalMorphShapeAttributeName,
} from '#components/geometry/loader/metal-morph-material.node.js';

// Node types must stay literals for TSL generics; grouping them under one `as const` object satisfies
// `tau-lint(no-literal-const-assertion)` while preserving tsgo narrowing (a bare `'vec4'` widens).
const nodeTypes = { packedSample: 'vec4', pair: 'vec2', triple: 'vec3' } as const;

export type GlassPrismMaterialOptions = Readonly<{
  /** Prefiltered studio the glass reflects and refracts; swapped through `setEnvironment` on a theme change. */
  environment: Texture;
  /** Refractive index per display channel; see `glassPrismChannelIndices`. */
  channelIndices?: readonly [number, number, number];
  /** Linear transmittance tint. */
  tint?: Color;
  /** Coverage the body always has over the page, so clear glass still reads as a solid. */
  baseOpacity?: number;
  /** Extra coverage at grazing angles, where a real pane goes mirror-like. */
  rimOpacity?: number;
  /** Strength of the thin-film colour that blooms along the rim, the liquid glass signature. */
  filmStrength?: number;
  /** White light the rim itself gives off, the edge glow that makes clear glass legible on any ground. */
  rimGlow?: number;
  /** Which faces this instance draws; a body is drawn back faces first, then front faces. */
  side?: 'front' | 'back';
  /** Tilt the shading normal by the displacement gradient while the glass flows; hero tiers only. */
  perturbNormals?: boolean;
  /** Back-ease overshoot applied to the travelling front. */
  overshoot?: number;
  /** Half-width of the transformation front, as a fraction of the body's extent along the sweep axis. */
  frontBand?: number;
  /** Broad undulation of the flowing surface, in render units. */
  flowAmplitude?: number;
  flowScale?: number;
  /** Height of the ripple train trailing the crest, in render units. */
  rippleAmplitude?: number;
  rippleWavelength?: number;
  rippleDecay?: number;
  /** Outward swell of the crest, in render units. */
  swell?: number;
  /** Radial amplitude of the settle wobble, in render units. */
  ringAmplitude?: number;
}>;

export type GlassPrismMaterialHandles = Readonly<{
  uFromIndex: UniformNode<'float', number>;
  uToIndex: UniformNode<'float', number>;
  uProgress: UniformNode<'float', number>;
  uMolten: UniformNode<'float', number>;
  uRing: UniformNode<'float', number>;
  uTime: UniformNode<'float', number>;
  uSweepAxis: UniformNode<'vec3', Vector3>;
  uSeedOffset: UniformNode<'vec3', Vector3>;
}>;

const defaultOptions: Required<Omit<GlassPrismMaterialOptions, 'environment' | 'channelIndices' | 'tint'>> = {
  baseOpacity: 0.1,
  rimOpacity: 1,
  filmStrength: 0.5,
  rimGlow: 0.9,
  side: 'front',
  perturbNormals: true,
  overshoot: 0.1,
  frontBand: 0.3,
  flowAmplitude: 0.045,
  flowScale: 1.5,
  rippleAmplitude: 0.01,
  rippleWavelength: 0.2,
  rippleDecay: 0.3,
  swell: 0.06,
  ringAmplitude: 0.025,
};

/** Finite-difference step for the displacement gradient, in render units on the unit sphere. */
const gradientStep = 0.015;
/** Nudge that keeps blended normals away from zero when two face normals oppose. */
const normalBlendNudge = 1e-4;
/** PMREM roughness the mirror-like reflection samples at. */
const reflectionRoughness = 0.04;
/** PMREM roughness the refracted view samples at; a touch soft, as if seen through a millimetre of glass. */
const refractionRoughness = 0.12;
/** Back faces read fainter: they are the far wall of the body seen through its near wall. */
const backFaceOpacityScale = 0.55;
/** Thin-film phase cycles across the rim, per display channel, tuned so the fringe runs violet to gold. */
const filmPhaseScale = vec3(5.2, 6.1, 7.4);
const filmPhaseOffset = vec3(0, 2.1, 4.2);

/** Uniform mirrors of the body's animation state; shared with the metal loader's controller logic. */
const createHandles = (): GlassPrismMaterialHandles => ({
  uFromIndex: uniform(0, 'float'),
  uToIndex: uniform(0, 'float'),
  uProgress: uniform(1, 'float'),
  uMolten: uniform(0, 'float'),
  uRing: uniform(0, 'float'),
  uTime: uniform(0, 'float'),
  uSweepAxis: uniform(new Vector3(0, 1, 0)),
  uSeedOffset: uniform(new Vector3(0, 0, 0)),
});

/**
 * Glass body material for the loader. Image-based throughout: the studio reflects off the near surface
 * with a Fresnel weight and refracts through it once per display channel at its own index, so the
 * environment's strips split into fringes; a thin-film ramp blooms along the rim. Positions morph per vertex
 * from the packed radial samples with the liquid fields the metal loader flows with. Output is premultiplied
 * for the transparent canvas, so the page shows through the body wherever the glass is clear.
 */
export type GlassPrismMaterial = Readonly<{
  material: MeshBasicNodeMaterial;
  handles: GlassPrismMaterialHandles;
  setEnvironment: (texture: Texture) => void;
  /**
   * Re-weight the body for the page it sits on: over a dark page glass is read by the light its rim gives
   * off; over a light page by the grey it refracts, so it takes more body and almost no glow.
   */
  setTheme: (theme: 'dark' | 'light') => void;
}>;

/** Coverage and rim glow per theme; see {@link GlassPrismMaterial.setTheme}. */
const themeWeights = {
  dark: { opacityScale: 1, rimGlowScale: 1 },
  light: { opacityScale: 3, rimGlowScale: 0.12 },
} as const;

export const createGlassPrismNodeMaterial = (options: GlassPrismMaterialOptions): GlassPrismMaterial => {
  const settings = { ...defaultOptions, ...options };
  const indices = options.channelIndices ?? glassPrismChannelIndices;
  const tint = options.tint ?? glassPrismTint;
  const handles = createHandles();
  const { uFromIndex, uToIndex, uProgress, uMolten, uRing, uTime, uSweepAxis, uSeedOffset } = handles;
  const uOvershoot = uniform(settings.overshoot, 'float');
  const uFrontBand = uniform(settings.frontBand, 'float');
  const uFlowAmplitude = uniform(settings.flowAmplitude, 'float');
  const uFlowScale = uniform(settings.flowScale, 'float');
  const uRippleAmplitude = uniform(settings.rippleAmplitude, 'float');
  const uRippleWavelength = uniform(settings.rippleWavelength, 'float');
  const uRippleDecay = uniform(settings.rippleDecay, 'float');
  const uSwell = uniform(settings.swell, 'float');
  const uRingAmplitude = uniform(settings.ringAmplitude, 'float');
  const uIndices = uniform(new Vector3(...indices));
  const uTint = uniform(new Color(tint.r, tint.g, tint.b));
  const uBaseOpacity = uniform(settings.baseOpacity, 'float');
  const uRimOpacity = uniform(settings.rimOpacity, 'float');
  const uFilmStrength = uniform(settings.filmStrength, 'float');
  const uRimGlow = uniform(settings.rimGlow, 'float');

  const shapeAttributes: ReadonlyArray<AttributeNode<'vec4'>> = glassPrismShapeIds.map((_id, index) =>
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

  const vNormal = varyingProperty('vec3', 'tauGlassNormalVarying');
  const vPerturbation = varyingProperty('vec3', 'tauGlassPerturbationVarying');
  const vMolten = varyingProperty('float', 'tauGlassMoltenVarying');

  const reflectionNode = pmremTexture(options.environment, vec3(0, 1, 0), float(reflectionRoughness));
  const refractionNodes = [0, 1, 2].map(() =>
    pmremTexture(options.environment, vec3(0, 1, 0), float(refractionRoughness)),
  );

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    premultipliedAlpha: true,
    side: settings.side === 'back' ? BackSide : FrontSide,
  });

  material.positionNode = Fn(() => {
    const direction = positionLocal.toVar('tauGlassDirection');
    const source = pickShape(uFromIndex).toVar('tauGlassSource');
    const target = pickShape(uToIndex).toVar('tauGlassTarget');
    const front = frontField(direction).toVar('tauGlassFront');
    const weight = front.x;
    const frontness = front.y;
    const alongSweep = front.z;

    const radius = mix(source.w, target.w, weight).toVar('tauGlassRadius');
    const faceNormal = normalize(
      mix(source.xyz, target.xyz, saturate(weight)).add(direction.mul(normalBlendNudge)),
    ).toVar('tauGlassVertexNormal');
    const molten = uMolten.mul(frontness).toVar('tauGlassMoltenAmount');
    const height = float(0).toVar('tauGlassHeight');
    const perturbation = vec3(0, 0, 0).toVar('tauGlassPerturbation');

    // The liquid fields only exist while a transition is under way; at rest one uniform branch skips them.
    If(uMolten.greaterThan(float(0)), () => {
      height.assign(displacementField(direction, uSeedOffset, uTime));
      if (settings.perturbNormals) {
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

    const relief = height.add(uSwell).mul(molten).toVar('tauGlassRelief');
    const ringWave = uRing
      .mul(uRingAmplitude)
      .mul(cos(alongSweep.mul(Math.PI * 2)))
      .toVar('tauGlassRing');

    vNormal.assign(faceNormal);
    vPerturbation.assign(perturbation);
    vMolten.assign(molten);
    return direction.mul(radius.add(ringWave)).add(faceNormal.mul(relief));
  })();

  const shading = Fn(() => {
    // World-space shading normal: the morphed face normal tilted by the liquid gradient, flipped for the far wall.
    const objectNormal = normalize(vNormal.sub(vPerturbation));
    // `faceDirection` is untyped in `@types/three`; a select on the boolean gives a typed sign.
    const facing = frontFacing.select(float(1), float(-1));
    const normal = normalize(vec3(transformNormal(objectNormal)))
      .mul(facing)
      .toVar('tauGlassNormal');
    const view = normalize(cameraPosition.sub(positionWorld)).toVar('tauGlassView');
    const cosine = saturate(dot(normal, view)).toVar('tauGlassCosine');

    // Schlick Fresnel at the green index; the body's own dispersion lives in the refracted sample.
    const eta = uIndices.y;
    const reflectanceAtNormal = pow(eta.sub(1).div(eta.add(1)), 2);
    const fresnel = reflectanceAtNormal
      .add(oneMinus(reflectanceAtNormal).mul(pow(oneMinus(cosine), 5)))
      .toVar('tauGlassFresnel');

    const incident = view.negate();
    reflectionNode.uvNode = reflect(incident, normal);
    const reflection = vec3(reflectionNode).toVar('tauGlassReflection');
    const channels = [refractionNodes[0]!, refractionNodes[1]!, refractionNodes[2]!] as const;
    channels[0].uvNode = refract(incident, normal, float(1).div(uIndices.x));
    channels[1].uvNode = refract(incident, normal, float(1).div(uIndices.y));
    channels[2].uvNode = refract(incident, normal, float(1).div(uIndices.z));
    const refraction = vec3(vec3(channels[0]).x, vec3(channels[1]).y, vec3(channels[2]).z)
      .mul(uTint)
      .toVar('tauGlassRefraction');

    // Thin film along the rim: a cheap interference ramp keyed by the viewing angle, strongest where the
    // surface turns away and while the glass flows.
    const rim = pow(oneMinus(cosine), 3).toVar('tauGlassRim');
    const film = cos(cosine.mul(filmPhaseScale).add(filmPhaseOffset)).mul(0.5).add(0.5);
    const filmWeight = uFilmStrength.mul(rim).mul(float(0.6).add(vMolten.mul(0.8)));

    // The rim gives off a little light of its own: an edge caustic, and the line the eye reads glass by.
    const edge = pow(oneMinus(cosine), 5).mul(uRimGlow);
    const color = reflection
      .mul(fresnel)
      .add(refraction.mul(oneMinus(fresnel)))
      .add(film.mul(filmWeight))
      .add(edge)
      .toVar('tauGlassColor');
    const opacity = saturate(
      uBaseOpacity.add(fresnel.mul(uRimOpacity)).add(edge).add(luminance(refraction).mul(0.25)),
    ).mul(settings.side === 'back' ? backFaceOpacityScale : 1);
    return vec4(color, opacity);
  })();

  material.colorNode = shading.xyz;
  material.opacityNode = shading.w;

  const setEnvironment = (texture: Texture): void => {
    reflectionNode.value = texture;
    for (const node of refractionNodes) {
      node.value = texture;
    }
  };

  const setTheme = (theme: 'dark' | 'light'): void => {
    const weights = themeWeights[theme];
    uBaseOpacity.value = Math.min(1, settings.baseOpacity * weights.opacityScale);
    uRimGlow.value = settings.rimGlow * weights.rimGlowScale;
  };

  return { material, handles, setEnvironment, setTheme };
};

/** Vertex attribute names of the light ribbons: colour, and `intensity, taper` per vertex. */
export const lightRibbonAttributeNames = { color: 'ribbonColor', profile: 'ribbonProfile' } as const;

export type LightRibbonMaterialHandles = Readonly<{
  /** Radiance scale that keeps the beam's energy constant however many rays overlap in it. */
  uGain: UniformNode<'float', number>;
}>;

export type LightRibbonMaterials = Readonly<{
  /** Added light: radiance and coverage both accumulate, so overlapping rays sum to the beam. */
  light: MeshBasicNodeMaterial;
  /** Ink for a light page, drawn instead of the light: added light on white is invisible, printed colour is not. */
  ink: MeshBasicNodeMaterial;
  handles: LightRibbonMaterialHandles;
}>;

/** Ink the white beam prints as on a light page. */
const inkColor = vec3(0.56, 0.62, 0.7);

/**
 * Depth-free materials for the traced light: each ribbon glows with a Gaussian profile across its width
 * and, when it leaves the sheet, fades along its length. A dark page adds the light; a light page prints it.
 */
export const createLightRibbonMaterials = (): LightRibbonMaterials => {
  const uGain = uniform(1, 'float');
  const color = attribute(lightRibbonAttributeNames.color, nodeTypes.triple);
  const profile = attribute(lightRibbonAttributeNames.profile, nodeTypes.pair);

  const shapeRibbon = (): { core: Node<'float'>; halo: Node<'float'>; intensity: Node<'float'> } => {
    const across = uv().y.mul(2).sub(1);
    const along = uv().x;
    // A soft profile: the beam is a body of light with feathered edges, not a hot line with a halo.
    const core = exp(across.mul(across).mul(-4)).toVar('tauRibbonCore');
    const halo = exp(across.mul(across).mul(-1.2)).mul(0.45).toVar('tauRibbonHalo');
    const fade = mix(float(1), pow(oneMinus(along), 2), profile.y);
    const intensity = profile.x.mul(fade).toVar('tauRibbonIntensity');
    return { core, halo, intensity };
  };

  const light = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    // Radiance and coverage both accumulate, untouched by each other: the shader owns both.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneFactor,
  });
  const lightGlow = Fn(() => {
    const { core, halo, intensity } = shapeRibbon();
    const radiance = color.mul(core.add(halo)).mul(intensity).mul(uGain).mul(0.85);
    const coverage = saturate(max(core, halo).mul(intensity).mul(uGain).mul(2));
    return vec4(radiance, coverage);
  })();
  light.colorNode = lightGlow.xyz;
  light.opacityNode = lightGlow.w;

  const ink = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
    premultipliedAlpha: true,
    blending: NormalBlending,
  });
  const inkGlow = Fn(() => {
    const { core, halo, intensity } = shapeRibbon();
    // The white beam prints as grey-blue ink; the spectrum prints in its own colours, deepened for paper.
    const whiteness = step(float(2.9), color.x.add(color.y).add(color.z));
    const printed = mix(color.mul(0.85), inkColor, whiteness);
    // Partial coverage lets overlapping colours layer rather than the last one drawn winning outright.
    const coverage = saturate(
      max(core, halo)
        .mul(intensity)
        .mul(mix(float(0.7), float(1), whiteness)),
    );
    return vec4(printed, coverage);
  })();
  ink.colorNode = inkGlow.xyz;
  ink.opacityNode = inkGlow.w;

  return { light, ink, handles: { uGain } };
};

/** Ordered draw for the glass: the haze, the light, then the far wall, then the near wall. */
export const glassPrismRenderOrder = { ink: 0, ribbons: 1, backFaces: 2, frontFaces: 3 } as const;

/** Convenience for callers that build both body materials. */
export const createGlassPrismBodyMaterials = (
  options: Omit<GlassPrismMaterialOptions, 'side'>,
): { readonly front: GlassPrismMaterial; readonly back: GlassPrismMaterial } => ({
  front: createGlassPrismNodeMaterial({ ...options, side: 'front' }),
  back: createGlassPrismNodeMaterial({ ...options, side: 'back' }),
});
