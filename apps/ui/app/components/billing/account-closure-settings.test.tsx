import { render, screen, within } from '@testing-library/react';
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
/** Opens the confirmation, confirms the checkbox and asks to prepare closure. */
const prepareClosure = async (): Promise<void> => {
  await userEvent.click(screen.getByRole('button', { name: 'Close account' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('checkbox'));
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close account' }));
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
    await userEvent.click(screen.getByRole('button', { name: 'Close account' }));
    const dialog = await screen.findByRole('alertdialog');
    const button = within(dialog).getByRole('button', { name: 'Close account' });
    expect(button).toBeDisabled();
    const checkbox = within(dialog).getByRole('checkbox', { name: 'I understand I’ll lose my remaining credits.' });
    await userEvent.click(within(dialog).getByText('I understand I’ll lose my remaining credits.'));
    expect(checkbox).toBeChecked();
    expect(button).toBeEnabled();
    await userEvent.keyboard('[Space]');
    expect(checkbox).not.toBeChecked();
    expect(button).toBeDisabled();
    expect(prepare).not.toHaveBeenCalled();
    await userEvent.keyboard('[Space]');
    await userEvent.click(button);
    expect(deleteUser).not.toHaveBeenCalled();
    const refresh = await screen.findByRole('button', { name: 'Check again' });
    expect(refresh).toBeEnabled();
    await userEvent.click(refresh);
    expect(getClosure).toHaveBeenCalledOnce();
  });

  it('should open the Add credits dialog for a pending Checkout and drop the notice once it opens', async () => {
    refuseFor({ state: 'redirect_required' });
    const review = vi.fn();
    renderClosure(binding, review);
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have a credit purchase you haven’t finished. Finish or cancel it, then close your account.',
    );
    expect(screen.queryByRole('link', { name: 'Email support@tau.new' })).not.toBeInTheDocument();
    // The sentence names an action and the control reaches it; the notice has done its job once the dialog is open.
    await userEvent.click(screen.getByRole('button', { name: 'Go to purchase' }));
    expect(review).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('should offer the dialog for a prepared quote the owner can discard or finish', async () => {
    refuseFor({ state: 'prepared', purpose: 'manual_topup' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have a credit purchase you haven’t finished. Finish or cancel it, then close your account.',
    );
    expect(screen.getByRole('button', { name: 'Go to purchase' })).toBeEnabled();
  });

  it('should send a paused saved-card payment back to Checkout through the dialog', async () => {
    refuseFor({ state: 'attention_required', attention: { action: 'continue_hosted' } });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have a payment to finish first. Finish it, then close your account.',
    );
    expect(screen.getByRole('button', { name: 'Go to purchase' })).toBeEnabled();
    expect(screen.queryByRole('link', { name: 'Email support@tau.new' })).not.toBeInTheDocument();
  });

  it('should tell the owner to wait for an automatic reload and offer nothing to click', async () => {
    refuseFor({ state: 'prepared', purpose: 'automatic_topup' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Auto-reload is buying credits right now. Try again in a few minutes.',
    );
    expect(screen.queryByRole('button', { name: 'Go to purchase' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email support@tau.new' })).not.toBeInTheDocument();
  });

  it('should point a held payment at support instead of asking for an action the customer cannot take', async () => {
    refuseFor({ state: 'attention_required' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A payment needs to be sorted out before you can close your account. Email support@tau.new for help.',
    );
    expect(screen.getByRole('link', { name: 'Email support@tau.new' })).toHaveAttribute(
      'href',
      'mailto:support@tau.new',
    );
    expect(screen.queryByRole('button', { name: 'Go to purchase' })).not.toBeInTheDocument();
  });

  it('should tell the customer to wait for a payment that is still being processed', async () => {
    refuseFor({ state: 'processing' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A payment is still processing. Wait a minute, then try again.',
    );
    expect(screen.queryByRole('link', { name: 'Email support@tau.new' })).not.toBeInTheDocument();
  });

  it('should hold closure for received funds whose credits have not landed and offer support', async () => {
    refuseFor({ state: 'funds_received' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We’re still adding credits from your last payment. Try again in a few minutes, or email support@tau.new if this doesn’t clear.',
    );
    expect(screen.getByRole('link', { name: 'Email support@tau.new' })).toBeInTheDocument();
    // Nothing the customer can finish here, so no control that pretends otherwise.
    expect(screen.queryByRole('button', { name: 'Go to purchase' })).not.toBeInTheDocument();
  });

  it('should ask for a plain retry when the refusal raced a payment that just finished', async () => {
    refuseFor({ state: 'fulfilled' });
    renderClosure();
    await prepareClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent('That payment is done. Try again.');
    expect(screen.queryByRole('link', { name: 'Email support@tau.new' })).not.toBeInTheDocument();
  });

  it('should say when the closure status could not be checked and still offer to prepare', async () => {
    current.mockRejectedValue(new Error('offline'));
    renderClosure();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t check whether your account is closing. Reload the page to try again.',
    );
    expect(screen.getByRole('button', { name: 'Close account' })).toBeInTheDocument();
  });

  it('invokes Better Auth only for a deletion-ready closure', async () => {
    current.mockResolvedValue({ state: 'ready_for_auth_deletion', closureId: 'closure-a' });
    renderClosure();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete account' }));
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
    expect(await screen.findByText('Cancel your plan now and permanently delete your account.')).toBeInTheDocument();
    expect(screen.queryByText(/your plan is canceled/i)).toBeNull();
  });

  it.each([
    {
      state: 'closing',
      title: 'Closing your account',
      description: 'We’re canceling your plan. This can take a minute.',
      action: 'Check again',
    },
    {
      state: 'cancellation_pending',
      title: 'Closing your account',
      description: 'We’re canceling your plan. This can take a minute.',
      action: 'Check again',
    },
    {
      state: 'ready_for_auth_deletion',
      title: 'Your plan is canceled',
      description: 'One step left. Deleting your account is permanent.',
      action: 'Delete account',
    },
    {
      state: 'attention',
      title: 'We couldn’t close your account',
      description: 'Something needs fixing on our side. Email us and we’ll finish it for you.',
      action: 'Check again',
    },
  ])('says where a $state closure stands in plain words, never the wire state', async (row) => {
    const { state, title, description, action } = row;
    current.mockResolvedValue({ state, closureId: 'closure-a' });
    renderClosure();
    expect(await screen.findByRole('group', { name: title })).toHaveAccessibleDescription(description);
    expect(screen.getByRole('button', { name: action })).toBeEnabled();
    expect(screen.queryByText(/closure status|ready for auth deletion|cancellation pending/iu)).toBeNull();
  });

  it('says a closed account is closed and offers nothing more to do', async () => {
    current.mockResolvedValue({ state: 'closed', closureId: 'closure-a' });
    renderClosure();
    const row = await screen.findByRole('group', { name: 'Your account is closed' });
    expect(within(row).queryByRole('button')).toBeNull();
  });

  it('puts the consequence first and each alternative on its own line with its icon on the first line', async () => {
    renderClosure();
    await userEvent.click(screen.getByRole('button', { name: 'Close account' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveAccessibleDescription(
      'Your plan ends now and you lose any credits you have left. This can’t be undone.',
    );
    const alternatives = within(dialog).getAllByRole('listitem');
    expect(alternatives.map((item) => item.textContent)).toStrictEqual([
      'To keep your plan until the end of the billing period, cancel the plan in Billing instead.',
      'If you bought credits in the last 14 days and want a refund, email support@tau.new before you close.',
    ]);
    for (const item of alternatives) {
      // The icon box is one line tall and centres the icon, so it sits on the first line's centre whatever the text wraps to.
      const iconBox = item.querySelector('[data-slot=first-line-icon]');
      expect(iconBox).toHaveClass('h-lh', 'items-center');
      expect(iconBox?.querySelector('svg')).not.toBeNull();
      expect(iconBox?.parentElement).toHaveClass('items-start');
    }
    expect(dialog).not.toHaveTextContent(/cancelled|forfeited|top-up/iu);
  });
});
