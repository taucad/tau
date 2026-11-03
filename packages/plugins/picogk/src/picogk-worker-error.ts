import type { PicogkIssue } from '#picogk.protocol.js';

/** Structured user-code issues returned by the PicoGK worker. @public */
export class PicogkWorkerError extends Error {
  public readonly issues: PicogkIssue[];

  public constructor(issues: readonly PicogkIssue[]) {
    super(issues.map(({ message }) => message).join('; '));
    this.issues = [...issues];
    this.name = 'PicogkWorkerError';
  }
}
