/**
 * How a compute call fails when the worker, not the work, failed. Kept apart
 * from the contract so the pack reader can tell a crash from corrupt bytes
 * without importing the work itself.
 *
 * @module
 */

/**
 * The work a compute worker answers, by name (the keys of `ComputeWorker`).
 *
 * @public
 */
export type ComputeMethod =
  | 'inflate'
  | 'deflate'
  | 'sha1'
  | 'sha256'
  | 'sha256Kept'
  | 'indexPack'
  | 'resolveDelta'
  | 'decodeImportEntry'
  | 'measureImportBytes';

/** Why a call to a compute worker failed without the work itself refusing. */
export type ComputeWorkerFailure = 'crashed' | 'unavailable';

/**
 * A compute call that failed because its worker died, or because the
 * supervisor stopped restarting it. Never a `TypeError`: the bytes were not
 * judged, so nothing is dropped as corrupt because of it.
 * @public
 */
export class ComputeWorkerCrashedError extends Error {
  public override readonly name = 'ComputeWorkerCrashedError';

  /** `crashed` for a worker that died while it held the call; `unavailable` once restarts stopped. */
  public readonly failure: ComputeWorkerFailure;

  /** The call that failed. */
  public readonly method: ComputeMethod;

  /**
   * Name the call that failed, and why.
   *
   * @param failure - Why the call failed.
   * @param method - The call that failed.
   * @param options - The worker's own error event, when it gave one.
   */
  public constructor(failure: ComputeWorkerFailure, method: ComputeMethod, options?: ErrorOptions) {
    super(
      failure === 'crashed'
        ? `The compute worker stopped during ${method}; it is being restarted.`
        : `The compute worker is unavailable for ${method}: it crashed too often and is no longer restarted.`,
      options,
    );
    this.failure = failure;
    this.method = method;
  }
}

/**
 * Whether an error is a compute worker's own failure rather than a verdict on the bytes.
 *
 * @param error - Anything a compute call rejected with.
 * @returns `true` for a crash or an unavailable worker.
 * @public
 */
export const isComputeWorkerFailure = (error: unknown): error is ComputeWorkerCrashedError =>
  error instanceof ComputeWorkerCrashedError;

/**
 * A verdict on the bytes: they are not a zlib stream, a delta that applies, or
 * a pack that indexes. Marked where the verdict is made, and the only failure
 * that crosses the seam as one, so a store drops a pack for this and never for
 * a worker's own trouble (an allocation that failed, a crash).
 *
 * @public
 */
export class CorruptBytesError extends TypeError {
  public override readonly name = 'CorruptBytesError';
}
