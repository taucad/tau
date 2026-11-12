/* eslint-disable @typescript-eslint/naming-convention -- WebSocket close-code keys are numeric protocol values. */
/** Tau Cloud Zoo refusals; the banner matches these exact messages to offer billing. */
export const zooCloseMessages = {
  unavailable: 'Zoo is temporarily unavailable. Your project is safe. Try again later.',
  credits: 'You need more credits to run Zoo. Add credits, then try again.',
  pro: 'Zoo needs a Pro plan. Upgrade to Pro, then try again.',
} as const;

/** Must match apps/api billing.constants.ts `zooCloseCodes`. */
export const zooCloseErrors: Readonly<Record<string, string>> = {
  1013: zooCloseMessages.unavailable,
  4401: 'Sign in to Tau to use the Zoo kernel.',
  4402: zooCloseMessages.credits,
  4403: zooCloseMessages.pro,
};
/* eslint-enable @typescript-eslint/naming-convention -- End numeric WebSocket close-code keys. */
