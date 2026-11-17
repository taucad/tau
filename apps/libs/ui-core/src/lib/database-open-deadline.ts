/**
 * The deadline on a local database open (desktop resilient startup blueprint D3, B31).
 *
 * An `indexedDB.open` request settles only on `success`, `error` or `blocked`, and a request that fires none of them
 * would hold the start forever. Each open that the start waits on arms this deadline and rejects with a named error
 * when it passes, which the start classifies as a database failure with its own actions.
 */

/** How long an open may take before it is given up. Milliseconds. @public */
export const databaseOpenDeadlineMilliseconds = 5000;

/**
 * A local database open that fired no event before its deadline.
 *
 * @public
 */
export class DatabaseOpenTimeoutError extends Error {
  public override readonly name = 'DatabaseOpenTimeoutError';

  public constructor(databaseName: string) {
    super(`Opening the local database ${databaseName} did not answer within ${databaseOpenDeadlineMilliseconds} ms.`);
  }
}

/** The armed deadline of one open request. @public */
export type DatabaseOpenDeadline = Readonly<{
  /** Whether the deadline passed, so the open's own handlers settle nothing. */
  expired: () => boolean;
  /** Disarm the deadline once the open settled. */
  clear: () => void;
}>;

/**
 * Arm the deadline on one open request. When it passes, `reject` gets a {@link DatabaseOpenTimeoutError}, and a
 * connection that still arrives afterwards is closed, so it can neither leak nor block another tab's upgrade. A later
 * open is a new request with its own deadline.
 *
 * @param request - The open request.
 * @param databaseName - The database's name, for the error.
 * @param reject - The open's rejection.
 * @returns The deadline's handle.
 * @public
 */
export function armDatabaseOpenDeadline(
  request: IDBOpenDBRequest,
  databaseName: string,
  reject: (error: Error) => void,
): DatabaseOpenDeadline {
  let isExpired = false;
  const timer = setTimeout(() => {
    isExpired = true;
    reject(new DatabaseOpenTimeoutError(databaseName));
  }, databaseOpenDeadlineMilliseconds);
  request.addEventListener('success', () => {
    if (isExpired) {
      request.result.close();
    }
  });
  return {
    expired: () => isExpired,
    clear: () => {
      clearTimeout(timer);
    },
  };
}
