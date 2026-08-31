import { REVISION } from 'three';
import type { Camera, Object3D, Scene } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

type GeneratedShaderSource = Awaited<ReturnType<WebGPURenderer['debug']['getShaderAsync']>>;

export const supportedThreeShaderDebugRevision = '184';

/** Exact-version adapter for Three's intentionally debug-only generated shader API. */
export const getGeneratedShaderSource = async ({
  camera,
  object,
  renderer,
  scene,
}: {
  readonly camera: Camera;
  readonly object: Object3D;
  readonly renderer: {
    readonly debug: Pick<WebGPURenderer['debug'], 'getShaderAsync'>;
  };
  readonly scene: Scene;
}): Promise<GeneratedShaderSource> => {
  if (REVISION !== supportedThreeShaderDebugRevision) {
    throw new Error(`Three shader debug adapter requires r${supportedThreeShaderDebugRevision}; found r${REVISION}`);
  }
  return renderer.debug.getShaderAsync(scene, camera, object);
};
