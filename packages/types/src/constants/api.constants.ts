/**
 * Error categories for API responses.
 * Used by both the API (to normalize errors) and UI (to route to appropriate components).
 */
export const errorCategory = {
  /** User has run out of credits */
  credits: 'credits',
  /** Rate limit exceeded */
  rateLimit: 'rate_limit',
  /** Service temporarily overloaded */
  overloaded: 'overloaded',
  /** Tool processing error (e.g., invalid tool results) */
  toolError: 'tool_error',
  /** Authentication error */
  auth: 'auth',
  /** Client-side network error (handled by UI only) */
  network: 'network',
  /** Server-side error */
  server: 'server',
  /** Request was cancelled/aborted by user */
  cancelled: 'cancelled',
  /** Generic/unknown error */
  generic: 'generic',
} as const;

/**
 * All possible error category values.
 */
export const errorCategories = Object.values(errorCategory);
