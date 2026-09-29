import { util as zodUtility } from 'zod';

import type { RunFailureDetail } from '#log/event-types.js';

/**
 * The durable failure detail for a throw: its message, and whatever code, status and structured `details` it carries,
 * so a terminal row is never poorer than the refusal that caused it.
 *
 * @param error - Whatever ended the run or refused the step.
 * @returns The failure detail to persist.
 */
export const codedFailureDetail = (error: unknown): RunFailureDetail => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- reading optional own properties off a thrown value.
  const fields = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const status = typeof fields?.['status'] === 'number' ? fields['status'] : undefined;
  const details = zodUtility.isObject(fields?.['details']) ? fields['details'] : undefined;
  return {
    message: error instanceof Error ? error.message : String(error),
    ...(typeof fields?.['code'] === 'string' ? { code: fields['code'] } : {}),
    ...(status === undefined ? {} : { status }),
    ...(details === undefined ? {} : { details }),
  };
};
