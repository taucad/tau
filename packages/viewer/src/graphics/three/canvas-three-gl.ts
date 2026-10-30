import type { CanvasProps, Renderer as FiberCompatibleGl } from '@react-three/fiber';
import type { ThreeCamera } from '@taucad/three/camera';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import type { RendererInstance } from '#graphics/three/renderer.js';
import { isViewportWebGpu } from '#graphics/three/viewport-cad-renderer.js';
import { createRenderer } from '#graphics/three/renderer.js';
import { WebGpuInitializationError } from '#graphics/three/webgpu-initialization-error.js';

type TauR3fGlDefaults = Parameters<Extract<CanvasProps['gl'], (defaults: never) => unknown>>[0];

/**
 * One factory's renderer ownership, bound to its mounted Canvas DOM node.
 *
 * @public
 */
export type TauR3fGlFactory = ((defaults: TauR3fGlDefaults) => Promise<FiberCompatibleGl>) & {
  /** Bind the Canvas ref; StrictMode ref replay keeps a reattached canvas alive. */
  readonly bindCanvas: (canvas: HTMLCanvasElement | undefined) => void;
  /** Keep renderer bookkeeping alive until the mounted scene's passive cleanups finish. Returns its release callback. */
  readonly retainScene: () => () => void;
  /** Whether this factory's mounted canvas has been removed. */
  readonly isRetired: () => boolean;
};

/**
 * Rejects a renderer request whose canvas was removed before the renderer could be used.
 *
 * @public
 */
export class RetiredCanvasError extends Error {
  public override readonly name = 'RetiredCanvasError';

  public constructor() {
    super('The canvas was removed before its renderer was ready.');
  }
}

/* oxlint-disable unicorn-js/prevent-abbreviations -- name mirrors R3F `<Canvas gl={...}>` ergonomics */
/**
 * R3F `gl` factory / props for {@link ResolvedGraphicsBackend}.
 *
 * Builds renderers via {@link createRenderer} with the **`viewport`** use case (MSAA,
 * WebGL log-depth / WebGPU reversed-Z — see `renderer.ts`). Node canvases use
 * the viewer's composed post frame for depth/stencil; the canvas only encodes final color.
 *
 * A renderer that cannot be created (no WebGL context, or a context Safari hands back already lost) is reported
 * through `onCreateError`, and the factory stays pending while its canvas is mounted: the owner unmounts the
 * `<Canvas>` and shows its fallback, so R3F never also throws the failure from inside the Canvas. Once the canvas is
 * retired, every pending call rejects with {@link RetiredCanvasError}. R3F waits for `root.ready` before tearing a
 * root down, so settling is what lets it drop the root of a canvas removed mid-creation.
 *
 * The factory owns its renderer's lifetime. R3F 9.8 also disposes and loses the context of a renderer a `gl`
 * function created; both calls are routed to the factory's own retirement, which waits for scene cleanup and runs
 * `dispose()` and `forceContextLoss()` exactly once.
 *
 * @param graphicsBackend - Backend the viewport renderer is created for.
 * @param cameras - Retained cameras whose projection convention must follow the new renderer.
 * @param options - The owner's choices.
 * @param options.onCreateError - Receives the renderer creation failure so the owner can render its fallback.
 * @param options.preserveDrawingBuffer - Keep each WebGL frame readable after it is shown (a live capture).
 * @public
 */
export function createTauR3fGlProp(
  graphicsBackend: ResolvedGraphicsBackend,
  cameras: readonly ThreeCamera[] = [],
  {
    onCreateError,
    preserveDrawingBuffer = false,
  }: Readonly<{
    onCreateError?: (error: Error) => void;
    preserveDrawingBuffer?: boolean;
  }> = {},
): TauR3fGlFactory {
  let initialization: Promise<FiberCompatibleGl> | undefined;
  let ownedRenderer: RendererInstance | undefined;
  let mountedCanvas: HTMLCanvasElement | undefined = undefined;
  let hasCanvasBinding = false;
  let retired = false;
  let disposed = false;
  let sceneOwners = 0;
  let releaseRenderer: (() => void) | undefined;
  let rejectRetirement: (error: RetiredCanvasError) => void = () => undefined;
  const retirement = new Promise<never>((_resolve, reject) => {
    rejectRetirement = reject;
  });
  // R3F reads the rejection from `root.ready`; a factory call nobody awaits must not report it as unhandled.
  // oxlint-disable-next-line promise/prefer-await-to-then -- marks the rejection handled without awaiting it.
  retirement.catch(() => undefined);
  /**
   * Pending while the canvas is mounted; rejects once it is retired so R3F can tear its root down.
   *
   * @returns The factory's retirement, which only ever rejects.
   */
  const pending = async (): Promise<never> => retirement;
  const isRetired = (): boolean => retired || (hasCanvasBinding && mountedCanvas === undefined);
  const retire = (): void => {
    if (!retired) {
      retired = true;
      rejectRetirement(new RetiredCanvasError());
    }
    if (ownedRenderer && !disposed && sceneOwners === 0) {
      disposed = true;
      // Release after scene effects. Disposing at DOM ref removal is too early: later
      // cube-target cleanup still needs Three's renderer bookkeeping.
      releaseRenderer?.();
    }
  };
  /**
   * Routes `dispose()`/`forceContextLoss()` from R3F's root teardown into this factory's single release.
   *
   * @param renderer - The renderer this factory created and now owns.
   */
  const adoptRenderer = (renderer: RendererInstance): void => {
    ownedRenderer = renderer;
    const { dispose } = renderer;
    const loseContext = 'forceContextLoss' in renderer ? renderer.forceContextLoss : undefined;
    releaseRenderer = (): void => {
      dispose.call(renderer);
      loseContext?.call(renderer);
    };
    renderer.dispose = retire;
    if (loseContext) {
      Object.assign(renderer, { forceContextLoss: retire });
    }
  };
  const retainScene = (): (() => void) => {
    sceneOwners += 1;
    return () => {
      // Passive effect replay can acquire a replacement before this release. The microtask also
      // lets descendant passive cleanups finish even when this owner's cleanup ran first.
      queueMicrotask(() => {
        sceneOwners -= 1;
        if (retired) {
          retire();
        }
      });
    };
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
      renderer = await createRenderer('viewport', graphicsBackend, {
        canvas,
        preserveDrawingBuffer,
        nodePipeline: true,
      });
    } catch (error) {
      if (isRetired()) {
        return pending();
      }
      const cause = error instanceof Error ? error : new Error(String(error));
      const failure =
        graphicsBackend === 'webgpu' && !(cause instanceof WebGpuInitializationError)
          ? new WebGpuInitializationError(cause.message, { cause })
          : cause;
      console.warn('[createTauR3fGlProp] Renderer creation failed:', failure);
      onCreateError?.(failure);
      return pending();
    }
    adoptRenderer(renderer);
    if (isRetired()) {
      retire();
      return pending();
    }
    if (isViewportWebGpu(renderer)) {
      // This canvas always uses the node post owner's explicit depth/stencil frame,
      // including with AO off. Its only canvas draw is a depth-free final encoding.
      // Set this before the first draw; leave standalone/offscreen factory users intact.
      renderer.depth = false;
      renderer.stencil = false;
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
    // Retirement settles a call still waiting on initialization; a late renderer is disposed by `initialize`.
    const renderer = await Promise.race([initialization, retirement]);
    if (isRetired()) {
      retire();
      return pending();
    }
    return renderer;
  };
  return Object.assign(factory, { bindCanvas, retainScene, isRetired });
}
/* oxlint-enable unicorn-js/prevent-abbreviations */
