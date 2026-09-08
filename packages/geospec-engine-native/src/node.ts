import { Engine as NativeEngine, canonicalize as nativeCanonicalize } from '#native-binding';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { ProtocolError as HostProtocolError, callHost, toHostBytes } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type { HostBytes, HostEngine } from '#host-types.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared protocol-error identity.
export { ProtocolError } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves an in-package public contract.
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared byte contract.
export type { HostBytes, HostEngine } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves in-package public contract types.

const buffer = (value: unknown) => {
  if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer)) {
    throw new HostProtocolError('invalid-request', 'Host input must use an ordinary ArrayBuffer.');
  }
  return Buffer.from(value);
};

/** Stateful Node N-API facade over the portable GeoSpec core. @public */
export class Engine implements HostEngine {
  readonly #inner = new NativeEngine();

  /**
   * Admit one mesh into this engine instance.
   * @param request - Exact request bytes.
   * @param mesh - Exact mesh payload bytes.
   * @returns Exact response bytes.
   */
  public ingestMesh(request: HostBytes, mesh: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.ingestMesh(buffer(request), buffer(mesh))));
  }

  /**
   * Process one request against admitted meshes.
   * @param request - Exact request bytes.
   * @returns Exact response bytes.
   */
  public processRequest(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.processRequest(buffer(request))));
  }

  /**
   * Produce the canonical plan for one request.
   * @param request - Exact request bytes.
   * @returns Exact plan bytes.
   */
  public canonicalPlan(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.canonicalPlan(buffer(request))));
  }

  /**
   * Evaluate one canonical plan.
   * @param plan - Exact plan bytes.
   * @returns Exact response bytes.
   */
  public evaluatePlan(plan: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.evaluatePlan(buffer(plan))));
  }
}

/**
 * Canonicalize strict finite JSON bytes without semantic normalization.
 * @param input - Exact JSON bytes.
 * @returns Exact canonical JSON bytes.
 * @public
 */
export const canonicalize = (input: HostBytes): HostBytes =>
  callHost(() => toHostBytes(nativeCanonicalize(buffer(input))));
