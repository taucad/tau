import type { GraphicsBackendPreference, ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';

/**
 * Probe WebGPU adapter availability without creating a GPUDevice.
 *
 * Matches the Tau graphics machine probe contract.
 *
 * Returns `false` immediately when APIs are unavailable (SSR, tests, unsupported browsers).
 * @public
 */
export async function probeWebGpuSupport(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
    return false;
  }

  try {
    // `GPU` / `navigator.gpu` arrived after some `lib.dom` baselines TypeScript snapshots use.
    const navigatorGpu = (navigator as Navigator & { readonly gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (navigatorGpu === undefined) {
      return false;
    }

    const adapter = await navigatorGpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}

/**
 * Whether an `OffscreenCanvas` can acquire a WebGPU context (Chromium; often false in Firefox).
 *
 * Used for shared off-thread renderers that want WebGPU when available.
 * @public
 */
export function offscreenWebGpuCanvasContextAvailable(): boolean {
  if (typeof OffscreenCanvas === 'undefined') {
    return false;
  }

  try {
    const canvas = new OffscreenCanvas(1, 1);
    return canvas.getContext('webgpu') !== null;
  } catch {
    return false;
  }
}

/**
 * Resolve persisted preference + runtime capability into `webgl` or `webgpu`.
 *
 * `webgpu` falls back to `webgl` when no adapter is available so the renderer
 * always has a valid backend to mount against.
 * @public
 */
export function resolveGraphicsBackendPreference(
  preference: GraphicsBackendPreference,
  gpuAvailable: boolean,
): ResolvedGraphicsBackend {
  if (preference === 'webgpu') {
    return gpuAvailable ? 'webgpu' : 'webgl';
  }

  return 'webgl';
}
