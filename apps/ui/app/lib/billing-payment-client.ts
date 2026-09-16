import { randomUuid } from '@taucad/utils/id';
import { wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import type { FinancialSessionRequest } from '#providers/financial-session-provider.js';
import { recordBillingRevisionMinimum } from '#db/billing-snapshot-store.js';

export type PaymentActionBinding = {
  readonly apiBaseUrl: string;
  readonly environment: WirePaymentAction['environment'];
  readonly ownerId: string;
  readonly subjectId?: string;
  readonly financialSession?: FinancialSessionRequest;
};

type PaymentConflictCode = 'request_payload_conflict' | 'action_already_pending' | 'subscription_already_exists';

/** An owned payment-action conflict returned by the first-party billing API. */
export class BillingPaymentConflict extends Error {
  public readonly code: PaymentConflictCode;
  public readonly action: WirePaymentAction | undefined;

  public constructor(code: PaymentConflictCode, action?: WirePaymentAction) {
    super(code);
    this.code = code;
    this.action = action;
    this.name = 'BillingPaymentConflict';
  }
}

const assertBoundAction = (action: WirePaymentAction, binding: PaymentActionBinding): WirePaymentAction => {
  if (
    action.environment !== binding.environment ||
    action.ownerId !== binding.ownerId ||
    (binding.subjectId !== undefined && action.subjectId !== binding.subjectId)
  ) {
    throw new Error('Payment action identity changed');
  }
  return action;
};

const parseConflict = async (
  response: Response,
  binding: PaymentActionBinding,
): Promise<BillingPaymentConflict | undefined> => {
  if (response.status !== 409) {
    return undefined;
  }
  const body: unknown = await response.json().catch(() => undefined);
  assertCurrentSession(binding);
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const { code, action } = body as { code?: unknown; action?: unknown };
  if (!['request_payload_conflict', 'action_already_pending', 'subscription_already_exists'].includes(String(code))) {
    return undefined;
  }
  const parsedAction = wirePaymentActionSchema.safeParse(action);
  return new BillingPaymentConflict(
    code as PaymentConflictCode,
    parsedAction.success ? assertBoundAction(parsedAction.data, binding) : undefined,
  );
};

const actionRequest = async (
  path: string,
  binding: PaymentActionBinding,
  init?: RequestInit,
): Promise<WirePaymentAction> => {
  const response = await fetch(`${binding.apiBaseUrl.replace(/\/$/u, '')}/v1/billing${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body === undefined ? init?.headers : { 'content-type': 'application/json', ...init.headers },
    ...(binding.financialSession === undefined && init?.signal === undefined
      ? {}
      : { signal: binding.financialSession?.signal ?? init?.signal }),
  });
  assertCurrentSession(binding);
  if (!response.ok) {
    const conflict = await parseConflict(response, binding);
    if (conflict) {
      throw conflict;
    }
    throw new Error(`Billing payment request failed with ${response.status}`);
  }
  const body: unknown = await response.json();
  assertCurrentSession(binding);
  const action = assertBoundAction(wirePaymentActionSchema.parse(body), binding);
  if (action.receipt !== null) {
    await recordBillingRevisionMinimum({
      environment: action.environment,
      ownerId: action.ownerId,
      subjectId: action.subjectId,
      revision: action.receipt.revision,
    });
  }
  return action;
};

/** Creates a fresh browser correlation ID; server ownership remains authoritative. */
export const createPaymentRequestId = (): string => randomUuid();

export const prepareTopup = async (
  binding: PaymentActionBinding,
  input: {
    readonly requestId: string;
    readonly amountMinor: string;
    readonly method: 'saved_card' | 'checkout';
    readonly returnPath: string;
  },
): Promise<WirePaymentAction> =>
  actionRequest('/payment-actions/topup', binding, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const confirmPaymentAction = async (
  binding: PaymentActionBinding,
  actionId: string,
): Promise<WirePaymentAction> =>
  actionRequest(`/payment-actions/${encodeURIComponent(actionId)}/confirm`, binding, {
    method: 'POST',
  });

export const cancelPaymentAction = async (
  binding: PaymentActionBinding,
  actionId: string,
): Promise<WirePaymentAction> =>
  actionRequest(`/payment-actions/${encodeURIComponent(actionId)}/cancel`, binding, {
    method: 'POST',
  });

export const recoverPaymentAction = async (
  binding: PaymentActionBinding,
  actionId: string,
): Promise<WirePaymentAction> =>
  actionRequest(`/payment-actions/${encodeURIComponent(actionId)}/recover`, binding, {
    method: 'POST',
  });

export const createSubscriptionAction = async (
  binding: PaymentActionBinding,
  input: {
    readonly requestId: string;
    readonly returnPath: string;
  },
): Promise<WirePaymentAction> =>
  actionRequest('/payment-actions/subscription', binding, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const createPortalAction = async (
  binding: PaymentActionBinding,
  input: {
    readonly requestId: string;
    readonly returnPath: string;
  },
): Promise<WirePaymentAction> =>
  actionRequest('/payment-actions/portal', binding, {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const getPaymentAction = async (binding: PaymentActionBinding, actionId: string): Promise<WirePaymentAction> =>
  actionRequest(`/payment-actions/${encodeURIComponent(actionId)}`, binding);

export const getUnresolvedPaymentActions = async (
  binding: PaymentActionBinding,
  purpose: WirePaymentAction['purpose'],
): Promise<WirePaymentAction[]> => {
  const response = await fetch(
    `${binding.apiBaseUrl.replace(/\/$/u, '')}/v1/billing/payment-actions?purpose=${encodeURIComponent(purpose)}`,
    binding.financialSession === undefined
      ? { credentials: 'include' }
      : { credentials: 'include', signal: binding.financialSession.signal },
  );
  assertCurrentSession(binding);
  if (!response.ok) {
    throw new Error(`Billing payment request failed with ${response.status}`);
  }
  const body: unknown = await response.json();
  assertCurrentSession(binding);
  return wirePaymentActionSchema
    .array()
    .max(20)
    .parse(body)
    .map((action) => assertBoundAction(action, binding));
};

export const followPaymentRedirect = (action: WirePaymentAction): boolean => {
  if (action.state !== 'redirect_required' || action.redirectUrl === null) {
    return false;
  }
  globalThis.location.assign(action.redirectUrl);
  return true;
};

const assertCurrentSession = (binding: PaymentActionBinding): void => {
  if (binding.financialSession !== undefined && !binding.financialSession.isCurrent()) {
    throw new Error('Financial session changed');
  }
};
