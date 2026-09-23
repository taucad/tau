import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BillingAddressRequired,
  getCurrentAccountClosure,
  getReloadConsent,
  prepareAccountClosure,
  prepareReloadConsent,
} from './billing-lifecycle-client.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

const binding = {
  apiBaseUrl: 'https://api.tau.new',
  environment: 'development',
  ownerId: 'user-a',
  subjectId: 'account-a',
} satisfies PaymentActionBinding;
const closure = {
  version: 'account-closure-v1',
  environment: 'development',
  ownerId: 'user-a',
  subjectId: 'account-a',
  closureId: 'closure-a',
  state: 'ready_for_auth_deletion',
  attention: null,
  updatedAt: '2026-09-06T00:00:00Z',
};

describe('billing lifecycle client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses frozen closure routes and validates identity', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(closure), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(prepareAccountClosure(binding, 'request-a')).resolves.toEqual(closure);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.tau.new/v1/billing/account-closure',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requestId: 'request-a' }),
        credentials: 'include',
      }),
    );
  });

  it('types a missing billing address refusal and leaves other conflicts generic', async () => {
    const refuse = (code: string) =>
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, statusCode: 409 }), { status: 409 }));
    vi.stubGlobal('fetch', refuse('customer_tax_location_invalid'));
    await expect(prepareReloadConsent(binding, { requestId: 'request-a', returnPath: '/' })).rejects.toBeInstanceOf(
      BillingAddressRequired,
    );
    vi.stubGlobal('fetch', refuse('automatic_reload_unavailable'));
    await expect(prepareReloadConsent(binding, { requestId: 'request-a', returnPath: '/' })).rejects.toThrow(
      'Billing lifecycle request failed with 409',
    );
  });

  it('supports null current closure and reload consent', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response('null', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(getCurrentAccountClosure(binding)).resolves.toBeUndefined();
    await expect(getReloadConsent(binding)).resolves.toBeUndefined();
  });

  it('rejects a foreign owner and a stale response', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ ...closure, ownerId: 'user-b' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(prepareAccountClosure(binding, 'request-a')).rejects.toThrow('identity changed');
    const token = { generation: 1, signal: new AbortController().signal, isCurrent: () => false };
    await expect(prepareAccountClosure({ ...binding, financialSession: token }, 'request-a')).rejects.toThrow(
      'session changed',
    );
  });

  it('rejects a session change while parsing the response body', async () => {
    let release!: (value: unknown) => void;
    const body = new Promise((resolve) => {
      release = resolve;
    });
    let isCurrent = true;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => body }));
    const pending = prepareAccountClosure(
      {
        ...binding,
        financialSession: { generation: 1, signal: new AbortController().signal, isCurrent: () => isCurrent },
      },
      'request-a',
    );
    await Promise.resolve();
    isCurrent = false;
    release(closure);
    await expect(pending).rejects.toThrow('session changed');
  });
});
