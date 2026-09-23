import type { Material, Mesh, Object3D, WebGLProgramParametersWithUniforms } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { gltfEdgeLineWidth } from '#components/geometry/graphics/three/materials/gltf-edges.js';

const slopeScale = gltfEdgeLineWidth * 0.5 + 1;
const constantDepthSteps = 2;
const webGlDepthStep = constantDepthSteps / (2 ** 24 - 1);
const webGlDepthClamp = 0.01;
const shaderCacheKey = 'tau-gltf-surface-depth-bias-v2';

type SurfaceDepthBiasState = Readonly<{
  backend: ResolvedGraphicsBackend;
  onBeforeCompile: Material['onBeforeCompile'];
  customProgramCacheKey: Material['customProgramCacheKey'];
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
}>;

/**
 * The rasterizer offset half of the separation, per backend.
 *
 * Live only where the renderer does not write `gl_FragDepth` — the WebGPU viewport. Exported so
 * generated surfaces (the section caps) can be asserted against the one separation rather than
 * carrying a second set of constants.
 */
export const gltfSurfacePolygonOffset = {
  webgl: { polygonOffsetFactor: slopeScale, polygonOffsetUnits: constantDepthSteps },
  webgpu: { polygonOffsetFactor: -slopeScale, polygonOffsetUnits: -constantDepthSteps },
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

const restoreSurfaceDepthBias = (material: Material, state: SurfaceDepthBiasState): void => {
  material.onBeforeCompile = state.onBeforeCompile;
  material.customProgramCacheKey = state.customProgramCacheKey;
  material.polygonOffset = state.polygonOffset;
  material.polygonOffsetFactor = state.polygonOffsetFactor;
  material.polygonOffsetUnits = state.polygonOffsetUnits;
  states.delete(material);
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
 * paths) the shader term separates the surface and `polygonOffset*` is inert, because a
 * shader-written depth discards the rasterizer's offset. The WebGPU viewport runs reversed-Z
 * without log depth, so there `polygonOffset*` is the whole mechanism.
 */
export const applyGltfSurfaceDepthBias = (material: Material, backend: ResolvedGraphicsBackend): void => {
  const existingState = states.get(material);
  if (!isOpaqueDepthWriter(material)) {
    if (existingState) {
      restoreSurfaceDepthBias(material, existingState);
    }
    return;
  }

  if (existingState?.backend === backend) {
    return;
  }
  if (existingState) {
    restoreSurfaceDepthBias(material, existingState);
  }

  const state: SurfaceDepthBiasState = {
    backend,
    onBeforeCompile: material.onBeforeCompile,
    customProgramCacheKey: material.customProgramCacheKey,
    polygonOffset: material.polygonOffset,
    polygonOffsetFactor: material.polygonOffsetFactor,
    polygonOffsetUnits: material.polygonOffsetUnits,
  };
  states.set(material, state);
  material.polygonOffset = true;
  material.polygonOffsetFactor = gltfSurfacePolygonOffset[backend].polygonOffsetFactor;
  material.polygonOffsetUnits = gltfSurfacePolygonOffset[backend].polygonOffsetUnits;

  if (backend === 'webgl') {
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer): void => {
      state.onBeforeCompile.call(material, shader, renderer);
      shader.fragmentShader = replaceExactlyOnce(
        shader.fragmentShader,
        `#include <logdepthbuf_fragment>
        #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
          float tauSurfaceDepthSlope = max(abs(dFdx(gl_FragDepth)), abs(dFdy(gl_FragDepth)));
          float tauSurfaceDepthOffset = min(${webGlDepthClamp.toPrecision(8)}, tauSurfaceDepthSlope * ${slopeScale.toPrecision(8)} + ${webGlDepthStep.toPrecision(8)});
          gl_FragDepth = min(1.0, gl_FragDepth + tauSurfaceDepthOffset);
        #endif`,
      );
    };
    material.customProgramCacheKey = (): string => `${state.customProgramCacheKey.call(material)}|${shaderCacheKey}`;
  }

  material.needsUpdate = true;
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
