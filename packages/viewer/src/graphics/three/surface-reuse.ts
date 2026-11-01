import { RenderTarget } from 'three/webgpu';
import type { WebGPURenderer } from 'three/webgpu';

type SurfaceReuse = {
  target: RenderTarget;
  prepare: (width: number, height: number) => void;
  render: (compose: () => void, filter: () => void) => void;
};

/**
 * Consume Three r184's one-time depth clear for a freshly sized target.
 * `setSize` re-arms it and `initRenderTarget` leaves it armed, so the first draw with
 * `autoClearDepth` off would erase depth already written into a shared attachment.
 * @param renderer - The renderer that owns the target.
 * @param target - A target sized and initialized since its last draw.
 */
export function primeTargetDepth(renderer: WebGPURenderer, target: RenderTarget): void {
  const destination = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  try {
    renderer.clear(false, true, true);
  } finally {
    renderer.setRenderTarget(destination);
  }
}

/**
 * Create the caller-owned framebuffer view that reuses dead scene color after surface composition.
 * All three targets must belong to one post-processing graph and one renderer.
 * The view takes over the composed target's depth/stencil, so composition is color-only and
 * the filter pass owns the frame's depth. The post owner disposes all three targets together:
 * Three r184 target disposal releases borrowed attachments too, so no sibling may continue drawing.
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
  const depth = composed.depthTexture;
  // Detach first: the setter clears the old texture's owner, which sizes its sample count.
  composed.depthTexture = null;
  target.depthTexture = depth;
  composed.depthBuffer = false;
  composed.stencilBuffer = false;
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
      primeTargetDepth(renderer, target);
      // Commit only after successful initialization; failed allocations can retry.
      preparedWidth = width;
      preparedHeight = height;
    },
    render(compose, filter) {
      const destination = renderer.getRenderTarget();
      try {
        renderer.setRenderTarget(composed);
        compose();
        renderer.setRenderTarget(target);
        filter();
      } finally {
        renderer.setRenderTarget(destination);
      }
    },
  };
}
