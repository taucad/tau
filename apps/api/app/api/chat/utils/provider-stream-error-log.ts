import { isChatAbortError } from '#api/chat/utils/chat-abort.js';
import { decodeProviderErrorBody } from '#api/chat/utils/provider-error-decoder.js';

export type ProviderStreamFailureLogContext = {
  chatId: string;
  modelId: string;
  providerId: string | undefined;
};

type ProviderFailureLogger = {
  error: (payload: Record<string, unknown>, message: string) => void;
};

type ProviderStreamErrorLoggerOptions<T> = {
  abortSignal: AbortSignal;
  context: ProviderStreamFailureLogContext;
  logger: ProviderFailureLogger;
  stream: AsyncIterable<T>;
};

export const logProviderStreamFailure = (
  logger: ProviderFailureLogger,
  context: ProviderStreamFailureLogContext,
  error: unknown,
): void => {
  logger.error(
    {
      chatId: context.chatId,
      modelId: context.modelId,
      providerId: context.providerId,
      providerError: serializeProviderErrorForLog(error),
    },
    `Chat model stream failed for ${context.modelId}`,
  );
};

export async function* logProviderStreamErrors<T>(options: ProviderStreamErrorLoggerOptions<T>): AsyncGenerator<T> {
  const { abortSignal, context, logger, stream } = options;

  try {
    for await (const event of stream) {
      yield event;
    }
  } catch (error) {
    if (abortSignal.aborted && isChatAbortError(abortSignal.reason)) {
      return;
    }

    logProviderStreamFailure(logger, context, error);
    throw error;
  }
}

export const serializeProviderErrorForLog = (error: unknown): Record<string, unknown> => {
  const errorRecord = asRecord(error);
  const response = asRecord(errorRecord?.['response']);
  const responseData = response?.['data'];
  const nestedError = asRecord(asRecord(responseData)?.['error']);
  const decodedError = decodeProviderErrorBody(responseData ?? (error instanceof Error ? error.message : error));

  return {
    name: error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? truncateLogString(error.message) : sanitizeLogValue(error),
    code:
      readString(errorRecord, 'code') ??
      readString(nestedError, 'status') ??
      decodedError.providerCode ??
      readNumber(nestedError, 'code'),
    status:
      readNumber(errorRecord, 'status') ??
      readNumber(errorRecord, 'statusCode') ??
      readNumber(response, 'status') ??
      readNumber(response, 'statusCode') ??
      decodedError.httpStatus ??
      readNumber(nestedError, 'code'),
    providerStatus: readString(nestedError, 'status') ?? decodedError.providerStatus,
    statusText: readString(response, 'statusText'),
    providerMessage: readString(nestedError, 'message') ?? decodedError.providerMessage,
    providerReason: decodedError.providerReason,
    decodedBody: {
      bodyKind: decodedError.bodyKind,
      httpStatus: decodedError.httpStatus,
      providerCode: decodedError.providerCode,
      providerStatus: decodedError.providerStatus,
      providerMessage: decodedError.providerMessage,
      providerReason: decodedError.providerReason,
    },
    responseData: sanitizeLogValue(responseData),
  };
};

export const sanitizeLogValue = (value: unknown, depth = 0): unknown => {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return truncateLogString(value);
  }

  if (depth >= 6) {
    return '[truncated-depth]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeLogValue(item, depth + 1));
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'symbol') {
    return value.description ? `Symbol(${value.description})` : 'Symbol()';
  }

  if (typeof value === 'function') {
    return '[function]';
  }

  const record = asRecord(value);
  if (!record) {
    return `[${typeof value}]`;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (
      /(authorization|cookie|token|api[_-]?key|private[_-]?key|credential|secret)/i.test(key) ||
      /^(prompt|messages|contents|snapshot|toolarguments|tool_args|toolcalls|tool_calls)$/i.test(key)
    ) {
      sanitized[key] = '[redacted]';
      continue;
    }

    sanitized[key] = sanitizeLogValue(child, depth + 1);
  }

  return sanitized;
};

const truncateLogString = (value: string): string => {
  const maxLength = 8000;
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}...[truncated ${value.length - maxLength} chars]`
    : value;
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined;

const readString = (record: Record<string, unknown> | undefined, key: string): string | undefined => {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
};

const readNumber = (record: Record<string, unknown> | undefined, key: string): number | undefined => {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
};
