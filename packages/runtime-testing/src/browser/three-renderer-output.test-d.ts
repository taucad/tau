import { describe, expectTypeOf, it } from 'vitest';
import { WebGLRenderer } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import {
  captureRendererOutput,
  createRendererOutputCanvas,
  disposeRendererOutput,
  installRendererOutput,
} from '@taucad/runtime-testing/browser/three-renderer-output';

describe('browser renderer output consumer surface', () => {
  it('should accept native Three renderers and expose awaitable final pixels and retirement', async () => {
    const renderer = new WebGPURenderer();
    await renderer.init();
    installRendererOutput(renderer, 'software');
    const pixels = await captureRendererOutput(renderer);
    expectTypeOf(pixels).toEqualTypeOf<Uint8ClampedArray>();
    const canvas = createRendererOutputCanvas({ renderer, pixels });
    expectTypeOf(canvas).toEqualTypeOf<HTMLCanvasElement>();
    await disposeRendererOutput(renderer);
    renderer.dispose();
  });

  it('should accept a presented WebGL renderer without profile inference', async () => {
    const renderer = new WebGLRenderer();
    installRendererOutput(renderer, 'hardware');
    await captureRendererOutput(renderer);
    await disposeRendererOutput(renderer);
    renderer.dispose();
  });

  it('should reject unsupported profiles and incomplete screenshot input', () => {
    const renderer = new WebGPURenderer();
    // @ts-expect-error - The caller must explicitly choose the supported hardware or software profile.
    installRendererOutput(renderer, 'automatic');
    // @ts-expect-error - A software output profile must not be inferred from the browser or adapter.
    installRendererOutput(renderer);
    // @ts-expect-error - A snapshot must use completed pixels from the chosen final frame.
    createRendererOutputCanvas({ renderer });
  });
});
