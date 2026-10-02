import type { errorCategory } from '#constants/api.constants.js';

/**
 * Error category type derived from the constants.
 */
export type ErrorCategory = (typeof errorCategory)[keyof typeof errorCategory];

/**
 * Normalized error response from the API.
 * All chat stream errors are normalized to this format.
 */
export type ChatError = {
  /** Error category for routing to appropriate UI components */
  category: ErrorCategory;
  /** Optional error code (e.g., LangChain error code, HTTP status text) */
  code?: string;
  /** HTTP status code if applicable */
  httpStatus?: number;
  /** User-friendly error title */
  title: string;
  /** User-friendly error message/description (may contain markdown) */
  message: string;
  /** Request ID for support/debugging */
  requestId?: string;
  /** URL to help documentation or troubleshooting guide */
  helpUrl?: string;
  /** Raw error message for debugging */
  raw?: string;
};

/**
 * Error response format from HTTP exception filter.
 */
export type HttpErrorResponse = {
  error: string;
  code?: string;
  statusCode: number;
  message?: string | string[];
  path?: string;
  requestId?: string;
};
