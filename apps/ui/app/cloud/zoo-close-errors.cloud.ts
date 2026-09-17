/* eslint-disable @typescript-eslint/naming-convention -- WebSocket close-code keys are numeric protocol values. */
/** Tau Cloud Zoo refusals; the banner matches these exact messages to offer billing. */
export const zooCloseMessages = {
  unavailable: 'Zoo execution is temporarily unavailable. Your project is safe; try again later.',
  credits: 'This Zoo run needs more credits. Add credits, then retry.',
  pro: 'Zoo execution requires Pro. Upgrade to Pro, then retry.',
} as const;

/** Must match apps/api billing.constants.ts `zooCloseCodes`. */
export const zooCloseErrors: Readonly<Record<string, string>> = {
  1013: zooCloseMessages.unavailable,
  4401: 'Sign in to Tau to use the Zoo kernel.',
  4402: zooCloseMessages.credits,
  4403: zooCloseMessages.pro,
};
/* eslint-enable @typescript-eslint/naming-convention -- End numeric WebSocket close-code keys. */
