import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelPlanSettings } from '#components/billing/cancel-plan-settings.js';

const createPortalAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  createPaymentRequestId: () => 'request-a',
  createPortalAction,
  followPaymentRedirect,
}));

const binding = { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: 'user-a' } as const;

describe('CancelPlanSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says the plan is kept until the end of the billing period', () => {
    render(<CancelPlanSettings binding={binding} />);

    expect(screen.getByRole('group', { name: 'Cancel plan' })).toHaveAccessibleDescription(
      'You keep Pro until the end of your billing period.',
    );
  });

  it('names the date the plan runs to when the paid period is known', () => {
    render(<CancelPlanSettings binding={binding} paidThrough={new Date(2026, 11, 8)} />);

    expect(screen.getByRole('group', { name: 'Cancel plan' })).toHaveAccessibleDescription(
      `You keep Pro until ${new Date(2026, 11, 8).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.`,
    );
  });

  it('opens the billing portal on its cancellation flow', async () => {
    const action = { state: 'redirect_required', redirectUrl: 'https://billing.stripe.com/p/session/1' };
    createPortalAction.mockResolvedValue(action);
    render(<CancelPlanSettings binding={binding} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));

    expect(createPortalAction).toHaveBeenCalledWith(
      binding,
      expect.objectContaining({ requestId: 'request-a', flow: 'subscription_cancel' }),
    );
    expect(followPaymentRedirect).toHaveBeenCalledWith(action);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the cancellation flow cannot open', async () => {
    createPortalAction.mockRejectedValue(new Error('offline'));
    render(<CancelPlanSettings binding={binding} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t open the cancellation page. Try again.');
    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeEnabled();
  });

  it.each([
    ['the owner changes', 'switch'],
    ['the row unmounts', 'unmount'],
  ] as const)('never follows a portal session once %s', async (_case, change) => {
    let settle: (value: unknown) => void = () => undefined;
    createPortalAction.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const view = render(<CancelPlanSettings binding={binding} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));

    if (change === 'switch') {
      view.rerender(<CancelPlanSettings binding={{ ...binding, ownerId: 'user-b' }} />);
    } else {
      view.unmount();
    }
    await act(async () => {
      settle({ state: 'redirect_required', redirectUrl: 'https://billing.stripe.com/p/session/1' });
    });

    expect(followPaymentRedirect).not.toHaveBeenCalled();
  });

  it('waits for the billing session before offering cancellation', () => {
    render(<CancelPlanSettings binding={undefined} />);

    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeDisabled();
  });
});
