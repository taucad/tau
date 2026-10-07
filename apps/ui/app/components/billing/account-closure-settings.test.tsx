import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountClosureSettings } from '#components/billing/account-closure-settings.js';
import { FinancialSessionProvider, FinancialSessionScope } from '#providers/financial-session-provider.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

type PendingAction = { state: string; purpose?: string; attention?: { action: string } };
const prepare = vi.hoisted(() => vi.fn());
const current = vi.hoisted(() => vi.fn());
const getClosure = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
const PaymentPending = vi.hoisted(
  () =>
    class extends Error {
      public action: PendingAction | undefined;
    },
);
vi.mock('#lib/billing-lifecycle-client.js', () => ({
  AccountClosurePaymentPending: PaymentPending,
  prepareAccountClosure: prepare,
  getCurrentAccountClosure: current,
  getAccountClosure: getClosure,
}));
vi.mock('#lib/billing-payment-client.js', () => ({ createPaymentRequestId: () => 'request-a' }));
vi.mock('#lib/auth-client.js', () => ({ authClient: { deleteUser } }));
const binding = { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: 'user-a' } as const;
const renderClosure = (activeBinding = binding, onReviewPayment: () => void = vi.fn()) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (nextBinding: PaymentActionBinding) => (
    <QueryClientProvider client={queryClient}>
      <FinancialSessionProvider>
        <FinancialSessionScope identity={nextBinding}>
          <AccountClosureSettings binding={nextBinding} onReviewPayment={onReviewPayment} />
        </FinancialSessionScope>
      </FinancialSessionProvider>
    </QueryClientProvider>
  );
  const rendered = render(view(activeBinding));
  return {
    ...rendered,
    rerenderBinding: (nextBinding: PaymentActionBinding) => {
      rendered.rerender(view(nextBinding));
    },
  };
};
/** Makes the next prepare refuse closure for this pending payment. */
const refuseFor = (action: PendingAction): void => {
  prepare.mockRejectedValue(Object.assign(new PaymentPending(), { action }));
};
/** Confirms the checkbox and asks to prepare closure. */
const prepareClosure = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('checkbox'));
  await userEvent.click(screen.getByRole('button', { name: 'Prepare account closure' }));
};

describe('AccountClosureSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    current.mockResolvedValue(undefined);
  });
  it('requires confirmation, then purges as soon as prepare proves revocation', async () => {
    prepare.mockResolvedValue({ state: 'cancellation_pending', closureId: 'closure-a' });
    getClosure.mockResolvedValue({ state: 'cancellation_pending', closureId: 'closure-a' });
    renderClosure();
    const button = screen.getByRole('button', { name: 'Prepare account closure' });
    expect(button).toBeDisabled();
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(button);
    expect(deleteUser).not.toHaveBeenCalled();
    const refresh = await screen.findByRole('button', { name: 'Refresh closure status' });
    expect(refresh).toBeEnabled();
    await userEvent.click(refresh);
    expect(getClosure).toHaveBeenCalledOnce();
  });

  it('should open the Add credits dialog for a pending Checkout and drop the notice once it opens', async () => {
    refuseFor({ state: 'redirect_required' });
    const review = vi.fn();
    renderClosure(binding, review);
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish or cancel your pending payment first.');
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
    // The sentence names an action and the control reaches it; the notice has done its job once the dialog is open.
    await userEvent.click(screen.getByRole('button', { name: 'Open Add credits' }));
    expect(review).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should offer the dialog for a prepared quote the owner can discard or finish', async () => {
    refuseFor({ state: 'prepared', purpose: 'manual_topup' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('Discard or finish your pending top-up quote first.');
    expect(screen.getByRole('button', { name: 'Open Add credits' })).toBeEnabled();
  });

  it('should send a paused saved-card payment back to Checkout through the dialog', async () => {
    refuseFor({ state: 'attention_required', attention: { action: 'continue_hosted' } });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('Finish your pending payment in Checkout first.');
    expect(screen.getByRole('button', { name: 'Open Add credits' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
  });

  it('should tell the owner to wait for an automatic reload and offer nothing to click', async () => {
    refuseFor({ state: 'prepared', purpose: 'automatic_topup' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('An automatic reload is in progress.');
    expect(screen.queryByRole('button', { name: 'Open Add credits' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
  });

  it('should point a held payment at support instead of asking for an action the customer cannot take', async () => {
    refuseFor({ state: 'attention_required' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A payment needs attention before this account can close.',
    );
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', 'mailto:support@tau.new');
    expect(screen.queryByRole('button', { name: 'Open Add credits' })).not.toBeInTheDocument();
  });

  it('should tell the customer to wait for a payment that is still being processed', async () => {
    refuseFor({ state: 'processing' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('A payment is still being processed.');
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
  });

  it('should hold closure for received funds whose credits have not landed and offer support', async () => {
    refuseFor({ state: 'funds_received' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your payment was received and its credits are still being added.',
    );
    expect(screen.getByRole('link', { name: 'Contact support' })).toBeInTheDocument();
    // Nothing the customer can finish here, so no control that pretends otherwise.
    expect(screen.queryByRole('button', { name: 'Open Add credits' })).not.toBeInTheDocument();
  });

  it('should ask for a plain retry when the refusal raced a payment that just finished', async () => {
    refuseFor({ state: 'fulfilled' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('That payment is no longer pending. Try again.');
    expect(screen.queryByRole('link', { name: 'Contact support' })).not.toBeInTheDocument();
  });

  it('should say when the closure status could not be checked and still offer to prepare', async () => {
    current.mockRejectedValue(new Error('offline'));
    renderClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check account closure status.');
    expect(screen.getByRole('button', { name: 'Prepare account closure' })).toBeInTheDocument();
  });

  it('invokes Better Auth only for a deletion-ready closure', async () => {
    current.mockResolvedValue({ state: 'ready_for_auth_deletion', closureId: 'closure-a' });
    renderClosure();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
    expect(deleteUser).toHaveBeenCalledOnce();
  });

  it('does not render a delayed closure after the financial owner changes', async () => {
    let resolveBody!: (value: { state: string; closureId: string } | undefined) => void;
    current
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveBody = resolve;
        }),
      )
      .mockResolvedValue(undefined);
    const rendered = renderClosure();
    rendered.rerenderBinding({ ...binding, ownerId: 'user-b' });
    resolveBody({ state: 'ready_for_auth_deletion', closureId: 'closure-a' });
    expect(await screen.findByText(/immediately ends this billing session/i)).toBeInTheDocument();
    expect(screen.queryByText(/closure status/i)).toBeNull();
  });
});
