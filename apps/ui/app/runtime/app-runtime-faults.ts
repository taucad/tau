/**
 * The app runtime's one fault hook (app state orchestration charter D23; B2).
 *
 * A new or rewritten machine keeps its first fault in context and reports it here once, from the transition that
 * recorded it. Later faults are usually that one's consequences, so they are recorded nowhere and reported never. The
 * report goes to the app's error reporter, the one the route error page uses, which already drops a second report of
 * the same error object.
 */
import { reportUiError } from '#lib/error-reporting.js';

/**
 * A fault's message, for the context key that keeps it.
 *
 * @param error - What a root or invoke `onError` was handed.
 * @param fallback - The message for a non-`Error` throw.
 * @returns The message.
 * @public
 */
export const faultMessage = (error: unknown, fallback: string): string =>
  error instanceof Error ? error.message : fallback;

/**
 * Report a machine's first fault once.
 *
 * @param error - What the root or invoke `onError` was handed.
 * @public
 */
export const reportAppRuntimeFault = (error: unknown): void => {
  // async-iife: bootstrap -- a transition cannot await the report, and a report that fails is not retried.
  void reportUiError(error);
};
