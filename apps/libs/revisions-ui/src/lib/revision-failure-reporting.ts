import type { RevisionToast } from '#types/revision-worker-protocol.js';

/**
 * What one reported revision failure carries to error reporting: its tags and the fingerprint it is grouped by.
 *
 * @public
 */
export type RevisionFailureDetails = Readonly<{ tags: Readonly<Record<string, string>>; fingerprint: string[] }>;

/**
 * The app's error reporter, as the toast reporter calls it. Reporting never rejects.
 *
 * @public
 */
export type ReportRevisionFailure = (error: Error, details: RevisionFailureDetails) => Promise<unknown>;

/**
 * Refusal codes that lost nothing: files that are back, an undo with nothing here to undo, a merge that moved nothing
 * (W0 N1, M1, D15). The page
 * shows them as warnings; they are not failures and are never reported.
 */
export const revisionWarningCodes: ReadonlySet<string> = new Set([
  'RESTORE_UNRECORDED',
  'UNDO_UNAVAILABLE',
  'NOTHING_TO_UNDO',
  'UNDO_PAST_MERGE',
  'UNDO_MERGE_MOVED',
  'MERGE_UP_TO_DATE',
  'MERGE_UNDONE',
]);

/** A revision verb the tree could not carry out, as its error toast names it. */
export class RevisionFailure extends Error {
  public override readonly name = 'RevisionFailure';
}

/**
 * The reporter for revision error toasts (SB4): the diagnostic goes to error reporting with the refusal's `code`,
 * `subject` and `operation` tags, grouped by subject and code; the page's product event keeps outcome fields only.
 *
 * @param reportUiError - The app's error reporter.
 * @returns The listener every revision client's toast channel calls with one toast.
 * @public
 */
export const createRevisionToastReporter =
  (reportUiError: ReportRevisionFailure) =>
  (toast: RevisionToast): void => {
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
