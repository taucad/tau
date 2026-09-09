import { Engine as NativeEngine, canonicalize as nativeCanonicalize } from '#native-binding';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves an in-package module.
import { ProtocolError as HostProtocolError, callHost, toHostBytes } from '#host-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import resolves in-package contract types.
import type { HostBytes, HostEngine, HostSubjectLifecycle } from '#host-types.js';

// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared protocol-error identity.
export { ProtocolError } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves an in-package public contract.
// oxlint-disable-next-line no-barrel-files/no-barrel-files -- The host facade exposes the shared byte contract.
export type { HostBytes, HostEngine, HostSubjectLifecycle } from '#host-types.js'; // eslint-disable-line import-x/no-extraneous-dependencies -- Package import resolves in-package public contract types.

const buffer = (value: unknown) => {
  if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer)) {
    throw new HostProtocolError('invalid-request', 'Host input must use an ordinary ArrayBuffer.');
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
};

/** Stateful Node N-API facade over the configured native GeoSpec engine. @public */
export class Engine implements HostEngine, HostSubjectLifecycle {
  readonly #inner = new NativeEngine();

  /**
   * Transfer one subject and its ordered external resource buffers.
   * @param request - Metadata-only control bytes.
   * @param primary - Primary geometry bytes.
   * @param resources - Ordered resource buffers declared by the request.
   * @returns Exact admission response bytes.
   */
  public ingestSubject(request: HostBytes, primary: HostBytes, resources: readonly HostBytes[]): HostBytes {
    return callHost(() =>
      toHostBytes(
        this.#inner.ingestSubject(
          buffer(request),
          buffer(primary),
          resources.map((resource) => buffer(resource)),
        ),
      ),
    );
  }

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
   * Acquire the stable owner/generation token for one admitted subject.
   * @param request - Exact subject identity control bytes.
   * @returns Exact subject-handle response bytes.
   */
  public subjectHandle(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.subjectHandle(buffer(request))));
  }

  /**
   * Release one generation-checked subject and its retained analysis.
   * @param request - Exact release control bytes containing the subject handle.
   * @returns Exact release response bytes.
   */
  public releaseSubject(request: HostBytes): HostBytes {
    return callHost(() => toHostBytes(this.#inner.releaseSubject(buffer(request))));
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
