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
 * inside the process that loaded the engine — and since the colocation closeout
 * it reports the engine's own `backend` export rather than a version suffix,
 * which is the only thing left that differs between the two payloads.
 */

/** Log event name the e2e greps for. */
export const kernelEngineEvent = 'kernel.engine';

/** The detail object logged under {@link kernelEngineEvent}. */
export type KernelEngineRecord = {
  /** Capability id — `openrscad`, whichever payload bound. */
  readonly kernelId: string;
  /** Resolved kernel version, e.g. `0.11.0-beta.3` — the engine release, which
   *  is the same string for both backends. */
  readonly version: string;
  /** The payload `@taulabs/openrscad-engine` bound in the utility process. */
  readonly backend: string;
  /** Whether that payload is the N-API addon. */
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
 * The kernel version no longer distinguishes the backends — one engine release
 * ships both, byte-identical — so `native` is derived from the engine's own
 * `backend` export, read in the process that loaded it. That is the only honest
 * witness left: a platform package that failed to match leaves the version
 * untouched and flips this field.
 *
 * @param input - Resolved kernel identity, the bound backend, and the process's version table.
 * @returns The record to log.
 */
export const kernelEngineRecord = (input: {
  readonly kernelId: string;
  readonly version: string;
  readonly backend: string;
  readonly versions: { readonly electron?: string | undefined; readonly node: string };
}): KernelEngineRecord => ({
  kernelId: input.kernelId,
  version: input.version,
  backend: input.backend,
  native: input.backend === 'native',
  electron: input.versions.electron,
  node: input.versions.node,
  napiExternalBuffersAssumedCopied: input.versions.electron !== undefined,
});
