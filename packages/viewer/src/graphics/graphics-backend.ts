import type { GraphicsBackendPreference, ResolvedGraphicsBackend } from '#graphics/graphics-settings.js';

let webGpuSupportProbe: Promise<boolean> | undefined;

const requestWebGpuAdapter = async (): Promise<boolean> => {
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
    // A failed request (such as a restarting GPU process) is not remembered: the next probe asks again.
    webGpuSupportProbe = undefined;
    return false;
  }
};

/**
 * Probe WebGPU adapter availability without creating a GPUDevice.
 *
 * Matches the Tau graphics machine probe contract.
 *
 * The answer is requested once per page and shared by every viewer, since each adapter request makes the
 * browser's GPU process set up state. Returns `false` immediately when APIs are unavailable (SSR, tests,
 * unsupported browsers).
 * @public
 */
export async function probeWebGpuSupport(): Promise<boolean> {
  webGpuSupportProbe ??= requestWebGpuAdapter();
  return webGpuSupportProbe;
}

/**
 * Record that the browser destroyed a canvas's WebGPU device underneath a live viewer. Later probes answer `false`, so
 * viewers mounted afterwards start on WebGL instead of repeating a WebGPU start the browser cannot present.
 * @public
 */
export function reportWebGpuCanvasLoss(): void {
  webGpuSupportProbe = Promise.resolve(false);
}

/**
 * How long a viewer waits for the WebGPU adapter answer before it mounts on WebGL instead. The adapter normally
 * answers within milliseconds, a software adapter within a second or two; the bound only covers a browser whose
 * adapter request never settles, so the stage never waits on it forever. Milliseconds.
 * @public
 */
export const webGpuProbeTimeout = 10_000;

/**
 * {@link probeWebGpuSupport}, answering `false` when the adapter has not answered within `probeTimeout`.
 *
 * @param probeTimeout - The longest wait for the answer, in milliseconds.
 * @returns Whether a WebGPU adapter is available, or `false` once the wait runs out.
 * @public
 */
export async function probeWebGpuSupportWithin(probeTimeout: number = webGpuProbeTimeout): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const probeDeadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => {
      resolve(false);
    }, probeTimeout);
  });
  try {
    return await Promise.race([probeWebGpuSupport(), probeDeadline]);
  } finally {
    clearTimeout(timer);
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

/**
 * What a WebGPU adapter says about itself: `GPUAdapter` (with its `info`) or a device's `adapterInfo`.
 *
 * @public
 */
export type GpuAdapterIdentity = Readonly<{
  isFallbackAdapter?: boolean;
  info?: Readonly<{
    architecture?: string;
    description?: string;
    device?: string;
    isFallbackAdapter?: boolean;
    vendor?: string;
  }>;
}>;

/**
 * The adapter's self-reported vendor, architecture, device and description, lowercased; empty when it reports none.
 *
 * @param adapter - The adapter, or a device's `adapterInfo` wrapped as `{ info }`.
 * @returns The identity string.
 * @public
 */
export function gpuAdapterIdentity(adapter: GpuAdapterIdentity): string {
  const { info } = adapter;
  return [info?.vendor, info?.architecture, info?.device, info?.description].join(' ').trim().toLowerCase();
}

/**
 * Whether the adapter rasterizes on the CPU: the browser's fallback adapter, or one that names a software
 * implementation (SwiftShader, llvmpipe, lavapipe, or Windows WARP, the Microsoft Basic Render Driver). Work that is cheap on a GPU, such as ambient occlusion, can
 * saturate such an adapter and stall the page.
 *
 * @param adapter - The adapter, or a device's `adapterInfo` wrapped as `{ info }`.
 * @returns True for a software adapter; false for hardware or an adapter that reports nothing.
 * @public
 */
export function isSoftwareGpuAdapter(adapter: GpuAdapterIdentity): boolean {
  if (adapter.isFallbackAdapter === true || adapter.info?.isFallbackAdapter === true) {
    return true;
  }

  return /\b(?:swiftshader|llvmpipe|lavapipe|software|cpu|warp|basic render driver)\b/u.test(
    gpuAdapterIdentity(adapter),
  );
}
