import { DepthStencilFormat, REVISION } from 'three';
import type { Texture } from 'three';
import { WebGPUBackend } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';

// Narrow installed-r184 seam: @types/three omits backend allocation/cache methods.
type TextureBackend = WebGPUBackend & {
  createTexture: (texture: Texture, options: unknown) => void;
  get: (texture: Texture) => {
    [key: string]: unknown;
    texture: {
      width: number;
      height: number;
      depthOrArrayLayers: number;
      mipLevelCount: number;
      createView: (descriptor: {
        aspect: 'depth-only';
        dimension: '2d';
        mipLevelCount: number;
        baseMipLevel: number;
      }) => unknown;
    };
  };
};

/**
 * Correct r184's sampled 2D depth/stencil view without narrowing attachment views.
 * Three owns the view cache: destroyTexture deletes it, and reallocation seeds it again.
 * No per-frame work, extra texture allocation, precision change or workspace dependency patch.
 * Remove when Three's binding utility selects depth-only itself. Exact upstream source
 * fingerprints are pinned by webgpu-depth-sampling.test.ts.
 *
 * @internal
 * @param renderer - Initialized renderer, before its first texture allocation.
 */
export function installWebGpuDepthSampling(renderer: WebGPURenderer): void {
  if (!(renderer.backend instanceof WebGPUBackend)) {
    return;
  }
  if (REVISION !== '184') {
    throw new Error('Requalify the depth/stencil sampled-view adaptation for this Three revision');
  }
  const backend = renderer.backend as TextureBackend;
  const createTexture = backend.createTexture.bind(backend);
  backend.createTexture = (texture, options) => {
    createTexture(texture, options);
    if (texture.format !== DepthStencilFormat) {
      return;
    }
    const data = backend.get(texture);
    const allocation = data.texture;
    // Tau's CAD depth targets are 2D; do not claim array/cube support through this seam.
    if (allocation.depthOrArrayLayers !== 1) {
      return;
    }
    const key = `view-${allocation.width}-${allocation.height}-${allocation.mipLevelCount}-0`;
    data[key] = allocation.createView({
      aspect: 'depth-only',
      dimension: '2d',
      mipLevelCount: allocation.mipLevelCount,
      baseMipLevel: 0,
    });
  };
}
