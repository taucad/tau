import type { RefusalCode } from '#wire/refusals.js';

/**
 * The codes Tau's LLM gateway (apps/api) refuses with: its 13 API codes plus W11's `ATTEMPT_VOIDED`. apps/api types
 * its errors from this as a type (`LlmGatewayErrorType = GatewayErrorCode`), and each code's recovery is its
 * {@link refusals} entry.
 *
 * @public
 */
export const gatewayErrorCodes = [
  'BILLING_RECOVERY_UNAVAILABLE',
  'FUNDED_HELPER_LIMIT',
  'FUNDED_OPERATION_LIMIT',
  'INSUFFICIENT_CREDIT',
  'INVALID_REQUEST',
  'MODEL_NOT_IN_CATALOG',
  'ORIGIN_NOT_ALLOWED',
  /**
   * The provider account behind the key Tau spent against has no credit or is not billable; distinct from
   * `INSUFFICIENT_CREDIT`, the customer's own balance. `details` carries `providerId`, the provider's own
   * `providerCode` when it sent one, and `accountOwner` (`operator` or `tau`).
   */
  'PROVIDER_ACCOUNT_EXHAUSTED',
  'PROVIDER_UNAVAILABLE',
  'RATE_LIMITED',
  /** The serialized request is past the funded request contract's byte bound; `details` carries `maximumBytes`. */
  'REQUEST_TOO_LARGE',
  'UNAUTHENTICATED',
  /** The upstream provider refused the relayed request (a non-429 4xx); the message names its status only. */
  'UPSTREAM_REJECTED',
  /** W11: the gateway voided a key it never admitted (HTTP 409); the host continues under a new key. */
  'ATTEMPT_VOIDED',
] as const satisfies readonly RefusalCode[];

/** One {@link gatewayErrorCodes} value. @public */
export type GatewayErrorCode = (typeof gatewayErrorCodes)[number];
