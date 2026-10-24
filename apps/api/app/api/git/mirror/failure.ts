import { RepositoryStoreError } from '#api/git/store/errors.js';

/** `stage` on `tau.mirror.copy_failures` (W13 Finding 8). */
export type MirrorFailureStage = 'source_read' | 'verify' | 'dest_write' | 'retention' | 'watermark' | 'reconcile';

/** `reason` on `tau.mirror.copy_failures`; `other` keeps the label an enum. */
export type MirrorFailureReason = 'source_missing' | 'checksum' | 'http_4xx' | 'http_5xx' | 'timeout' | 'other';

/** A copy round that stopped, with where and why: the labels of the failure counter. */
export class MirrorFailure extends Error {
  // oxlint-disable-next-line max-params -- the two labels, then Error's own message and options
  public constructor(
    public readonly stage: MirrorFailureStage,
    public readonly reason: MirrorFailureReason,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'MirrorFailure';
  }
}

/** The reason an S3 or transport error stands for. */
export const reasonOf = (error: unknown): MirrorFailureReason => {
  if (error instanceof MirrorFailure) {
    return error.reason;
  }
  if (error instanceof RepositoryStoreError && error.code === 'missing-pack') {
    return 'source_missing';
  }
  const candidate = error as { name?: string; code?: string; $metadata?: { httpStatusCode?: number } } | undefined;
  const status = candidate?.$metadata?.httpStatusCode;
  if (status !== undefined) {
    return status >= 500 ? 'http_5xx' : status >= 400 ? 'http_4xx' : 'other';
  }
  if (candidate?.name === 'TimeoutError' || candidate?.name === 'AbortError' || candidate?.code === 'ETIMEDOUT') {
    return 'timeout';
  }
  return 'other';
};

/** Wraps any error as a {@link MirrorFailure} at `stage`, keeping one that already is. */
export const failAt = (stage: MirrorFailureStage, error: unknown): MirrorFailure =>
  error instanceof MirrorFailure
    ? error
    : new MirrorFailure(stage, reasonOf(error), error instanceof Error ? error.message : String(error), {
        cause: error,
      });
