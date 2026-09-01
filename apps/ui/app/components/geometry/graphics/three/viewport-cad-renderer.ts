import type { WebGLRenderer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';

/** Main-thread viewport renderer used by `@react-three/fiber` (<Canvas />) in Tau. */
export type ViewportCadGl = WebGLRenderer | WebGPURenderer;

export function isViewportWebGpu(gl: ViewportCadGl): gl is WebGPURenderer {
  return 'isWebGPURenderer' in gl && Boolean(gl.isWebGPURenderer);
}
