import { render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloudPaymentActionReturn } from '#cloud/root-billing.cloud.js';

const getPaymentAction = vi.hoisted(() => vi.fn());
const recoverPaymentAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  getPaymentAction,
  followPaymentRedirect,
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

const returnFromCheckout = (queryClient = new QueryClient()): void => {
  renderHook(useCloudPaymentActionReturn, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
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

/** The card setup Checkout that turns automatic reload on. */
const cardSetup = (state: string) => ({ ...checkoutAction(state), purpose: 'reload_setup' });

/** A toast button as the code under test builds it; its click handlers ignore the event. */
type ToastButton = { readonly onClick: () => unknown };

/** Whether a toast's `action` is a button rather than a custom node. */
const isToastButton = (offer: unknown): offer is ToastButton =>
  typeof offer === 'object' && offer !== null && 'onClick' in offer && typeof offer.onClick === 'function';

/** The button on the latest warning; the mocked toast never renders it. */
const warningButton = (): ToastButton => {
  const offer: unknown = vi.mocked(toast.warning).mock.lastCall?.[1]?.action;
  if (!isToastButton(offer)) {
    throw new TypeError('Expected the warning to offer a button');
  }
  return offer;
};

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
    getPaymentAction.mockResolvedValue(cardSetup('redirect_required'));
    returnFromCheckout();
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('Confirming your card for automatic reload.');
    });
    expect(recoverPaymentAction).not.toHaveBeenCalled();
    // A finished setup reads the same until billing confirms it, so continuing is not offered yet.
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('should say automatic reload is on once billing confirms the card setup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction.mockResolvedValueOnce(cardSetup('redirect_required')).mockResolvedValue(cardSetup('completed'));
      vi.mocked(toast).mockReturnValueOnce('confirming');
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      returnFromCheckout(queryClient);
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Confirming your card for automatic reload.');
      });

      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Automatic reload is on.');
      });
      expect(toast.dismiss).toHaveBeenCalledWith('confirming');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] });
      expect(toast.warning).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should offer to continue a card setup that billing has not confirmed once the re-check runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const setup = cardSetup('redirect_required');
      getPaymentAction.mockResolvedValue(setup);
      vi.mocked(toast).mockReturnValueOnce('confirming');
      returnFromCheckout();
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Confirming your card for automatic reload.');
      });

      await vi.advanceTimersByTimeAsync(18_000);
      expect(toast.warning).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          'Automatic reload is waiting for card setup.',
          expect.objectContaining({ action: expect.objectContaining({ label: 'Continue setup' }) as unknown }),
        );
      });
      expect(getPaymentAction).toHaveBeenCalledTimes(11);
      expect(toast.dismiss).toHaveBeenCalledWith('confirming');
      expect(followPaymentRedirect).not.toHaveBeenCalled();
      warningButton().onClick();
      expect(followPaymentRedirect).toHaveBeenCalledWith(setup);
    } finally {
      vi.useRealTimers();
    }
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
