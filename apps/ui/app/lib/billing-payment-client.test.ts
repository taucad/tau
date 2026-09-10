import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getUnresolvedPaymentActions, prepareTopup } from './billing-payment-client.js';

vi.mock('#environment.config.js', () => ({
  requireClientEnvironmentUrl: () => 'https://api.tau.new/',
}));
vi.mock('@taucad/utils/id', () => ({ randomUuid: () => 'request_1' }));

const action = {
  version: 'payment-action-v1',
  actionId: 'topup_1',
  environment: 'development',
  ownerId: 'user-a',
  subjectId: 'account-a',
  purpose: 'manual_topup',
  state: 'prepared',
  frozen: {
    offerId: 'offer_1',
    currency: 'usd',
    principalMinor: '2500',
    taxMinor: '0',
    grossMinor: '2500',
    maximumGrossMinor: '2500',
    creditAtoms: '25000000000',
    paymentMethod: null,
  },
  redirectUrl: null,
  attention: null,
  receipt: null,
  updatedAt: '2026-09-06T00:00:00.000Z',
};

describe('billing payment client', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));

  it('uses the purpose-only unresolved query', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify([action]), { status: 200 }));
    await getUnresolvedPaymentActions(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
      },
      'manual_topup',
    );
    expect(fetch).toHaveBeenCalledWith('https://api.tau.new/v1/billing/payment-actions?purpose=manual_topup', {
      credentials: 'include',
    });
  });

  it('posts the exact top-up quote request', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(action), { status: 200 }));
    await prepareTopup(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
      },
      {
        requestId: 'request_1',
        amountMinor: '2500',
        method: 'saved_card',
        returnPath: '/work',
      },
    );
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe('https://api.tau.new/v1/billing/payment-actions/topup');
    expect(init?.method).toBe('POST');
    expect(init?.body).toEqual(expect.stringContaining('"amountMinor":"2500"'));
  });

  it('preserves an owned action on conflict', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'action_already_pending', action }), {
        status: 409,
      }),
    );
    await expect(
      prepareTopup(
        {
          apiBaseUrl: 'https://api.tau.new',
          environment: 'development',
          ownerId: 'user-a',
        },
        {
          requestId: 'request_1',
          amountMinor: '2500',
          method: 'saved_card',
          returnPath: '/',
        },
      ),
    ).rejects.toMatchObject({ code: 'action_already_pending', action });
  });

  it('rejects a response from another billing environment', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...action, environment: 'staging' }), {
        status: 200,
      }),
    );
    await expect(
      prepareTopup(
        {
          apiBaseUrl: 'https://api.tau.new',
          environment: 'development',
          ownerId: 'user-a',
        },
        {
          requestId: 'request_1',
          amountMinor: '2500',
          method: 'saved_card',
          returnPath: '/',
        },
      ),
    ).rejects.toThrow('Payment action identity changed');
  });

  it.each([
    new Response(JSON.stringify(action), { status: 200 }),
    new Response(JSON.stringify({ code: 'action_already_pending', action }), { status: 409 }),
  ])('rejects delayed success and conflict after the financial generation changes', async (response) => {
    let resolveResponse: (value: Response) => void = () => undefined;
    vi.mocked(fetch).mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    let current = true;
    const request = prepareTopup(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
        financialSession: { generation: 1, signal: new AbortController().signal, isCurrent: () => current },
      },
      { requestId: 'request_1', amountMinor: '2500', method: 'saved_card', returnPath: '/' },
    );
    current = false;
    resolveResponse(response);
    await expect(request).rejects.toThrow('Financial session changed');
  });

  it('rejects an action owned by another authenticated owner', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ ...action, ownerId: 'user-b' }]), {
        status: 200,
      }),
    );
    await expect(
      getUnresolvedPaymentActions(
        {
          apiBaseUrl: 'https://api.tau.new',
          environment: 'development',
          ownerId: 'user-a',
        },
        'manual_topup',
      ),
    ).rejects.toThrow('Payment action identity changed');
  });

  it('accepts a first purchase whose financial account differs from its auth owner', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(action), { status: 200 }));
    await expect(
      prepareTopup(
        {
          apiBaseUrl: 'https://api.tau.new',
          environment: 'development',
          ownerId: 'user-a',
        },
        {
          requestId: 'request_1',
          amountMinor: '2500',
          method: 'saved_card',
          returnPath: '/',
        },
      ),
    ).resolves.toMatchObject({ ownerId: 'user-a', subjectId: 'account-a' });
  });

  it('enforces a financial subject once C03 established it', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ ...action, subjectId: 'account-b' }), {
        status: 200,
      }),
    );
    await expect(
      prepareTopup(
        {
          apiBaseUrl: 'https://api.tau.new',
          environment: 'development',
          ownerId: 'user-a',
          subjectId: 'account-a',
        },
        {
          requestId: 'request_1',
          amountMinor: '2500',
          method: 'saved_card',
          returnPath: '/',
        },
      ),
    ).rejects.toThrow('Payment action identity changed');
  });

  it('rejects a session change while parsing an action body', async () => {
    let release!: (value: unknown) => void;
    const body = new Promise((resolve) => {
      release = resolve;
    });
    let isCurrent = true;
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => body } as Response);
    const pending = prepareTopup(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
        financialSession: { generation: 1, signal: new AbortController().signal, isCurrent: () => isCurrent },
      },
      { requestId: 'request_1', amountMinor: '2500', method: 'saved_card', returnPath: '/' },
    );
    await Promise.resolve();
    isCurrent = false;
    release(action);
    await expect(pending).rejects.toThrow('Financial session changed');
  });
});
