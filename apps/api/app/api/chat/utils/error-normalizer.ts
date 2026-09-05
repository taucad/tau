/**
 * Error normalizer for LangGraph, LangChain, and LLM provider errors.
 * Converts various error formats into a structured JSON format for the UI.
 */

import process from 'node:process';
import { errorCategory } from '@taucad/types/constants';
import type { ErrorCategory, ChatError } from '@taucad/types';
import { httpStatusToCategory, errorCategoryTitles } from '@taucad/chat/utils';
import { isAbortError as isProviderAbortError } from '@ai-sdk/provider-utils';
import { z } from 'zod';
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

/* eslint-disable @typescript-eslint/naming-convention -- provider SDK and HTTP body schemas mirror wire keys. */
const providerSdkRootFields = {
  status: z.number().optional(),
  requestID: z.string().optional(),
  request_id: z.string().optional(),
  lc_error_code: z.string().optional(),
} as const;

const directProviderSdkErrorSchema = z
  .looseObject(providerSdkRootFields)
  .refine(
    (error) =>
      error.status !== undefined ||
      error.requestID !== undefined ||
      error.request_id !== undefined ||
      error.lc_error_code !== undefined,
  )
  .transform((error) => ({
    status: error.status,
    requestId: error.requestID ?? error.request_id,
    lcErrorCode: error.lc_error_code,
    nestedMessage: undefined as string | undefined,
  }));

const nestedProviderSdkErrorSchema = z
  .looseObject({
    ...providerSdkRootFields,
    error: z
      .looseObject({
        request_id: z.string().optional(),
        message: z.string().optional(),
      })
      .refine((error) => error.request_id !== undefined || error.message !== undefined),
  })
  .transform((error) => ({
    status: error.status,
    requestId: error.requestID ?? error.request_id ?? error.error.request_id,
    lcErrorCode: error.lc_error_code,
    nestedMessage: error.error.message,
  }));

const nestedAnthropicSdkErrorSchema = z
  .looseObject({
    ...providerSdkRootFields,
    error: z.looseObject({
      request_id: z.string().optional(),
      message: z.string().optional(),
      error: z.looseObject({ message: z.string() }),
    }),
  })
  .transform((error) => ({
    status: error.status,
    requestId: error.requestID ?? error.request_id ?? error.error.request_id,
    lcErrorCode: error.lc_error_code,
    nestedMessage: error.error.error.message,
  }));

const providerSdkErrorSchema = z.union([
  nestedAnthropicSdkErrorSchema,
  nestedProviderSdkErrorSchema,
  directProviderSdkErrorSchema,
]);

const jsonRecordSchema = z.looseObject({});
const anthropicErrorBodySchema = z.looseObject({
  type: z.literal('error'),
  error: z.looseObject({
    message: z.string().optional(),
    type: z.string().optional(),
  }),
});
const requestIdBodySchema = z.looseObject({ request_id: z.string() });
/* eslint-enable @typescript-eslint/naming-convention -- end provider wire schemas. */

const parseJsonRecord = (value: string): Record<string, unknown> | undefined => {
  const result = jsonRecordSchema.safeParse(JSON.parse(value));
  return result.success ? result.data : undefined;
};

/**
 * Extracts help/troubleshooting URL from error message.
 * LangChain appends "Troubleshooting URL: https://..." to error messages.
 */
function extractHelpUrl(message: string): string | undefined {
  const match = /troubleshooting url:\s*(https?:\/\/\S+)/i.exec(message);
  return match?.[1]?.replace(/[!),.:;>?\]}]+$/, ''); // Strip trailing punctuation
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
      const parsed = parseJsonRecord(statusPrefixMatch[2]);
      return { parsed, statusPrefix: Number.parseInt(statusPrefixMatch[1], 10) };
    } catch {
      // Fall through
    }
  }

  // Try direct JSON parsing
  if (message.startsWith('{')) {
    try {
      const parsed = parseJsonRecord(message);
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
  return isProviderAbortError(error) || (error instanceof Error && error.message.toLowerCase().includes('abort'));
}

function extractRegexGroup(message: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(message);
  return match?.[1];
}

/**
 * First-party ledger exhaustion (billing B2). The marker + µ$ amounts survive
 * the agent stream's error channel inside `error.message` (only the string
 * crosses `toUIMessageStream`); this re-extracts them into the friendly copy
 * `chat-error-credits.tsx` renders.
 */
function normalizeInsufficientCreditsError(
  rawMessage: string,
): Pick<ChatError, 'category' | 'code' | 'message' | 'raw'> | undefined {
  if (!rawMessage.includes('INSUFFICIENT_CREDITS')) {
    return undefined;
  }
  const balanceMicro = extractRegexGroup(rawMessage, /balanceMicro=(-?\d+)/);
  const requiredMicro = extractRegexGroup(rawMessage, /requiredMicro=(-?\d+)/);
  const formatMicro = (value: string | undefined): string | undefined => {
    if (value === undefined) {
      return undefined;
    }
    const micro = Number(value);
    return Number.isFinite(micro) ? (micro / 1_000_000).toFixed(2) : undefined;
  };
  const balance = formatMicro(balanceMicro);
  const required = formatMicro(requiredMicro);
  const details =
    balance !== undefined && required !== undefined
      ? `Your credit balance is $${balance} and this request needs about $${required}. Add credits to continue.`
      : 'Your credit balance is too low for this request. Add credits to continue.';
  return {
    category: errorCategory.credits,
    code: 'INSUFFICIENT_CREDITS',
    message: details,
    raw: rawMessage,
  };
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
  const providerSdkErrorResult = providerSdkErrorSchema.safeParse(error);
  const providerSdkError = providerSdkErrorResult.success ? providerSdkErrorResult.data : undefined;
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

  const insufficientCreditsError = normalizeInsufficientCreditsError(rawMessage);
  if (insufficientCreditsError && category !== errorCategory.cancelled) {
    category = insufficientCreditsError.category;
    code = insufficientCreditsError.code;
    message = insufficientCreditsError.message;
  }

  const tauImplementationBugError = normalizeTauImplementationBugError(error, rawMessage);
  if (tauImplementationBugError && category !== errorCategory.cancelled && code === undefined) {
    category = tauImplementationBugError.category;
    code = tauImplementationBugError.code;
    message = tauImplementationBugError.message;
  }

  // 1. Check for LangChain error codes
  if (category === errorCategory.generic && providerSdkError?.lcErrorCode) {
    const lcCode = providerSdkError.lcErrorCode as LangChainErrorCode;
    if (lcCode in langChainCodeToCategory) {
      category = langChainCodeToCategory[lcCode];
      code = lcCode;
    }
  }

  // 2. Check for HTTP status (SDK errors)
  if (providerSdkError?.status !== undefined) {
    httpStatus = providerSdkError.status;
    // Only override category if we don't have a more specific LangChain code
    if (category === errorCategory.generic) {
      category = httpStatusToCategory(providerSdkError.status);
    }
  }

  if (decodedProviderError.httpStatus && !httpStatus) {
    httpStatus = decodedProviderError.httpStatus;
    if (category === errorCategory.generic) {
      category = httpStatusToCategory(decodedProviderError.httpStatus);
    }
  }

  // Extract request ID
  requestId = providerSdkError?.requestId;

  // 2.5. Try to extract message from nested Anthropic error structure on the error object
  // LangChain wraps Anthropic errors with: error.error = { type, error: { type, message }, request_id }
  const nestedMessage = providerSdkError?.nestedMessage;
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
    const anthropicBody = anthropicErrorBodySchema.safeParse(parsed);
    if (anthropicBody.success) {
      const errorBody = anthropicBody.data.error;
      if (!nestedMessage && errorBody.message !== undefined) {
        message = errorBody.message;
      }

      if (errorBody.type !== undefined) {
        code ??= errorBody.type;

        // Map Anthropic error types to categories
        if (category === errorCategory.generic) {
          // oxlint-disable-next-line eslint/max-depth -- nested within JSON parsing conditional
          switch (errorBody.type) {
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
    const parsedRequestId = requestIdBodySchema.safeParse(parsed);
    if (parsedRequestId.success && !requestId) {
      requestId = parsedRequestId.data.request_id;
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

  // Build the normalized error. `rawMessage` is uncurated driver/library text
  // (a DrizzleQueryError embeds the failed SQL plus bound parameter values), so it
  // never crosses to the client in production - neither as `raw`, nor as `message`
  // when no branch above replaced it with curated provider copy.
  // ponytail: `message !== rawMessage` is the curation test; swap it for an explicit
  // flag if a curated branch ever legitimately reproduces the raw message verbatim.
  const disclosesInternals = process.env.NODE_ENV !== 'production';
  const normalizedError: ChatError = {
    category,
    title: errorCategoryTitles[category],
    message: disclosesInternals || message !== rawMessage ? message : errorCategoryTitles[category],
    ...(disclosesInternals ? { raw: rawMessage } : {}),
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
