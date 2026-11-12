/**
 * Whether this device should be treated as memory-constrained.
 *
 * iOS Safari kills a tab silently at roughly 1.5–2 GB across the page, its
 * workers and their WASM heaps, and gives no pressure signal first. The two
 * hints a page can read are a coarse primary pointer (phones and tablets) and
 * `navigator.deviceMemory` (Chromium only, rounded, capped at 8). Either one is
 * enough to budget for a phone (editor memory remediation B-08, B-16, B-19).
 */

type DeviceEnvironment = Readonly<{
  matchMedia?: ((query: string) => Readonly<{ matches: boolean }>) | undefined;
  navigator?: Readonly<{ deviceMemory?: number | undefined }> | undefined;
}>;

/** `navigator.deviceMemory`, which the DOM library does not declare; `undefined` outside Chromium and during SSR. */
const readDeviceMemory = (): number | undefined => {
  if (typeof navigator === 'undefined' || !('deviceMemory' in navigator)) {
    return undefined;
  }
  const { deviceMemory } = navigator;
  return typeof deviceMemory === 'number' ? deviceMemory : undefined;
};

const browserEnvironment = (): DeviceEnvironment => ({
  matchMedia: typeof globalThis.matchMedia === 'function' ? (query) => globalThis.matchMedia(query) : undefined,
  navigator: { deviceMemory: readDeviceMemory() },
});

/** At or below this many GB, `navigator.deviceMemory` marks a device as constrained. */
const constrainedDeviceMemoryGigabytes = 4;

/** Heap above which a phone's idle editor runtime is recycled: the audit's 512 MiB (editor memory remediation B-04). */
const constrainedRecycleHeapBytes = 512 * 2 ** 20;
/** Heap above which any other idle editor runtime is recycled: the compute-reuse W8 browser high-water candidate. */
const standardRecycleHeapBytes = 1.5 * 2 ** 30;

/**
 * The WebAssembly heap above which an editor runtime is recycled once idle (D-RT-03).
 *
 * @param constrained - Whether the device is memory-constrained (`isMemoryConstrainedDevice`).
 * @returns The threshold in bytes.
 * @public
 */
export const runtimeRecycleHeapBytes = (constrained: boolean): number =>
  constrained ? constrainedRecycleHeapBytes : standardRecycleHeapBytes;

/**
 * Read the device's memory class.
 *
 * @param environment - The global object; a test passes a stand-in.
 * @returns `true` on a coarse-pointer or low-memory device; `false` elsewhere and during SSR.
 * @public
 */
export const isMemoryConstrainedDevice = (environment: DeviceEnvironment = browserEnvironment()): boolean => {
  const deviceMemory = environment.navigator?.deviceMemory;
  if (typeof deviceMemory === 'number' && deviceMemory <= constrainedDeviceMemoryGigabytes) {
    return true;
  }
  return environment.matchMedia?.('(pointer: coarse)').matches === true;
};
