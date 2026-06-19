import { errorCategory, errorCategories } from '@taucad/types/constants';
import type { ErrorCategory, ChatError } from '@taucad/types';
import { errorCategoryTitles, httpStatusToCategory } from '@taucad/chat/utils';

type DecodedProviderError = {
  readonly httpStatus?: number;
  readonly code?: string;
  readonly message?: string;
};

const textDecoder = new TextDecoder();

/**
 * Client-side transport failure (request never reaches the API as structured JSON).
 * Mirrors AI SDK `Chat.makeRequest` disconnect classification in `ai` package
 * (`ai/src/ui/chat.ts`, TypeError branch: `fetch` / `network` substrings on the message).
 */
function isTransportError(error: Error): boolean {
  if (error instanceof TypeError) {
    const lowered = error.message.toLowerCase();
    if (lowered.includes('fetch') || lowered.includes('network')) {
      return true;
    }
  }

  const lowered = error.message.toLowerCase();
  return lowered.includes('load failed') || error.message.includes('net::ERR_');
}

/**
 * Parses a ChatError from JSON.
 * The API always sends errors in ChatError format, so we just parse and validate.
 */
function tryParseChatError(message: string): ChatError | undefined {
  if (!message.startsWith('{')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(message) as Record<string, unknown>;

    // Validate required fields
    if (
      typeof parsed['category'] === 'string' &&
      typeof parsed['title'] === 'string' &&
      typeof parsed['message'] === 'string'
    ) {
      // Validate category against known values, fallback to generic if unknown
      const parsedCategory = parsed['category'];
      const category: ErrorCategory = errorCategories.includes(parsedCategory as ErrorCategory)
        ? (parsedCategory as ErrorCategory)
        : errorCategory.generic;

      return {
        category,
        title: parsed['title'],
        message: parsed['message'],
        code: typeof parsed['code'] === 'string' ? parsed['code'] : undefined,
        httpStatus: typeof parsed['httpStatus'] === 'number' ? parsed['httpStatus'] : undefined,
        raw: typeof parsed['raw'] === 'string' ? parsed['raw'] : undefined,
        requestId: typeof parsed['requestId'] === 'string' ? parsed['requestId'] : undefined,
        helpUrl: typeof parsed['helpUrl'] === 'string' ? parsed['helpUrl'] : undefined,
      };
    }
  } catch {
    // Not valid JSON
  }

  return undefined;
}

function tryDecodeProviderError(message: string): DecodedProviderError | undefined {
  const trimmed = message.trim();
  const googlePrefix = /^google request failed with status code\s+(\d{3})(?::\s*([\S\s]*))?$/i.exec(trimmed);
  if (googlePrefix?.[1]) {
    const status = Number.parseInt(googlePrefix[1], 10);
    const body = googlePrefix[2];
    const decodedBody = body ? tryDecodeProviderError(body) : undefined;
    return {
      httpStatus: decodedBody?.httpStatus ?? status,
      code: decodedBody?.code,
      message: decodedBody?.message,
    };
  }

  const bytes = parseDecimalByteList(trimmed);
  if (bytes) {
    return tryDecodeProviderError(textDecoder.decode(bytes));
  }

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const errorRecord = getProviderErrorRecord(parsed);
    if (!errorRecord) {
      return undefined;
    }

    return {
      httpStatus: readNumber(errorRecord, 'code') ?? readNumber(errorRecord, 'status'),
      code:
        readString(errorRecord, 'status') ??
        readString(errorRecord, 'code') ??
        readNumber(errorRecord, 'code')?.toString(),
      message: readString(errorRecord, 'message'),
    };
  } catch {
    return undefined;
  }
}

function parseDecimalByteList(text: string): Uint8Array<ArrayBuffer> | undefined {
  if (!/^\s*\d{1,3}(?:\s*,\s*\d{1,3})+\s*$/.test(text)) {
    return undefined;
  }

  const values = text.split(',').map((part) => Number.parseInt(part.trim(), 10));
  if (!values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)) {
    return undefined;
  }

  return Uint8Array.from(values);
}

function getProviderErrorRecord(parsed: unknown): Record<string, unknown> | undefined {
  const first: unknown = Array.isArray(parsed) ? parsed[0] : parsed;
  const record = asRecord(first);
  if (!record) {
    return undefined;
  }

  const error = asRecord(record['error']);
  if (!error) {
    return record;
  }

  const nested = asRecord(error['error']);
  return nested ?? error;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' ? value : undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Parses an Error object into a ChatError for persistence.
 * This is used to store errors in the chat entity so they survive page reloads.
 *
 * The API always sends errors in ChatError format, so this function just:
 * 1. Handles client-side network errors (which never reach the API)
 * 2. Parses the structured ChatError from the API response
 * 3. Falls back to a generic error for unexpected formats
 */
export function parseErrorForPersistence(error: Error): ChatError {
  // Handle client-side network errors (these never reach the API)
  if (isTransportError(error)) {
    return {
      category: errorCategory.network,
      title: errorCategoryTitles[errorCategory.network],
      message: 'Unable to connect to the server. Please check your internet connection.',
      raw: error.message,
    };
  }

  // Parse structured ChatError from API
  const parsed = tryParseChatError(error.message);
  if (parsed) {
    return parsed;
  }

  const decodedProviderError = tryDecodeProviderError(error.message);
  if (decodedProviderError?.message) {
    const category = decodedProviderError.httpStatus
      ? httpStatusToCategory(decodedProviderError.httpStatus)
      : errorCategory.generic;
    return {
      category,
      title: errorCategoryTitles[category],
      message: decodedProviderError.message,
      code: decodedProviderError.code,
      httpStatus: decodedProviderError.httpStatus,
      raw: error.message,
    };
  }

  // Fallback for unexpected formats
  return {
    category: errorCategory.generic,
    title: errorCategoryTitles[errorCategory.generic],
    message: error.message,
    raw: error.message,
  };
}
