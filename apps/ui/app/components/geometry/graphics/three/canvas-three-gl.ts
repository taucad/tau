import type { CanvasProps, Renderer as FiberCompatibleGl } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import type { RendererInstance } from '#components/geometry/graphics/three/renderer.js';
import { createRenderer } from '#components/geometry/graphics/three/renderer.js';

type TauR3fGlDefaults = Parameters<Extract<CanvasProps['gl'], (defaults: never) => unknown>>[0];

/** One factory's renderer ownership, bound to its mounted Canvas DOM node. */
export type TauR3fGlFactory = ((defaults: TauR3fGlDefaults) => Promise<FiberCompatibleGl>) & {
  /** Bind the Canvas ref; StrictMode ref replay keeps a reattached canvas alive. */
  readonly bindCanvas: (canvas: HTMLCanvasElement | undefined) => void;
  /** Whether this factory's mounted canvas has been removed. */
  readonly isRetired: () => boolean;
};

/**
 * R3F `gl` factory / props for {@link ResolvedGraphicsBackend}.
 *
 * Builds renderers via {@link createRenderer} with the **`viewport`** use case (MSAA,
 * WebGL log-depth / WebGPU reversed-Z — see `tau-renderer.ts`).
 *
 * R3F awaits this factory inside a `configure()` call that nothing awaits, so a renderer that cannot be created
 * (no WebGL context, or a context Safari hands back already lost) would surface as an unhandled rejection that no
 * error boundary sees, leaving a blank canvas. The factory instead reports the failure through `onCreateError` and
 * never settles; the owner unmounts the `<Canvas>` and shows its fallback.
 *
 * @param graphicsBackend - Backend the viewport renderer is created for.
 * @param cameras - Retained cameras whose projection convention must follow the new renderer.
 * @param onCreateError - Receives the renderer creation failure so the owner can render its fallback.
 */
/* oxlint-disable unicorn-js/prevent-abbreviations -- name mirrors R3F `<Canvas gl={...}>` ergonomics */
export function createTauR3fGlProp(
  graphicsBackend: ResolvedGraphicsBackend,
  cameras: readonly ThreeCamera[] = [],
  onCreateError?: (error: Error) => void,
): TauR3fGlFactory {
  let initialization: Promise<FiberCompatibleGl> | undefined;
  let ownedRenderer: RendererInstance | undefined;
  let mountedCanvas: HTMLCanvasElement | undefined = undefined;
  let hasCanvasBinding = false;
  let retired = false;
  let disposed = false;
  const pending = async (): Promise<never> =>
    new Promise<never>(() => {
      // Never settles while R3F waits for a retired or failed canvas.
      void 0;
    });
  const isRetired = (): boolean => retired || (hasCanvasBinding && mountedCanvas === undefined);
  const retire = (): void => {
    retired = true;
    if (ownedRenderer && !disposed) {
      disposed = true;
      ownedRenderer.dispose();
    }
  };
  const bindCanvas = (canvas: HTMLCanvasElement | undefined): void => {
    hasCanvasBinding = true;
    const previousCanvas = mountedCanvas;
    mountedCanvas = canvas;
    if (canvas === undefined) {
      // Ref cleanup/replay is synchronous; actual DOM removal is known after the commit.
      queueMicrotask(() => {
        if (mountedCanvas === undefined && !previousCanvas?.isConnected) {
          retire();
        }
      });
    }
  };
  const initialize = async (canvas: HTMLCanvasElement): Promise<FiberCompatibleGl> => {
    let renderer: RendererInstance;
    try {
      renderer = await createRenderer('viewport', graphicsBackend, canvas);
    } catch (error) {
      if (isRetired()) {
        return pending();
      }
      const failure = error instanceof Error ? error : new Error(String(error));
      console.warn('[createTauR3fGlProp] Renderer creation failed:', failure);
      onCreateError?.(failure);
      return pending();
    }
    ownedRenderer = renderer;
    if (isRetired()) {
      retire();
      return pending();
    }
    // R3F reapplies DPR on every resize. WebGLRenderer.setPixelRatio also calls
    // setSize, clearing/reallocating the old buffer before R3F sizes the new one.
    const setPixelRatio = renderer.setPixelRatio.bind(renderer);
    renderer.setPixelRatio = (value: number): void => {
      if (!isRetired() && renderer.getPixelRatio() !== value) {
        setPixelRatio(value);
      }
    };
    const reversedDepth = 'reversedDepthBuffer' in renderer && renderer.reversedDepthBuffer;
    for (const camera of cameras) {
      // The rig survives backend remounts. Three r184 only ever enables reversed
      // depth, so restore both conventions before scene warmup or direct rendering.
      camera.coordinateSystem = renderer.coordinateSystem;
      // Three exposes reversedDepth as a getter without a setter.
      Object.assign(camera, { _reversedDepth: reversedDepth });
      camera.updateProjectionMatrix();
    }
    return renderer as FiberCompatibleGl;
  };
  // R3F can reenter configure before this async factory settles. One canvas/backend
  // mount must share the complete setup; a new keyed factory owns a fresh retry.
  const factory = async (defaults: TauR3fGlDefaults): Promise<FiberCompatibleGl> => {
    if (isRetired()) {
      return pending();
    }
    initialization ??= initialize(defaults.canvas as HTMLCanvasElement);
    const renderer = await initialization;
    if (isRetired()) {
      retire();
      return pending();
    }
    return renderer;
  };
  return Object.assign(factory, { bindCanvas, isRetired });
}
/* oxlint-enable unicorn-js/prevent-abbreviations */
