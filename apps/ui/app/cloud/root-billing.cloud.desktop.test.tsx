/**
 * The desktop's own payment follow-up (adaptive app deployment mode charter D14, W5 acceptance): a window `focus` with
 * no visibility change refetches the billing queries and no other, and announces each action this identity opened in
 * the browser, once, in the return's own copy; an end state forgets it; a stored id survives a reload and is announced
 * on the next launch.
 */
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingPaymentActions, rememberPendingPaymentAction } from '@taucad/billing-ui/lib/pending-payment-actions';
import { DesktopPaymentFollowUp } from '#cloud/root-billing.cloud.js';

const getPaymentAction = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing-ui/lib/billing-payment-client', () => ({
  cancelPaymentAction: vi.fn(),
  getPaymentAction,
  followPaymentRedirect: vi.fn(),
  recoverPaymentAction: vi.fn(),
}));
vi.mock('#lib/build-target.js', () => ({ isDesktopTarget: () => true }));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => ({ apiBaseUrl: 'https://api.tau.new', environment: 'development', userId: 'user-a' }),
}));
vi.mock('#cloud/cloud-financial-session.js', () => ({
  useCloudFinancialSession: () => ({
    capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
  }),
}));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn(), dismiss: vi.fn() }) }));

const fulfilled = {
  actionId: 'action_1',
  purpose: 'manual_topup',
  state: 'fulfilled',
  redirectUrl: null,
  receipt: { grantedCreditAtoms: '5000000000' },
  subjectId: 'account-a',
};

const mount = (queryClient: QueryClient) =>
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DesktopPaymentFollowUp />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  getPaymentAction.mockReset();
  vi.mocked(toast.success).mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('DesktopPaymentFollowUp (D14)', () => {
  it('announces a payment opened before a relaunch once, then forgets it at its end state', async () => {
    rememberPendingPaymentAction({
      actionId: 'action_1',
      environment: 'development',
      ownerId: 'user-a',
      openedAt: Date.now(),
    });
    getPaymentAction.mockResolvedValue(fulfilled);
    mount(new QueryClient());
    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('added to your balance'));
    });
    expect(pendingPaymentActions({ environment: 'development', ownerId: 'user-a' }, Date.now())).toEqual([]);
  });

  it('refetches the billing queries, and no other, when the window regains focus without hiding', async () => {
    const queryClient = new QueryClient();
    const refetch = vi.spyOn(queryClient, 'refetchQueries').mockResolvedValue();
    mount(queryClient);
    globalThis.dispatchEvent(new Event('focus'));
    await waitFor(() => {
      expect(refetch).toHaveBeenCalledWith({ queryKey: ['billing'] });
    });
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("does not announce another owner's stored action", async () => {
    rememberPendingPaymentAction({
      actionId: 'action_9',
      environment: 'development',
      ownerId: 'user-b',
      openedAt: Date.now(),
    });
    mount(new QueryClient());
    globalThis.dispatchEvent(new Event('focus'));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(getPaymentAction).not.toHaveBeenCalled();
  });
});
