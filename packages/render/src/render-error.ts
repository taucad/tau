/**
 * Failure taxonomy for the image transcoder. The Rust core prefixes every
 * error message with a stable tag (`adapter-unavailable:`, `gpu:`, `parse:`,
 * `encode:`); both the wasm and napi bindings surface it verbatim as a JS
 * error. {@link RenderError.from} parses that tag back into a typed `code` so
 * the transcoder can turn it into a structured issue and the browser worker /
 * CLI can decide whether to keep the last thumbnail (GPU faults) or report a
 * hard failure (bad GLB, encode error).
 */

/**
 * Stable failure codes surfaced to callers.
 *
 * - `adapter-unavailable` — no GPU adapter (WebGPU unsupported, headless Linux
 *   without Mesa, multi-GPU laptop returning null). Keep-last-thumbnail case.
 * - `device-lost` — the GPU device dropped mid-render (Safari 26 bug, driver
 *   reset). Keep-last-thumbnail case; retries on the next geometry settle.
 * - `gpu` — any other GPU/driver fault during the render pass.
 * - `parse` — malformed GLB or out-of-range options.
 * - `encode` — encoder failure (e.g. JPEG requested for a translucent render).
 * - `unknown` — an error that carried no recognizable tag.
 *
 * @public
 */
export type RenderFailureCode = 'adapter-unavailable' | 'device-lost' | 'gpu' | 'parse' | 'encode' | 'unknown';

/** GPU-fault codes are transient: keep the last thumbnail and retry later. */
const gpuFaultCodes: ReadonlySet<RenderFailureCode> = new Set<RenderFailureCode>([
  'adapter-unavailable',
  'device-lost',
  'gpu',
]);

/**
 * Typed error carrying a {@link RenderFailureCode}.
 *
 * @public
 */
export class RenderError extends Error {
  /**
   * Convert any thrown value (JsError from wasm, napi Error, wasm trap,
   * non-Error throw) into a typed {@link RenderError}. Never throws — this is
   * the panic-containment boundary the blueprint requires: a malformed GLB or
   * driver edge surfaces as a structured error, never an unhandled crash.
   *
   * @param error - The thrown value to classify.
   * @returns A typed {@link RenderError} with the parsed failure code.
   */
  public static from(error: unknown): RenderError {
    if (error instanceof RenderError) {
      return error;
    }

    const message = error instanceof Error ? error.message : String(error);
    return new RenderError(classify(message), message);
  }

  public readonly code: RenderFailureCode;

  /**
   * Construct a typed render error.
   *
   * @param code - Failure taxonomy code.
   * @param message - Human-readable message (typically the core's tagged text).
   */
  public constructor(code: RenderFailureCode, message: string) {
    super(message);
    this.name = 'RenderError';
    this.code = code;
  }

  /**
   * `true` when the failure is a transient GPU fault (adapter/device/driver),
   * where the caller should keep the existing thumbnail rather than surface an
   * error. `false` for deterministic input/encode faults that will recur.
   *
   * @returns Whether the failure is a transient GPU fault.
   */
  public get isGpuFault(): boolean {
    return gpuFaultCodes.has(this.code);
  }
}

/** Map a core error message to its {@link RenderFailureCode} by leading tag. */
/**
 * Map a core error message to its {@link RenderFailureCode} by leading tag.
 *
 * @param message - The error message emitted by the render core.
 * @returns The matching failure code, or `unknown` for an untagged message.
 */
function classify(message: string): RenderFailureCode {
  const normalized = message.toLowerCase();
  // Device loss can arrive tagged `gpu:` (map_async drop) or from the driver.
  // Check the phrase before the generic gpu tag so it gets its own code.
  if (normalized.includes('device lost') || normalized.includes('device-lost')) {
    return 'device-lost';
  }
  if (normalized.startsWith('adapter-unavailable:')) {
    return 'adapter-unavailable';
  }
  if (normalized.startsWith('gpu:')) {
    return 'gpu';
  }
  if (normalized.startsWith('parse:')) {
    return 'parse';
  }
  if (normalized.startsWith('encode:')) {
    return 'encode';
  }
  return 'unknown';
}
