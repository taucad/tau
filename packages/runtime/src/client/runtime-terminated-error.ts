/** Fatal transport closure details. @public */
export class RuntimeTerminatedError extends Error {
  public constructor(message = 'RuntimeClient has been terminated.') {
    super(message);
    this.name = 'RuntimeTerminatedError';
  }
  /** Stable runtime termination code.
   * @returns The runtime termination code.
   */
  public get code(): 'RUNTIME_TERMINATED' {
    return 'RUNTIME_TERMINATED';
  }
}

/** Realm-safe check for runtime termination. @public
 * @param error - A thrown value.
 * @returns Whether the value is a runtime termination error.
 */
export const isRuntimeTerminatedError = (error: unknown): error is RuntimeTerminatedError =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  error.name === 'RuntimeTerminatedError' &&
  'code' in error &&
  error.code === 'RUNTIME_TERMINATED' &&
  'message' in error &&
  typeof error.message === 'string';
