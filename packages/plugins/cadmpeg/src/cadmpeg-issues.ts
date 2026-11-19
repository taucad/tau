import type { KernelIssue } from '@taucad/runtime/types';
import { CadmpegError } from 'cadmpeg-ts/core';
import type { Loss } from 'cadmpeg-ts/core';

/**
 * One cadmpeg loss as a runtime issue (charter D7): a warning by default,
 * carrying cadmpeg's `namespace/code`, phase and severity in `details`.
 *
 * @param loss - The loss cadmpeg reported.
 * @returns The issue.
 */
export const lossIssue = (loss: Loss): KernelIssue => ({
  message: loss.message,
  code: 'REPRESENTATION_UNSUPPORTED',
  type: 'kernel',
  severity: loss.severity === 'info' ? 'info' : 'warning',
  details: { cadmpegCode: loss.code, phase: loss.phase, severity: loss.severity },
});

/**
 * A cadmpeg refusal or failure as an error message that names its code.
 *
 * @param error - What the conversion threw.
 * @returns The message.
 */
export const failureMessage = (error: unknown): string => {
  if (error instanceof CadmpegError) {
    return `cadmpeg ${error.code}${error.phase === undefined ? '' : ` (${error.phase})`}: ${error.message}`;
  }
  return error instanceof Error ? error.message : 'cadmpeg conversion failed';
};
