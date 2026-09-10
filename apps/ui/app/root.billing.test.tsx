import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePaymentActionReturn } from '#root.js';

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
vi.mock('#providers/financial-session-provider.js', () => ({
  useFinancialSession: () => ({
    capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
  }),
}));

function Harness(): React.JSX.Element {
  usePaymentActionReturn();
  return <div />;
}

describe('billing payment return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    session.current = {
      apiBaseUrl: 'https://api.tau.new',
      environment: 'development',
      userId: 'user-a',
    };
    history.replaceState({}, '', '/work?payment_action=topup_1');
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
    render(<Harness />);
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
    render(<Harness />);
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
    const view = render(<Harness />);
    session.current = { ...session.current, userId: 'user-b' };
    history.replaceState({}, '', '/work');
    view.rerender(<Harness />);
    rejectRequest(new Error('old owner request failed'));
    await Promise.resolve();
    await Promise.resolve();
    expect(warning).not.toHaveBeenCalled();
  });
});
