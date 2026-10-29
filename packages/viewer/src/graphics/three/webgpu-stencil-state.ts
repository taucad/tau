import { REVISION } from 'three';
import type { Texture, Vector4 } from 'three';
import { WebGPUBackend } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';

type StencilContext = { stencil: boolean };
// Installed r184 backend methods omitted by @types/three; guarded by source and pixel tests.
type StencilBackend = WebGPUBackend & {
  beginRender: (context: StencilContext) => void;
  copyFramebufferToTexture: (texture: Texture, context: StencilContext, rectangle: Vector4) => void;
  get: (context: StencilContext) => { currentStencilRef: number; currentPass?: unknown };
};

/**
 * Align r184's cached stencil reference with each new native pass encoder's zero default.
 * Keep the existing per-draw state cache; framebuffer copies can also restart an encoder.
 * Remove when upstream resets this state at both boundaries. No additional GPU resources.
 * @param renderer - Initialized renderer, before its first draw.
 */
export function installWebGpuStencilState(renderer: WebGPURenderer): void {
  if (!(renderer.backend instanceof WebGPUBackend)) {
    return;
  }
  if (REVISION !== '184') {
    throw new Error('Requalify the stencil pass-state adaptation for this Three revision');
  }
  const backend = renderer.backend as StencilBackend;
  const beginRender = backend.beginRender.bind(backend);
  const copyFramebufferToTexture = backend.copyFramebufferToTexture.bind(backend);
  backend.beginRender = (context) => {
    beginRender(context);
    if (context.stencil) {
      backend.get(context).currentStencilRef = 0;
    }
  };
  backend.copyFramebufferToTexture = (texture, context, rectangle) => {
    const previousPass = backend.get(context).currentPass;
    copyFramebufferToTexture(texture, context, rectangle);
    // A format mismatch or out-of-pass copy does not start a new encoder.
    if (context.stencil && backend.get(context).currentPass !== previousPass) {
      backend.get(context).currentStencilRef = 0;
    }
  };
}
