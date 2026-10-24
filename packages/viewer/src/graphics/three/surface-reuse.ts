import { RenderTarget } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';

type SurfaceReuse = {
  target: RenderTarget;
  prepare: (width: number, height: number) => void;
  render: (compose: () => void, filter: () => void) => void;
};

/**
 * Create the caller-owned framebuffer view that reuses dead scene color after surface composition.
 * All three targets must belong to one post-processing graph and one renderer.
 * The post owner disposes all three targets together: Three r184 target
 * disposal releases borrowed attachments too, so no sibling may continue drawing.
 * @param options - The renderer and its existing scene/composed attachments.
 * @returns A single-sample view, paired resize and synchronous composition scope.
 */
export function createSurfaceReuse({
  renderer,
  scene,
  composed,
}: {
  readonly renderer: WebGPURenderer;
  readonly scene: RenderTarget;
  readonly composed: RenderTarget;
}): SurfaceReuse {
  const target = new RenderTarget(1, 1, { samples: 0, stencilBuffer: true });
  target.texture = scene.texture;
  target.depthTexture = composed.depthTexture;
  let preparedWidth = 0;
  let preparedHeight = 0;
  return {
    target,
    prepare(width, height) {
      if (width === preparedWidth && height === preparedHeight) {
        return;
      }
      // Three's setSize disposes attachments in r184. Retire every view before any
      // initialization, and initialize all views before authoritative scene writes.
      scene.setSize(width, height);
      composed.setSize(width, height);
      target.setSize(width, height);
      renderer.initRenderTarget(scene);
      renderer.initRenderTarget(composed);
      renderer.initRenderTarget(target);
      // Commit only after successful initialization; failed allocations can retry.
      preparedWidth = width;
      preparedHeight = height;
    },
    render(compose, filter) {
      const destination = renderer.getRenderTarget();
      const clearDepth = renderer.autoClearDepth;
      const clearStencil = renderer.autoClearStencil;
      try {
        renderer.setRenderTarget(composed);
        compose();
        renderer.setRenderTarget(target);
        renderer.autoClearDepth = false;
        renderer.autoClearStencil = false;
        filter();
      } finally {
        renderer.setRenderTarget(destination);
        renderer.autoClearDepth = clearDepth;
        renderer.autoClearStencil = clearStencil;
      }
    },
  };
}
