import { setTimeout as delay } from 'node:timers/promises';
import { wireBalanceExplanationSchema, wirePaymentActionSchema } from '@taucad/billing';
import type { WireBalanceExplanation, WirePaymentAction } from '@taucad/billing';
import type { Account } from '#support/account.js';
import { ok } from '#support/api.js';
import type { PaymentRead } from '#support/checkout.js';

/** States a just-paid action passes through before the grant lands: the UI's own set (root-billing.cloud.tsx). */
export const settlingStates: ReadonlySet<string> = new Set([
  'redirect_required',
  'creating',
  'processing',
  'funds_received',
]);

/** The return page re-checks a settling action 10 × 2 s (root-billing.cloud.tsx); a later grant is never announced. */
export const uiRecheckSeconds = 20;

/** One owner-scoped read of a payment action, parsed with its wire schema. */
export const readAction = async (account: Account, actionId: string): Promise<WirePaymentAction> =>
  ok(await account.api.request('GET', `/v1/billing/payment-actions/${actionId}`), wirePaymentActionSchema);

/**
 * The account's open payment actions (`GET /v1/billing/payment-actions` lists no fulfilled, failed or canceled
 * purchase), optionally of one purpose.
 */
export const readOpenActions = async (
  account: Account,
  purpose?: 'manual_topup' | 'subscription_checkout',
): Promise<WirePaymentAction[]> =>
  ok(
    await account.api.request(
      'GET',
      purpose === undefined ? '/v1/billing/payment-actions' : `/v1/billing/payment-actions?purpose=${purpose}`,
    ),
    wirePaymentActionSchema.array(),
  );

/** The account's balance explanation; rows read `balance` and `history` from it. */
export const readCredits = async (account: Account): Promise<WireBalanceExplanation> =>
  ok(await account.api.request('GET', '/v1/billing/credits'), wireBalanceExplanationSchema);

/** Spendable atoms, or `unavailable` when the ledger could not answer. */
export const availableAtoms = (credits: WireBalanceExplanation): string =>
  credits.balance?.eligibleAvailableCreditAtoms ?? 'unavailable';

/**
 * Whether the action may still move on its own: a settling state, or an attention the customer is told to wait out
 * (`provider_outcome_unknown`/`wait`), which a later Stripe event can still settle.
 */
export const isUnsettled = (action: WirePaymentAction): boolean =>
  settlingStates.has(action.state) || (action.state === 'attention_required' && action.attention?.action === 'wait');

/** The settled action, the first state read (what the return could see) and every state in between, in order. */
export type Settlement = {
  readonly action: WirePaymentAction;
  readonly first: WirePaymentAction;
  /** Each distinct state with the second it was first read, such as `attention_required@0, fulfilled@4`. */
  readonly timeline: string;
  readonly seconds: number;
};

/**
 * Polls the action every 2 s while it may still move on its own or until `settleBudget` passes, so a slow but healthy
 * webhook shows as its settle time instead of being misread as a missing grant, and a passing state is kept.
 *
 * @param account - The account that owns the action.
 * @param actionId - The payment action to read.
 * @param settleBudget - Milliseconds to keep polling.
 * @returns The last and first states read, the states between and the seconds it took.
 */
export const waitForSettlement = async (
  account: Account,
  actionId: string,
  settleBudget = 60_000,
): Promise<Settlement> => {
  const started = Date.now();
  const first = await readAction(account, actionId);
  const seen = [`${first.state}@0`];
  let action = first;
  while (isUnsettled(action) && Date.now() - started < settleBudget) {
    // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
    await delay(2000);
    const previous = action.state;
    // oxlint-disable-next-line no-await-in-loop -- sequential bounded polling of one action
    action = await readAction(account, actionId);
    if (action.state !== previous) {
      seen.push(`${action.state}@${Math.round((Date.now() - started) / 1000)}`);
    }
  }
  return { action, first, timeline: seen.join(', '), seconds: Math.round((Date.now() - started) / 1000) };
};

/** One evidence line for an action: state, attention and receipt. */
export const describeAction = (action: WirePaymentAction): string =>
  [
    `action ${action.actionId} ${action.purpose} ${action.state}`,
    action.attention === null ? undefined : `attention ${action.attention.reason}/${action.attention.action}`,
    action.receipt === null
      ? undefined
      : `receipt ${action.receipt.receiptId} granted ${action.receipt.grantedCreditAtoms} atoms${
          action.receipt.chargedPaymentMethod === null
            ? ''
            : ` to ${action.receipt.chargedPaymentMethod.brand} ${action.receipt.chargedPaymentMethod.last4}`
        }`,
    action.frozen === null
      ? undefined
      : `frozen principal ${action.frozen.principalMinor}, tax ${action.frozen.taxMinor ?? 'in Checkout'}, gross ${
          action.frozen.grossMinor ?? 'in Checkout'
        }`,
  ]
    .filter((part): part is string => part !== undefined)
    .join('; ');

/** States a paid session reaches once something accepted the payment. */
const paidStates: ReadonlySet<string> = new Set(['processing', 'funds_received', 'fulfilled']);

/**
 * How the app's return page found a paid Checkout: `webhook` when its first read already showed the payment accepted,
 * `recover` when the first read was `redirect_required` and the page's recover moved it on, `unsettled` otherwise.
 */
export const returnPath = (reads: readonly PaymentRead[]): 'webhook' | 'recover' | 'unsettled' => {
  const first = reads.find(({ method }) => method === 'GET');
  if (first?.state !== undefined && paidStates.has(first.state)) {
    return 'webhook';
  }
  const recovered = reads.find(
    ({ method, path, status, state }) =>
      method === 'POST' && path.endsWith('/recover') && status === 200 && state !== undefined && paidStates.has(state),
  );
  return first?.state === 'redirect_required' && recovered !== undefined ? 'recover' : 'unsettled';
};

/** The app's return reads as one evidence line. */
export const describeReads = (reads: readonly PaymentRead[]): string =>
  reads.length === 0
    ? 'the return page made no payment-action reads'
    : `return page read ${reads
        .map(
          ({ method, path, status, state, attention, requestId }) =>
            `${method} ${path.endsWith('/recover') ? 'recover' : 'action'} ${status} ${state ?? '?'}${
              attention === undefined ? '' : ` ${attention.reason}/${attention.action}`
            }${requestId === undefined ? '' : ` (${requestId})`}`,
        )
        .join(', ')}`;

/**
 * The tax Checkout's order summary shows, in minor units: `0` for a zero or absent tax line, the amount otherwise.
 * Stripe prints tax as "Tax" or "GST"/"VAT" followed by the amount.
 */
export const summaryTaxMinor = (summary: string): number => {
  const match = /\b(?:Tax|GST|VAT|Sales tax)\b.{0,40}?(?:US)?\$\s?(\d+(?:\.\d{2})?)/iu.exec(summary);
  return match?.[1] === undefined ? 0 : Math.round(Number(match[1]) * 100);
};
