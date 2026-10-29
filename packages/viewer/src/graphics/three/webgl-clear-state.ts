import { REVISION } from 'three';
import { WebGLBackend } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';

// Installed r184 methods omitted by @types/three; source fingerprints and real pixels guard this seam.
type ClearBackend = WebGLBackend & {
  state: { setColorMask: (enabled: boolean) => void };
  clear: (color: boolean, depth: boolean, stencil: boolean, ...options: unknown[]) => void;
};

/**
 * Let an r184 node WebGL2 color clear overwrite a preceding color-disabled stencil draw.
 * Native WebGPU clears ignore draw write masks. Remove when upstream restores this mask itself.
 * No readback, extra draw or attachment; retain Three's cached state for the next material.
 * @param renderer - Initialized renderer before its first render.
 * @internal
 */
export function installWebGlClearState(renderer: WebGPURenderer): void {
  if (!(renderer.backend instanceof WebGLBackend)) {
    return;
  }
  if (REVISION !== '184') {
    throw new Error('Requalify the WebGL color-clear state adaptation for this Three revision');
  }
  const backend = renderer.backend as ClearBackend;
  const clear = backend.clear.bind(backend);
  backend.clear = (color, depth, stencil, ...options) => {
    if (color) {
      backend.state.setColorMask(true);
    }
    clear(color, depth, stencil, ...options);
  };
}
