import { invalidate } from '@react-three/fiber';
import { claimCanvasRenderer } from '#graphics/three/canvas-renderer-ownership.js';
import type { CanvasProps, Renderer as FiberCompatibleGl } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import type { RendererInstance } from '#graphics/three/renderer.js';
import { createRenderer } from '#graphics/three/renderer.js';

type TauR3fGlDefaults = Parameters<Extract<CanvasProps['gl'], (defaults: never) => unknown>>[0];

/**
 * One factory's renderer ownership, bound to its mounted Canvas DOM node.
 *
 * @public
 */
export type TauR3fGlFactory = ((defaults: TauR3fGlDefaults) => Promise<FiberCompatibleGl>) & {
  /** Bind the Canvas ref; StrictMode ref replay keeps a reattached canvas alive. */
  readonly bindCanvas: (canvas: HTMLCanvasElement | undefined) => void;
  /** Whether this factory's mounted canvas has been removed. */
  readonly isRetired: () => boolean;
};

/* oxlint-disable unicorn-js/prevent-abbreviations -- name mirrors R3F `<Canvas gl={...}>` ergonomics */
/**
 * R3F `gl` factory / props for {@link ResolvedGraphicsBackend}.
 *
 * Builds renderers via {@link createRenderer} with the **`viewport`** use case (MSAA,
 * WebGL log-depth / WebGPU reversed-Z — see `tau-renderer.ts`).
 *
 * R3F owns disposal of factory-created renderers and waits for configuration to settle before teardown.
 * Report creation failures to the viewer and reject so R3F can finish teardown through its error handler.
 * Real DOM removal promptly releases the renderer through its idempotent lease. A renderer that finishes later
 * is released before reaching R3F, without changing retained cameras; R3F still observes its settled factory.
 *
 * @param graphicsBackend - Backend the viewport renderer is created for.
 * @param cameras - Retained cameras whose projection convention must follow the new renderer.
 * @param options - The owner's choices.
 * @param options.onCreateError - Receives the renderer creation failure so the owner can render its fallback.
 * @param options.preserveDrawingBuffer - Keep each WebGL frame readable after it is shown (a live capture).
 * @returns A canvas-bound factory whose renderer is disposed by R3F.
 * @public
 */
export function createTauR3fGlProp(
  graphicsBackend: ResolvedGraphicsBackend,
  cameras: readonly ThreeCamera[] = [],
  {
    onCreateError,
    preserveDrawingBuffer = false,
  }: Readonly<{ onCreateError?: (error: Error) => void; preserveDrawingBuffer?: boolean }> = {},
): TauR3fGlFactory {
  let initialization: Promise<FiberCompatibleGl> | undefined;
  let ownedRenderer: RendererInstance | undefined;
  let releaseStarted = false;
  let retirement: Promise<void> | undefined;
  let mountedCanvas: HTMLCanvasElement | undefined = undefined;
  let hasCanvasBinding = false;
  let retired = false;
  const isRetired = (): boolean => retired || (hasCanvasBinding && mountedCanvas === undefined);
  const retire = (): Promise<void> | undefined => {
    retired = true;
    if (!ownedRenderer || releaseStarted) {
      return retirement;
    }
    releaseStarted = true;
    const renderer = ownedRenderer;
    const loseContext = (): void => {
      // The lease guards the shared canvas and deduplicates R3F's later loss.
      if ('forceContextLoss' in renderer) {
        renderer.forceContextLoss();
      }
    };
    // Release the drawing buffer at real DOM removal, not R3F's deferred cleanup.
    // The lease keeps disposal idempotent and returns any in-flight cleanup to R3F.
    const dispose: () => unknown = renderer.dispose.bind(renderer);
    const result = dispose();
    if (typeof result === 'object' && result !== null && 'then' in result && typeof result.then === 'function') {
      const settleRetirement = async (): Promise<void> => {
        try {
          await Promise.resolve(result);
        } catch (error) {
          console.warn('[createTauR3fGlProp] Renderer disposal failed:', error);
          return;
        }
        loseContext();
      };
      retirement = settleRetirement();
    } else {
      loseContext();
    }
    return retirement;
  };
  const bindCanvas = (canvas: HTMLCanvasElement | undefined): void => {
    hasCanvasBinding = true;
    const previousCanvas = mountedCanvas;
    mountedCanvas = canvas;
    if (canvas === undefined) {
      // Ref cleanup/replay is synchronous; actual DOM removal is known after the commit.
      queueMicrotask(() => {
        if (mountedCanvas === undefined && !previousCanvas?.isConnected) {
          // Retirement is cached by this owner; late initialization awaits its settlement.
          void retire();
        }
      });
    }
  };
  const initialize = async (canvas: HTMLCanvasElement): Promise<FiberCompatibleGl> => {
    const attachOwnership = claimCanvasRenderer(canvas, invalidate);
    let renderer: RendererInstance;
    try {
      renderer = await createRenderer(
        'viewport',
        graphicsBackend,
        preserveDrawingBuffer ? { canvas, preserveDrawingBuffer } : canvas,
      );
    } catch (error) {
      attachOwnership.cancel();
      const failure = error instanceof Error ? error : new Error(String(error));
      if (!isRetired()) {
        console.warn('[createTauR3fGlProp] Renderer creation failed:', failure);
        onCreateError?.(failure);
      }
      throw failure;
    }
    attachOwnership(renderer);
    ownedRenderer = renderer;
    if (isRetired()) {
      if (retired || !canvas.isConnected) {
        await retire();
      }
      return renderer as FiberCompatibleGl;
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
    if (isRetired() && initialization === undefined) {
      throw new Error('Cannot initialize a retired canvas.');
    }
    initialization ??= initialize(defaults.canvas as HTMLCanvasElement);
    return initialization;
  };
  return Object.assign(factory, { bindCanvas, isRetired });
}
/* oxlint-enable unicorn-js/prevent-abbreviations */
