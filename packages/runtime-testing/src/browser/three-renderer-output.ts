import { RenderTarget, Vector2, Vector4 } from 'three';
import type { WebGLRenderer } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
type RendererInstance = WebGLRenderer | WebGPURenderer;

/** Software qualification redirects final output; hardware qualification uses the presented canvas. @public */
export type RendererOutputProfile = 'hardware' | 'software';

/** Completed renderer pixels to present in a detached screenshot canvas. @public */
export type RendererOutputCanvasInput = Readonly<{
  renderer: RendererInstance;
  /**
   * Direct capture results retain their original dimensions and reject snapshots after a resize.
   * For copied or externally supplied arrays, the caller supplies packed rows matching the current drawing buffer.
   */
  pixels: Uint8ClampedArray;
}>;

const isWebGpuRenderer = (renderer: RendererInstance): renderer is WebGPURenderer =>
  'isWebGPURenderer' in renderer && renderer.isWebGPURenderer;

type RendererOutput = {
  capture: () => Promise<Uint8ClampedArray>;
  restore: () => void;
  pending?: Promise<Uint8ClampedArray>;
  retired: boolean;
};

const outputs = new WeakMap<RendererInstance, RendererOutput>();
const captureDimensions = new WeakMap<Uint8ClampedArray, Readonly<{ width: number; height: number }>>();

/**
 * Build a detached 2D snapshot matching the renderer's drawing buffer and viewport on the page.
 * The caller appends the canvas for screenshot presentation and removes it afterward.
 * @param input - Renderer bounds and completed final-frame pixels.
 * @returns A detached snapshot canvas with the same page bounds as the renderer canvas.
 * @public
 */
export const createRendererOutputCanvas = ({ renderer, pixels }: RendererOutputCanvasInput): HTMLCanvasElement => {
  const copy = document.createElement('canvas');
  copy.width = renderer.domElement.width;
  copy.height = renderer.domElement.height;
  const captured = captureDimensions.get(pixels);
  if (captured && (captured.width !== copy.width || captured.height !== copy.height)) {
    throw new RangeError('Renderer resized after capture. Capture a new final frame before creating its snapshot.');
  }
  if (pixels.length !== copy.width * copy.height * 4) {
    throw new RangeError('Renderer capture dimensions no longer match its drawing buffer');
  }
  const context = copy.getContext('2d');
  if (!context) {
    throw new Error('A 2D context is required for renderer capture');
  }
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), copy.width, copy.height), 0, 0);
  const bounds = renderer.domElement.getBoundingClientRect();
  Object.assign(copy.style, {
    position: 'fixed',
    left: `${bounds.left}px`,
    top: `${bounds.top}px`,
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    pointerEvents: 'none',
  });
  return copy;
};

/**
 * Install software output before the first submission; hardware keeps its presented canvas.
 * @param renderer - The initialized fixture renderer.
 * @param profile - Explicit profile supplied by the browser configuration.
 * @public
 */
export const installRendererOutput = (renderer: RendererInstance, profile: RendererOutputProfile): void => {
  if (outputs.has(renderer)) {
    throw new Error('Renderer output is already installed');
  }
  const copy = document.createElement('canvas');
  const context = copy.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('A 2D context is required for renderer capture');
  }
  const output: RendererOutput = {
    retired: false,
    capture: async () => {
      copy.width = renderer.domElement.width;
      copy.height = renderer.domElement.height;
      context.drawImage(renderer.domElement, 0, 0);
      const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
      captureDimensions.set(pixels, { width: copy.width, height: copy.height });
      return pixels;
    },
    restore: () => undefined,
  };
  if (isWebGpuRenderer(renderer)) {
    if (!('isWebGPUBackend' in renderer.backend && renderer.backend.isWebGPUBackend)) {
      throw new Error('WebGPU qualification requires the native WebGPU backend');
    }
    if (profile === 'software') {
      const size = renderer.getDrawingBufferSize(new Vector2());
      // This is the final encoded output. Three retains its own linear multisampled frame target.
      const target = new RenderTarget(size.x, size.y, { depthBuffer: renderer.depth, stencilBuffer: renderer.stencil });
      const previousOutput = renderer.getOutputRenderTarget();
      const previousTarget = renderer.getRenderTarget();
      const { render } = renderer;
      const setViewport = renderer.setViewport.bind(renderer);
      const originalSetViewport = renderer.setViewport;
      const setScissor = renderer.setScissor.bind(renderer);
      const originalSetScissor = renderer.setScissor;
      const { setScissorTest } = renderer;
      const sync = (): void => {
        renderer.getDrawingBufferSize(size);
        target.setSize(size.x, size.y);
        renderer.getViewport(target.viewport).multiplyScalar(renderer.getPixelRatio()).floor();
        renderer.getScissor(target.scissor).multiplyScalar(renderer.getPixelRatio()).floor();
        target.scissorTest = renderer.getScissorTest();
      };
      renderer.setViewport = (...args: [Vector4] | [number, number, number, number, number?, number?]): void => {
        const [x, y, width, height, minDepth = 0, maxDepth = 1] = args;
        if (x instanceof Vector4) {
          setViewport(x);
        } else {
          setViewport(x, y!, width!, height!, minDepth, maxDepth);
        }
        sync();
        Object.assign(target.viewport, { minDepth, maxDepth });
      };
      renderer.setScissor = (...args: [Vector4] | [number, number, number, number]): void => {
        const [x, y, width, height] = args;
        if (x instanceof Vector4) {
          setScissor(x);
        } else {
          setScissor(x, y!, width!, height!);
        }
        sync();
      };
      renderer.setScissorTest = (enabled: boolean): void => {
        setScissorTest.call(renderer, enabled);
        sync();
      };
      renderer.render = (...args): void => {
        sync();
        render.apply(renderer, args);
      };
      sync();
      renderer.setOutputRenderTarget(target);
      output.capture = async () => {
        // Called at the final frame priority: the copy is submitted before another frame can overwrite it.
        const { width, height } = target;
        const data = await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height);
        const rowBytes = width * 4;
        // Three's WebGPU readback retains the GPU copy's 256-byte row padding; Canvas2D needs packed rows.
        const stride = data.length === rowBytes * height ? rowBytes : Math.ceil(rowBytes / 256) * 256;
        if (data.length !== (height - 1) * stride + rowBytes) {
          throw new RangeError('GPU readback dimensions do not match the output target');
        }
        const pixels = new Uint8ClampedArray(rowBytes * height);
        for (let index = 0; index < pixels.length; index += 4) {
          const source = Math.floor(index / rowBytes) * stride + (index % rowBytes);
          const alpha = data[source + 3]!;
          // Canvas2D getImageData returns straight alpha; the renderer's output is premultiplied.
          for (let channel = 0; channel < 3; channel++) {
            pixels[index + channel] = alpha === 0 ? 0 : (data[source + channel]! * 255) / alpha;
          }
          pixels[index + 3] = alpha;
        }
        captureDimensions.set(pixels, { width, height });
        return pixels;
      };
      output.restore = () => {
        renderer.render = render;
        renderer.setViewport = originalSetViewport;
        renderer.setScissor = originalSetScissor;
        renderer.setScissorTest = setScissorTest;
        renderer.setOutputRenderTarget(previousOutput);
        renderer.setRenderTarget(previousTarget);
        target.dispose();
      };
    }
  }
  outputs.set(renderer, output);
};

/**
 * Capture final output, coalescing overlapping requests into the current completed readback.
 * @param renderer - The fixture renderer with installed output.
 * @returns Completed final-frame pixels in Canvas2D orientation and encoding.
 * @public
 */
export const captureRendererOutput = async (renderer: RendererInstance): Promise<Uint8ClampedArray> => {
  const output = outputs.get(renderer);
  if (!output || output.retired) {
    throw new Error('Renderer output is not active');
  }
  if (output.pending) {
    return output.pending;
  }
  output.pending = output.capture();
  try {
    return await output.pending;
  } finally {
    output.pending = undefined;
  }
};

/**
 * Stop requests and settle GPU readback before React or a fixture disposes its renderer.
 * @param renderer - The renderer whose output is being retired.
 * @public
 */
export const disposeRendererOutput = async (renderer: RendererInstance): Promise<void> => {
  const output = outputs.get(renderer);
  if (!output) {
    return;
  }
  output.retired = true;
  try {
    await output.pending;
  } finally {
    output.restore();
    outputs.delete(renderer);
  }
};
