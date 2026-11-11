import type * as BillingSessionModule from '@taucad/billing/hooks/billing-session';
import type * as FinancialSessionModule from '#providers/financial-session-provider.js';
import { renderToString } from 'react-dom/server';
import type { ReactNode } from 'react';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { requireClientEnvironment } from '#environment.config.js';
import { render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudRootBoundary, useCloudPaymentActionReturn } from '#cloud/root-billing.cloud.js';

const getPaymentAction = vi.hoisted(() => vi.fn());
const recoverPaymentAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn());
const cancelPaymentAction = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  cancelPaymentAction,
  getPaymentAction,
  followPaymentRedirect,
  recoverPaymentAction,
}));
const boundary = vi.hoisted(() => ({ enabled: false, userId: undefined as string | undefined }));
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: boundary.userId === undefined ? undefined : { user: { id: boundary.userId } } }),
}));
vi.mock('#providers/auth-provider.js', () => ({
  AuthConfigProvider: ({ children }: { children: ReactNode }): ReactNode => children,
}));
vi.mock('@taucad/billing/hooks/billing-session', async (loadOriginal) => {
  const original = await loadOriginal<typeof BillingSessionModule>();
  return {
    ...original,
    useBillingSession: () =>
      boundary.enabled
        ? original.useBillingSession()
        : { apiBaseUrl: 'https://api.tau.new', environment: 'development', userId: 'user-a' },
  };
});
const financial = vi.hoisted(() => ({
  capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
}));
vi.mock('#providers/financial-session-provider.js', async (loadOriginal) => {
  const original = await loadOriginal<typeof FinancialSessionModule>();
  return { ...original, useFinancialSession: () => (boundary.enabled ? original.useFinancialSession() : financial) };
});
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const returnTo = (url: string, queryClient = new QueryClient()): void => {
  renderHook(useCloudPaymentActionReturn, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  });
};

const returnFromCheckout = (queryClient = new QueryClient()): void => {
  returnTo('/?payment_action=action_1', queryClient);
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

/** A paid Checkout whose outcome billing has yet to hear, as after a card authentication or a retried payment. */
const outcomeUnknown = {
  ...checkoutAction('attention_required'),
  attention: { reason: 'provider_outcome_unknown', action: 'wait' },
};

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
    expect(toast).toHaveBeenCalledWith(
      'You didn’t finish paying. You haven’t been charged.',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Continue to payment' }) as unknown,
        cancel: expect.objectContaining({ label: 'Cancel purchase' }) as unknown,
      }),
    );
  });
  expect(recoverPaymentAction).toHaveBeenCalledOnce();
  // Coming back without paying is the customer's choice, not something to warn about.
  expect(toast.warning).not.toHaveBeenCalled();
};

/** The given button on the latest neutral toast; the mocked toast never renders it. */
const toastButton = (kind: 'action' | 'cancel'): ToastButton => {
  const options: unknown = vi.mocked(toast).mock.lastCall?.[1];
  const offer: unknown =
    typeof options === 'object' && options !== null ? (options as Record<string, unknown>)[kind] : undefined;
  if (!isToastButton(offer)) {
    throw new TypeError(`Expected the toast to offer a ${kind} button`);
  }
  return offer;
};

describe('useCloudPaymentActionReturn', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should say billing was updated after a portal visit, refresh billing for a while, and read no payment', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      let search = '';
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      const Probe = (): undefined => {
        useCloudPaymentActionReturn();
        search = useLocation().search;
        return undefined;
      };
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/?settings=billing&billing_return=portal']}>
            <Probe />
          </MemoryRouter>
        </QueryClientProvider>,
      );
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Subscription updated.');
      });
      expect(search).toBe('?settings=billing');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] });
      await vi.advanceTimersByTimeAsync(20_000);
      // Stripe's webhook can land after the page loads, so the plan is re-read until it has had time to.
      expect(invalidate).toHaveBeenCalledTimes(5);
      expect(getPaymentAction).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should treat a returned portal action as a billing update, never as a Checkout to resume', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction.mockResolvedValue({
        ...checkoutAction('completed'),
        purpose: 'billing_portal',
      });
      returnFromCheckout();
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Subscription updated.');
      });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(getPaymentAction).toHaveBeenCalledOnce();
      expect(recoverPaymentAction).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should say a returned payment belongs to another account when this one cannot see it', async () => {
    getPaymentAction.mockRejectedValue(new Error('Billing payment request failed with 404'));
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'This payment was made from a different account. Sign in to that account to see it.',
      );
    });
  });

  it('should cancel an unfinished Checkout from its return toast', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    recoverPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    cancelPaymentAction.mockResolvedValue(checkoutAction('canceled'));
    returnFromCheckout();
    await expectResumeOffer();
    await toastButton('cancel').onClick();
    expect(cancelPaymentAction).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'account-a' }), 'action_1');
    expect(toast).toHaveBeenCalledWith('Purchase canceled.');
  });

  it('should refresh billing on any returned action, even one still open', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    recoverPaymentAction.mockResolvedValue(checkoutAction('redirect_required'));
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    returnFromCheckout(queryClient);
    await expectResumeOffer();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] });
  });

  it('should never offer a paid subscription still awaiting its first invoice a Checkout to resume', async () => {
    getPaymentAction.mockResolvedValue({ ...checkoutAction('processing'), purpose: 'subscription_checkout' });
    returnFromCheckout();
    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith('Processing your payment…');
    });
    expect(toast).not.toHaveBeenCalledWith('You didn’t finish paying. You haven’t been charged.', expect.anything());
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
      expect(toast.success).toHaveBeenCalledWith('537 credits added to your balance.');
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

  it('should tell a card setup the customer left from one billing is still confirming', async () => {
    const setup = cardSetup('redirect_required');
    getPaymentAction.mockResolvedValue(setup);
    recoverPaymentAction.mockResolvedValue(setup);
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'You didn’t finish setting up auto-reload.',
        expect.objectContaining({ action: expect.objectContaining({ label: 'Continue to payment' }) as unknown }),
      );
    });
    // Recovery read the Session as open: only the customer can finish it, so it is not re-read.
    expect(recoverPaymentAction).toHaveBeenCalledOnce();
    expect(toast).not.toHaveBeenCalledWith('Confirming your card for auto-reload…');
    warningButton().onClick();
    expect(followPaymentRedirect).toHaveBeenCalledWith(setup);
  });

  it('should say automatic reload is on once billing confirms the card setup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction.mockResolvedValue(cardSetup('redirect_required'));
      recoverPaymentAction.mockResolvedValueOnce(cardSetup('processing')).mockResolvedValue(cardSetup('completed'));
      vi.mocked(toast).mockReturnValueOnce('confirming');
      const queryClient = new QueryClient();
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      returnFromCheckout(queryClient);
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Confirming your card for auto-reload…');
      });

      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('Auto-reload is on.');
      });
      expect(toast.dismiss).toHaveBeenCalledWith('confirming');
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['billing'] });
      expect(toast.warning).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should say billing is still confirming a finished card setup once the re-check runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction.mockResolvedValue(cardSetup('redirect_required'));
      recoverPaymentAction.mockResolvedValue(cardSetup('processing'));
      vi.mocked(toast).mockReturnValueOnce('confirming');
      returnFromCheckout();
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Confirming your card for auto-reload…');
      });

      await vi.advanceTimersByTimeAsync(18_000);
      expect(toast.warning).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          'We’re still confirming your card for auto-reload. Check back in a few minutes.',
        );
      });
      expect(recoverPaymentAction).toHaveBeenCalledTimes(11);
      expect(toast.dismiss).toHaveBeenCalledWith('confirming');
      // The customer finished in Checkout, so nothing offers to send them back there.
      expect(followPaymentRedirect).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should re-read a payment whose outcome billing has yet to hear and announce the credits it adds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction
        .mockResolvedValueOnce(outcomeUnknown)
        .mockResolvedValue(checkoutAction('fulfilled', { grantedCreditAtoms: '5370000' }));
      vi.mocked(toast).mockReturnValueOnce('processing');
      returnFromCheckout();
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Processing your payment…');
      });

      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('537 credits added to your balance.');
      });
      expect(toast.dismiss).toHaveBeenCalledWith('processing');
      expect(toast.warning).not.toHaveBeenCalled();
      expect(recoverPaymentAction).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should say billing has not confirmed a payment only once the re-check runs out without hearing its outcome', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction.mockResolvedValue(outcomeUnknown);
      vi.mocked(toast).mockReturnValueOnce('processing');
      returnFromCheckout();
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Processing your payment…');
      });

      await vi.advanceTimersByTimeAsync(18_000);
      expect(toast.warning).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          'Your payment is taking longer than usual. Check back in a few minutes.',
        );
      });
      expect(getPaymentAction).toHaveBeenCalledTimes(11);
      expect(toast.dismiss).toHaveBeenCalledWith('processing');
    } finally {
      vi.useRealTimers();
    }
  });

  it('should offer to continue in Checkout when a payment billing waited on turns out to need the customer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      getPaymentAction.mockResolvedValueOnce(outcomeUnknown).mockResolvedValue({
        ...checkoutAction('attention_required'),
        attention: { reason: 'authentication_required', action: 'continue_hosted' },
      });
      returnFromCheckout();
      await waitFor(() => {
        expect(toast).toHaveBeenCalledWith('Processing your payment…');
      });

      await vi.advanceTimersByTimeAsync(2000);

      await waitFor(() => {
        expect(toast.warning).toHaveBeenCalledWith(
          'Your bank needs you to confirm this payment.',
          expect.objectContaining({ action: expect.objectContaining({ label: 'Continue to payment' }) as unknown }),
        );
      });
      await vi.advanceTimersByTimeAsync(4000);
      // Only the customer can move it on now, so it is read no further.
      expect(getPaymentAction).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should say Tau Pro is active along with the credits a paid subscription added', async () => {
    getPaymentAction.mockResolvedValue({
      ...checkoutAction('fulfilled', { grantedCreditAtoms: '20000000' }),
      purpose: 'subscription_checkout',
    });
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('You’re on Tau Pro. 2,000 monthly credits added.');
    });
    expect(toast.success).toHaveBeenCalledOnce();
  });

  it.each([
    ['a card setup', 'reload_setup', 'Auto-reload wasn’t turned on.'],
    ['a purchase', 'manual_topup', 'Payment failed. You weren’t charged.'],
  ])('should say %s was not completed when the customer left its Checkout', async (_, purpose, copy) => {
    getPaymentAction.mockResolvedValue({ ...checkoutAction('canceled'), purpose });
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(copy);
    });
    expect(toast.warning).toHaveBeenCalledOnce();
    expect(recoverPaymentAction).not.toHaveBeenCalled();
  });

  it('should not recover an action that already settled', async () => {
    getPaymentAction.mockResolvedValue(checkoutAction('fulfilled', { grantedCreditAtoms: '5370000' }));
    returnFromCheckout();
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('537 credits added to your balance.');
    });
    expect(recoverPaymentAction).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/naming-convention -- Fixtures preserve the host's window.ENV injection keys. */
describe('CloudRootBoundary host bootstrap', () => {
  afterEach(() => {
    boundary.enabled = false;
    boundary.userId = undefined;
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const Probe = (): React.JSX.Element => {
    const session = useBillingSession();
    return <output>{JSON.stringify(session)}</output>;
  };
  const renderBoundary = (): string =>
    renderToString(
      <QueryClientProvider client={new QueryClient()}>
        <CloudRootBoundary>
          <Probe />
        </CloudRootBoundary>
      </QueryClientProvider>,
    );

  it('should prerender the desktop boundary before preload without inventing a billing API', () => {
    boundary.enabled = true;
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.stubGlobal('window', undefined);
    expect(() => requireClientEnvironment('TAU_API_URL')).toThrow('Missing TAU_API_URL');
    expect(renderBoundary()).toContain('<output>{}</output>');
  });

  it('should use the injected desktop billing URL and current session after bootstrap', () => {
    boundary.enabled = true;
    boundary.userId = 'desktop-owner';
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.stubGlobal('window', {
      ENV: { TAU_API_URL: 'https://desktop.example/', TAU_BILLING_ENVIRONMENT: 'development' },
    });
    const markup = renderBoundary();
    expect(markup).toContain('https://desktop.example');
    expect(markup).toContain('desktop-owner');
    expect(markup).toContain('development');
  });

  it('should retain web server billing configuration without a window', () => {
    boundary.enabled = true;
    boundary.userId = 'web-owner';
    vi.stubEnv('TAU_TARGET', 'web');
    vi.stubEnv('TAU_API_URL', 'https://web.example/');
    vi.stubEnv('TAU_FRONTEND_URL', 'https://web.example/');
    vi.stubEnv('TAU_WEBSOCKET_URL', 'wss://web.example');
    vi.stubEnv('TAU_BILLING_ENVIRONMENT', 'development');
    vi.stubGlobal('window', undefined);
    const markup = renderBoundary();
    expect(markup).toContain('https://web.example');
    expect(markup).toContain('web-owner');
  });

  it('should retain the browser API while signed out with billing unconfigured', () => {
    boundary.enabled = true;
    vi.stubEnv('TAU_TARGET', 'web');
    vi.stubGlobal('window', { ENV: { TAU_API_URL: 'https://browser.example/' } });
    expect(renderBoundary()).toContain('https://browser.example');
  });

  it('should still refuse a configured billing session when its required API is missing', () => {
    boundary.enabled = true;
    boundary.userId = 'desktop-owner';
    vi.stubEnv('TAU_TARGET', 'desktop');
    vi.stubGlobal('window', { ENV: { TAU_BILLING_ENVIRONMENT: 'development' } });
    expect(renderBoundary).toThrow('Missing TAU_API_URL');
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- End host injection fixtures. */
