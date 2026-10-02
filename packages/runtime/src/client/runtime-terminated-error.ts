import type { RuntimeTransportCloseResult } from '#transport/runtime-transport.types.js';

/** Why the document client became terminal. @public */
export type RuntimeTerminatedCause = 'explicit' | 'transport-closed' | 'operation-timeout';
/** Host exit facts retained on a termination error. @public */
export type RuntimeTerminatedDetail = Omit<Extract<RuntimeTransportCloseResult, { cause: 'host-exit' }>, 'cause'>;

const isTerminationDetail = (detail: unknown): detail is RuntimeTerminatedDetail =>
  typeof detail === 'object' &&
  detail !== null &&
  'phase' in detail &&
  (detail.phase === 'boot' || detail.phase === 'session') &&
  (!('exitCode' in detail) || detail.exitCode === undefined || typeof detail.exitCode === 'number') &&
  (!('reason' in detail) || detail.reason === undefined || typeof detail.reason === 'string') &&
  (!('released' in detail) || detail.released === undefined || typeof detail.released === 'boolean') &&
  (!('stderrTail' in detail) || detail.stderrTail === undefined || typeof detail.stderrTail === 'string');

const firstStderrLine = (stderrTail: string | undefined): string | undefined =>
  stderrTail
    ?.split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

const hostExitMessage = (detail: RuntimeTerminatedDetail): string => {
  const exitCode = detail.exitCode ?? 'unknown';
  if (detail.phase === 'session') {
    return `The runtime host exited unexpectedly (exit code ${exitCode}).`;
  }
  const cause = firstStderrLine(detail.stderrTail) ?? detail.reason;
  const failure = `The runtime host failed to start (exit code ${exitCode})`;
  return cause === undefined ? `${failure}.` : `${failure}: ${cause}.`;
};

/** Fatal transport closure details. @public */
export class RuntimeTerminatedError extends Error {
  public readonly causeKind: RuntimeTerminatedCause;
  public readonly detail: RuntimeTerminatedDetail | undefined;

  public constructor(close?: RuntimeTransportCloseResult) {
    const detail =
      close?.cause === 'host-exit'
        ? {
            phase: close.phase,
            ...(close.exitCode === undefined ? {} : { exitCode: close.exitCode }),
            ...(close.reason === undefined ? {} : { reason: close.reason }),
            ...(close.released === undefined ? {} : { released: close.released }),
            ...(close.stderrTail === undefined ? {} : { stderrTail: close.stderrTail }),
          }
        : undefined;
    super(
      detail
        ? hostExitMessage(detail)
        : close?.cause === 'operation-timeout'
          ? 'The isolated runtime host did not recover from an operation timeout and was terminated. Create a new RuntimeClient before issuing more work.'
          : close?.cause === 'wire-failure'
            ? `Runtime transport closed: ${close.error.message}`
            : 'RuntimeClient has been terminated.',
      close?.cause === 'wire-failure' ? { cause: close.error } : undefined,
    );
    this.name = 'RuntimeTerminatedError';
    this.causeKind =
      close?.cause === 'operation-timeout' ? 'operation-timeout' : close ? 'transport-closed' : 'explicit';
    this.detail = detail;
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
  'causeKind' in error &&
  (error.causeKind === 'explicit' ||
    error.causeKind === 'transport-closed' ||
    error.causeKind === 'operation-timeout') &&
  (!('detail' in error) || error.detail === undefined || isTerminationDetail(error.detail)) &&
  'message' in error &&
  typeof error.message === 'string';
