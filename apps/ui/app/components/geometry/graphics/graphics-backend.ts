import type { GraphicsBackendPreference, ResolvedGraphicsBackend } from '#constants/editor.constants.js';

/** Query-param override for e2e and manual testing (whole-tab). */
const graphicsBackendQueryValues = ['webgl', 'webgpu'] as const;

/**
 * Probe WebGPU adapter availability without creating a GPUDevice.
 *
 * Matches the Tau graphics machine probe contract.
 *
 * Returns `false` immediately when APIs are unavailable (SSR, tests, unsupported browsers).
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

/**
 * Read `graphicsBackend` from the current URL (browser only).
 *
 * Validates against `GraphicsBackendPreference` tokens and returns undefined when absent / invalid.
 */
export function readGraphicsBackendQueryOverride(): GraphicsBackendPreference | undefined {
  const browserWindow = Reflect.get(globalThis, 'window') as Window | undefined;
  if (browserWindow === undefined) {
    return undefined;
  }

  const graphicsBackendParameter = new URLSearchParams(browserWindow.location.search).get('graphicsBackend');
  if (!graphicsBackendParameter) {
    return undefined;
  }

  if ((graphicsBackendQueryValues as readonly string[]).includes(graphicsBackendParameter)) {
    return graphicsBackendParameter as GraphicsBackendPreference;
  }

  return undefined;
}

/**
 * Merge machine-resolved backend with an optional URL override.
 *
 * When a valid query override is present it wins for the lifetime of the page.
 */
export function mergeGraphicsBackendWithQueryOverride(
  machineResolved: ResolvedGraphicsBackend,
  _preference: GraphicsBackendPreference,
  gpuAvailable: boolean,
): ResolvedGraphicsBackend {
  const override = readGraphicsBackendQueryOverride();
  if (override === undefined) {
    return machineResolved;
  }

  return resolveGraphicsBackendPreference(override, gpuAvailable);
}
