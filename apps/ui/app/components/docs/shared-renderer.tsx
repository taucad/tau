import { createContext, useContext, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { WebGLRenderer } from 'three';
import type { Scene as ThreeScene, PerspectiveCamera as ThreePerspectiveCamera } from 'three';

/**
 * A singleton Three.js renderer that uses a single OffscreenCanvas and WebGL context.
 * Multiple views share this renderer to avoid exhausting the browser's WebGL context limit.
 *
 * Each view calls `render()` with its own scene, camera, and target canvas.
 * The renderer draws to the OffscreenCanvas, then transfers the result to the
 * target canvas via ImageBitmapRenderingContext (zero-copy).
 */
export class SharedRenderer {
  private readonly offscreen: OffscreenCanvas;
  private readonly renderer: WebGLRenderer;

  public constructor() {
    this.offscreen = new OffscreenCanvas(1, 1);
    this.renderer = new WebGLRenderer({
      canvas: this.offscreen as unknown as HTMLCanvasElement,
      antialias: true,
      alpha: true,
    });
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, 2));
  }

  /**
   * Render a scene/camera pair and transfer the result to the target canvas.
   */
  public render(scene: ThreeScene, camera: ThreePerspectiveCamera, targetCanvas: HTMLCanvasElement): void {
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
  }

  public dispose(): void {
    this.renderer.dispose();
  }
}

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
