import { render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudPaymentActionReturn } from '#cloud/root-billing.cloud.js';

const getPaymentAction = vi.hoisted(() => vi.fn());
const recoverPaymentAction = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  getPaymentAction,
  followPaymentRedirect: vi.fn(),
  recoverPaymentAction,
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => ({ apiBaseUrl: 'https://api.tau.new', environment: 'development', userId: 'user-a' }),
}));
const financial = vi.hoisted(() => ({
  capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
}));
vi.mock('#providers/financial-session-provider.js', () => ({ useFinancialSession: () => financial }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const returnFromCheckout = (): void => {
  renderHook(useCloudPaymentActionReturn, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/?payment_action=action_1']}>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
};

const checkoutAction = (state: string, receipt: unknown = null) => ({
  actionId: 'action_1',
  purpose: 'manual_topup',
  state,
  redirectUrl: state === 'redirect_required' ? 'https://checkout.stripe.com/c/pay/cs_test_1' : null,
  receipt,
  subjectId: 'account-a',
});

const expectResumeOffer = async (): Promise<void> => {
  await waitFor(() => {
    expect(toast.warning).toHaveBeenCalledWith(
      'Checkout is ready to continue.',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Resume Checkout' }) as unknown }),
    );
  });
  expect(recoverPaymentAction).toHaveBeenCalledOnce();
};

describe('useCloudPaymentActionReturn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(['completed', 'fulfilled'])('refreshes billing data when the returned action is %s', async (state) => {
    getPaymentAction.mockResolvedValue({
      actionId: 'action_1',
      purpose: 'subscription_checkout',
      state,
      receipt: null,
      subjectId: 'account-a',
    });
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    renderHook(useCloudPaymentActionReturn, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/?payment_action=action_1']}>{children}</MemoryRouter>
        </QueryClientProvider>
      ),
    });
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] });
    });
  });

  it('clears the returned action parameter even when the check fails', async () => {
    getPaymentAction.mockRejectedValue(new Error('offline'));
    let search = '';
    const Probe = (): undefined => {
      useCloudPaymentActionReturn();
      search = useLocation().search;
      return undefined;
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/?payment_action=action_1']}>
          <Probe />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(search).toBe('');
    });
  });

  it('should announce the credits when a paid Checkout still reads redirect_required on return', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    recoverPaymentAction.mockResolvedValue(checkoutAction('fulfilled', { grantedCreditAtoms: '5370000' }));
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('537 credits added.');
    });
    expect(recoverPaymentAction).toHaveBeenCalledOnce();
    expect(recoverPaymentAction).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'account-a' }), 'action_1');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('should keep offering Resume Checkout when an open Checkout comes back unchanged', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    recoverPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    returnFromCheckout();
    await expectResumeOffer();
  });

  it('should keep offering Resume Checkout when recovery fails', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    recoverPaymentAction.mockRejectedValue(new Error('offline'));
    returnFromCheckout();
    await expectResumeOffer();
  });

  it('should not recover a reload-setup Checkout, which has nothing to settle', async () => {
    getPaymentAction.mockResolvedValue({ ...checkoutAction('redirect_required'), purpose: 'reload_setup' });
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('Checkout is ready to continue.', expect.anything());
    });
    expect(recoverPaymentAction).not.toHaveBeenCalled();
  });

  it('should not recover an action that already settled', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('fulfilled', { grantedCreditAtoms: '5370000' }));
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('537 credits added.');
    });
    expect(recoverPaymentAction).not.toHaveBeenCalled();
  });
});
