/** NestJS token for the first-party billing Stripe client. */
export const stripeClientKey = 'stripeClientKey';
/** Read-only Stripe source client for reconciliation and card display. */
export const stripeReadClientKey = 'stripeReadClientKey';

/**
 * Typed WebSocket close code for the Zoo proxy session gate. Application codes
 * 4000–4999 are caller-defined per RFC 6455; the runtime's Zoo transport maps
 * these to actionable connection errors.
 */
export const zooCloseCodes = {
  unauthenticated: 4401,
  insufficientCredit: 4402,
  proRequired: 4403,
} as const;
