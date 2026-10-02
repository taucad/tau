import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { PerspectiveCamera as ThreePerspectiveCamera, Scene as ThreeScene } from 'three';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { offscreenWebGpuCanvasContextAvailable } from '#components/geometry/graphics/graphics-backend.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';
import type { ViewportCadGl } from '#components/geometry/graphics/three/viewport-cad-renderer.js';

/* oxlint-disable promise/prefer-await-to-then -- render queue intentionally chains async WebGPU frames */

/**
 * A singleton Three.js renderer that uses a single OffscreenCanvas.
 * Multiple views share this renderer to avoid exhausting the browser's context limit.
 *
 * Prefers OffscreenCanvas WebGPU when `getContext('webgpu')` is available (Chromium);
 * otherwise uses WebGL. Each view calls `render()` with its own scene, camera, and
 * target canvas — frames are serialised on an internal chain so async WebGPU init/render
 * cannot overlap.
 *
 * The renderer draws to the OffscreenCanvas, then transfers the result to the
 * target canvas via ImageBitmapRenderingContext (zero-copy).
 */
export class SharedRenderer {
  private readonly offscreen: OffscreenCanvas;
  private renderer!: ViewportCadGl;
  private readonly initPromise: Promise<void>;
  private renderChain: Promise<void> = Promise.resolve();

  public constructor() {
    this.offscreen = new OffscreenCanvas(1, 1);
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- OffscreenCanvas is supported at runtime
    const canvas = this.offscreen as unknown as HTMLCanvasElement;

    const backend: ResolvedGraphicsBackend = offscreenWebGpuCanvasContextAvailable() ? 'webgpu' : 'webgl';
    this.initPromise = createRenderer('offscreen', backend, canvas).then((renderer) => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- runtime union narrowed by bootstrap
      this.renderer = renderer as ViewportCadGl;
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
    });
  }

  /**
   * Render a scene/camera pair and transfer the result to the target canvas.
   */
  public render(scene: ThreeScene, camera: ThreePerspectiveCamera, targetCanvas: HTMLCanvasElement): void {
    this.renderChain = this.renderChain
      .then(async () => {
        await this.initPromise;
      })
      .then(async () => {
        const width = targetCanvas.clientWidth;
        const height = targetCanvas.clientHeight;

        if (width === 0 || height === 0) {
          return;
        }

        const dpr = Math.min(globalThis.devicePixelRatio, 2);
        const renderWidth = Math.floor(width * dpr);
        const renderHeight = Math.floor(height * dpr);

        if (this.offscreen.width !== renderWidth || this.offscreen.height !== renderHeight) {
          this.offscreen.width = renderWidth;
          this.offscreen.height = renderHeight;
          this.renderer.setSize(renderWidth, renderHeight, false);
        }

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        this.renderer.render(scene, camera);

        const bitmap = this.offscreen.transferToImageBitmap();
        const bitmapContext = targetCanvas.getContext('bitmaprenderer');
        if (bitmapContext) {
          targetCanvas.width = renderWidth;
          targetCanvas.height = renderHeight;
          bitmapContext.transferFromImageBitmap(bitmap);
        } else {
          bitmap.close();
        }
      })
      .catch(() => {
        // Docs previews are best-effort; avoid rejecting the whole chain on a single frame failure.
      });
  }

  public dispose(): void {
    // async-iife: bootstrap — dispose after the queued render completes; callers do not await.
    void this.renderChain.finally(() => {
      this.renderer.dispose();
    });
  }
}
/* oxlint-enable promise/prefer-await-to-then -- end SharedRenderer promise-chain scope */

const SharedRendererContext = createContext<SharedRenderer | undefined>(undefined);

type SharedRendererProviderProps = {
  readonly children: ReactNode;
};

export function SharedRendererProvider({ children }: SharedRendererProviderProps): React.JSX.Element {
  const rendererRef = useRef<SharedRenderer | undefined>(undefined);

  rendererRef.current ??= new SharedRenderer();

  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = undefined;
    },
    [],
  );

  return <SharedRendererContext.Provider value={rendererRef.current}>{children}</SharedRendererContext.Provider>;
}

export function useSharedRenderer(): SharedRenderer {
  const renderer = useContext(SharedRendererContext);
  if (!renderer) {
    throw new Error('useSharedRenderer must be used within a SharedRendererProvider');
  }

  return renderer;
}
