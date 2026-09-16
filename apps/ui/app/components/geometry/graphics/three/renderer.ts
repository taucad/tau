import * as THREE from 'three';
import { WebGPURenderer as ThreeWebGPURenderer } from 'three/webgpu';
import type { ResolvedGraphicsBackend } from '#constants/editor.constants.js';
import { reversedDepthTransparentSort } from '#components/geometry/graphics/three/reversed-depth-transparent-sort.js';

/** WebGL renderer instantiated by Tau helpers. */
export type WebGlRenderer = THREE.WebGLRenderer;

/** WebGPU renderer instantiated by Tau helpers. */
export type WebGpuRenderer = InstanceType<typeof ThreeWebGPURenderer>;

/** Union returned from {@link createRenderer}. */
export type RendererInstance = WebGlRenderer | WebGpuRenderer;

/**
 * Tau-owned renderer presets for disparate surfaces:
 *
 * - **`viewport`** — Interactive CAD `<Canvas>`: MSAA on for both backends — WebGPU adds reversed-Z + GTAO,
 *   WebGL adds log-depth + N8AO and `powerPreference: 'high-performance'` (matches @react-three/fiber defaults
 *   for object-form `gl` props; factory `gl` must set it explicitly). TRAA/temporal AA is intentionally absent because the viewport runs
 *   `frameloop='demand'` (see `docs/policy/graphics-backend-policy.md`) and temporal effects cannot
 *   converge while the scene is idle, so static frames must be AA-clean from a single render.
 * - **`offscreen`** — Shared/doc bitmap path: MSAA + log-depth + stencil; WebGL omits preserve-buffer (bitmap transfer).
 * - **`showcase`** — Brand surfaces built on TSL node materials (the metal morph loader): always Three's node
 *   renderer so one TSL graph serves both GPU APIs. `backend: 'webgpu'` uses the WebGPU backend and lets Three
 *   fall back to its WebGL 2 backend when no adapter exists; `backend: 'webgl'` pins the WebGL 2 backend through
 *   `forceWebGL`. MSAA and a transparent framebuffer are on; reversed-Z, stencil and log-depth are off because
 *   a single continuously animated object has no depth-fighting risk.
 *
 * @see `docs/policy/graphics-backend-policy.md`
 */
export type RendererUseCase = 'viewport' | 'offscreen' | 'showcase';

async function initWebGpuIfNeeded(renderer: WebGpuRenderer): Promise<void> {
  await renderer.init();
}

/**
 * Instantiate a Tau-normalised Three.js renderer for the given GPU backend and UI surface.
 *
 * @param useCase - Viewport, offscreen or showcase preset (see {@link RendererUseCase}).
 * @param backend - `'webgl'` or `'webgpu'`.
 * @param canvas - Backing canvas (`OffscreenCanvas` callers rely on the same cast path as upstream Three.js typings).
 */
export async function createRenderer(
  useCase: 'showcase',
  backend: ResolvedGraphicsBackend,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<WebGpuRenderer>;
export async function createRenderer(
  useCase: RendererUseCase,
  backend: ResolvedGraphicsBackend,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<RendererInstance>;
export async function createRenderer(
  useCase: RendererUseCase,
  backend: ResolvedGraphicsBackend,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<RendererInstance> {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Offscreen-backed bitmap path matches upstream typing
  const backingCanvas = canvas as HTMLCanvasElement;

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
    });
    await initWebGpuIfNeeded(renderer);
    return renderer;
  }

  if (backend === 'webgpu') {
    const options: ConstructorParameters<typeof ThreeWebGPURenderer>[0] = {
      canvas: backingCanvas,
      alpha: true,
    };

    if (useCase === 'viewport') {
      Object.assign(options, {
        antialias: true,
        reversedDepthBuffer: true,
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
    await initWebGpuIfNeeded(renderer);

    if (useCase === 'viewport') {
      // Compensates for `reversedDepthBuffer: true` flipping clip-space Z direction:
      // upstream `reversePainterSortStable` (`node_modules/three/src/renderers/common/RenderList.js`)
      // assumes "larger clip-z = farther", which is INVERTED under reversed-Z and silently sorts
      // transparent geometry front-to-back. See docs/research/webgpu-reversed-z-transparent-sort-inversion.md.
      renderer.setTransparentSort(reversedDepthTransparentSort);
    }

    return renderer;
  }

  const webGlOptions: THREE.WebGLRendererParameters = {
    canvas: backingCanvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance',
  };

  Object.assign(webGlOptions, {
    stencil: true,
    logarithmicDepthBuffer: true,
  } satisfies THREE.WebGLRendererParameters);

  return new THREE.WebGLRenderer(webGlOptions);
}
