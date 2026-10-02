import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ThreeModule from 'three';
/* eslint-disable @typescript-eslint/naming-convention -- stub class + module-export property names mirror three.js's WebGPURenderer/WebGLRenderer spellings */

/**
 * Stubs `three` and `three/webgpu` so the renderer factory can be exercised in jsdom (no
 * GPU device). Each constructed renderer is recorded into `hoisted.createdRenderers` so
 * tests can assert which `setTransparentSort` calls fired and on which backend.
 *
 * Mirrors the WebGPU mocking style in `apps/ui/app/components/geometry/graphics/three/post-processing-webgpu.test.tsx`.
 */
const hoisted = vi.hoisted(() => {
  type RecordedRenderer = {
    readonly setTransparentSort: ReturnType<typeof vi.fn>;
    readonly setOpaqueSort: ReturnType<typeof vi.fn>;
    readonly init: ReturnType<typeof vi.fn>;
    readonly options: unknown;
    readonly kind: 'webgl' | 'webgpu';
  };

  return {
    createdRenderers: [] as RecordedRenderer[],
  };
});

vi.mock('three/webgpu', () => {
  class WebGPURendererStub {
    public readonly setTransparentSort = vi.fn();
    public readonly setOpaqueSort = vi.fn();
    public readonly init = vi.fn(async () => {
      // Jsdom has no GPU adapter; the real `init` is irrelevant for this factory test.
    });
    // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
    public readonly options: unknown;

    public constructor(options: unknown) {
      this.options = options;
      hoisted.createdRenderers.push({
        setTransparentSort: this.setTransparentSort,
        setOpaqueSort: this.setOpaqueSort,
        init: this.init,
        options,
        kind: 'webgpu',
      });
    }
  }

  return { WebGPURenderer: WebGPURendererStub };
});

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof ThreeModule>();

  class WebGLRendererStub {
    public readonly setTransparentSort = vi.fn();
    public readonly setOpaqueSort = vi.fn();
    public readonly domElement: HTMLCanvasElement;
    // oxlint-disable-next-line @typescript-eslint/parameter-properties -- `erasableSyntaxOnly` forbids constructor parameter properties in Vitest specs
    public readonly parameters: { canvas: HTMLCanvasElement };

    public constructor(parameters: { canvas: HTMLCanvasElement }) {
      this.parameters = parameters;
      this.domElement = parameters.canvas;
      hoisted.createdRenderers.push({
        setTransparentSort: this.setTransparentSort,
        setOpaqueSort: this.setOpaqueSort,
        init: vi.fn(),
        options: parameters,
        kind: 'webgl',
      });
    }
  }

  return {
    ...actual,
    WebGLRenderer: WebGLRendererStub,
  };
});
/* eslint-enable @typescript-eslint/naming-convention -- end three.js-mirror naming window */

describe('createRenderer', () => {
  beforeEach(() => {
    hoisted.createdRenderers.length = 0;
  });

  describe('reversed-Z transparent sort wiring', () => {
    it('should register reversedDepthTransparentSort on the WebGPU viewport renderer', async () => {
      const { createRenderer } = await import('#components/geometry/graphics/three/renderer.js');
      const { reversedDepthTransparentSort } =
        await import('#components/geometry/graphics/three/reversed-depth-transparent-sort.js');

      const canvas = document.createElement('canvas');
      await createRenderer('viewport', 'webgpu', canvas);

      expect(hoisted.createdRenderers).toHaveLength(1);
      const created = hoisted.createdRenderers.at(0);
      expect(created).toBeDefined();
      expect(created?.kind).toBe('webgpu');
      expect(created?.setTransparentSort).toHaveBeenCalledTimes(1);
      expect(created?.setTransparentSort).toHaveBeenCalledWith(reversedDepthTransparentSort);
      expect(created?.setOpaqueSort).not.toHaveBeenCalled();
    });

    it('should NOT register a custom transparent sort on the WebGPU offscreen renderer (no reversed-Z)', async () => {
      const { createRenderer } = await import('#components/geometry/graphics/three/renderer.js');

      const canvas = document.createElement('canvas');
      await createRenderer('offscreen', 'webgpu', canvas);

      expect(hoisted.createdRenderers).toHaveLength(1);
      const created = hoisted.createdRenderers.at(0);
      expect(created?.kind).toBe('webgpu');
      expect(created?.setTransparentSort).not.toHaveBeenCalled();
    });

    it('should NOT register a custom transparent sort on the WebGPU screenshot renderer (no reversed-Z)', async () => {
      const { createRenderer } = await import('#components/geometry/graphics/three/renderer.js');

      const canvas = document.createElement('canvas');
      await createRenderer('screenshot', 'webgpu', canvas);

      expect(hoisted.createdRenderers).toHaveLength(1);
      const created = hoisted.createdRenderers.at(0);
      expect(created?.kind).toBe('webgpu');
      expect(created?.setTransparentSort).not.toHaveBeenCalled();
    });

    it.each(['viewport', 'offscreen', 'screenshot'] as const)(
      'should NOT register a custom transparent sort on the WebGL %s renderer',
      async (useCase) => {
        const { createRenderer } = await import('#components/geometry/graphics/three/renderer.js');

        const canvas = document.createElement('canvas');
        await createRenderer(useCase, 'webgl', canvas);

        expect(hoisted.createdRenderers).toHaveLength(1);
        const created = hoisted.createdRenderers.at(0);
        expect(created?.kind).toBe('webgl');
        expect(created?.setTransparentSort).not.toHaveBeenCalled();
      },
    );
  });
});
