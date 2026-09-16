import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { usePaymentActionReturn } from '#root-layout.js';

const payment = vi.hoisted(() => ({
  getPaymentAction: vi.fn(),
  recoverPaymentAction: vi.fn(),
  followPaymentRedirect: vi.fn(),
}));
const warning = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  current: {
    apiBaseUrl: 'https://api.tau.new',
    environment: 'development',
    userId: 'user-a',
  },
}));
vi.mock('#lib/billing-payment-client.js', () => payment);
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), warning }),
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => session.current,
}));
/* One controller, as the real provider's memoised context value is: a fresh
 * object per render would re-run every effect that depends on it, and the
 * payment return now re-renders when it clears its own search parameter. */
const financialSession = vi.hoisted(() => ({
  capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
}));
vi.mock('#providers/financial-session-provider.js', () => ({
  useFinancialSession: () => financialSession,
}));

function Harness(): React.JSX.Element {
  usePaymentActionReturn();
  return <div />;
}

/* The return parameter is router state now, not a raw history entry. */
const returnAt = (search: string): React.JSX.Element => (
  <MemoryRouter initialEntries={[`/work${search}`]}>
    <Harness />
  </MemoryRouter>
);

describe('billing payment return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.current = {
      apiBaseUrl: 'https://api.tau.new',
      environment: 'development',
      userId: 'user-a',
    };
  });

  it('GETs attention status and performs no recovery until the explicit action is clicked', async () => {
    payment.getPaymentAction.mockResolvedValue({
      actionId: 'topup_1',
      ownerId: 'user-a',
      subjectId: 'account-a',
      environment: 'development',
      state: 'attention_required',
      attention: {
        reason: 'authentication_required',
        action: 'continue_hosted',
      },
    });
    payment.recoverPaymentAction.mockResolvedValue({
      state: 'redirect_required',
    });
    render(returnAt('?payment_action=topup_1'));
    await waitFor(() => {
      expect(warning).toHaveBeenCalledOnce();
    });
    expect(payment.getPaymentAction).toHaveBeenCalledOnce();
    expect(payment.recoverPaymentAction).not.toHaveBeenCalled();
    expect(location.search).toBe('');
    const options = warning.mock.calls[0]?.[1] as {
      action: { label: string; onClick: () => Promise<void> };
    };
    expect(options.action.label).toBe('Continue in Checkout');
    await userEvent.click(document.body);
    await options.action.onClick();
    expect(payment.recoverPaymentAction).toHaveBeenCalledOnce();
    expect(payment.recoverPaymentAction).toHaveBeenCalledWith(
      expect.objectContaining({ subjectId: 'account-a' }),
      'topup_1',
    );
    expect(payment.followPaymentRedirect).toHaveBeenCalledOnce();
  });

  it('GETs a redirect and resumes it only after the explicit action is clicked', async () => {
    const action = {
      actionId: 'topup_1',
      ownerId: 'user-a',
      subjectId: 'account-a',
      environment: 'development',
      state: 'redirect_required',
      redirectUrl: 'https://checkout.example/resume',
    };
    payment.getPaymentAction.mockResolvedValue(action);
    render(returnAt('?payment_action=topup_1'));
    await waitFor(() => {
      expect(warning).toHaveBeenCalledOnce();
    });
    expect(payment.followPaymentRedirect).not.toHaveBeenCalled();
    const options = warning.mock.calls[0]?.[1] as {
      action: { label: string; onClick: () => void };
    };
    expect(options.action.label).toBe('Resume Checkout');
    options.action.onClick();
    expect(payment.followPaymentRedirect).toHaveBeenCalledWith(action);
    expect(payment.recoverPaymentAction).not.toHaveBeenCalled();
  });

  it('ignores a rejected return GET after the owner changes', async () => {
    let rejectRequest!: (error: Error) => void;
    payment.getPaymentAction.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const view = render(returnAt('?payment_action=topup_1'));
    session.current = { ...session.current, userId: 'user-b' };
    view.rerender(returnAt('?payment_action=topup_1'));
    rejectRequest(new Error('old owner request failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(warning).not.toHaveBeenCalled();
  });
});
