import { z } from 'zod';

import type { RefusalCode } from '#wire/refusals.js';

/**
 * The codes Tau's LLM gateway (apps/api) refuses with: its 13 API codes, W11's `ATTEMPT_VOIDED` and
 * `BILLING_ACCOUNT_CLOSED`, the route and account denials `MODEL_ROUTE_PAUSED` and `BILLING_ACCOUNT_RESTRICTED`, and
 * `REASONING_REPLAY_REJECTED`.
 * apps/api types its errors from this as a type (`LlmGatewayErrorType = GatewayErrorCode`), and each code's recovery
 * is its {@link refusals} entry.
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
  /** W11: the attempt lookup's account is closing, closed or restricted (HTTP 403); not a sign-in failure. */
  'BILLING_ACCOUNT_CLOSED',
  /**
   * Tau's operators paused this model route (HTTP 503); `details` carries `routeId`. Another route still answers, so
   * the person switches model; the gateway's sentence never reaches the card.
   */
  'MODEL_ROUTE_PAUSED',
  /**
   * Admission refused spending on this account while a billing case about its balance is open, or the account is
   * restricted (HTTP 403). No model choice or sign-in changes it; the card points to support.
   */
  'BILLING_ACCOUNT_RESTRICTED',
  /**
   * The provider refused native reasoning replayed from an earlier turn (HTTP 502; Anthropic's thinking-signature
   * binding). The same history meets the same refusal, so nothing resumes it; another model reads the reasoning as text.
   */
  'REASONING_REPLAY_REJECTED',
] as const satisfies readonly RefusalCode[];

/** One {@link gatewayErrorCodes} value. @public */
export type GatewayErrorCode = (typeof gatewayErrorCodes)[number];

/**
 * `x-tau-turn-step`: whether a gateway step is the first model invocation after a user turn was admitted, or a later
 * step of the same run. apps/api reads it as a telemetry label only (`readTurnTelemetry`), never for admission, price
 * or the request digest, and turns a value it does not know into `unknown`.
 *
 * @public
 */
export const gatewayTurnSteps = ['first', 'continuation'] as const;

/** One {@link gatewayTurnSteps} value. @public */
export type GatewayTurnStep = (typeof gatewayTurnSteps)[number];

/**
 * `x-tau-turn-gap`: the pause from the chat's previous model step to this turn's first step, bucketed at the provider
 * cache lifetimes (5 and 60 minutes). `first_turn` when the chat has no previous model step. Every step of a run
 * carries its turn's gap, so a series can be cut by gap and step together.
 *
 * @public
 */
export const gatewayTurnGaps = ['first_turn', 'lt_5m', '5m_60m', 'gt_60m'] as const;

/** One {@link gatewayTurnGaps} value. @public */
export type GatewayTurnGap = (typeof gatewayTurnGaps)[number];

/**
 * The turn labels one gateway step carries as `x-tau-turn-step` and `x-tau-turn-gap`: enumerated labels only (I4),
 * sent as headers and never in the request body.
 *
 * @public
 */
export type GatewayTurnLabels = Readonly<{
  step: GatewayTurnStep;
  /** Absent when the previous step's time cannot be read; the gateway then records the gap as `unknown`. */
  gap?: GatewayTurnGap | undefined;
}>;

/**
 * The host's reader-side projection of the gateway's attempt lookup, `GET v1/billing/attempts/:surface/:attemptKey`.
 * `z.looseObject` keeps fields this build does not read (D16) without reshaping them, so the receipt can grow.
 * `voided: true` on `not_found` means the gateway voided the key before answering (GI-R3); a bare `not_found` comes
 * from an image older than that. `settlesBy` on `pending` is the instant by which the gateway settles the attempt on
 * its own (the hold's `due_at` plus the recovery grace, W2); an image older than that omits it.
 *
 * @public
 */
export const attemptReceiptSchema = z.discriminatedUnion('state', [
  z.looseObject({
    state: z.literal('pending'),
    operationId: z.string().min(1),
    settlesBy: z.iso.datetime().optional(),
  }),
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
 * - `pending`: the gateway still owns the attempt. Wait, until `settlesBy` when it is stated (`MODEL_ATTEMPT_PENDING`).
 * - `unavailable`: no answer now (network, 5xx, timeout, or an image older than the void). Wait.
 * - `terminal`: the row left `pending`. Record it (`model.invocation-settled`), then proceed under a new key.
 * - `voided`: never admitted, and never will be. Record it, then proceed under a new key.
 *
 * @public
 */
export type InvocationResolution =
  | {
      readonly status: 'pending';
      /**
       * The ISO instant by which the gateway settles the attempt on its own (W2): the host keeps asking until then.
       * Absent when the gateway did not say, and the host waits only its own short budget.
       */
      readonly settlesBy?: string | undefined;
    }
  | { readonly status: 'unavailable' }
  | {
      readonly status: 'terminal';
      readonly operationId: string;
      readonly outcome: 'settled' | 'released' | 'absorbed';
      /** Integer string of credit atoms; `'0'` unless `outcome` is `'settled'`. */
      readonly chargedCreditAtoms: string;
    }
  | { readonly status: 'voided' };
