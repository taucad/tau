import type { Material, Mesh, Object3D, WebGLProgramParametersWithUniforms } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { gltfEdgeLineWidth } from '#components/geometry/graphics/three/materials/gltf-edges.js';

const slopeScale = gltfEdgeLineWidth * 0.5 + 1;
const constantDepthSteps = 2;
const webGlDepthStep = constantDepthSteps / (2 ** 24 - 1);
const webGlDepthClamp = 0.01;
const shaderCacheKey = 'tau-gltf-surface-depth-bias-v1';

type SurfaceDepthBiasState = Readonly<{
  backend: ResolvedGraphicsBackend;
  onBeforeCompile: Material['onBeforeCompile'];
  customProgramCacheKey: Material['customProgramCacheKey'];
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
}>;

const states = new WeakMap<Material, SurfaceDepthBiasState>();
const logDepthFragmentChunk = '#include <logdepthbuf_fragment>';

const replaceExactlyOnce = (source: string, replacement: string): string => {
  const first = source.indexOf(logDepthFragmentChunk);
  if (first < 0 || first !== source.lastIndexOf(logDepthFragmentChunk)) {
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

/** Keep GLTF lines at geometric depth and separate only coplanar opaque triangles. */
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
  material.polygonOffsetFactor = backend === 'webgpu' ? -slopeScale : slopeScale;
  material.polygonOffsetUnits = backend === 'webgpu' ? -constantDepthSteps : constantDepthSteps;

  if (backend === 'webgl') {
    material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms, renderer): void => {
      state.onBeforeCompile.call(material, shader, renderer);
      shader.fragmentShader = replaceExactlyOnce(
        shader.fragmentShader,
        `#include <logdepthbuf_fragment>
        #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
          if (vIsPerspective == 1.0) {
            float tauSurfaceDepthSlope = max(abs(dFdx(gl_FragDepth)), abs(dFdy(gl_FragDepth)));
            float tauSurfaceDepthOffset = min(${webGlDepthClamp.toPrecision(8)}, tauSurfaceDepthSlope * ${slopeScale.toPrecision(8)} + ${webGlDepthStep.toPrecision(8)});
            gl_FragDepth = min(1.0, gl_FragDepth + tauSurfaceDepthOffset);
          }
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
