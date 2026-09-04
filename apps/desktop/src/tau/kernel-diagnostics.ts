/**
 * The kernel utility's engine-identity record (work items N5 and N6).
 *
 * N6 originally read "the smoke test asserts the kernel version reports
 * `+native`" from the client. It cannot: the smoke lane proved the engine
 * version never crosses the runtime wire — `RuntimeHelloPayload` carries only
 * `runtimeVersion`, and the capability frames carry a kernel id and its
 * extensions, never a kernel version. Making it cross would widen the runtime's
 * public transport surface, which is an E6-shaped change needing its own review.
 *
 * So the observable moves to the one place that already knows: the kernel
 * utility itself, which writes a structured line into the shell's diagnostics
 * log (`userData/logs/desktop.log`) that the e2e reads from disk. That is a
 * strictly *better* witness than a string on the wire, because it is produced
 * inside the process that loaded the engine.
 */

/** Build metadata that distinguishes the native kernel from its WebAssembly twin. */
export const nativeVersionMarker = '+native';

/** Log event name the e2e greps for. */
export const kernelEngineEvent = 'kernel.engine';

/** The detail object logged under {@link kernelEngineEvent}. */
export type KernelEngineRecord = {
  /** Capability id — the same `openrscad` both engines answer to. */
  readonly kernelId: string;
  /** Resolved kernel version, e.g. `0.11.0-beta.1+native`. */
  readonly version: string;
  /** Whether the resolved version is the native build. */
  readonly native: boolean;
  /** Electron version, absent when the utility runs under plain Node. */
  readonly electron: string | undefined;
  /** Utility-process Node version. */
  readonly node: string;
  /**
   * N5, folded in rather than logged separately. **Asserted, not measured**:
   * Electron builds Node with `NODE_API_NO_EXTERNAL_BUFFERS_ALLOWED`, so
   * `napi_create_external_buffer` is rejected and napi-rs copies every returned
   * buffer — which makes this field a restatement of "the process is Electron"
   * and nothing more. A real measurement needs the native engine to report
   * whether the call was refused. A trace attribute, never a gate.
   */
  readonly napiExternalBuffersAssumedCopied: boolean;
};

/**
 * Build the engine-identity record.
 *
 * `native` is derived from the version rather than hard-coded, which is the
 * whole point: swap the definition back to the WebAssembly kernel and the
 * assertion flips, instead of a constant that would read `true` either way.
 *
 * @param input - Resolved kernel identity and the process's version table.
 * @returns The record to log.
 */
export const kernelEngineRecord = (input: {
  readonly kernelId: string;
  readonly version: string;
  readonly versions: { readonly electron?: string | undefined; readonly node: string };
}): KernelEngineRecord => ({
  kernelId: input.kernelId,
  version: input.version,
  native: input.version.includes(nativeVersionMarker),
  electron: input.versions.electron,
  node: input.versions.node,
  napiExternalBuffersAssumedCopied: input.versions.electron !== undefined,
});
