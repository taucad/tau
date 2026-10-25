import * as THREE from 'three';
import { WebGPUBackend, WebGPURenderer as ThreeWebGPURenderer } from 'three/webgpu';
import type { ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';
import { reversedDepthTransparentSort } from '#graphics/three/reversed-depth-transparent-sort.js';
import { syncGltfSurfaceDepthBias } from '#graphics/three/materials/gltf-surface-depth-bias.js';
import { installWebGpuDepthSampling } from '#graphics/three/webgpu-depth-sampling.js';
import { installWebGpuStencilState } from '#graphics/three/webgpu-stencil-state.js';
import { WebGpuInitializationError } from '#graphics/three/webgpu-initialization-error.js';
import { reportWebGpuCanvasLoss } from '#graphics/graphics-backend.js';

/**
 * WebGL renderer instantiated by Tau helpers.
 *
 * @public
 */
export type WebGlRenderer = THREE.WebGLRenderer;

/**
 * WebGPU renderer instantiated by Tau helpers.
 *
 * @public
 */
export type WebGpuRenderer = InstanceType<typeof ThreeWebGPURenderer>;

/**
 * Union returned from {@link createRenderer}.
 *
 * @public
 */
export type RendererInstance = WebGlRenderer | WebGpuRenderer;

/**
 * Tau-owned renderer presets for disparate surfaces:
 *
 * - **`viewport`** — Interactive CAD `<Canvas>`: the lean node candidate uses single-sample targets with reversed-Z + GTAO;
 *   classic WebGL retains MSAA, log-depth + N8AO and `powerPreference: 'high-performance'` (matches @react-three/fiber defaults
 *   for object-form `gl` props; factory `gl` must set it explicitly). TRAA/temporal AA is intentionally absent because the viewport runs
 *   `frameloop='demand'` (see `docs/policy/graphics-backend-policy.md`) and temporal effects cannot
 *   converge while the scene is idle. Single-frame edge quality remains a qualification gate for the lean candidate.
 * - **`offscreen`** — Shared/doc bitmap path: MSAA + log-depth + stencil; WebGL omits preserve-buffer (bitmap transfer).
 * - **`showcase`** — Brand surfaces built on TSL node materials (the metal morph loader): always Three's node
 *   renderer so one TSL graph serves both GPU APIs. `backend: 'webgpu'` uses the WebGPU backend and lets Three
 *   fall back to its WebGL 2 backend when no adapter exists; `backend: 'webgl'` pins the WebGL 2 backend through
 *   `forceWebGL`. MSAA and a transparent framebuffer are on; reversed-Z, stencil and log-depth are off because
 *   a single continuously animated object has no depth-fighting risk. `powerPreference` forwards the adapter
 *   hint: spinners ask for the low-power adapter, hero surfaces for the high-performance one.
 *
 * @see `docs/policy/graphics-backend-policy.md`
 * @public
 */
export type RendererUseCase = 'viewport' | 'offscreen' | 'showcase';

/**
 * A showcase canvas together with its adapter hint.
 *
 * @public
 */
export type ShowcaseRendererTarget = Readonly<{
  canvas: HTMLCanvasElement | OffscreenCanvas;
  powerPreference?: 'high-performance' | 'low-power';
}>;

/**
 * A canvas together with per-surface choices: the showcase adapter hint, or a readable WebGL canvas.
 *
 * @public
 */
export type RendererTarget = ShowcaseRendererTarget &
  Readonly<{
    /** Keep each WebGL frame readable after it is shown (`canvas.toDataURL`); the WebGPU backends ignore it. */
    preserveDrawingBuffer?: boolean;
    /** Use shared node materials/composition for a viewport, including forced WebGL2 execution. */
    nodePipeline?: boolean;
  }>;

const isShowcaseTarget = (surface: HTMLCanvasElement | OffscreenCanvas | RendererTarget): surface is RendererTarget =>
  'canvas' in surface;

async function initWebGpuIfNeeded(renderer: WebGpuRenderer): Promise<void> {
  await renderer.init();
  installWebGpuDepthSampling(renderer);
  installWebGpuStencilState(renderer);
}

const destroyAllocatedDevice = (backend: WebGpuRenderer['backend']): void => {
  if (backend instanceof WebGPUBackend) {
    // Three owns this property; the published Backend declaration omits it.
    const gpuBackend = backend as WebGPUBackend & {
      readonly device?: { destroy: () => void };
    };
    gpuBackend.device?.destroy();
  }
};

/** The parts of Three's WebGPU backend a presentation check uses; the published Backend declaration omits them. */
type PresentableWebGpuBackend = Readonly<{
  device?: Readonly<{
    lost: Promise<Readonly<{ reason: string; message: string }>>;
    createCommandEncoder: () => {
      beginRenderPass: (descriptor: unknown) => { end: () => void };
      finish: () => unknown;
    };
    queue: Readonly<{ submit: (buffers: unknown[]) => void; onSubmittedWorkDone: () => Promise<void> }>;
  }>;
  context?: Readonly<{ getCurrentTexture: () => { createView: () => unknown } }>;
}>;

/**
 * Present one cleared frame and report whether the device survived it. A browser that cannot allocate the canvas's
 * swap chain (Chromium on a software adapter, whose compositor has no backing to share with the WebGPU canvas)
 * destroys the device within milliseconds of the first presented texture. Checking here, before the scene compiles a
 * single pipeline, lets the viewer start on WebGL at once; found later, the scene's pipeline builds hold the GPU
 * process for tens of seconds on a software adapter before anything can draw again.
 * @param renderer - The initialized renderer, on Three's WebGPU backend.
 * @returns The loss's message when the device did not survive the frame, otherwise `undefined`.
 */
async function presentFirstCanvasFrame(renderer: WebGpuRenderer): Promise<string | undefined> {
  const backend = renderer.backend as unknown as PresentableWebGpuBackend;
  const { device, context } = backend;
  if (device === undefined || context === undefined) {
    return undefined;
  }
  let lossMessage: string | undefined;
  // Settles only if the device is lost; a healthy device leaves it pending with nothing to release.
  const loss = (async (): Promise<void> => {
    const info = await device.lost;
    lossMessage = info.message || info.reason;
  })();
  try {
    const encoder = device.createCommandEncoder();
    encoder
      .beginRenderPass({
        colorAttachments: [
          {
            view: context.getCurrentTexture().createView(),
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
          },
        ],
      })
      .end();
    device.queue.submit([encoder.finish()]);
    await Promise.race([device.queue.onSubmittedWorkDone(), loss]);
  } catch (error) {
    // A dropped device rejects the work-done promise; the loss above carries its reason.
    lossMessage ??= error instanceof Error ? error.message : String(error);
  }
  // The loss is delivered as its own task; let it land before answering.
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  return lossMessage;
}

/**
 * Instantiate a Tau-normalised Three.js renderer for the given GPU backend and UI surface.
 *
 * @param useCase - Viewport, offscreen or showcase preset (see {@link RendererUseCase}).
 * @param backend - `'webgl'` or `'webgpu'`.
 * @param surface - Backing canvas (`OffscreenCanvas` callers rely on the same cast path as upstream Three.js typings),
 *   or, for the showcase preset, the canvas together with its adapter power hint.
 * @public
 */
export async function createRenderer(
  useCase: 'showcase',
  backend: ResolvedGraphicsBackend,
  surface: HTMLCanvasElement | OffscreenCanvas | ShowcaseRendererTarget,
): Promise<WebGpuRenderer>;
/**
 * Instantiate a Tau-normalised Three.js renderer for any use case.
 *
 * @param useCase - Viewport, offscreen or showcase preset (see {@link RendererUseCase}).
 * @param backend - `'webgl'` or `'webgpu'`.
 * @param surface - Backing canvas, or the canvas together with per-surface choices (the showcase adapter hint, a
 *   readable WebGL canvas).
 * @returns The initialised renderer.
 * @public
 */
export async function createRenderer(
  useCase: RendererUseCase,
  backend: ResolvedGraphicsBackend,
  surface: HTMLCanvasElement | OffscreenCanvas | RendererTarget,
): Promise<RendererInstance>;
/**
 * Implementation of the {@link createRenderer} overloads.
 *
 * @param useCase - Viewport, offscreen or showcase preset.
 * @param backend - `'webgl'` or `'webgpu'`.
 * @param surface - Backing canvas, or the canvas with its per-surface choices.
 * @returns The initialised renderer.
 * @public
 */
export async function createRenderer(
  useCase: RendererUseCase,
  backend: ResolvedGraphicsBackend,
  surface: HTMLCanvasElement | OffscreenCanvas | RendererTarget,
): Promise<RendererInstance> {
  const target = isShowcaseTarget(surface) ? surface : { canvas: surface };
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Offscreen-backed bitmap path matches upstream typing
  const backingCanvas = target.canvas as HTMLCanvasElement;

  if (useCase === 'showcase') {
    const renderer = new ThreeWebGPURenderer({
      canvas: backingCanvas,
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      logarithmicDepthBuffer: false,
      reversedDepthBuffer: false,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- three.js constructor option name
      forceWebGL: backend === 'webgl',
      powerPreference: isShowcaseTarget(surface) ? surface.powerPreference : undefined,
    });
    await initWebGpuIfNeeded(renderer);
    return renderer;
  }

  if (backend === 'webgpu' || (useCase === 'viewport' && target.nodePipeline)) {
    const options: ConstructorParameters<typeof ThreeWebGPURenderer>[0] = {
      canvas: backingCanvas,
      alpha: true,
    };

    if (useCase === 'viewport') {
      Object.assign(options, {
        antialias: false,
        samples: 0,
        reversedDepthBuffer: backend === 'webgpu',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- Three constructor option.
        forceWebGL: backend === 'webgl',
        logarithmicDepthBuffer: false,
        stencil: true,
      } satisfies Partial<ConstructorParameters<typeof ThreeWebGPURenderer>[0]>);
    } else {
      Object.assign(options, {
        antialias: true,
        logarithmicDepthBuffer: true,
        stencil: true,
      } satisfies Partial<ConstructorParameters<typeof ThreeWebGPURenderer>[0]>);
    }

    const renderer = new ThreeWebGPURenderer(options);
    const requestedBackend = renderer.backend;
    try {
      await initWebGpuIfNeeded(renderer);
    } catch (error) {
      // Three.dispose() calls init again through setAnimationLoop when init never completed.
      // This factory supplied no external device: release any partially allocated one directly.
      destroyAllocatedDevice(requestedBackend);
      throw new WebGpuInitializationError(error instanceof Error ? error.message : String(error), { cause: error });
    }
    if (backend === 'webgpu' && renderer.coordinateSystem !== THREE.WebGPUCoordinateSystem) {
      renderer.dispose();
      destroyAllocatedDevice(requestedBackend);
      throw new WebGpuInitializationError('WebGPU initialization did not select a native WebGPU backend');
    }

    if (useCase === 'viewport' && backend === 'webgpu') {
      const lossMessage = await presentFirstCanvasFrame(renderer);
      if (lossMessage !== undefined) {
        renderer.dispose();
        destroyAllocatedDevice(requestedBackend);
        reportWebGpuCanvasLoss();
        throw new WebGpuInitializationError(`The WebGPU canvas could not present a frame: ${lossMessage}`);
      }
    }

    if (useCase === 'viewport') {
      // NodeRenderer does not invoke Material.onBeforeRender. Use its supported
      // draw callback for renderer-dependent surface bias, without per-draw arrays.
      // oxlint-disable-next-line max-params -- Three draw callback signature; avoid a rest-array allocation per draw.
      renderer.setRenderObjectFunction((object, scene, camera, geometry, material, group, lights, clipping, passId) => {
        syncGltfSurfaceDepthBias.call(material, renderer);
        renderer.renderObject(object, scene, camera, geometry, material, group, lights, clipping, passId);
      });

      // Compensates for `reversedDepthBuffer: true` flipping clip-space Z direction:
      // upstream `reversePainterSortStable` (`node_modules/three/src/renderers/common/RenderList.js`)
      // assumes "larger clip-z = farther", which is INVERTED under reversed-Z and silently sorts
      // transparent geometry front-to-back. See docs/research/webgpu-reversed-z-transparent-sort-inversion.md.
      if (renderer.reversedDepthBuffer) {
        renderer.setTransparentSort(reversedDepthTransparentSort);
      }
    }

    return renderer;
  }

  const webGlOptions: THREE.WebGLRendererParameters = {
    canvas: backingCanvas,
    // Premultiplied, like WebGPU's canvas: overlays alpha-blend onto a transparent clear, which
    // leaves premultiplied pixels; a straight-alpha canvas darkens every fractional-alpha pixel.
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
    ...(isShowcaseTarget(surface) && surface.preserveDrawingBuffer === true ? { preserveDrawingBuffer: true } : {}),
  };

  Object.assign(webGlOptions, {
    stencil: true,
    logarithmicDepthBuffer: true,
  } satisfies THREE.WebGLRendererParameters);

  return new THREE.WebGLRenderer(webGlOptions);
}
