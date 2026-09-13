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
 * - **`screenshot`** — Headless clones + readback path: matches offscreen presets and adds **`preserveDrawingBuffer`** on WebGL where pixels are sampled from the framebuffer.
 *
 * @see `docs/policy/graphics-backend-policy.md`
 */
export type RendererUseCase = 'viewport' | 'offscreen' | 'screenshot';

async function initWebGpuIfNeeded(renderer: WebGpuRenderer): Promise<void> {
  await renderer.init();
}

/**
 * Instantiate a Tau-normalised Three.js renderer for the given GPU backend and UI surface.
 *
 * @param useCase - Viewport / offscreen / screenshot preset (see {@link RendererUseCase}).
 * @param backend - `'webgl'` or `'webgpu'`.
 * @param canvas - Backing canvas (`OffscreenCanvas` callers rely on the same cast path as upstream Three.js typings).
 */
export async function createRenderer(
  useCase: RendererUseCase,
  backend: ResolvedGraphicsBackend,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<RendererInstance> {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- Offscreen-backed bitmap path matches upstream typing
  const backingCanvas = canvas as HTMLCanvasElement;

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

  if (useCase === 'screenshot') {
    Object.assign(webGlOptions, {
      preserveDrawingBuffer: true,
    } satisfies THREE.WebGLRendererParameters);
  }

  return new THREE.WebGLRenderer(webGlOptions);
}
