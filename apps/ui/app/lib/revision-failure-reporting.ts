import type { RevisionToast } from '#machines/file-manager.worker.revisions.js';
import { reportUiError } from '#lib/error-reporting.js';

/**
 * Refusal codes that lost nothing: files that are back, an undo with nothing here to undo (W0 N1, M1, D15). The page
 * shows them as warnings; they are not failures and are never reported.
 */
export const revisionWarningCodes: ReadonlySet<string> = new Set([
  'RESTORE_UNRECORDED',
  'UNDO_UNAVAILABLE',
  'NOTHING_TO_UNDO',
  'UNDO_PAST_MERGE',
]);

/** A revision verb the tree could not carry out, as its error toast names it. */
export class RevisionFailure extends Error {
  public override readonly name = 'RevisionFailure';
}

/**
 * Report a revision error toast (SB4): the diagnostic goes to error reporting with the refusal's `code`, `subject`
 * and `operation` tags, grouped by subject and code; the page's product event keeps outcome fields only.
 *
 * @param toast - One toast from a revision client.
 */
export const reportRevisionToast = (toast: RevisionToast): void => {
  if (toast.type !== 'error' || (toast.code !== undefined && revisionWarningCodes.has(toast.code))) {
    return;
  }
  const code = toast.code ?? 'UNKNOWN';
  const operation = toast.operation ?? toast.connectionOperation;
  // async-iife: bootstrap -- a toast listener cannot await; reporting never rejects.
  void reportUiError(new RevisionFailure(toast.message), {
    tags: { code, subject: toast.subject, ...(operation === undefined ? {} : { operation }) },
    fingerprint: ['revision-failure', toast.subject, code],
  });
};
