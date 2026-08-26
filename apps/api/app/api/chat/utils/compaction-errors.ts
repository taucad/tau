export type CompactionFailureKind =
  | 'morph_transport_error'
  | 'morph_http_error'
  | 'morph_contract_error'
  | 'transcript_commit_failed'
  | 'context_overflow_retry_failed'
  | 'unexpected_error';

export type CompactionFailureDisposition = 'blocked_before_provider';

export const compactionFailureDisposition: Record<
  Uppercase<CompactionFailureDisposition>,
  CompactionFailureDisposition
> = {
  BLOCKED_BEFORE_PROVIDER: 'blocked_before_provider',
};

type CompactionErrorOptions = {
  readonly cause?: unknown;
  readonly debugId?: string;
};

export class CompactionPipelineError extends Error {
  public readonly code = 'CONTEXT_COMPACTION_FAILED';
  public readonly failureDisposition = compactionFailureDisposition.BLOCKED_BEFORE_PROVIDER;
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
        `failureDisposition=${compactionFailureDisposition.BLOCKED_BEFORE_PROVIDER}`,
        options.debugId ? `debugId=${options.debugId}` : undefined,
      ]
        .filter((entry): entry is string => entry !== undefined)
        .join(' '),
    );
    this.name = 'CompactionPipelineError';
    this.cause = options.cause;
    this.debugId = options.debugId;
  }

  public readonly debugId?: string;
}

export class MorphCompactionTransportError extends Error {
  public readonly failureKind = 'morph_transport_error' satisfies CompactionFailureKind;
  public override readonly cause?: unknown;

  public constructor(message: string, options: { readonly cause?: unknown } = {}) {
    super(message);
    this.name = 'MorphCompactionTransportError';
    this.cause = options.cause;
  }
}

export class MorphCompactionHttpError extends Error {
  public readonly failureKind = 'morph_http_error' satisfies CompactionFailureKind;

  public constructor(
    public readonly status: number,
    public readonly responseBody: string,
  ) {
    super(`Morph compaction failed with HTTP ${status}`);
    this.name = 'MorphCompactionHttpError';
  }
}

export class MorphCompactionContractError extends Error {
  public readonly failureKind = 'morph_contract_error' satisfies CompactionFailureKind;

  public constructor(message: string) {
    super(message);
    this.name = 'MorphCompactionContractError';
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
  if (!isRecord(error)) {
    return false;
  }
  return isCompactionFailureKind(error['failureKind']);
}

function isCompactionPipelineErrorRecord(error: unknown): error is {
  code: 'CONTEXT_COMPACTION_FAILED';
  failureKind: CompactionFailureKind;
  failureDisposition: CompactionFailureDisposition;
  debugId?: string;
} {
  if (!isRecord(error)) {
    return false;
  }
  return (
    error['code'] === 'CONTEXT_COMPACTION_FAILED' &&
    isCompactionFailureKind(error['failureKind']) &&
    error['failureDisposition'] === compactionFailureDisposition.BLOCKED_BEFORE_PROVIDER
  );
}

function isCompactionFailureKind(value: unknown): value is CompactionFailureKind {
  return (
    value === 'morph_transport_error' ||
    value === 'morph_http_error' ||
    value === 'morph_contract_error' ||
    value === 'transcript_commit_failed' ||
    value === 'context_overflow_retry_failed' ||
    value === 'unexpected_error'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
