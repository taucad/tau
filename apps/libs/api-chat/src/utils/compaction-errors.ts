import { z } from 'zod';

export const compactionFailureKindSchema = z.enum([
  'transcript_commit_failed',
  'context_overflow_retry_failed',
  'circuit_breaker_open',
  'summarization_failed',
  'state_update_failed',
  'unexpected_error',
]);

export type CompactionFailureKind = z.infer<typeof compactionFailureKindSchema>;

export type CompactionFailureDisposition = 'blocked_before_provider';

export const compactionFailureDisposition: Record<'blockedBeforeProvider', CompactionFailureDisposition> = {
  blockedBeforeProvider: 'blocked_before_provider',
};

const compactionFailureKindCarrierSchema = z.looseObject({
  failureKind: compactionFailureKindSchema,
});

const compactionPipelineErrorRecordSchema = z.looseObject({
  code: z.literal('CONTEXT_COMPACTION_FAILED'),
  failureKind: compactionFailureKindSchema,
  failureDisposition: z.literal(compactionFailureDisposition.blockedBeforeProvider),
});

type CompactionErrorOptions = {
  readonly cause?: unknown;
  readonly debugId?: string;
};

export class CompactionPipelineError extends Error {
  public readonly debugId?: string;

  public get code(): 'CONTEXT_COMPACTION_FAILED' {
    return 'CONTEXT_COMPACTION_FAILED';
  }
  public readonly failureDisposition = compactionFailureDisposition.blockedBeforeProvider;
  public override readonly cause?: unknown;

  public constructor(
    message: string,
    public readonly failureKind: CompactionFailureKind,
    options: CompactionErrorOptions = {},
  ) {
    super(
      [
        `CONTEXT_COMPACTION_FAILED: ${message}`,
        `failureKind=${failureKind}`,
        `failureDisposition=${compactionFailureDisposition.blockedBeforeProvider}`,
        options.debugId ? `debugId=${options.debugId}` : undefined,
      ]
        .filter((entry): entry is string => entry !== undefined)
        .join(' '),
    );
    this.name = 'CompactionPipelineError';
    this.cause = options.cause;
    this.debugId = options.debugId;
  }
}

export function compactionFailureKindForError(error: unknown): CompactionFailureKind {
  if (isCompactionFailureKindCarrier(error)) {
    return error.failureKind;
  }
  return 'unexpected_error';
}

export function isCompactionPipelineError(error: unknown): error is CompactionPipelineError {
  return error instanceof CompactionPipelineError || isCompactionPipelineErrorRecord(error);
}

function isCompactionFailureKindCarrier(error: unknown): error is { failureKind: CompactionFailureKind } {
  return compactionFailureKindCarrierSchema.safeParse(error).success;
}

function isCompactionPipelineErrorRecord(error: unknown): error is {
  code: 'CONTEXT_COMPACTION_FAILED';
  failureKind: CompactionFailureKind;
  failureDisposition: CompactionFailureDisposition;
  debugId?: string;
} {
  return compactionPipelineErrorRecordSchema.safeParse(error).success;
}
