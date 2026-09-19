// eslint-disable-next-line @nx/enforce-module-boundaries -- UI owns this first-party billing HTTP boundary
import { wireAccountClosureSchema, wireAutoReloadConsentSchema, wirePaymentActionSchema } from '@taucad/billing';
import type { WireAccountClosure, WireAutoReloadConsent, WirePaymentAction } from '@taucad/billing';
import { parseCollectionRefusal } from '#lib/billing-payment-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

const base = (binding: PaymentActionBinding): string => `${binding.apiBaseUrl.replace(/\/$/u, '')}/v1/billing`;

const request = async (binding: PaymentActionBinding, path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(`${base(binding)}${path}`, {
    credentials: 'include',
    ...init,
    headers: init?.body === undefined ? init?.headers : { 'content-type': 'application/json', ...init.headers },
    signal: binding.financialSession?.signal ?? init?.signal,
  });
  if (!binding.financialSession?.isCurrent() && binding.financialSession !== undefined) {
    throw new Error('Financial session changed');
  }
  if (!response.ok) {
    throw (
      (await parseCollectionRefusal(response)) ?? new Error(`Billing lifecycle request failed with ${response.status}`)
    );
  }
  const body: unknown = await response.json();
  if (!binding.financialSession?.isCurrent() && binding.financialSession !== undefined) {
    throw new Error('Financial session changed');
  }
  return body;
};

const owned = <T extends { environment: string; ownerId: string; subjectId: string }>(
  value: T,
  binding: PaymentActionBinding,
): T => {
  if (
    value.environment !== binding.environment ||
    value.ownerId !== binding.ownerId ||
    (binding.subjectId !== undefined && value.subjectId !== binding.subjectId)
  ) {
    throw new Error('Billing lifecycle identity changed');
  }
  return value;
};

export const getReloadConsent = async (binding: PaymentActionBinding): Promise<WireAutoReloadConsent | undefined> => {
  const value = await request(binding, '/reload-consent');
  return value === null ? undefined : owned(wireAutoReloadConsentSchema.parse(value), binding);
};

export const prepareReloadConsent = async (
  binding: PaymentActionBinding,
  input: { readonly requestId: string; readonly returnPath: string; readonly taxLocationRevision?: string },
): Promise<WirePaymentAction> =>
  owned(
    wirePaymentActionSchema.parse(
      await request(binding, '/reload-consent', { method: 'POST', body: JSON.stringify(input) }),
    ),
    binding,
  );

export const revokeReloadConsent = async (
  binding: PaymentActionBinding,
  consentId: string,
): Promise<WireAutoReloadConsent> =>
  owned(
    wireAutoReloadConsentSchema.parse(
      await request(binding, `/reload-consent/${encodeURIComponent(consentId)}/revoke`, { method: 'POST' }),
    ),
    binding,
  );

export const getCurrentAccountClosure = async (
  binding: PaymentActionBinding,
): Promise<WireAccountClosure | undefined> => {
  const value = await request(binding, '/account-closure');
  return value === null ? undefined : owned(wireAccountClosureSchema.parse(value), binding);
};

export const getAccountClosure = async (
  binding: PaymentActionBinding,
  closureId: string,
): Promise<WireAccountClosure> =>
  owned(
    wireAccountClosureSchema.parse(await request(binding, `/account-closure/${encodeURIComponent(closureId)}`)),
    binding,
  );

export const prepareAccountClosure = async (
  binding: PaymentActionBinding,
  requestId: string,
): Promise<WireAccountClosure> =>
  owned(
    wireAccountClosureSchema.parse(
      await request(binding, '/account-closure', { method: 'POST', body: JSON.stringify({ requestId }) }),
    ),
    binding,
  );
