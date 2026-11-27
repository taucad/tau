import { zooNeutralCloseMessages } from '#cloud/zoo-close-messages.js';

/**
 * One map for an adaptive build (adaptive app deployment mode charter, the surface table): the server's refusals in
 * neutral words, with no purchase in them. A self-host API sends neither 4402 nor 4403; a Tau Cloud API does, and the
 * lazy Zoo banner adds the purchase action when the mode is `funded`. Must match apps/api billing.constants.ts
 * `zooCloseCodes`.
 */
export const zooCloseErrors: Readonly<Record<string, string>> = {
  1013: 'Zoo is temporarily unavailable. Your project is safe. Try again later.',
  4401: 'Sign in to Tau to use the Zoo kernel.',
  4402: zooNeutralCloseMessages.credits,
  4403: zooNeutralCloseMessages.pro,
};
