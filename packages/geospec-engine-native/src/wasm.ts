// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves the generated in-package binding.
import initializeBinding, { Engine as WasmEngine, canonicalize as wasmCanonicalize } from '#wasm-binding';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves generated in-package types.
import type { InitInput } from '#wasm-binding';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { callHost, toHostBytes } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type { HostBytes, HostEngine } from '#host-types.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared protocol-error identity.
export { ProtocolError } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves an in-package public contract.
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared byte contract.
export type { HostBytes, HostEngine } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves in-package public contract types.

/** Input accepted by the generated wasm-bindgen initializer. @public */
export type WasmInput = InitInput | Promise<InitInput>;

/**
 * Initialize the portable GeoSpec WASM module.
 * @param input - Optional module or byte source accepted by wasm-bindgen.
 * @returns A promise resolved after initialization.
 * @public
 */
export const initialize = async (input?: WasmInput): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- wasm-bindgen defines this initializer field.
  const bindingInput = input === undefined ? undefined : { module_or_path: input };
  await initializeBinding(bindingInput);
};

/** Stateful browser/Node WASM facade over the portable GeoSpec core. @public */
export class Engine implements HostEngine {
  readonly #inner = new WasmEngine();

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
export const canonicalize = (input: HostBytes): HostBytes => callHost(() => toHostBytes(wasmCanonicalize(input)));
