import { errorCategory } from '@taucad/types/constants';
import type { ErrorCategory } from '@taucad/types';

/**
 * Maps HTTP status codes to error categories.
 * Used by both the API (to normalize errors) and chat exception filter.
 * @public
 */
export function httpStatusToCategory(status: number): ErrorCategory {
  switch (status) {
    case 400: {
      return errorCategory.toolError;
    }

    case 401: {
      return errorCategory.auth;
    }

    // 402 Payment Required is the first-party ledger's status
    // (InsufficientCreditsError and friends); 403 stays mapped for
    // provider-passthrough credit errors.
    case 402: {
      return errorCategory.credits;
    }

    case 403: {
      return errorCategory.credits;
    }

    case 404: {
      return errorCategory.server;
    }

    case 429: {
      return errorCategory.rateLimit;
    }

    case 503:
    case 529: {
      return errorCategory.overloaded;
    }

    default: {
      if (status >= 500) {
        return errorCategory.server;
      }

      return errorCategory.generic;
    }
  }
}

/**
 * Default titles for each error category.
 * Used to provide user-friendly titles for error messages.
 * @public
 */
export const errorCategoryTitles: Record<ErrorCategory, string> = {
  [errorCategory.credits]: 'Credit Limit Reached',
  [errorCategory.rateLimit]: 'Rate Limit Exceeded',
  [errorCategory.overloaded]: 'Service Temporarily Unavailable',
  [errorCategory.toolError]: 'Processing Error',
  [errorCategory.auth]: 'Authentication Error',
  [errorCategory.network]: 'Connection Error',
  [errorCategory.server]: 'Server Error',
  [errorCategory.cancelled]: 'Request Cancelled',
  [errorCategory.generic]: 'Error',
};
