import type { ErrorInfo } from 'react';
import { isRouteErrorResponse } from 'react-router';
import type { ErrorDetails } from '#lib/error-details.js';
import { reportUiError } from '#lib/error-reporting.js';
import { isStaleModuleError, recoverFromCaughtError } from '#lib/stale-build-recovery.js';

/** What React hands each root error hook beside the error. */
type RootErrorInfo = Readonly<Pick<ErrorInfo, 'componentStack'>>;

/**
 * The `react` context of a React error event: the component stack React recorded, as Sentry's
 * `reactErrorHandler` attaches it.
 *
 * @param errorInfo - What React passed with the error.
 * @returns The details to report the error with.
 */
export const reactErrorDetails = (errorInfo: RootErrorInfo): ErrorDetails =>
  errorInfo.componentStack ? { contexts: { react: { componentStack: errorInfo.componentStack } } } : {};

/**
 * Hand one React error to its owner: a module load failure to the stale-build recovery (which reports it once it
 * is decided genuine), a route error response to the route error page (which knows which statuses are reportable),
 * and anything else to `reportUiError` with React's component stack. `reportUiError` reports a value once, so a
 * boundary or the error page reporting the same error again costs nothing.
 *
 * @param error - The value React caught, did not catch, or recovered from.
 * @param errorInfo - What React passed with it.
 */
export const reportReactError = (error: unknown, errorInfo: RootErrorInfo): void => {
  if (isStaleModuleError(error)) {
    recoverFromCaughtError(error);
    return;
  }
  if (isRouteErrorResponse(error)) {
    return;
  }
  // async-iife: bootstrap -- React's error hooks cannot await; reporting never rejects.
  void reportUiError(error, reactErrorDetails(errorInfo));
};

/**
 * The `hydrateRoot` error hooks (SB4): every error React sees is reported once, with its component stack, and
 * keeps React's console output. Replacing `onUncaughtError` and `onRecoverableError` means React no longer
 * rethrows these to `window`, so the global handlers never report them a second time.
 */
export const reactRootErrorHooks = {
  onCaughtError(error: unknown, errorInfo: RootErrorInfo): void {
    reportReactError(error, errorInfo);
    console.error(error, errorInfo.componentStack);
  },
  onUncaughtError(error: unknown, errorInfo: RootErrorInfo): void {
    reportReactError(error, errorInfo);
    console.error(error, errorInfo.componentStack);
  },
  onRecoverableError(error: unknown, errorInfo: RootErrorInfo): void {
    reportReactError(error, errorInfo);
    console.error(error, errorInfo.componentStack);
  },
};
