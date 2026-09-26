// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { callHost, toHostClaimEvaluation } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type { HostBytes, HostClaimEvaluation, HostEngine, HostSubjectLifecycle } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { MixedWasmBinding, canonicalizeMixedWasm, initializeMixedWasm } from '#mixed-wasm-loader.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type {
  WasmExecution as MixedWasmExecution,
  WasmInput as MixedWasmInput,
  WasmResources as MixedWasmResources,
} from '#mixed-wasm-loader.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared protocol-error identity.
export { ProtocolError } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves an in-package public contract.
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared byte contract.
export type { HostBytes, HostClaimEvaluation, HostEngine, HostSubjectLifecycle } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves in-package public contract types.

/** Input accepted by the compiled Emscripten module. @public */
export type WasmInput = MixedWasmInput;
/** Ordered external binary resources paired with request metadata. @public */
export type WasmResources = MixedWasmResources;
/** Explicit single-threaded or MT WASM product selection. @public */
export type WasmExecution = MixedWasmExecution;

/**
 * Initialize the compiled GeoSpec WASM module.
 * @param input - Optional module byte source or artifact location.
 * @param execution - Explicit ST or MT product selection.
 * @returns A promise resolved after initialization.
 * @public
 */
export const initialize = async (input?: WasmInput, execution?: WasmExecution): Promise<void> => {
  await initializeMixedWasm(input, execution);
};

/** Stateful browser/Node facade over the compiled GeoSpec engine. @public */
export class Engine implements HostEngine, HostSubjectLifecycle {
  readonly #inner: MixedWasmBinding;

  /**
   * Construct an engine from the selected initialized WASM product.
   * @param execution - Explicit ST or MT product selection.
   */
  public constructor(execution?: WasmExecution) {
    this.#inner = new MixedWasmBinding(execution);
  }

  /**
   * Read cumulative observations outside canonical geometry results.
   * @returns Owned diagnostic bytes; snapshot traffic does not count itself.
   */
  public observations(): HostBytes {
    return callHost(() => this.#inner.observations());
  }

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
    return callHost(() => this.#inner.ingestMesh(request, mesh));
  }

  /**
   * Admit one full-format subject and its ordered external resources.
   * @param request - Metadata-only exact request bytes.
   * @param primary - Exact primary subject bytes.
   * @param resources - Exact resource buffers in request metadata order.
   * @returns Exact response bytes.
   */
  public ingestSubject(request: HostBytes, primary: HostBytes, resources: WasmResources): HostBytes {
    return callHost(() => this.#inner.ingestSubject(request, primary, resources));
  }

  /**
   * Acquire the stable owner/generation token for one admitted subject.
   * @param request - Exact subject identity control bytes.
   * @returns Exact subject-handle response bytes.
   */
  public subjectHandle(request: HostBytes): HostBytes {
    return callHost(() => this.#inner.subjectHandle(request));
  }

  /**
   * Release one generation-checked subject and its retained analysis.
   * @param request - Exact release control bytes containing the subject handle.
   * @returns Exact release response bytes.
   */
  public releaseSubject(request: HostBytes): HostBytes {
    return callHost(() => this.#inner.releaseSubject(request));
  }

  /**
   * Process one request against admitted meshes.
   * @param request - Exact request bytes.
   * @returns Exact response bytes.
   */
  public processRequest(request: HostBytes): HostBytes {
    return callHost(() => this.#inner.processRequest(request));
  }

  /**
   * Produce the canonical plan for one request.
   * @param request - Exact request bytes.
   * @returns Exact plan bytes.
   */
  public canonicalPlan(request: HostBytes): HostBytes {
    return callHost(() => this.#inner.canonicalPlan(request));
  }

  /**
   * Evaluate one canonical plan.
   * @param plan - Exact plan bytes.
   * @returns Exact response bytes.
   */
  public evaluatePlan(plan: HostBytes): HostBytes {
    return callHost(() => this.#inner.evaluatePlan(plan));
  }

  /**
   * Canonicalize and evaluate a one-claim request in one engine call.
   * @param request - Exact submitClaims request bytes with exactly one claim.
   * @returns Views of the exact canonical plan, claim and result bytes over one host copy.
   */
  public evaluateClaim(request: HostBytes): HostClaimEvaluation {
    return toHostClaimEvaluation(callHost(() => this.#inner.evaluateClaim(request)));
  }
}

/**
 * Canonicalize strict finite JSON bytes without semantic normalization through any initialized ST or MT product.
 * @param input - Exact JSON bytes.
 * @returns Exact canonical JSON bytes.
 * @public
 */
export const canonicalize = (input: HostBytes): HostBytes => callHost(() => canonicalizeMixedWasm(input));
