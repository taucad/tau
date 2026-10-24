import type { Material, Mesh, Object3D, WebGLProgramParametersWithUniforms } from 'three';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { gltfEdgeLineWidth } from '#graphics/three/materials/gltf-edges.js';

const webGpuSlopeScale = gltfEdgeLineWidth * 0.5 + 1;
const constantDepthSteps = 2;
const webGlDepthStep = constantDepthSteps / (2 ** 24 - 1);
const webGlDepthClamp = 0.01;
const shaderCacheKey = 'tau-gltf-surface-depth-bias-v3';

/**
 * The WebGL slope margin, in device pixels of the surface's own depth gradient.
 *
 * An edge fragment off the line's spine carries the spine's depth while the face under it moves
 * `|∇depth|` per pixel, so a coplanar edge needs the face to give up half the drawn stroke, plus
 * the half pixel by which a fragment's centre (where `gl_FragDepth` is evaluated) can sit past the
 * stroke's edge. Any margin beyond that lets a hidden edge that ends on the face's boundary, such
 * as a far-side flank edge of a gear tooth, show through as a tick past the contour line. The
 * stroke is {@link gltfEdgeLineWidth} CSS pixels wide, so the margin follows the renderer's pixel
 * ratio. See `docs/research/viewer-edge-end-bleed-blueprint.md`.
 */
const webGlSlopeScale = { value: gltfEdgeLineWidth * 0.5 + 0.5 };

/**
 * The shared surface update. Classic materials call it as a render hook; the node renderer
 * calls it from its draw callback because Three does not invoke material hooks there.
 * It reads the pixel ratio per draw because one material can serve renderers at different ratios.
 * @param renderer - The renderer about to draw the material, including its depth convention.
 */
export function syncGltfSurfaceDepthBias(
  this: Material,
  renderer: Readonly<{ getPixelRatio: () => number; reversedDepthBuffer?: boolean }>,
): void {
  const margin = gltfEdgeLineWidth * 0.5 * renderer.getPixelRatio() + 0.5;
  webGlSlopeScale.value = margin;
  const state = states.get(this);
  if (state?.backend === 'webgpu') {
    // The node family can execute with either depth convention. Separate surfaces
    // away from the camera, using the actual device-pixel stroke footprint.
    const sign = renderer.reversedDepthBuffer ? -1 : 1;
    this.polygonOffsetFactor = sign * margin;
    this.polygonOffsetUnits = sign * constantDepthSteps;
    state.appliedPolygonOffsetFactor = this.polygonOffsetFactor;
    state.appliedPolygonOffsetUnits = this.polygonOffsetUnits;
  }
}

/**
 * Whether a material render hook is the shared one installed by {@link applyGltfSurfaceDepthBias}.
 * @param hook - A material's `onBeforeRender`.
 * @returns True for the depth bias's own hook.
 */
export const isGltfSurfaceDepthBiasRenderHook = (hook: unknown): boolean => hook === syncGltfSurfaceDepthBias;

type SurfaceDepthBiasState = {
  configuredBackend: ResolvedGraphicsBackend;
  composed: boolean;
  appliedPolygonOffsetFactor?: number;
  appliedPolygonOffsetUnits?: number;
  hookKeyPrefix?: { previous: string; composed: string };
  previousHooks?: Pick<Material, 'onBeforeCompile' | 'customProgramCacheKey'>;
  composedHooks?: Pick<Material, 'onBeforeCompile' | 'customProgramCacheKey'>;
  /** The backend the bias is active for; undefined while the surface is not an opaque depth writer. */
  backend: ResolvedGraphicsBackend | undefined;
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
};

/**
 * The rasterizer offset half of the separation, per backend.
 *
 * Live only on the WebGPU viewport. WebGL writes `gl_FragDepth` on every path, and the shader term owns
 * the whole separation there: on the orthographic path Three writes `gl_FragCoord.z`, which some
 * drivers return with the rasterizer offset already applied, so a WebGL offset doubled the margin
 * exactly where it does the most harm. Exported so
 * generated surfaces (the section caps) can be asserted against the one separation rather than
 * carrying a second set of constants.
 */
export const gltfSurfacePolygonOffset = {
  webgl: { polygonOffsetFactor: 0, polygonOffsetUnits: 0 },
  webgpu: {
    polygonOffsetFactor: -webGpuSlopeScale,
    polygonOffsetUnits: -constantDepthSteps,
  },
} as const satisfies Record<ResolvedGraphicsBackend, { polygonOffsetFactor: number; polygonOffsetUnits: number }>;

const states = new WeakMap<Material, SurfaceDepthBiasState>();
const logDepthFragmentChunk = '#include <logdepthbuf_fragment>';

const replaceExactlyOnce = (source: string, replacement: string): string => {
  const first = source.indexOf(logDepthFragmentChunk);
  if (first === -1 || first !== source.lastIndexOf(logDepthFragmentChunk)) {
    throw new Error('GLTF surface depth bias requires exactly one <logdepthbuf_fragment> chunk');
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + logDepthFragmentChunk.length)}`;
};

const isOpaqueDepthWriter = (material: Material): boolean =>
  material.depthWrite && !material.transparent && material.opacity >= 1;

/**
 * Chains the bias into the material's shader hook once, for good. The hook and the program key read the state, so
 * turning the bias off never unwinds the chain and cannot drop a hook composed after it, such as the section clip.
 */
const composeSurfaceDepthBias = (material: Material, state: SurfaceDepthBiasState): void => {
  state.composed = true;
  const previousHook = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  state.previousHooks = { onBeforeCompile: previousHook, customProgramCacheKey: previousKey };
  const previousHookText = previousHook.toString();
  const hookDerivedKey = previousKey.call(material).startsWith(previousHookText);
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer): void => {
    previousHook.call(material, shader, renderer);
    if (state.backend === 'webgl') {
      shader.uniforms['tauSurfaceDepthSlopeScale'] = webGlSlopeScale;
      shader.fragmentShader = `uniform float tauSurfaceDepthSlopeScale;\n${replaceExactlyOnce(
        shader.fragmentShader,
        `#include <logdepthbuf_fragment>
        #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
          float tauSurfaceDepthSlope = length(vec2(dFdx(gl_FragDepth), dFdy(gl_FragDepth)));
          float tauSurfaceDepthOffset = min(${webGlDepthClamp.toPrecision(8)}, tauSurfaceDepthSlope * tauSurfaceDepthSlopeScale + ${webGlDepthStep.toPrecision(8)});
          gl_FragDepth = min(1.0, gl_FragDepth + tauSurfaceDepthOffset);
        #endif`,
      )}`;
    }
  };
  if (material.onBeforeRender === Object.getPrototypeOf(material).onBeforeRender) {
    material.onBeforeRender = syncGltfSurfaceDepthBias;
  }
  if (hookDerivedKey) {
    state.hookKeyPrefix = { previous: previousHookText, composed: material.onBeforeCompile.toString() };
  }
  material.customProgramCacheKey = (): string =>
    state.backend === 'webgl' ? `${previousKey.call(material)}|${shaderCacheKey}` : previousKey.call(material);
  state.composedHooks = {
    onBeforeCompile: material.onBeforeCompile,
    customProgramCacheKey: material.customProgramCacheKey,
  };
};

const deactivateSurfaceDepthBias = (material: Material, state: SurfaceDepthBiasState): void => {
  state.backend = undefined;
  material.polygonOffset = state.polygonOffset;
  material.polygonOffsetFactor = state.polygonOffsetFactor;
  material.polygonOffsetUnits = state.polygonOffsetUnits;
  material.needsUpdate = true;
};

/**
 * Keep GLTF lines at geometric depth and separate only coplanar opaque triangles.
 *
 * Nothing drawn *over* a surface may carry this bias. Overlays (characteristic edges, the
 * emphasis wash) render at geometric depth and win by the slope-scaled margin; matching the
 * surface's bias instead makes the depth test an exact `LEQUAL` tie, which the GPU does not
 * resolve reproducibly — see `docs/research/viewer-emphasis-depth-and-coverage-blueprint.md`.
 *
 * Only one of the two mechanisms below is live per renderer. Where the renderer writes
 * `gl_FragDepth` (`logarithmicDepthBuffer: true`: the WebGL viewport, screenshot and offscreen
 * paths) the shader term separates the surface, sized to the drawn edge stroke at the renderer's
 * pixel ratio, and the WebGL `polygonOffset*` is zero. The WebGPU viewport runs reversed-Z
 * without log depth, so there `polygonOffset*` is the whole mechanism.
 */
export const applyGltfSurfaceDepthBias = (material: Material, backend: ResolvedGraphicsBackend): void => {
  let state = states.get(material);
  if (!state) {
    state = {
      configuredBackend: backend,
      composed: false,
      backend: undefined,
      polygonOffset: material.polygonOffset,
      polygonOffsetFactor: material.polygonOffsetFactor,
      polygonOffsetUnits: material.polygonOffsetUnits,
    };
    states.set(material, state);
  }
  state.configuredBackend = backend;
  if (!isOpaqueDepthWriter(material)) {
    if (state.backend) {
      deactivateSurfaceDepthBias(material, state);
    }
    return;
  }

  if (state.backend === backend) {
    return;
  }
  if (state.backend) {
    deactivateSurfaceDepthBias(material, state);
  }

  if (!state.composed) {
    composeSurfaceDepthBias(material, state);
  }
  state.backend = backend;
  state.polygonOffset = material.polygonOffset;
  state.polygonOffsetFactor = material.polygonOffsetFactor;
  state.polygonOffsetUnits = material.polygonOffsetUnits;
  material.polygonOffset = true;
  material.polygonOffsetFactor = gltfSurfacePolygonOffset[backend].polygonOffsetFactor;
  material.polygonOffsetUnits = gltfSurfacePolygonOffset[backend].polygonOffsetUnits;
  state.appliedPolygonOffsetFactor = material.polygonOffsetFactor;
  state.appliedPolygonOffsetUnits = material.polygonOffsetUnits;
  material.needsUpdate = true;
};

/** Refresh only explicitly configured surfaces after their final appearance is applied. */
export const refreshGltfSurfaceDepthBias = (material: Material): void => {
  const state = states.get(material);
  if (state) {
    applyGltfSurfaceDepthBias(material, state.configuredBackend);
  }
};

/** Recognize only the exact delayed depth hook composed over an already sealed material. */
export const isGltfSurfaceDepthBiasHookExtension = (
  material: Material,
  sealed: Pick<Material, 'onBeforeCompile' | 'customProgramCacheKey'>,
): boolean => {
  const state = states.get(material);
  return (
    state?.previousHooks?.onBeforeCompile === sealed.onBeforeCompile &&
    state.previousHooks.customProgramCacheKey === sealed.customProgramCacheKey &&
    state.composedHooks?.onBeforeCompile === material.onBeforeCompile &&
    state.composedHooks.customProgramCacheKey === material.customProgramCacheKey
  );
};

type SurfaceDepthBiasCohort = Readonly<{
  backend: ResolvedGraphicsBackend;
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  programCacheKey: string;
}>;

/** Normalize only the owned opacity-dependent bias for retained opaque cohort capacity. */
export const getGltfSurfaceDepthBiasCohort = (
  material: Material,
  programCacheKey: string,
): SurfaceDepthBiasCohort | undefined => {
  const state = states.get(material);
  if (!state || Boolean(state.backend) !== isOpaqueDepthWriter(material)) {
    return undefined;
  }
  const expected = state.backend
    ? { polygonOffsetFactor: state.appliedPolygonOffsetFactor, polygonOffsetUnits: state.appliedPolygonOffsetUnits }
    : state;
  if (
    material.polygonOffset !== (state.backend ? true : state.polygonOffset) ||
    material.polygonOffsetFactor !== expected.polygonOffsetFactor ||
    material.polygonOffsetUnits !== expected.polygonOffsetUnits
  ) {
    return undefined;
  }
  let normalizedKey = programCacheKey;
  if (state.backend === 'webgl') {
    const marker = `|${shaderCacheKey}`;
    const ownMarker = normalizedKey.lastIndexOf(marker);
    if (ownMarker === -1) {
      return undefined;
    }
    normalizedKey = normalizedKey.slice(0, ownMarker) + normalizedKey.slice(ownMarker + marker.length);
  }
  // Three's default key reads the current hook. Undo only this owner's exact outer prefix,
  // preserving any authored or section suffix and every unrelated key.
  const prefix = state.hookKeyPrefix;
  if (prefix && normalizedKey.startsWith(prefix.composed)) {
    normalizedKey = prefix.previous + normalizedKey.slice(prefix.composed.length);
  }
  return {
    backend: state.configuredBackend,
    polygonOffset: state.polygonOffset,
    polygonOffsetFactor: state.polygonOffsetFactor,
    polygonOffsetUnits: state.polygonOffsetUnits,
    programCacheKey: normalizedKey,
  };
};

export const applyGltfSurfaceDepthBiasToScene = (scene: Object3D, backend: ResolvedGraphicsBackend): void => {
  scene.traverse((object) => {
    if (!('isMesh' in object) || !object.isMesh || object.type === 'LineSegments2') {
      return;
    }

    const { material } = object as Mesh;
    for (const surfaceMaterial of Array.isArray(material) ? material : [material]) {
      applyGltfSurfaceDepthBias(surfaceMaterial, backend);
    }
  });
};
