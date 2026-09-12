/** NestJS token for the first-party billing Stripe client. */
export const stripeClientKey = 'stripeClientKey';
/** Read-only Stripe source client for reconciliation and card display. */
export const stripeReadClientKey = 'stripeReadClientKey';

/**
 * Typed WebSocket close code for the Zoo proxy session gate. Application codes
 * 4000–4999 are caller-defined per RFC 6455; the runtime's Zoo transport maps
 * this to its sign-in error. Hosted Zoo itself is disabled (B7 R3/S6), so the
 * credit and entitlement codes are gone: an authorized socket is refused 1013.
 */
export const zooCloseCodes = {
  unauthenticated: 4401,
} as const;
