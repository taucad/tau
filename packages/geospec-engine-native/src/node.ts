import { Engine as NativeEngine, canonicalize as nativeCanonicalize } from '#native-binding';
import { availableParallelism } from 'node:os';
import {
  ProtocolError as HostProtocolError,
  appendHostObservationCopies,
  observeHostCopy,
  callHost,
  toHostBytes,
  toHostClaimEvaluation,
} from '#host-types.js';
import type {
  HostBytes,
  HostCacheLifecycle,
  HostCacheOptions,
  HostClaimEvaluation,
  HostEngine,
  HostSubjectLifecycle,
} from '#host-types.js';

// oxlint-disable no-barrel-files/no-barrel-files -- The host facade exposes its shared public contracts.
export { ProtocolError } from '#host-types.js';
export type {
  HostBytes,
  HostCacheLifecycle,
  HostCacheOptions,
  HostClaimEvaluation,
  HostEngine,
  HostSubjectLifecycle,
} from '#host-types.js';
// oxlint-enable no-barrel-files/no-barrel-files

const buffer = (value: unknown) => {
  if (!(value instanceof Uint8Array) || !(value.buffer instanceof ArrayBuffer)) {
    throw new HostProtocolError('invalid-request', 'Host input must use an ordinary ArrayBuffer.');
  }
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
};

/** Stateful Node N-API facade over the configured native GeoSpec engine. @public */
export class Engine implements HostEngine, HostSubjectLifecycle, HostCacheLifecycle {
  #inner: NativeEngine | undefined;
  readonly #copies = { exact: true, inputCopies: 0n, inputBytes: 0n, outputCopies: 0n, outputBytes: 0n };

  /**
   * Create a resident-only engine or opt into authenticated filesystem cache storage.
   * @param cacheOptions - Optional authenticated cache location.
   * @param executionPermits - Caller-inclusive CPU allocation; defaults to one.
   */
  public constructor(cacheOptions?: HostCacheOptions, executionPermits?: number) {
    if (
      executionPermits !== undefined &&
      (!Number.isSafeInteger(executionPermits) || executionPermits < 1 || executionPermits > availableParallelism())
    ) {
      throw new HostProtocolError(
        'invalid-request',
        'Execution permits must be a positive integer including the caller and within the host cap.',
      );
    }
    if (executionPermits === undefined) {
      this.#inner = cacheOptions === undefined ? new NativeEngine() : new NativeEngine(cacheOptions);
    } else {
      this.#inner = new NativeEngine(cacheOptions, executionPermits);
    }
  }

  /** Release the retained native engine and authenticated cache. */
  public close(): void {
    const inner = this.#inner;
    this.#inner = undefined;
    inner?.close();
  }

  /**
   * Transfer one subject and its ordered external resource buffers.
   * @param request - Metadata-only control bytes.
   * @param primary - Primary geometry bytes.
   * @param resources - Ordered resource buffers declared by the request.
   * @returns Exact admission response bytes.
   */
  public ingestSubject(request: HostBytes, primary: HostBytes, resources: readonly HostBytes[]): HostBytes {
    return callHost(() =>
      this.output(
        this.inner().ingestSubject(
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
    return callHost(() => this.output(this.inner().ingestMesh(buffer(request), buffer(mesh))));
  }

  /**
   * Acquire the stable owner/generation token for one admitted subject.
   * @param request - Exact subject identity control bytes.
   * @returns Exact subject-handle response bytes.
   */
  public subjectHandle(request: HostBytes): HostBytes {
    return callHost(() => this.output(this.inner().subjectHandle(buffer(request))));
  }

  /**
   * Release one generation-checked subject and its retained analysis.
   * @param request - Exact release control bytes containing the subject handle.
   * @returns Exact release response bytes.
   */
  public releaseSubject(request: HostBytes): HostBytes {
    return callHost(() => this.output(this.inner().releaseSubject(buffer(request))));
  }

  /**
   * Process one request against admitted meshes.
   * @param request - Exact request bytes.
   * @returns Exact response bytes.
   */
  public processRequest(request: HostBytes): HostBytes {
    return callHost(() => this.output(this.inner().processRequest(buffer(request))));
  }

  /**
   * Produce the canonical plan for one request.
   * @param request - Exact request bytes.
   * @returns Exact plan bytes.
   */
  public canonicalPlan(request: HostBytes): HostBytes {
    return callHost(() => this.output(this.inner().canonicalPlan(buffer(request))));
  }

  /**
   * Evaluate one canonical plan.
   * @param plan - Exact plan bytes.
   * @returns Exact response bytes.
   */
  public evaluatePlan(plan: HostBytes): HostBytes {
    return callHost(() => this.output(this.inner().evaluatePlan(buffer(plan))));
  }

  /**
   * Canonicalize and evaluate a one-claim request in one engine call.
   * @param request - Exact submitClaims request bytes with exactly one claim.
   * @returns Views of the exact canonical plan, claim and result bytes over one host copy.
   */
  public evaluateClaim(request: HostBytes): HostClaimEvaluation {
    return toHostClaimEvaluation(callHost(() => this.output(this.inner().evaluateClaim(buffer(request)))));
  }

  /**
   * Seal cache publication and return stable canonical diagnostics.
   * @returns Canonical cache diagnostics bytes.
   */
  public flushCache(): HostBytes {
    return callHost(() => toHostBytes(this.inner().flushCache()));
  }

  /**
   * Remove authenticated overlap (B48) actions from the managed cache generation.
   * Exact-cluster and legacy-root records remain available.
   * @returns Whether the optional cache accepted and completed the clear.
   */
  public clearOverlapCache(): boolean {
    return this.inner().clearOverlapCache();
  }

  /**
   * Return the common core/CSG/BRep build identity.
   * @returns Canonical producer identity bytes.
   */
  public cacheProducerIdentity(): HostBytes {
    return callHost(() => toHostBytes(this.inner().cacheProducerIdentity()));
  }

  /**
   * Return a non-mutating cumulative snapshot; this copy does not observe itself.
   * @returns Owned cumulative diagnostic bytes.
   */
  public observations(): HostBytes {
    return appendHostObservationCopies(toHostBytes(this.inner().observations()), this.#copies);
  }

  private output(value: unknown): HostBytes {
    const bytes = toHostBytes(value);
    observeHostCopy(this.#copies, 'output', bytes.byteLength);
    return bytes;
  }

  private inner(): NativeEngine {
    if (this.#inner === undefined) {
      throw new HostProtocolError('invalid-request', 'GeoSpec Node engine is closed.');
    }
    return this.#inner;
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
