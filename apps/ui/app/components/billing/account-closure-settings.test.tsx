import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountClosureSettings } from '#components/billing/account-closure-settings.js';
import { FinancialSessionProvider, FinancialSessionScope } from '#providers/financial-session-provider.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

const prepare = vi.hoisted(() => vi.fn());
const current = vi.hoisted(() => vi.fn());
const getClosure = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-lifecycle-client.js', () => ({
  prepareAccountClosure: prepare,
  getCurrentAccountClosure: current,
  getAccountClosure: getClosure,
}));
vi.mock('#lib/billing-payment-client.js', () => ({ createPaymentRequestId: () => 'request-a' }));
vi.mock('#lib/auth-client.js', () => ({ authClient: { deleteUser } }));
const binding = { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: 'user-a' } as const;
const renderClosure = (activeBinding = binding) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = (nextBinding: PaymentActionBinding) => (
    <QueryClientProvider client={queryClient}>
      <FinancialSessionProvider>
        <FinancialSessionScope identity={nextBinding}>
          <AccountClosureSettings binding={nextBinding} />
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
