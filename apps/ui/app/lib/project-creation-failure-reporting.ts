import { reportUiError } from '#lib/error-reporting.js';
import { PendingProjectRecoveryError } from '@taucad/files-ui/runtime/project-library-storage';

/**
 * Report a project create that failed (a location the user must choose again is not a failure and is not reported).
 * The toast and console say only that it failed; the event carries the error with its cause chain, tagged with the
 * commit's recovery reason where there is one, and grouped by that reason.
 *
 * @param error - What the create threw.
 */
export const reportProjectCreationFailure = (error: unknown): void => {
  const reason = error instanceof PendingProjectRecoveryError ? error.reason : 'unknown';
  // async-iife: bootstrap -- a submit handler does not wait on reporting; reporting never rejects.
  void reportUiError(error, {
    tags: { operation: 'create-project', reason },
    fingerprint: ['project-creation-failure', reason],
  });
};
