// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { callHost, toHostBytes } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type { HostBytes, HostEngine, HostSubjectLifecycle } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { MixedWasmBinding, canonicalizeMixedWasm, initializeMixedWasm } from '#mixed-wasm-loader.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type { WasmInput as MixedWasmInput, WasmResources as MixedWasmResources } from '#mixed-wasm-loader.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared protocol-error identity.
export { ProtocolError } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves an in-package public contract.
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared byte contract.
export type { HostBytes, HostEngine, HostSubjectLifecycle } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves in-package public contract types.

/** Input accepted by the compiled Emscripten module. @public */
export type WasmInput = MixedWasmInput;
/** Ordered external binary resources paired with request metadata. @public */
export type WasmResources = MixedWasmResources;

/**
 * Initialize the compiled GeoSpec WASM module.
 * @param input - Optional module byte source or artifact location.
 * @returns A promise resolved after initialization.
 * @public
 */
export const initialize = async (input?: WasmInput): Promise<void> => {
  await initializeMixedWasm(input);
};

/** Stateful browser/Node facade over the compiled GeoSpec engine. @public */
export class Engine implements HostEngine, HostSubjectLifecycle {
  readonly #inner = new MixedWasmBinding();

  /** Release the retained engine and its native geometry. */
  public close(): void {
    this.#inner.close();
  }

  /**
   * Admit one mesh into this engine instance.
   * @param request - Exact request bytes.
   * @param mesh - Exact mesh payload bytes.
   * @returns Exact response bytes.
   */
  public ingestMesh(request: HostBytes, mesh: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.ingestMesh(request, mesh)));
  }

  /**
   * Admit one full-format subject and its ordered external resources.
   * @param request - Metadata-only exact request bytes.
   * @param primary - Exact primary subject bytes.
   * @param resources - Exact resource buffers in request metadata order.
   * @returns Exact response bytes.
   */
  public ingestSubject(request: HostBytes, primary: HostBytes, resources: WasmResources): HostBytes {
    return callHost(() => toHostBytes(this.#inner.ingestSubject(request, primary, resources)));
  }

  /**
   * Acquire the stable owner/generation token for one admitted subject.
   * @param request - Exact subject identity control bytes.
   * @returns Exact subject-handle response bytes.
   */
  public subjectHandle(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.subjectHandle(request)));
  }

  /**
   * Release one generation-checked subject and its retained analysis.
   * @param request - Exact release control bytes containing the subject handle.
   * @returns Exact release response bytes.
   */
  public releaseSubject(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.releaseSubject(request)));
  }

  /**
   * Process one request against admitted meshes.
   * @param request - Exact request bytes.
   * @returns Exact response bytes.
   */
  public processRequest(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.processRequest(request)));
  }

  /**
   * Produce the canonical plan for one request.
   * @param request - Exact request bytes.
   * @returns Exact plan bytes.
   */
  public canonicalPlan(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.canonicalPlan(request)));
  }

  /**
   * Evaluate one canonical plan.
   * @param plan - Exact plan bytes.
   * @returns Exact response bytes.
   */
  public evaluatePlan(plan: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.evaluatePlan(plan)));
  }
}

/**
 * Canonicalize strict finite JSON bytes without semantic normalization.
 * @param input - Exact JSON bytes.
 * @returns Exact canonical JSON bytes.
 * @public
 */
export const canonicalize = (input: HostBytes): HostBytes => callHost(() => toHostBytes(canonicalizeMixedWasm(input)));
