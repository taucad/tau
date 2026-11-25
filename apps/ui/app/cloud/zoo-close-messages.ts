/**
 * Zoo's refusal sentences (adaptive app deployment mode, the surface table), shared by the close-code maps and the
 * Zoo banner of every ceiling. The neutral ones carry no purchase: an adaptive build shows them in any mode, and the
 * banner adds the purchase action when the mode is `funded`.
 */
export const zooNeutralCloseMessages = {
  credits: 'This server refused to run Zoo for this account. Your project is safe.',
  pro: 'Your plan on this server does not include Zoo. Your project is safe.',
} as const;
