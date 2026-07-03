/**
 * Error normalizer for LangGraph, LangChain, and LLM provider errors.
 * Converts various error formats into a structured JSON format for the UI.
 */

import { errorCategory } from '@taucad/types/constants';
import type { ErrorCategory, ChatError } from '@taucad/types';
import { httpStatusToCategory, errorCategoryTitles } from '@taucad/chat/utils';
import { decodeProviderErrorBody } from '#api/chat/utils/provider-error-decoder.js';
import { isCompactionPipelineError } from '#api/chat/utils/compaction-errors.js';

/**
 * LangChain error codes that may be present on wrapped errors.
 */
type LangChainErrorCode =
  | 'INVALID_PROMPT_INPUT'
  | 'INVALID_TOOL_RESULTS'
  | 'MESSAGE_COERCION_FAILURE'
  | 'MODEL_AUTHENTICATION'
  | 'MODEL_NOT_FOUND'
  | 'MODEL_RATE_LIMIT'
  | 'OUTPUT_PARSING_FAILURE'
  | 'GRAPH_RECURSION_LIMIT'
  | 'INVALID_CHAT_HISTORY'
  | 'INVALID_CONCURRENT_GRAPH_UPDATE'
  | 'INVALID_GRAPH_NODE_RETURN_VALUE'
  | 'MISSING_CHECKPOINTER'
  | 'MULTIPLE_SUBGRAPHS'
  | 'UNREACHABLE_NODE';

/**
 * Maps LangChain error codes to user-friendly categories.
 */
/* eslint-disable @typescript-eslint/naming-convention -- LangChain error codes use SCREAMING_SNAKE_CASE */
const langChainCodeToCategory: Record<LangChainErrorCode, ErrorCategory> = {
  INVALID_PROMPT_INPUT: errorCategory.toolError,
  INVALID_TOOL_RESULTS: errorCategory.toolError,
  MESSAGE_COERCION_FAILURE: errorCategory.toolError,
  MODEL_AUTHENTICATION: errorCategory.auth,
  MODEL_NOT_FOUND: errorCategory.server,
  MODEL_RATE_LIMIT: errorCategory.rateLimit,
  OUTPUT_PARSING_FAILURE: errorCategory.toolError,
  GRAPH_RECURSION_LIMIT: errorCategory.server,
  INVALID_CHAT_HISTORY: errorCategory.toolError,
  INVALID_CONCURRENT_GRAPH_UPDATE: errorCategory.toolError,
  INVALID_GRAPH_NODE_RETURN_VALUE: errorCategory.toolError,
  MISSING_CHECKPOINTER: errorCategory.server,
  MULTIPLE_SUBGRAPHS: errorCategory.server,
  UNREACHABLE_NODE: errorCategory.server,
};
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after SCREAMING_SNAKE_CASE section */

/**
 * Checks if error has a status property (Anthropic/OpenAI SDK errors).
 */
function hasStatus(error: unknown): error is { status: number } {
  return typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number';
}

/**
 * Checks if error has a requestID property (Anthropic SDK errors).
 */
function hasRequestId(
  error: unknown,
): error is { requestID: string } | { request_id: string } | { error: { request_id: string } } {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  if ('requestID' in error && typeof error.requestID === 'string') {
    return true;
  }

  if ('request_id' in error && typeof error.request_id === 'string') {
    return true;
  }

  if (
    'error' in error &&
    typeof error.error === 'object' &&
    error.error !== null &&
    'request_id' in error.error &&
    typeof error.error.request_id === 'string'
  ) {
    return true;
  }

  return false;
}

/**
 * Extracts requestId from error.
 */
function extractRequestId(error: unknown): string | undefined {
  if (!hasRequestId(error)) {
    return undefined;
  }

  // The hasRequestId type guard ensures one of these properties exists
  const errorObject = error as Record<string, unknown>;

  if ('requestID' in error && typeof errorObject['requestID'] === 'string') {
    return errorObject['requestID'];
  }

  if ('request_id' in error && typeof errorObject['request_id'] === 'string') {
    return errorObject['request_id'];
  }

  const nestedError = errorObject['error'] as Record<string, unknown> | undefined;
  if (nestedError && typeof nestedError['request_id'] === 'string') {
    return nestedError['request_id'];
  }

  return undefined;
}

/**
 * Extracts the nested Anthropic error message from LangChain-wrapped errors.
 * LangChain wraps Anthropic errors with structure: error.error = { type, error: { type, message }, request_id }
 */
function extractNestedAnthropicMessage(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const errorRecord = error as Record<string, unknown>;

  // Check for error.error.error.message (LangChain wrapped Anthropic structure)
  if ('error' in errorRecord && typeof errorRecord['error'] === 'object' && errorRecord['error'] !== null) {
    const outerError = errorRecord['error'] as Record<string, unknown>;

    if ('error' in outerError && typeof outerError['error'] === 'object' && outerError['error'] !== null) {
      const innerError = outerError['error'] as Record<string, unknown>;

      if (typeof innerError['message'] === 'string') {
        return innerError['message'];
      }
    }

    // Also check error.error.message directly
    if (typeof outerError['message'] === 'string') {
      return outerError['message'];
    }
  }

  return undefined;
}

/**
 * Extracts help/troubleshooting URL from error message.
 * LangChain appends "Troubleshooting URL: https://..." to error messages.
 */
function extractHelpUrl(message: string): string | undefined {
  const match = /troubleshooting url:\s*(https?:\/\/\S+)/i.exec(message);
  return match?.[1]?.replace(/[!),.:;>?\]}]+$/, ''); // Strip trailing punctuation
}

/**
 * Checks if error has a LangChain error code.
 */
function hasLcErrorCode(error: unknown): error is { lc_error_code: string } {
  return typeof error === 'object' && error !== null && 'lc_error_code' in error;
}

/**
 * Attempts to parse JSON from error message, handling various formats.
 */
function parseJsonFromMessage(message: string): {
  parsed: Record<string, unknown> | undefined;
  statusPrefix?: number;
} {
  // Handle "400 {...}" format
  const statusPrefixMatch = /^(\d{3})\s+({.+})$/s.exec(message);
  if (statusPrefixMatch?.[1] && statusPrefixMatch[2]) {
    try {
      const parsed = JSON.parse(statusPrefixMatch[2]) as Record<string, unknown>;
      return { parsed, statusPrefix: Number.parseInt(statusPrefixMatch[1], 10) };
    } catch {
      // Fall through
    }
  }

  // Try direct JSON parsing
  if (message.startsWith('{')) {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      return { parsed };
    } catch {
      // Fall through
    }
  }

  return { parsed: undefined };
}

/**
 * Checks if an error is an abort error (from AbortController).
 */
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    // Standard AbortError name used by AbortController
    if (error.name === 'AbortError') {
      return true;
    }

    // LangGraph/LangChain may wrap abort errors with specific messages
    const lowerMessage = error.message.toLowerCase();
    if (lowerMessage.includes('aborted') || lowerMessage.includes('abort')) {
      return true;
    }
  }

  return false;
}

function extractRegexGroup(message: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(message);
  return match?.[1];
}

function normalizeTauImplementationBugError(
  error: unknown,
  rawMessage: string,
): Pick<ChatError, 'category' | 'code' | 'message' | 'raw'> | undefined {
  if (isCompactionPipelineError(error)) {
    const details = [
      `Context compaction failed before provider dispatch.`,
      `Failure kind: ${error.failureKind}.`,
      `Failure disposition: ${error.failureDisposition}.`,
      error.debugId ? `Debug ID: ${error.debugId}.` : undefined,
    ].filter((entry): entry is string => entry !== undefined);
    return {
      category: errorCategory.toolError,
      code: error.code,
      message: details.join(' '),
      raw: rawMessage,
    };
  }

  if (rawMessage.includes('CONTEXT_COMPACTION_FAILED')) {
    const failureKind = extractRegexGroup(rawMessage, /failureKind=([_a-z]+)/);
    const failureDisposition = extractRegexGroup(rawMessage, /failureDisposition=([_a-z]+)/);
    const debugId = extractRegexGroup(rawMessage, /debugId=([\w-]+)/);
    const details = [
      `Context compaction failed before provider dispatch.`,
      failureKind ? `Failure kind: ${failureKind}.` : undefined,
      failureDisposition ? `Failure disposition: ${failureDisposition}.` : undefined,
      debugId ? `Debug ID: ${debugId}.` : undefined,
    ].filter((entry): entry is string => entry !== undefined);
    return {
      category: errorCategory.toolError,
      code: 'CONTEXT_COMPACTION_FAILED',
      message: details.join(' '),
      raw: rawMessage,
    };
  }

  return undefined;
}

/**
 * Detects specific error patterns in message text.
 */
function detectPatternCategory(message: string): ErrorCategory | undefined {
  const lowerMessage = message.toLowerCase();

  // Abort/cancelled patterns (check first as they're explicit user actions)
  if (lowerMessage.includes('aborted') || lowerMessage.includes('abort')) {
    return errorCategory.cancelled;
  }

  // Tool use without tool result pattern
  if (lowerMessage.includes('tool_use') && lowerMessage.includes('tool_result')) {
    return errorCategory.toolError;
  }

  // Credit/billing patterns
  if (
    lowerMessage.includes('credit') ||
    lowerMessage.includes('billing') ||
    lowerMessage.includes('payment') ||
    lowerMessage.includes('subscription') ||
    lowerMessage.includes('quota exceeded')
  ) {
    return errorCategory.credits;
  }

  // Overloaded patterns
  if (lowerMessage.includes('overloaded') || lowerMessage.includes('capacity') || lowerMessage.includes('too busy')) {
    return errorCategory.overloaded;
  }

  // Rate limit patterns
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return errorCategory.rateLimit;
  }

  // Authentication patterns
  if (
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('api key')
  ) {
    return errorCategory.auth;
  }

  return undefined;
}

/**
 * Normalizes an error into a structured format for the UI.
 *
 * Detection priority:
 * 0. Abort errors (explicit user cancellation - checked first)
 * 1. LangChain/LangGraph error codes (lc_error_code property)
 * 2. HTTP status codes (SDK error classes)
 * 3. JSON parsing from error message
 * 4. Billing pattern override on extracted provider message
 * 5. Generic-only pattern matching on message text
 * 6. Generic fallback
 */
// oxlint-disable-next-line eslint/complexity -- multi-layer error normalization requires sequential checks
export function normalizeError(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const decodedProviderError = decodeProviderErrorBody(rawMessage);
  let category: ErrorCategory = errorCategory.generic;
  let code: string | undefined;
  let httpStatus: number | undefined;
  let message = rawMessage;
  let requestId: string | undefined;

  // Extract help URL from raw message (LangChain appends troubleshooting URLs)
  const helpUrl = extractHelpUrl(rawMessage);

  // 0. Check for abort errors first (explicit user cancellation)
  if (isAbortError(error)) {
    category = errorCategory.cancelled;
  }

  const tauImplementationBugError = normalizeTauImplementationBugError(error, rawMessage);
  if (tauImplementationBugError && category !== errorCategory.cancelled) {
    category = tauImplementationBugError.category;
    code = tauImplementationBugError.code;
    message = tauImplementationBugError.message;
  }

  // 1. Check for LangChain error codes
  if (category === errorCategory.generic && hasLcErrorCode(error)) {
    const lcCode = error.lc_error_code as LangChainErrorCode;
    if (lcCode in langChainCodeToCategory) {
      category = langChainCodeToCategory[lcCode];
      code = lcCode;
    }
  }

  // 2. Check for HTTP status (SDK errors)
  if (hasStatus(error)) {
    httpStatus = error.status;
    // Only override category if we don't have a more specific LangChain code
    if (category === errorCategory.generic) {
      category = httpStatusToCategory(error.status);
    }
  }

  if (decodedProviderError.httpStatus && !httpStatus) {
    httpStatus = decodedProviderError.httpStatus;
    if (category === errorCategory.generic) {
      category = httpStatusToCategory(decodedProviderError.httpStatus);
    }
  }

  // Extract request ID
  requestId = extractRequestId(error);

  // 2.5. Try to extract message from nested Anthropic error structure on the error object
  // LangChain wraps Anthropic errors with: error.error = { type, error: { type, message }, request_id }
  const nestedMessage = extractNestedAnthropicMessage(error);
  if (nestedMessage) {
    message = nestedMessage;
  }

  if (decodedProviderError.providerMessage && category !== errorCategory.cancelled) {
    message = decodedProviderError.providerMessage;
  }

  if (decodedProviderError.providerCode !== undefined) {
    code ??= String(decodedProviderError.providerCode);
  }

  // 3. Try to parse JSON from message (for additional metadata like HTTP status)
  const { parsed, statusPrefix } = parseJsonFromMessage(rawMessage);
  if (parsed) {
    // Extract more specific info from parsed JSON
    if (statusPrefix && !httpStatus) {
      httpStatus = statusPrefix;
      if (category === errorCategory.generic) {
        category = httpStatusToCategory(statusPrefix);
      }
    }

    // Handle Anthropic error format: {"type":"error","error":{...}}
    // Only extract message if we didn't already get it from nested error structure
    if (parsed['type'] === 'error' && typeof parsed['error'] === 'object' && parsed['error'] !== null) {
      const errorBody = parsed['error'] as Record<string, unknown>;
      if (!nestedMessage && typeof errorBody['message'] === 'string') {
        ({ message } = errorBody as { message: string });
      }

      if (typeof errorBody['type'] === 'string') {
        code ??= errorBody['type'];

        // Map Anthropic error types to categories
        if (category === errorCategory.generic) {
          // oxlint-disable-next-line eslint/max-depth -- nested within JSON parsing conditional
          switch (errorBody['type']) {
            case 'invalid_request_error': {
              category = errorCategory.toolError;
              break;
            }

            case 'authentication_error': {
              category = errorCategory.auth;
              break;
            }

            case 'permission_error': {
              category = errorCategory.credits;
              break;
            }

            case 'rate_limit_error': {
              category = errorCategory.rateLimit;
              break;
            }

            case 'overloaded_error': {
              category = errorCategory.overloaded;
              break;
            }

            case 'api_error': {
              category = errorCategory.server;
              break;
            }
          }
        }
      }
    }

    // Extract request_id from parsed JSON
    if (typeof parsed['request_id'] === 'string' && !requestId) {
      requestId = parsed['request_id'];
    }
  }

  // 4. Pattern matching on final provider-facing message text. Billing
  // signals are more specific than wrapper categories like HTTP 400 or
  // Anthropic invalid_request_error, but explicit cancellation still wins.
  const patternCategory = detectPatternCategory(message);
  if (patternCategory === errorCategory.credits && category !== errorCategory.cancelled) {
    category = errorCategory.credits;
  } else if (category === errorCategory.generic && patternCategory) {
    category = patternCategory;
  }

  // Build the normalized error
  const normalizedError: ChatError = {
    category,
    title: errorCategoryTitles[category],
    message,
    raw: rawMessage,
  };

  if (code) {
    normalizedError.code = code;
  }

  if (httpStatus) {
    normalizedError.httpStatus = httpStatus;
  }

  if (requestId) {
    normalizedError.requestId = requestId;
  }

  if (helpUrl) {
    normalizedError.helpUrl = helpUrl;
  }

  return JSON.stringify(normalizedError);
}
