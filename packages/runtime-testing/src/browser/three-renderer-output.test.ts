// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { Camera, Scene, Vector4 } from 'three';
import type { WebGLRenderer } from 'three';
import { WebGPURenderer } from 'three/webgpu';
import {
  captureRendererOutput,
  createRendererOutputCanvas,
  disposeRendererOutput,
  installRendererOutput,
} from '#browser/three-renderer-output.js';

const renderers: Array<WebGPURenderer | WebGLRenderer> = [];
const createFixture = (): WebGPURenderer => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(mock<CanvasRenderingContext2D>());
  const renderer = new WebGPURenderer({ canvas: document.createElement('canvas'), antialias: true });
  renderer.setPixelRatio(2);
  renderer.setSize(100, 80);
  renderer.render = vi.fn();
  // These CPU fixtures never initialize a GPU; Three's dispose otherwise initializes its animation loop.
  renderer.setAnimationLoop = vi.fn(async () => undefined);
  renderers.push(renderer);
  return renderer;
};

afterEach(async () => {
  for (const renderer of renderers.splice(0)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Drain each fixture before retiring its renderer.
    await disposeRendererOutput(renderer);
    renderer.dispose();
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fixture renderer output', () => {
  it.each(['install', 'snapshot'] as const)(
    'should reject %s when a 2D capture context is unavailable',
    (operation) => {
      const renderer = createFixture();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
      const attempt = (): void => {
        if (operation === 'install') {
          installRendererOutput(renderer, 'software');
        } else {
          createRendererOutputCanvas({ renderer, pixels: new Uint8ClampedArray(200 * 160 * 4) });
        }
      };
      expect(attempt).toThrow('A 2D context is required for renderer capture');
      expect(attempt).toThrow(Error);
      expect(renderer.getOutputRenderTarget()).toBeNull();
    },
  );

  it('should reject duplicate installation without replacing the active output target', () => {
    const renderer = createFixture();
    installRendererOutput(renderer, 'software');
    const target = renderer.getOutputRenderTarget();
    expect(() => {
      installRendererOutput(renderer, 'software');
    }).toThrow('Renderer output is already installed');
    expect(() => {
      installRendererOutput(renderer, 'software');
    }).toThrow(Error);
    expect(renderer.getOutputRenderTarget()).toBe(target);
  });

  it.each(['webgl', 'webgpu'] as const)(
    'should capture the presented %s canvas with straight alpha and current bounds',
    async (backend) => {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 2;
      let renderer: WebGLRenderer | WebGPURenderer;
      if (backend === 'webgpu') {
        renderer = createFixture();
        renderer.setPixelRatio(1);
        renderer.setSize(2, 2);
      } else {
        renderer = mock<WebGLRenderer>();
        renderer.domElement = canvas;
        renderers.push(renderer);
      }
      const pixels = new Uint8ClampedArray([13, 25, 37, 128, 11, 22, 33, 255, 7, 8, 9, 0, 1, 2, 3, 255]);
      vi.stubGlobal(
        'ImageData',
        vi.fn(function (data: Uint8ClampedArray, width: number, height: number) {
          return { data, width, height };
        }),
      );
      const context = mock<CanvasRenderingContext2D>({
        getImageData: vi.fn(() => new ImageData(pixels, 2, 2)),
      });
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
      installRendererOutput(renderer, 'hardware');
      const captured = await captureRendererOutput(renderer);
      expect(captured).toEqual(pixels);
      expect(context.drawImage).toHaveBeenCalledWith(renderer.domElement, 0, 0);
      expect(context.getImageData).toHaveBeenCalledWith(0, 0, 2, 2);
      const snapshot = createRendererOutputCanvas({ renderer, pixels: captured });
      expect([snapshot.width, snapshot.height]).toEqual([2, 2]);
      expect(context.putImageData).toHaveBeenCalledWith(expect.objectContaining({ data: pixels }), 0, 0);
    },
  );

  it('should present the completed pixels at the renderer canvas page bounds and reject stale dimensions', () => {
    const renderer = createFixture();
    const context = mock<CanvasRenderingContext2D>();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    vi.spyOn(renderer.domElement, 'getBoundingClientRect').mockReturnValue(new DOMRect(12, 17, 100, 80));
    vi.stubGlobal(
      'ImageData',
      vi.fn(function (data: Uint8ClampedArray, width: number, height: number) {
        return { data, width, height };
      }),
    );
    const pixels = new Uint8ClampedArray(200 * 160 * 4);
    pixels.set([13, 25, 37, 128]);
    const canvas = createRendererOutputCanvas({ renderer, pixels });
    expect([canvas.width, canvas.height]).toEqual([200, 160]);
    expect([canvas.style.left, canvas.style.top, canvas.style.width, canvas.style.height]).toEqual([
      '12px',
      '17px',
      '100px',
      '80px',
    ]);
    expect(canvas.isConnected).toBe(false);
    expect(context.putImageData).toHaveBeenCalledWith(
      expect.objectContaining({ data: pixels, width: 200, height: 160 }),
      0,
      0,
    );
    renderer.setSize(110, 80);
    expect(() => createRendererOutputCanvas({ renderer, pixels })).toThrow('dimensions no longer match');
    expect(() => createRendererOutputCanvas({ renderer, pixels })).toThrow(RangeError);
  });
  it('should preserve viewport and scissor in drawing-buffer pixels through subviewport renders and resize', () => {
    const renderer = createFixture();
    installRendererOutput(renderer, 'software');
    const target = renderer.getOutputRenderTarget()!;
    expect([target.width, target.height]).toEqual([200, 160]);
    renderer.setViewport(4, 5, 30, 20, 0.2, 0.9);
    renderer.setScissor(new Vector4(6, 7, 25, 15));
    renderer.setScissorTest(true);
    renderer.render(new Scene(), new Camera());
    expect(target.viewport.toArray()).toEqual([8, 10, 60, 40]);
    expect(target.scissor.toArray()).toEqual([12, 14, 50, 30]);
    expect(Reflect.get(target.viewport, 'minDepth')).toBe(0.2);
    expect(Reflect.get(target.viewport, 'maxDepth')).toBe(0.9);
    expect(target.scissorTest).toBe(true);
    renderer.setViewport(new Vector4(4, 5, 30, 20));
    renderer.setScissor(6, 7, 25, 15);
    expect(target.viewport.toArray()).toEqual([8, 10, 60, 40]);
    expect(target.scissor.toArray()).toEqual([12, 14, 50, 30]);
    expect(Reflect.get(target.viewport, 'minDepth')).toBe(0);
    expect(Reflect.get(target.viewport, 'maxDepth')).toBe(1);
    renderer.setSize(140, 90);
    renderer.render(new Scene(), new Camera());
    expect([target.width, target.height]).toEqual([280, 180]);
    expect(target.viewport.toArray()).toEqual([0, 0, 280, 180]);
  });

  it('should coalesce captures and drain pending readback before restoring output', async () => {
    const renderer = createFixture();
    renderer.setPixelRatio(1);
    renderer.setSize(2, 1);
    const completed = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    renderer.readRenderTargetPixelsAsync = vi.fn(async () => completed.promise);
    const originalRender = renderer.render;
    installRendererOutput(renderer, 'software');
    const first = captureRendererOutput(renderer);
    const second = captureRendererOutput(renderer);
    const drained = disposeRendererOutput(renderer);
    expect(renderer.readRenderTargetPixelsAsync).toHaveBeenCalledOnce();
    expect(renderer.getOutputRenderTarget()).not.toBeNull();
    completed.resolve(new Uint8Array([40, 20, 10, 128, 8, 9, 10, 255]));
    expect(await first).toEqual(new Uint8ClampedArray([80, 40, 20, 128, 8, 9, 10, 255]));
    expect(await second).toEqual(await first);
    await drained;
    expect(renderer.getOutputRenderTarget()).toBeNull();
    expect(renderer.getRenderTarget()).toBeNull();
    expect(renderer.render).toBe(originalRender);
    await expect(captureRendererOutput(renderer)).rejects.toThrow('Renderer output is not active');
    await expect(captureRendererOutput(renderer)).rejects.toBeInstanceOf(Error);
  });

  it('should pack padded WebGPU rows without moving pixels or retaining padding', async () => {
    const renderer = createFixture();
    renderer.setPixelRatio(1);
    renderer.setSize(3, 2);
    const padded = new Uint8Array(256 + 12);
    padded.set([11, 22, 33, 255, 44, 55, 66, 255, 77, 88, 99, 255]);
    padded.fill(200, 12, 256);
    padded.set([12, 24, 36, 255, 48, 60, 72, 255, 84, 96, 108, 255], 256);
    renderer.readRenderTargetPixelsAsync = vi.fn(async () => padded);
    installRendererOutput(renderer, 'software');
    expect(await captureRendererOutput(renderer)).toEqual(
      new Uint8ClampedArray([
        11, 22, 33, 255, 44, 55, 66, 255, 77, 88, 99, 255, 12, 24, 36, 255, 48, 60, 72, 255, 84, 96, 108, 255,
      ]),
    );
  });

  it.each([
    [2, 3],
    [3, 3],
  ] as const)('should reject a captured snapshot after a resize to %i×%i', async (width, height) => {
    const renderer = createFixture();
    renderer.setPixelRatio(1);
    renderer.setSize(3, 2);
    renderer.readRenderTargetPixelsAsync = vi.fn(async () => new Uint8Array(256 + 12));
    installRendererOutput(renderer, 'software');
    const pixels = await captureRendererOutput(renderer);
    renderer.setSize(width, height);
    if (width === 2) {
      expect(pixels.length).toBe(renderer.domElement.width * renderer.domElement.height * 4);
    }
    expect(() => createRendererOutputCanvas({ renderer, pixels })).toThrow(RangeError);
    expect(() => createRendererOutputCanvas({ renderer, pixels })).toThrow('Capture a new final frame');
  });

  it('should reject malformed GPU copy dimensions instead of returning incomplete pixels', async () => {
    const renderer = createFixture();
    renderer.setPixelRatio(1);
    renderer.setSize(2, 2);
    renderer.readRenderTargetPixelsAsync = vi.fn(async () => new Uint8Array(4));
    installRendererOutput(renderer, 'software');
    const capture = captureRendererOutput(renderer);
    await expect(capture).rejects.toThrow('GPU readback dimensions do not match the output target');
    await expect(capture).rejects.toBeInstanceOf(RangeError);
  });

  it('should propagate failed readback and restore output during retirement', async () => {
    const renderer = createFixture();
    const completed = Promise.withResolvers<Uint8Array<ArrayBuffer>>();
    renderer.readRenderTargetPixelsAsync = vi.fn(async () => completed.promise);
    installRendererOutput(renderer, 'software');
    const capture = captureRendererOutput(renderer);
    const drained = disposeRendererOutput(renderer);
    const captureAssertion = expect(capture).rejects.toThrow('GPU copy failed');
    const drainAssertion = expect(drained).rejects.toBeInstanceOf(TypeError);
    completed.reject(new TypeError('GPU copy failed'));
    await Promise.all([captureAssertion, drainAssertion]);
    expect(renderer.getOutputRenderTarget()).toBeNull();
    expect(renderer.getRenderTarget()).toBeNull();
  });

  it('should retain hardware canvas output and reject fallback qualification', async () => {
    const renderer = createFixture();
    const originalRender = renderer.render;
    installRendererOutput(renderer, 'hardware');
    expect(renderer.getOutputRenderTarget()).toBeNull();
    expect(renderer.render).toBe(originalRender);
    await disposeRendererOutput(renderer);
    Reflect.set(renderer.backend, 'isWebGPUBackend', false);
    expect(() => {
      installRendererOutput(renderer, 'software');
    }).toThrow('native WebGPU backend');
    expect(() => {
      installRendererOutput(renderer, 'software');
    }).toThrow(Error);
  });
});
