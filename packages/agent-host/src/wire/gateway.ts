import { z } from 'zod';

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

/**
 * The host's reader-side projection of the gateway's attempt lookup, `GET v1/billing/attempts/:surface/:attemptKey`.
 * `z.looseObject` keeps fields this build does not read (D16) without reshaping them, so the receipt can grow.
 * `voided: true` on `not_found` means the gateway voided the key before answering (GI-R3); a bare `not_found` comes
 * from an image older than that.
 *
 * @public
 */
export const attemptReceiptSchema = z.discriminatedUnion('state', [
  z.looseObject({ state: z.literal('pending'), operationId: z.string().min(1) }),
  z.looseObject({
    state: z.literal('terminal'),
    operationId: z.string().min(1),
    receipt: z.looseObject({
      customerState: z.enum(['settled', 'released', 'absorbed']),
      chargedCreditAtoms: z.string().regex(/^(?:0|[1-9]\d*)$/u),
    }),
  }),
  z.looseObject({ state: z.literal('unavailable') }),
  z.looseObject({ state: z.literal('not_found'), voided: z.literal(true).optional() }),
]);

/**
 * The gateway's answer for one prepared attempt. No variant carries consent: under EQ1 the host acts on the answer
 * alone.
 *
 * - `pending`: the gateway still owns the attempt. Wait (`MODEL_ATTEMPT_PENDING`).
 * - `unavailable`: no answer now (network, 5xx, timeout, or an image older than the void). Wait.
 * - `terminal`: the row left `pending`. Record it (`model.invocation-settled`), then proceed under a new key.
 * - `voided`: never admitted, and never will be. Record it, then proceed under a new key.
 *
 * @public
 */
export type InvocationResolution =
  | { readonly status: 'pending' }
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'terminal';
      readonly operationId: string;
      readonly outcome: 'settled' | 'released' | 'absorbed';
      /** Integer string of credit atoms; `'0'` unless `outcome` is `'settled'`. */
      readonly chargedCreditAtoms: string;
    }
  | { readonly status: 'voided' };
